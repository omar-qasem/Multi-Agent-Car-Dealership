/**
 * أوتو جوردن - Conversation Flow Engine
 *
 * Enforces multi-step booking and purchase flows deterministically so the LLM
 * cannot skip required fields, invent times, or call write tools prematurely.
 *
 * DESIGN
 * ──────
 * The LLM's job in a flow is narrow: extract one field value from the
 * customer's reply and respond naturally. The engine handles:
 *   - Tracking which fields have been collected
 *   - Deciding which field to ask for next
 *   - Triggering tool calls at the right moment (check_branch_availability,
 *     book_maintenance) with validated inputs
 *   - Recovering from slot collisions automatically
 *
 * FLOW STATES
 * ───────────
 *   idle             → no active flow
 *   collecting       → gathering required fields one at a time
 *   awaiting_time    → check_branch_availability called, time slots shown
 *   done             → final tool called successfully, flow cleared
 *
 * PERSISTENCE
 * ───────────
 * Flow state lives in conversation_states.flow_state (JSONB, added by
 * migration 005). Shape:
 *   {
 *     flow_id:   'booking' | 'purchase',
 *     step:      'collecting' | 'awaiting_time' | 'done',
 *     collected: { service_type?, car_make?, car_model?, date?, branch? },
 *     available_slots: string[],   // filled after check_branch_availability
 *   }
 */

const logger = require('../utils/logger');

// =============================================
// Booking flow — required fields in order
// =============================================
const BOOKING_FIELDS = ['service_type', 'car_make', 'car_model', 'date', 'branch'];

const FIELD_QUESTION_CONTEXT = {
    service_type: 'اسأل العميل عن نوع الخدمة المطلوبة (مثال: صيانة دورية، تغيير زيت، فرامل، مكيف...)',
    car_make:     'اسأل العميل عن ماركة سيارته (Toyota، Hyundai، Kia، MG، Chery، Nissan، BMW)',
    car_model:    'اسأل العميل عن موديل سيارته',
    date:         'اسأل العميل عن التاريخ المناسب. حوّل أي إجابة (بكرا/الاثنين/15-4) إلى YYYY-MM-DD. تأكد أن التاريخ في المستقبل.',
    branch:       'اسأل العميل عن الفرع المناسب: عمان، إربد، الزرقاء، أو العقبة',
};

// =============================================
// Public API
// =============================================

/**
 * Called at the start of each turn to get the flow directive for this message.
 *
 * Returns one of:
 *   { mode: 'none' }                                     — no active flow
 *   { mode: 'collect', context: string, flowState: obj } — inject focused prompt, update state after
 *   { mode: 'check_availability', branch, date, flowState } — engine will call tool directly
 *   { mode: 'awaiting_time', slots: [], context: string, flowState } — show slots, wait for time pick
 *   { mode: 'book', collected: obj, flowState }          — ready to call book_maintenance
 */
function getFlowDirective(intent, entities, convState) {
    const flowState = convState?.flow_state || null;

    // ── Start a new booking flow? ────────────────────────────────
    // Trigger on explicit booking intent OR on service_type entity alone (without
    // date) when there's no purchase-indicating entity (budget / condition / fuel).
    // This covers short service requests like "غيار زيت" or "مكيف" where the
    // classifier extracts the service but can't detect intent from keywords alone.
    const looksLikeServiceRequest = (
        intent === 'unknown' &&
        entities.service_type &&
        !entities.budget &&
        !entities.condition
    );
    const shouldStartBooking = (
        (intent === 'booking' || looksLikeServiceRequest) &&
        (!flowState || flowState.flow_id !== 'booking' || flowState.step === 'done')
    );

    if (shouldStartBooking) {
        const initialCollected = _pickBookingEntities(entities, {});
        const newFlow = { flow_id: 'booking', step: 'collecting', collected: initialCollected, available_slots: [] };
        logger.info(`[FLOW] Starting booking flow — pre-collected: ${JSON.stringify(initialCollected)}`);
        return _bookingDirective(newFlow);
    }

    // ── Continue existing booking flow ───────────────────────────
    if (flowState?.flow_id === 'booking' && flowState.step !== 'done') {
        // Merge any newly extracted entities into collected
        const updatedCollected = _pickBookingEntities(entities, flowState.collected || {});
        const updatedFlow = { ...flowState, collected: updatedCollected };

        if (flowState.step === 'awaiting_time') {
            return _awaitingTimeDirective(updatedFlow, entities);
        }

        return _bookingDirective(updatedFlow);
    }

    return { mode: 'none' };
}

