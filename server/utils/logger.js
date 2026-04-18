/**
 * Structured Logger (P2-01)
 *
 * ────────────────────────────────────────────────────────────────
 *  Design goals
 * ────────────────────────────────────────────────────────────────
 *  - Preserve the existing logger API so every call site keeps working:
 *      logger.info / .success / .warn / .error / .webhook / .ai
 *    All accept `(message, data = null)`.
 *
 *  - Structured output: in production (NODE_ENV=production or
 *    LOG_FORMAT=json) emit a single JSON line per call so Netlify /
 *    Datadog / CloudWatch ingestion is painless. Pretty colored
 *    output in dev for humans.
 *
 *  - Correlation context: `logger.child({ request_id, message_id,
 *    phone, ... })` returns a scoped logger that carries those fields
 *    on every subsequent log line. Nested children merge context.
 *
 *  - Safe error extraction: if `data` is an Error instance, emit
 *    `{ err: { message, stack, code, status, ...response } }` instead
 *    of the default JSON.stringify (which drops the stack and prints
 *    `{}`).
 *
 *  - Never throws. A logger that blows up in a catch block masks the
 *    original error, which is brutal to debug. Any serialization
 *    failure falls back to a minimal plain-string emit.
 * ────────────────────────────────────────────────────────────────
 */

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
};

// Decide format at module load; can be overridden per-call via env.
// LOG_FORMAT=json forces JSON; LOG_FORMAT=pretty forces colored.
// Otherwise NODE_ENV=production → JSON.
function resolveFormat() {
    const f = (process.env.LOG_FORMAT || '').toLowerCase();
    if (f === 'json') return 'json';
    if (f === 'pretty') return 'pretty';
    return process.env.NODE_ENV === 'production' ? 'json' : 'pretty';
}

const LEVEL_META = {
    info:    { color: colors.cyan,    tag: 'INFO',    stream: 'log'   },
    success: { color: colors.green,   tag: 'SUCCESS', stream: 'log'   },
    warn:    { color: colors.yellow,  tag: 'WARN',    stream: 'warn'  },
    error:   { color: colors.red,     tag: 'ERROR',   stream: 'error' },
    webhook: { color: colors.magenta, tag: 'WEBHOOK', stream: 'log'   },
    ai:      { color: colors.blue,    tag: 'AI',      stream: 'log'   },
};

/**
 * Extract the interesting fields from an Error into a plain object.
 * Preserves fields set by our own code (status, nonRetryable, code)
 * and axios-shaped responses (response.status / response.data).
 */
function serializeError(err) {
    const out = {
        message: err.message,
        name: err.name,
    };
    if (err.stack)        out.stack = err.stack;
    if (err.code)         out.code = err.code;
    if (err.status)       out.status = err.status;
    if (err.nonRetryable) out.nonRetryable = err.nonRetryable;
    if (err.response) {
        out.response = {
            status: err.response.status,
            data: err.response.data,
        };
    }
    return out;
}

/**
 * Merge the call-site `data` argument into a single plain object for
 * structured output. Handles: null/undefined, Error, string, plain object.
 */
function normalizeData(data) {
    if (data === null || data === undefined) return null;
    if (data instanceof Error) return { err: serializeError(data) };
    if (typeof data === 'string') return { detail: data };
    if (typeof data !== 'object')  return { detail: String(data) };
    // Plain object — inspect each field, promote any nested Error.
    const out = {};
    for (const [k, v] of Object.entries(data)) {
        out[k] = v instanceof Error ? serializeError(v) : v;
    }
    return out;
}

function safeStringify(obj) {
    try {
        return JSON.stringify(obj);
    } catch (e) {
        // Circular structure or a getter that throws — fall back.
        try {
            return JSON.stringify(obj, (_, v) =>
                typeof v === 'bigint' ? v.toString() : v);
        } catch {
            return '"[unserializable]"';
        }
    }
}

/**
 * Emit one log line. `context` is the child's bound context (may be empty).
 */
function emit(level, message, data, context) {
    const meta = LEVEL_META[level] || LEVEL_META.info;
    const stream = console[meta.stream] || console.log;
    const format = resolveFormat();
    const payload = normalizeData(data);
    const ts = new Date().toISOString();

    if (format === 'json') {
        const record = { ts, level, msg: String(message) };
        if (context && Object.keys(context).length) Object.assign(record, context);
        if (payload) Object.assign(record, payload);
        stream(safeStringify(record));
        return;
    }

    // Pretty format for dev — keep close to the original shape so humans
    // aren't surprised, but append the context + payload for visibility.
    const ctxStr = context && Object.keys(context).length
        ? ` ${colors.gray}${safeStringify(context)}${colors.reset}`
        : '';
    const prefix = `${meta.color}[${meta.tag}]${colors.reset} ${ts} - ${message}${ctxStr}`;
    if (payload) stream(prefix, payload);
    else stream(prefix);
}

/**
 * Build a logger bound to a context. The context is frozen so callers
 * can't mutate it after the child is handed off.
 */
function makeLogger(context = {}) {
    const bound = Object.freeze({ ...context });

    const api = {};
    for (const level of Object.keys(LEVEL_META)) {
        api[level] = (message, data = null) => {
            try {
                emit(level, message, data, bound);
            } catch (loggerErr) {
                // NEVER let the logger throw into a caller's catch block.
                try {
                    // eslint-disable-next-line no-console
                    console.error('[LOGGER_FAILURE]', loggerErr?.message, '— original:', message);
                } catch { /* give up */ }
            }
        };
    }

    /**
     * Return a new logger carrying merged context. Child context wins
     * on key collision so per-request fields override any root-level
     * defaults.
     */
    api.child = (extra = {}) => makeLogger({ ...bound, ...(extra || {}) });

    // Escape hatches for tests + diagnostics
    api._getContext = () => bound;
    api._resolveFormat = resolveFormat;

    return api;
}

module.exports = makeLogger();
