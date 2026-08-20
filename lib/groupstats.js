/**
 * Daily group message statistics (data/groupStats.json).
 * Ported from KnightBot-Mini utils/groupstats.js.
 *
 * Hot-path optimized: addMessage() (called for every group message) only
 * touches memory and marks the store dirty; a periodic flush writes the file
 * (temp + rename for atomicity) and a synchronous last-resort flush runs on
 * process exit, so no counts are lost on restart.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'groupStats.json');

const FLUSH_INTERVAL_MS = 15000;

let db = null;
let dirty = false;
let flushTimer = null;
let flushPromise = null;

function loadDB() {
    if (db) return db;
    db = {};
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
            if (data && typeof data === 'object') db = data;
        }
    } catch {
        db = {};
    }
    return db;
}

function persistNow() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = DB_PATH + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
        fs.renameSync(tmp, DB_PATH);
        return true;
    } catch (err) {
        console.error('[groupStats] save error:', err);
        return false;
    }
}

function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
    }, FLUSH_INTERVAL_MS);
}

function addMessage(groupId, senderId, opts = {}) {
    const data = loadDB();
    const today = new Date().toISOString().slice(0, 10);
    const hour = new Date().getHours();

    if (!data[groupId]) data[groupId] = {};
    if (!data[groupId][today]) {
        data[groupId][today] = {
            total: 0,
            users: {},
            hours: {},
            night: {},
            mentioned: {},
            stickers: {},
        };
    }

    const g = data[groupId][today];
    if (!g.users) g.users = {};
    if (!g.hours) g.hours = {};
    if (!g.night) g.night = {};
    if (!g.mentioned) g.mentioned = {};
    if (!g.stickers) g.stickers = {};
    if (typeof g.total !== 'number') g.total = 0;

    g.total++;
    g.users[senderId] = (g.users[senderId] || 0) + 1;
    g.hours[hour] = (g.hours[hour] || 0) + 1;

    if (hour >= 22 || hour < 6) {
        g.night[senderId] = (g.night[senderId] || 0) + 1;
    }

    if (opts.mentions?.length) {
        for (const m of opts.mentions) {
            g.mentioned[m] = (g.mentioned[m] || 0) + 1;
        }
    }

    if (opts.sticker) {
        g.stickers[senderId] = (g.stickers[senderId] || 0) + 1;
    }

    dirty = true;
    scheduleFlush();
}

function getStats(groupId) {
    const data = loadDB();
    const today = new Date().toISOString().slice(0, 10);
    if (!data[groupId] || !data[groupId][today]) return null;
    return data[groupId][today];
}

function getWeeklyStats(groupId) {
    const data = loadDB();
    if (!data[groupId]) return null;

    const users = {};
    let total = 0;
    const now = new Date();

    for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const day = data[groupId][key];
        if (!day) continue;
        total += day.total || 0;
        for (const [uid, count] of Object.entries(day.users || {})) {
            users[uid] = (users[uid] || 0) + count;
        }
    }

    if (!total) return null;
    return { total, users };
}

function rankUsers(map, limit = 5) {
    return Object.entries(map || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);
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

// Last-resort synchronous flush so a restart never drops pending stats.
process.on('exit', () => {
    if (dirty && db) {
        persistNow();
    }
});

// Clean shutdown paths (PM2 restart, .restart, .update) also flush first.
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        if (dirty && db) persistNow();
        process.exit(0);
    });
}

module.exports = { addMessage, getStats, getWeeklyStats, rankUsers, flush };