/**
 * Build the focused system-prompt injection for the current booking state.
 * This replaces the 7-step instructions with a single, precise directive.
 */
function buildFlowContext(directive) {
    if (directive.mode === 'none') return '';

    if (directive.mode === 'collect') {
        const { flowState } = directive;
        const collected = flowState.collected || {};
        const missing = _nextMissingField(collected);
        const summary = Object.entries(collected)
            .filter(([, v]) => v)
            .map(([k, v]) => `  • ${_fieldLabel(k)}: ${v}`)
            .join('\n') || '  (لا شيء بعد)';

        return `\n\n## 🔄 حالة حجز الصيانة الحالية:
المعلومات المجمّعة:
${summary}
⏳ الخطوة التالية: **${_fieldLabel(missing)}**
تعليمات: ${FIELD_QUESTION_CONTEXT[missing]}
⛔ لا تستدعِ أي أداة الآن — سؤال واحد فقط عن "${_fieldLabel(missing)}".
⛔ لا تستدعِ search_cars — تلك لشراء سيارة جديدة، وليس للصيانة. السيارة التي يذكرها العميل هي سيارته الشخصية للصيانة.`;
    }

    if (directive.mode === 'awaiting_time') {
        const slots = directive.slots || [];
        return `\n\n## 🕐 اختيار وقت الحجز:
الأوقات المتاحة: ${slots.join('، ')}
تعليمات: اعرض هذه الأوقات للعميل واسأله يختار وحدة.
⛔ لا تستدعِ book_maintenance حتى يختار العميل وقتاً من القائمة.`;
    }

    if (directive.mode === 'check_availability') {
        return `\n\n## ✅ جميع البيانات مكتملة — استدعِ check_branch_availability الآن:
- branch: "${directive.branch}"
- date: "${directive.date}"
لا تسأل العميل — نفّذ الأداة مباشرة.`;
    }

    if (directive.mode === 'book') {
        const c = directive.collected;
        return `\n\n## ✅ العميل اختار الوقت — استدعِ book_maintenance الآن بهذه القيم:
- service_type: "${c.service_type}"
- car_make: "${c.car_make}"
- car_model: "${c.car_model}"
- preferred_date: "${c.date}"
- preferred_time: "${c.time}"
- branch: "${c.branch}"
لا تسأل العميل — نفّذ الأداة مباشرة.`;
    }

    return '';
}

/**
 * After the LLM responds (or a tool runs), produce the updated flow state
 * to save back to conversation_states.flow_state.
 *
 * @param {object} currentFlowState — state before this turn
 * @param {object} entities         — entities extracted this turn
 * @param {string[]} toolsUsed      — tools that ran this turn
 * @param {object[]} toolResults    — raw tool result objects { name, content }
 * @returns {object|null}           — new flow state (null = clear / done)
 */
