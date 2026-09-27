/**
 * timeParse — turn a human time spec into a timestamp for reminders and
 * scheduled messages.
 *
 * Accepts (case-insensitive):
 *   30s 10m 2h 1d            → relative from now
 *   5pm  5:30pm  17:30       → absolute clock time (next occurrence)
 *   tomorrow 9am             → absolute, next day
 *   daily 9am / everyday 9am → recurring every day
 *   weekly 9am               → recurring every 7 days
 *   weekly mon 9am           → recurring on that weekday
 *
 * Returns { dueAt, recurring, weeklyDay, isRelative, display } or null.
 */
const UNITS = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function parseClock(s) {
    let m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
    if (m) {
        let h = parseInt(m[1], 10);
        const mi = parseInt(m[2], 10);
        if (m[3] === 'pm' && h < 12) h += 12;
        if (m[3] === 'am' && h === 12) h = 0;
        if (h > 23 || mi > 59) return null;
        return { h, m: mi };
    }
    m = s.match(/^(\d{1,2})\s*(am|pm)$/);
    if (m) {
        let h = parseInt(m[1], 10);
        if (m[2] === 'pm' && h < 12) h += 12;
        if (m[2] === 'am' && h === 12) h = 0;
        if (h > 23) return null;
        return { h, m: 0 };
    }
    return null;
}

function fmt(d) {
    return d.toLocaleString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric',
    });
}

function parseTimeSpec(input) {
    let s = String(input || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!s) return null;

    let recurring = null;
    if (/^(daily|everyday|every day)\b/.test(s)) {
        recurring = 'daily';
        s = s.replace(/^(daily|everyday|every day)\s*/, '').trim();
    } else if (/^weekly\b/.test(s)) {
        recurring = 'weekly';
        s = s.replace(/^weekly\s*/, '').trim();
    }

    let weeklyDay = null;
    if (recurring === 'weekly') {
        const m = s.match(/^(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b\s*/);
        if (m) { weeklyDay = m[1]; s = s.replace(m[0], '').trim(); }
    }

    // Relative (only when not recurring).
    if (!recurring) {
        const rel = s.match(/^(\d+)\s*(s|m|h|d)$/);
        if (rel) {
            const value = parseInt(rel[1], 10);
            const ms = value * UNITS[rel[2]];
            if (value <= 0) return null;
            return { dueAt: Date.now() + ms, recurring: null, weeklyDay: null, isRelative: true, display: `${value}${rel[2]}` };
        }
    }

    // Absolute clock time.
    let tomorrow = false;
    if (/^tomorrow\b/.test(s)) { tomorrow = true; s = s.replace(/^tomorrow\s*/, '').trim(); }
    const clock = parseClock(s);
    if (!clock) return null;

    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), clock.h, clock.m, 0, 0);

    if (tomorrow) {
        d.setDate(d.getDate() + 1);
    } else if (recurring === 'weekly' && weeklyDay != null) {
        const target = DOW[weeklyDay];
        d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
        if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 7);
    } else if (d.getTime() <= Date.now()) {
        d.setDate(d.getDate() + 1); // next occurrence
    }

    return { dueAt: d.getTime(), recurring, weeklyDay, isRelative: false, display: fmt(d) };
}

/** Next fire time for a recurring reminder (or null if not recurring). */
function nextOccurrence(reminder) {
    if (!reminder || !reminder.recurring) return null;
    const d = new Date(reminder.dueAt);
    if (reminder.recurring === 'daily') d.setDate(d.getDate() + 1);
    else if (reminder.recurring === 'weekly') d.setDate(d.getDate() + 7);
    else return null;
    return d.getTime();
}

/**
 * Try the longest leading prefix of `tokens` (up to 4 words) that parses as a
 * time spec. Returns { spec, consumed } or null. Used by .remind / .schedule so
 * both "10m msg" and "tomorrow 9am msg" split correctly.
 */
function parseLeadingTime(tokens) {
    const arr = Array.isArray(tokens) ? tokens : [];
    for (let n = Math.min(4, arr.length - 1); n >= 1; n--) {
        const parsed = parseTimeSpec(arr.slice(0, n).join(' '));
        if (parsed) return { spec: parsed, consumed: n };
    }
    return null;
}

module.exports = { parseTimeSpec, parseLeadingTime, nextOccurrence, formatDue: (t) => fmt(new Date(t)) };
