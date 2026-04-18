/**
 * In-process metrics registry (P2-03)
 *
 * ────────────────────────────────────────────────────────────────
 *  Scope
 * ────────────────────────────────────────────────────────────────
 *  Serverless caveat: these counters live in a single Lambda instance's
 *  memory and reset on every cold start. That's still useful:
 *    - While a container is warm (usually 5–15 min on Netlify) we can
 *      tail /api/admin/metrics and see near-realtime request health.
 *    - For durable long-term metrics, push the snapshot to Datadog /
 *      CloudWatch from a scheduled job or hook into this module's
 *      `snapshot()` output.
 *
 *  Primitives
 *    - counter(name, labels) → monotonically increasing integer
 *    - histogram(name, labels) → count/sum/p50/p95/p99 of observed ms
 *    - gauge(name, labels) → arbitrary set/get
 *
 *  Labels are encoded into a stable key string so the registry stays
 *  shape-agnostic (no need to declare cardinalities up front). We keep
 *  the per-histogram sample ring bounded to HISTOGRAM_SAMPLE_CAP so
 *  memory usage stays predictable under heavy traffic.
 * ────────────────────────────────────────────────────────────────
 */

const HISTOGRAM_SAMPLE_CAP = 1000;

// Private registry. Exposed via snapshot() for the /metrics endpoint.
const registry = {
    counters:   new Map(),    // key → { name, labels, value }
    histograms: new Map(),    // key → { name, labels, samples[], count, sum }
    gauges:     new Map(),    // key → { name, labels, value }
    startedAt:  Date.now(),
};

function labelsKey(name, labels) {
    if (!labels || Object.keys(labels).length === 0) return name;
    const parts = Object.keys(labels).sort().map(k => `${k}=${labels[k]}`);
    return `${name}{${parts.join(',')}}`;
}

/**
 * Increment a counter. Creates the series on first use.
 */
function inc(name, by = 1, labels = {}) {
    const key = labelsKey(name, labels);
    const existing = registry.counters.get(key);
    if (existing) existing.value += by;
    else registry.counters.set(key, { name, labels, value: by });
}

/**
 * Record a single observation (milliseconds). Percentiles computed on
 * snapshot read to avoid paying for sort on every write.
 */
function observe(name, ms, labels = {}) {
    const key = labelsKey(name, labels);
    let h = registry.histograms.get(key);
    if (!h) {
        h = { name, labels, samples: [], count: 0, sum: 0 };
        registry.histograms.set(key, h);
    }
    h.count += 1;
    h.sum   += ms;
    h.samples.push(ms);
    // Keep the ring bounded. When we hit the cap, drop the oldest half
    // (not the oldest one) to amortize the O(n) splice across writes.
    if (h.samples.length > HISTOGRAM_SAMPLE_CAP) {
        h.samples.splice(0, Math.floor(HISTOGRAM_SAMPLE_CAP / 2));
    }
}

/**
 * Set a gauge. Unlike counters, gauges can go up or down and represent
 * instantaneous state (e.g. queue depth, active connections).
 */
function setGauge(name, value, labels = {}) {
    const key = labelsKey(name, labels);
    registry.gauges.set(key, { name, labels, value });
}

function percentile(samples, p) {
    if (!samples.length) return null;
    const sorted = samples.slice().sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
}

/**
 * Collect the full state for export. The caller (the /metrics route)
 * JSON-stringifies this directly.
 */
function snapshot() {
    const counters = Array.from(registry.counters.values()).map(c => ({
        name: c.name, labels: c.labels, value: c.value,
    }));
    const histograms = Array.from(registry.histograms.values()).map(h => ({
        name: h.name, labels: h.labels,
        count: h.count,
        sum: h.sum,
        avg_ms: h.count ? Math.round(h.sum / h.count) : 0,
        p50_ms: percentile(h.samples, 50),
        p95_ms: percentile(h.samples, 95),
        p99_ms: percentile(h.samples, 99),
    }));
    const gauges = Array.from(registry.gauges.values()).map(g => ({
        name: g.name, labels: g.labels, value: g.value,
    }));
    return {
        started_at:    new Date(registry.startedAt).toISOString(),
        uptime_ms:     Date.now() - registry.startedAt,
        counters,
        histograms,
        gauges,
    };
}

/** Wipe everything — for tests. Not exposed via the HTTP endpoint. */
function _reset() {
    registry.counters.clear();
    registry.histograms.clear();
    registry.gauges.clear();
    registry.startedAt = Date.now();
}

module.exports = {
    inc,
    observe,
    setGauge,
    snapshot,
    _reset,
    _HISTOGRAM_SAMPLE_CAP: HISTOGRAM_SAMPLE_CAP,
};