function advanceFlowState(currentFlowState, entities, toolsUsed, toolResults) {
    if (!currentFlowState || currentFlowState.flow_id !== 'booking') return null;

    // If book_maintenance succeeded → done, clear flow
    if (toolsUsed.includes('book_maintenance')) {
        const bookResult = _findToolResult(toolResults, 'book_maintenance');
        if (bookResult?.booking_id || bookResult?.success) {
            logger.info('[FLOW] Booking completed — clearing flow state');
            return null;
        }
        // If slot was taken, go back to awaiting_time with same slots
        if (bookResult?.slot_taken) {
            logger.warn('[FLOW] Slot taken — returning to awaiting_time');
            return { ...currentFlowState, step: 'awaiting_time' };
        }
    }

    // If check_branch_availability ran → capture slots, move to awaiting_time
    if (toolsUsed.includes('check_branch_availability')) {
        const avResult = _findToolResult(toolResults, 'check_branch_availability');
        if (avResult?.is_available === true) {
            const slots = avResult.available_time_slots || [];
            logger.info(`[FLOW] Availability confirmed — ${slots.length} slots, moving to awaiting_time`);
            return { ...currentFlowState, step: 'awaiting_time', available_slots: slots };
        }
        if (avResult?.is_available === false) {
            // Branch full — stay in collecting, clear date so LLM asks again
            logger.info('[FLOW] Branch full — clearing date, staying in collecting');
            const collected = { ...(currentFlowState.collected || {}), date: null };
            return { ...currentFlowState, step: 'collecting', collected, available_slots: [] };
        }
    }

    // No tool ran yet — merge newly extracted entities into collected
    const updatedCollected = _pickBookingEntities(entities, currentFlowState.collected || {});
    return { ...currentFlowState, collected: updatedCollected };
}

// =============================================
// Private helpers
// =============================================

function _bookingDirective(flowState) {
    const collected = flowState.collected || {};
    const missing = _nextMissingField(collected);

    if (!missing) {
        // All 5 fields collected — need availability check next
        return {
            mode: 'check_availability',
            branch: collected.branch,
            date: collected.date,
            flowState,
        };
    }

    return { mode: 'collect', flowState };
}

function _awaitingTimeDirective(flowState, entities) {
    const slots = flowState.available_slots || [];
    // Try to match the customer's reply to a slot from the available list
    const pickedTime = _matchTimeFromEntities(entities, slots);

    if (pickedTime) {
        // Valid time picked — ready to book
        const collected = { ...flowState.collected, time: pickedTime };
        return {
            mode: 'book',
            collected,
            flowState: { ...flowState, collected },
        };
    }

    // No valid time matched — show slots again
    return { mode: 'awaiting_time', slots, flowState };
}

function _nextMissingField(collected) {
    return BOOKING_FIELDS.find(f => !collected[f]) || null;
}

function _pickBookingEntities(entities, existing) {
    const out = { ...existing };
    if (entities.service_type && !out.service_type) out.service_type = entities.service_type;
    if (entities.car_make     && !out.car_make)     out.car_make     = entities.car_make;
    if (entities.car_model    && !out.car_model)    out.car_model    = entities.car_model;
    if (entities.date         && !out.date)         out.date         = entities.date;
    if (entities.branch       && !out.branch)       out.branch       = entities.branch;
    return out;
}

/** Try to match a customer's reply against a list of available slot strings */
function _matchTimeFromEntities(entities, slots) {
    if (!slots || !slots.length) return null;

    // Classifier can extract time from messages like "9 صباح" or "10:00"
    const rawTime = entities.preferred_time || entities.time;
    if (!rawTime) return null;

    const norm = rawTime.replace(/\s+/g, '').toLowerCase();
    return slots.find(s => {
        const sNorm = s.replace(/\s+/g, '').toLowerCase();
        return sNorm.includes(norm) || norm.includes(sNorm);
    }) || null;
}

function _findToolResult(toolResults, toolName) {
    if (!Array.isArray(toolResults)) return null;
    const tr = toolResults.find(r => r.name === toolName);
    if (!tr) return null;
    try {
        return typeof tr.content === 'string' ? JSON.parse(tr.content) : tr.content;
    } catch { return null; }
}

function _fieldLabel(field) {
    return {
        service_type: 'نوع الخدمة',
        car_make:     'ماركة السيارة',
        car_model:    'موديل السيارة',
        date:         'التاريخ',
        branch:       'الفرع',
        time:         'الوقت',
    }[field] || field;
}

module.exports = {
    getFlowDirective,
    buildFlowContext,
    advanceFlowState,
};
