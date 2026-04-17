/**
 * Canonical booking time slots.
 *
 * P0-02 FIX: previously, `check_branch_availability` used short Arabic strings
 * (`'9:00 ص'`, `'10:00 ص'`) while `book_maintenance` defaulted to a long form
 * (`'9:00 صباحاً'`). String comparisons never matched, producing bookings at
 * slots that were not actually offered.
 *
 * The store-of-truth is now a 24-hour canonical form ("HH:mm"). Display forms
 * are computed on demand for the LLM / customer. `parseTime` accepts many
 * natural Arabic and English forms and returns the canonical form or null.
 */

// Business hours: 08:00 → 19:00, hourly
const CANONICAL_SLOTS = [
    '08:00', '09:00', '10:00', '11:00',
    '12:00', '13:00', '14:00', '15:00',
    '16:00', '17:00', '18:00', '19:00',
];

/**
 * Convert a canonical "HH:mm" into an Arabic display form ("9:00 ص" / "5:00 م").
 */
function canonicalToDisplay(canonical) {
    if (!/^\d{2}:\d{2}$/.test(canonical || '')) return null;
    const [hh, mm] = canonical.split(':').map(Number);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    const period = hh < 12 ? 'ص' : 'م';
    let displayHour = hh % 12;
    if (displayHour === 0) displayHour = 12;
    return `${displayHour}:${String(mm).padStart(2, '0')} ${period}`;
}

const DISPLAY_SLOTS = CANONICAL_SLOTS.map(canonicalToDisplay);

// Eastern Arabic-Indic → ASCII digits
const ARABIC_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
function normalizeDigits(str) {
    return String(str).replace(/[٠-٩]/g, d => ARABIC_DIGITS[d] || d);
}

/**
 * Parse a human-provided time string into canonical "HH:mm".
 * Accepts:
 *   - "09:00", "9:00", "9"
 *   - "9:00 ص", "9 ص", "9:00 صباحاً", "9 صباحا"
 *   - "9:00 م", "9 م", "9:00 مساءً", "9 مساء", "9 عصرا"
 *   - "9 am", "9:00 pm", "9AM"
 *   - Arabic-Indic digits ("٩:٠٠ ص")
 * Returns null for unparseable input.
 */
function parseTime(input) {
    if (input == null) return null;
    let s = normalizeDigits(String(input)).trim().toLowerCase();
    if (!s) return null;

    // Strip Arabic "الساعة" prefix if present
    s = s.replace(/^الساعة\s+/, '');
    // Collapse extra whitespace
    s = s.replace(/\s+/g, ' ').trim();

    // Detect AM/PM markers.
    // Arabic note: JS `\b` is ASCII-only — Arabic letters are treated as
    // non-word characters, so `\bص\b` never matches. Use explicit whitespace
    // / start / end anchors for the single-letter Arabic markers.
    const AM_LONG  = /(صباحا?ً?|الصباح)/;
    const PM_LONG  = /(مساء?ً?|المساء|ظهرا?ً?|الظهر|عصرا?ً?|العصر|ليلا?ً?|الليل)/;
    const AM_SHORT = /(^|\s)ص(?=\s|$)/;
    const PM_SHORT = /(^|\s)م(?=\s|$)/;
    const AM_EN    = /\b(am|a\.m\.?)\b/i;
    const PM_EN    = /\b(pm|p\.m\.?)\b/i;

    let period = null;
    // Long/specific forms win before single-letter fallbacks — "العصر" (PM)
    // must not be classified as AM just because it contains "ص".
    if (AM_LONG.test(s) || AM_EN.test(s) || AM_SHORT.test(s)) period = 'am';
    else if (PM_LONG.test(s) || PM_EN.test(s) || PM_SHORT.test(s)) period = 'pm';

    // Extract the first "H" or "H:M" numeric token
    const m = s.match(/(\d{1,2})(?:[:.](\d{1,2}))?/);
    if (!m) return null;
    let hh = parseInt(m[1], 10);
    const mm = m[2] != null ? parseInt(m[2], 10) : 0;
    if (isNaN(hh) || isNaN(mm) || mm < 0 || mm > 59) return null;

    // Apply period
    if (period === 'am') {
        if (hh === 12) hh = 0;
        else if (hh < 1 || hh > 12) return null;
    } else if (period === 'pm') {
        if (hh === 12) hh = 12;
        else if (hh < 1 || hh > 12) return null;
        else hh += 12;
    } else {
        // No period — accept 24-hour form only
        if (hh < 0 || hh > 23) return null;
    }
    if (hh < 0 || hh > 23) return null;

    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Round a canonical time to the nearest offered slot (same hour, minute=00).
 * Returns null if the hour is outside business hours.
 */
function toNearestSlot(canonical) {
    if (!/^\d{2}:\d{2}$/.test(canonical || '')) return null;
    const hh = canonical.slice(0, 2);
    const candidate = `${hh}:00`;
    return CANONICAL_SLOTS.includes(candidate) ? candidate : null;
}

/**
 * True when `canonical` is exactly one of the offered slots.
 */
function isValidSlot(canonical) {
    return CANONICAL_SLOTS.includes(canonical);
}

module.exports = {
    CANONICAL_SLOTS,
    DISPLAY_SLOTS,
    canonicalToDisplay,
    parseTime,
    toNearestSlot,
    isValidSlot,
};
