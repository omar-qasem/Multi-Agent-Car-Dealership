/**
 * أوتو جوردن - Simple RAG (Retrieval-Augmented Generation)
 *
 * Pre-fetches relevant data from Supabase BEFORE the LLM call so the model
 * can answer in its FIRST response without needing a tool-call round-trip.
 * This saves 1–3 seconds per message on average.
 *
 * How it works:
 *   1. Classifier tags intent + extracts entities.
 *   2. RAG uses intent + entities to query the right Supabase tables.
 *   3. The retrieved context is injected into the LLM system prompt.
 *   4. LLM can still call tools for writes (booking, tickets) or if
 *      the pre-fetched data isn't sufficient.
 *
 * Design constraints:
 *   - No vector DB (too heavy for serverless).
 *   - Each retrieval must complete in <1s (hard timeout).
 *   - Max context injection: ~800 tokens (~400 Arabic words) to avoid
 *     pushing the conversation history out of the 8B model's window.
 */

const db = require('../database/db');
const logger = require('../utils/logger');

// Maximum cars/parts to include in context (keeps prompt compact)
const MAX_CARS_IN_CONTEXT = 5;
const MAX_PARTS_IN_CONTEXT = 4;
const RETRIEVAL_TIMEOUT_MS = 1500;

/**
 * Retrieve relevant context based on classifier output.
 *
 * @param {string} intent - Classifier intent (price, purchase, parts, booking, unknown, etc.)
 * @param {object} entities - Extracted entities { car_make, car_model, budget, service_type, ... }
 * @param {object} [convEntities] - Accumulated entities from previous turns
 * @returns {Promise<string|null>} - Context string to inject, or null if nothing relevant
 */
async function retrieveContext(intent, entities, convEntities = {}) {
    // Merge current + conversation entities (current wins)
    const e = { ...convEntities, ...entities };

    let timer;
    try {
        const timeoutPromise = new Promise((_, rej) => {
            timer = setTimeout(() => rej(new Error('RAG retrieval timed out')), RETRIEVAL_TIMEOUT_MS);
        });
        const result = await Promise.race([_retrieve(intent, e), timeoutPromise]);
        return result;
    } catch (err) {
        logger.warn(`⚠️ RAG retrieval failed: ${err.message}`);
        return null; // Non-critical — LLM still has tools
    } finally {
        clearTimeout(timer);
    }
}

async function _retrieve(intent, e) {
    switch (intent) {
        case 'price':
        case 'purchase':
            return _retrieveCars(e);

        case 'parts':
            return _retrieveParts(e);

        case 'booking':
            // For booking, if we have a car make, pre-fetch service context
            return _retrieveServiceContext(e);

        case 'unknown':
            // If entities hint at cars, search cars. Otherwise show promotions.
            if (e.car_make || e.car_model || e.budget) {
                return _retrieveCars(e);
            }
            return _retrievePromotions();

        default:
            return null;
    }
}

/**
 * Search cars matching entities and format as compact Arabic context.
 */
async function _retrieveCars(e) {
    const searchParams = {};
    if (e.car_make)   searchParams.make      = e.car_make;
    if (e.car_model)  searchParams.model     = e.car_model;
    if (e.budget)     searchParams.max_price = e.budget;
    if (e.fuel_type)  searchParams.fuel_type = e.fuel_type;
    if (e.condition)  searchParams.condition = e.condition;

    const cars = await db.searchCars(searchParams);
    if (!cars || cars.length === 0) return null;

    // Sort by price ascending, take top N
    const sorted = cars
        .filter(c => c.status === 'available')
        .sort((a, b) => a.price - b.price)
        .slice(0, MAX_CARS_IN_CONTEXT);

    if (sorted.length === 0) return null;

    let ctx = `\n\n## بيانات من المخزون (${sorted.length} سيارة متوفرة):\n`;
    for (const car of sorted) {
        ctx += `• ${car.make} ${car.model} ${car.year}`;
        ctx += ` | ${car.condition === 'new' ? 'جديدة' : 'مستعملة'}`;
        ctx += ` | ${car.price.toLocaleString()} دينار`;
        if (car.color) ctx += ` | ${car.color}`;
        if (car.fuel_type) ctx += ` | ${car.fuel_type}`;
        ctx += ` | فرع ${car.branch}`;
        ctx += '\n';
    }

    if (cars.length > MAX_CARS_IN_CONTEXT) {
        ctx += `(+ ${cars.length - MAX_CARS_IN_CONTEXT} سيارة أخرى متوفرة — استخدم search_cars لعرض المزيد)\n`;
    }

    ctx += '\nاستخدم هذه البيانات للرد مباشرة. إذا العميل بده تفاصيل أكثر أو موديل مختلف، استخدم أداة search_cars.';
    return ctx;
}

