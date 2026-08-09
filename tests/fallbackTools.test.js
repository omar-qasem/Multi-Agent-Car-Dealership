/**
 * P0-04 regression tests: verify that write tools are NOT silently stripped
 * when the primary model's TPD quota is exhausted and we're on the fallback
 * model. Also verifies the UTC-rollover reset on _primaryModelExhausted.
 *
 * Run: node tests/fallbackTools.test.js
 */

const path = require('node:path');
const assert = require('node:assert');

// ---------- Stub deps BEFORE loading GeminiService ----------

// Stub groq-sdk: capture params passed to chat.completions.create so we can
// assert which tools/model were sent.
const GROQ_PATH = require.resolve('groq-sdk');
const captured = { calls: [] };
class FakeGroq {
    constructor() {
        this.chat = {
            completions: {
                create: async (params /* , opts */) => {
                    captured.calls.push(JSON.parse(JSON.stringify({
                        model: params.model,
                        toolNames: (params.tools || []).map(t => t.function?.name),
                        systemPreview: (params.messages?.[0]?.content || ''),
                    })));
                    // Return a minimal valid Groq response (no tool calls, plain text)
                    return {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'ok',
                                tool_calls: null,
                            },
                        }],
                    };
                },
            },
        };
    }
}
require.cache[GROQ_PATH] = {
    id: GROQ_PATH, filename: GROQ_PATH, loaded: true,
    exports: FakeGroq,
};

// Stub logger to keep test output quiet
const LOGGER_PATH = path.resolve(__dirname, '../server/utils/logger.js');
require.cache[LOGGER_PATH] = {
    id: LOGGER_PATH, filename: LOGGER_PATH, loaded: true,
    exports: { info() {}, warn() {}, error() {}, success() {}, debug() {} },
};

// Stub classifier & rag so generateResponse doesn't need real network calls
const CLASSIFIER_PATH = path.resolve(__dirname, '../server/services/classifier.js');
require.cache[CLASSIFIER_PATH] = {
    id: CLASSIFIER_PATH, filename: CLASSIFIER_PATH, loaded: true,
    exports: { classify: async () => ({ intent: 'unknown', entities: {} }) },
};
const RAG_PATH = path.resolve(__dirname, '../server/services/rag.service.js');
require.cache[RAG_PATH] = {
    id: RAG_PATH, filename: RAG_PATH, loaded: true,
    exports: { retrieveContext: async () => '' },
};

// Stub db so GeminiService's saveConversation etc. don't blow up
const DB_PATH = path.resolve(__dirname, '../server/database/db.js');
require.cache[DB_PATH] = {
    id: DB_PATH, filename: DB_PATH, loaded: true,
    exports: {
        saveConversation: async () => {}, saveConversationState: async () => {},
        getConversationState: async () => null,
        upsertCustomer: async () => {}, getCustomer: async () => null,
        getSystemFlag: async () => null, setSystemFlag: async () => {},
    },
};

// Force env so _initialize actually constructs a client
process.env.GROQ_API_KEY = 'test-key';
process.env.GROQ_MODEL = 'primary-model-x';
process.env.GROQ_FALLBACK_MODEL = 'fallback-model-y';

const GS_PATH = path.resolve(__dirname, '../server/services/gemini.service.js');
delete require.cache[GS_PATH];
const GeminiServiceMod = require('../server/services/gemini.service.js');
// This service exports an instance (common pattern) — handle both shapes
const svc = GeminiServiceMod.generateResponse
    ? GeminiServiceMod
    : (GeminiServiceMod.GeminiService ? new GeminiServiceMod.GeminiService() : GeminiServiceMod);

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

function resetCapture() { captured.calls = []; }

// Look up the inner class instance so we can poke _primaryModelExhausted.
// The module exports either the instance directly or something exposing it.
function getUnderlying() {
    if (svc && typeof svc.generateResponse === 'function') return svc;
    if (svc && svc.default && typeof svc.default.generateResponse === 'function') return svc.default;
    throw new Error('could not locate GeminiService singleton');
}

