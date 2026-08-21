/**
 * Reminder Store — manages scheduled reminders with persistence.
 *
 * Persists to data/reminders.json
 * Structure:
 * {
 *   "reminders": {
 *     "R001": { id, userJid, chatJid, text, dueAt, createdAt, status, groupContext }
 *   }
 * }
 */

const { readJson, writeJson } = require('./dataStore');
const FILE = 'reminders.json';

function loadAll() {
    return readJson(FILE, { reminders: {} });
}

function saveAll(data) {
    return writeJson(FILE, data);
}

/**
 * Generate next reminder ID.
 */
function nextId() {
    const data = loadAll();
    const ids = Object.keys(data.reminders).map(id => {
        const num = parseInt(id.replace('R', ''), 10);
        return isNaN(num) ? 0 : num;
    });
    const maxNum = ids.length > 0 ? Math.max(...ids) : 0;
    return 'R' + String(maxNum + 1).padStart(3, '0');
}

/**
 * Create a new reminder.
 */
function createReminder({ userJid, chatJid, text, dueAt, groupContext = false }) {
    const data = loadAll();
    const id = nextId();

    const reminder = {
        id,
        userJid,
        chatJid,
        text,
        dueAt,
        createdAt: Date.now(),
        status: 'pending',
        groupContext
    };

    data.reminders[id] = reminder;
    saveAll(data);
    return reminder;
}

/**
 * Get a reminder by ID.
 */
function getReminder(id) {
    const data = loadAll();
    return data.reminders[id] || null;
}

/**
 * Get all pending reminders for a user.
 */
function getUserReminders(userJid) {
    const data = loadAll();
    return Object.values(data.reminders).filter(
        r => r.userJid === userJid && r.status === 'pending'
    );
}

/**
 * Get all pending reminders (for scheduler restore).
 */
function getAllPending() {
    const data = loadAll();
    return Object.values(data.reminders).filter(r => r.status === 'pending');
}

/**
 * Get overdue reminders (due but not yet delivered).
 */
function getOverdue() {
    const now = Date.now();
    const data = loadAll();
    return Object.values(data.reminders).filter(
        r => r.status === 'pending' && r.dueAt <= now
    );
}

/**
 * Mark a reminder as completed.
 */
function completeReminder(id) {
    const data = loadAll();
    if (data.reminders[id]) {
        data.reminders[id].status = 'completed';
        saveAll(data);
    }
}

/**
 * Cancel a reminder. Returns true if cancelled.
 */
function cancelReminder(id, userJid) {
    const data = loadAll();
    const reminder = data.reminders[id];
    if (!reminder) return false;
    if (reminder.userJid !== userJid) return false;
    if (reminder.status !== 'pending') return false;

    reminder.status = 'cancelled';
    saveAll(data);
    return true;
}

/**
 * Clean up old completed/cancelled reminders (older than 7 days).
 */
function cleanup(maxAge = 7 * 24 * 60 * 60 * 1000) {
    const data = loadAll();
    const cutoff = Date.now() - maxAge;
    let removed = 0;

    for (const [id, reminder] of Object.entries(data.reminders)) {
        if (reminder.status !== 'pending' && reminder.createdAt < cutoff) {
            delete data.reminders[id];
            removed++;
        }
    }

    if (removed > 0) saveAll(data);
    return removed;
}

module.exports = {
    createReminder,
    getReminder,
    getUserReminders,
    getAllPending,
    getOverdue,
    completeReminder,
    cancelReminder,
    cleanup
};