/**
 * Search parts matching entities.
 */
async function _retrieveParts(e) {
    const searchParams = {};
    if (e.car_make)  searchParams.car_make = e.car_make;
    if (e.car_model) searchParams.car_model = e.car_model;
    // Pass part name so results narrow to the specific part the customer asked about
    if (e.part_name) searchParams.name = e.part_name;

    const parts = await db.searchParts(searchParams);
    if (!parts || parts.length === 0) return null;

    const available = parts
        .filter(p => p.quantity > 0)
        .slice(0, MAX_PARTS_IN_CONTEXT);

    if (available.length === 0) return null;

    let ctx = `\n\n## قطع غيار متوفرة (${available.length}):\n`;
    for (const p of available) {
        ctx += `• ${p.name}`;
        if (p.part_number) ctx += ` (${p.part_number})`;
        ctx += ` | ${p.price} دينار`;
        ctx += ` | متوفر: ${p.quantity}`;
        if (Array.isArray(p.compatible) && p.compatible.length > 0) {
            ctx += ` | يناسب: ${p.compatible.join('، ')}`;
        }
        ctx += '\n';
    }
    ctx += '\nاستخدم هذه البيانات للرد. إذا القطعة مش موجودة، استخدم أداة check_parts_inventory.';
    return ctx;
}

/**
 * For booking intent: show available services + prices so the AI
 * can inform the customer while collecting booking info.
 */
async function _retrieveServiceContext(e) {
    // Static service data (same as get_service_types tool but injected directly)
    let ctx = '\n\n## خدمات الصيانة المتاحة:\n';
    ctx += '• تغيير زيت + فلتر: 25-35 دينار (45 دقيقة)\n';
    ctx += '• صيانة دورية 10K: 45-75 دينار (1.5-2 ساعة)\n';
    ctx += '• صيانة دورية 20K: 80-120 دينار (2-3 ساعات)\n';
    ctx += '• فحص شامل: مجاني مع الصيانة\n';
    ctx += '• إطارات: 8-12 دينار/إطار\n';
    ctx += '• بريك: 35-85 دينار\n';
    ctx += '• كهرباء: 20-50 دينار\n';
    ctx += '• مكيف: 25-40 دينار\n';

    // If we know the car, mention it
    if (e.car_make || e.car_model) {
        ctx += `\nالعميل عنده ${e.car_make || ''} ${e.car_model || ''}.`;
    }

    ctx += '\nاستخدم هذه الأسعار كمرجع. لحجز الموعد استخدم book_maintenance.';
    return ctx;
}

/**
 * For unknown intent with no car entities: show current promotions
 * so the AI has something relevant to offer.
 */
async function _retrievePromotions() {
    try {
        const promos = await db.getActivePromotions();
        if (!promos || promos.length === 0) return null;

        let ctx = `\n\n## العروض الحالية (${promos.length}):\n`;
        for (const p of promos) {
            ctx += `• ${p.title}`;
            if (p.description) ctx += `: ${p.description}`;
            if (p.applies_to) ctx += ` (${p.applies_to})`;
            ctx += '\n';
        }
        ctx += '\nاذكر العروض إذا العميل يسأل بشكل عام. لا تفرض العروض إذا عنده سؤال محدد.';
        return ctx;
    } catch {
        return null;
    }
}

module.exports = { retrieveContext };