// =============================================================
// Core assertion helpers
// =============================================================
function assertWriteToolsPresent(call) {
    const writeNames = ['book_maintenance', 'submit_support_ticket', 'create_purchase_inquiry'];
    for (const w of writeNames) {
        assert.ok(call.toolNames.includes(w),
            `expected ${w} in tool list on fallback, got: ${JSON.stringify(call.toolNames)}`);
    }
}

// =============================================================
// Tests
// =============================================================
test('fallback mode: write tools are still exposed to LLM', async () => {
    resetCapture();
    const underlying = getUnderlying();
    underlying._primaryModelExhausted = true;
    underlying._exhaustedUtcDate = underlying._currentUtcDate(); // same-day → no reset

    await underlying.generateResponse('مرحبا', '+962791234567', 'Test User');

    assert.ok(captured.calls.length >= 1, 'Groq should have been called at least once');
    const firstCall = captured.calls[0];
    assert.strictEqual(firstCall.model, 'fallback-model-y',
        'should route to fallback model when _primaryModelExhausted=true');
    assertWriteToolsPresent(firstCall);
});

test('primary mode: all tools including writes are exposed', async () => {
    resetCapture();
    const underlying = getUnderlying();
    underlying._primaryModelExhausted = false;
    underlying._exhaustedUtcDate = null;

    await underlying.generateResponse('مرحبا', '+962791234567', 'Test User');

    assert.ok(captured.calls.length >= 1);
    const firstCall = captured.calls[0];
    assert.strictEqual(firstCall.model, 'primary-model-x');
    assertWriteToolsPresent(firstCall);
});

test('fallback system prompt includes reinforcement about required fields', async () => {
    resetCapture();
    const underlying = getUnderlying();
    underlying._primaryModelExhausted = true;
    underlying._exhaustedUtcDate = underlying._currentUtcDate();

    await underlying.generateResponse('مرحبا', '+962791234567', 'Test User');

    const firstCall = captured.calls[0];
    assert.ok(/تأكد أنك جمعت كل الحقول المطلوبة/.test(firstCall.systemPreview),
        'fallback reminder about collecting required fields should be in system prompt, got: ' + firstCall.systemPreview);
});

test('primary system prompt does NOT include fallback reinforcement', async () => {
    resetCapture();
    const underlying = getUnderlying();
    underlying._primaryModelExhausted = false;
    underlying._exhaustedUtcDate = null;

    await underlying.generateResponse('مرحبا', '+962791234567', 'Test User');

    const firstCall = captured.calls[0];
    assert.ok(!/تأكد أنك جمعت كل الحقول المطلوبة/.test(firstCall.systemPreview),
        'fallback reminder should NOT be in system prompt during primary mode');
});

test('_maybeResetTpdFlag: same UTC day keeps the flag', () => {
    const underlying = getUnderlying();
    underlying._primaryModelExhausted = true;
    underlying._exhaustedUtcDate = underlying._currentUtcDate();
    underlying._maybeResetTpdFlag();
    assert.strictEqual(underlying._primaryModelExhausted, true);
});

test('_maybeResetTpdFlag: new UTC day clears the flag', () => {
    const underlying = getUnderlying();
    underlying._primaryModelExhausted = true;
    underlying._exhaustedUtcDate = '2000-01-01'; // any date in the past
    underlying._maybeResetTpdFlag();
    assert.strictEqual(underlying._primaryModelExhausted, false);
    assert.strictEqual(underlying._exhaustedUtcDate, null);
});

test('_maybeResetTpdFlag: no-op when flag is already false', () => {
    const underlying = getUnderlying();
    underlying._primaryModelExhausted = false;
    underlying._exhaustedUtcDate = null;
    underlying._maybeResetTpdFlag();
    assert.strictEqual(underlying._primaryModelExhausted, false);
});

// =============================================================
// Runner
// =============================================================
(async () => {
    let passed = 0, failed = 0;
    for (const t of TESTS) {
        try {
            await t.fn();
            console.log(`  ✓ ${t.name}`);
            passed++;
        } catch (err) {
            console.error(`  ✗ ${t.name}`);
            console.error(`     ${err.message}`);
            if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
            failed++;
        }
    }
    console.log(`\n${passed}/${TESTS.length} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();
