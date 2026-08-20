/**
 * Per-group message statistics (used by .topmembers) — stored in
 * data/messageStats.json as { [groupId]: { [userId]: count } }.
 *
 * Previously these lived at the top level of data/messageCount.json next to
 * the bot mode flag (isPublic), which conflated two unrelated concerns.
 * One-time migration imports any group-count keys found there.
 *
 * Hot-path design: increments only touch memory and mark the store dirty;
 * a periodic flush writes the whole file (temp file + rename for
 * atomicity). A synchronous last-resort flush runs on process exit so no
 * counts are lost on restart. No synchronous I/O happens per message.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATS_FILE = path.join(DATA_DIR, 'messageStats.json');
// Legacy file that held mode + stats together — migration source only.
const LEGACY_FILE = path.join(DATA_DIR, 'messageCount.json');

const FLUSH_INTERVAL_MS = 15000;

let stats = null;
let dirty = false;
let flushTimer = null;
let flushPromise = null;

function persistNow() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        // Write to a temp file and rename so a crash mid-write cannot corrupt the store.
        const tmp = STATS_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(stats, null, 2));
        fs.renameSync(tmp, STATS_FILE);
        return true;
    } catch (e) {
        console.error('[messageStats] failed to write messageStats.json:', e.message);
        return false;
    }
}

function load() {
    if (stats) return stats;
    stats = {};

    try {
        if (fs.existsSync(STATS_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
            if (data && typeof data === 'object') stats = data;
        } else if (fs.existsSync(LEGACY_FILE)) {
            // One-time migration: import group-count keys, skip mode/meta keys.
            const legacy = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'));
            if (legacy && typeof legacy === 'object') {
                for (const [key, value] of Object.entries(legacy)) {
                    if (key === 'isPublic' || key === 'messageCount') continue;
                    if (value && typeof value === 'object' && !Array.isArray(value)) {
                        stats[key] = value;
                    }
                }
            }
            persistNow(); // persist migrated data immediately
        }
    } catch (e) {
        console.error('[messageStats] failed to load stats, starting empty:', e.message);
    }

    return stats;
}

function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
    }, FLUSH_INTERVAL_MS);
}

/**
 * Increment the message count for (group, user). Memory-only; persisted
 * on the next periodic flush.
 */
function increment(groupId, userId) {
    const s = load();
    if (!s[groupId]) s[groupId] = {};
    s[groupId][userId] = (s[groupId][userId] || 0) + 1;
    dirty = true;
    scheduleFlush();
}

/**
 * Returns the per-user counts for a group (possibly empty object).
 */
function getGroupStats(groupId) {
    return load()[groupId] || {};
}

/**
 * Persist pending changes now (called by the periodic timer and on shutdown).
 */
async function flush() {
    if (!dirty) return;
    if (flushPromise) return flushPromise;

    dirty = false;
    flushPromise = (async () => {
        if (!persistNow()) dirty = true; // retry on next flush if the write failed
    })();

    try {
        await flushPromise;
    } finally {
        flushPromise = null;
    }
}

// Last-resort synchronous flush so a restart never drops pending counts.
process.on('exit', () => {
    if (dirty && stats) {
        persistNow();
    }
});

// Clean shutdown paths (PM2 restart, .restart, .update) also flush first.
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        if (dirty && stats) persistNow();
        process.exit(0);
    });
}

module.exports = { increment, getGroupStats, flush };
