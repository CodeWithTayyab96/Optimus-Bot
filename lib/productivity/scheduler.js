/**
 * Reminder Scheduler — manages timers for pending reminders.
 *
 * On startup, loads all pending reminders from persistence and
 * reconstructs timers for those still in the future. Overdue
 * reminders are delivered immediately with an "overdue" indicator.
 *
 * Duplicate execution is prevented by marking reminders as
 * "executing" before delivery and "completed" after.
 */

const reminderStore = require('./reminderStore');
const { nextOccurrence } = require('./timeParse');

// Map of active timers: reminderId → setTimeout handle
const activeTimers = new Map();

// The sock (Baileys connection) — set once on init
let sockRef = null;

/**
 * Initialize the scheduler. Call once after bot connects.
 * @param {object} sock — Baileys socket
 */
function init(sock) {
    sockRef = sock;
    console.log('[Scheduler] Initializing...');

    // Cleanup old completed/cancelled reminders
    const cleaned = reminderStore.cleanup();
    if (cleaned > 0) console.log(`[Scheduler] Cleaned up ${cleaned} old reminders`);

    // Restore all pending reminders
    restorePending();
}

/**
 * Restore pending reminders from persistence and schedule them.
 */
function restorePending() {
    const pending = reminderStore.getAllPending();
    console.log(`[Scheduler] Loaded ${pending.length} pending reminders`);

    const now = Date.now();

    for (const reminder of pending) {
        if (reminder.dueAt <= now) {
            // Overdue — deliver immediately
            console.log(`[Scheduler] Delivering overdue reminder ${reminder.id}`);
            deliverReminder(reminder);
        } else {
            // Schedule for the future
            scheduleTimer(reminder);
        }
    }
}

/**
 * Schedule a timer for a reminder.
 */
function scheduleTimer(reminder) {
    const delay = reminder.dueAt - Date.now();
    if (delay <= 0) {
        deliverReminder(reminder);
        return;
    }

    console.log(`[Scheduler] Scheduled ${reminder.id} in ${Math.round(delay / 1000)}s`);

    const timer = setTimeout(() => {
        deliverReminder(reminder);
    }, delay);

    activeTimers.set(reminder.id, timer);
}

/**
 * Deliver a reminder to the chat.
 */
async function deliverReminder(reminder) {
    // Prevent duplicate delivery
    if (reminder.status !== 'pending') return;

    const timer = activeTimers.get(reminder.id);
    if (timer) {
        clearTimeout(timer);
        activeTimers.delete(reminder.id);
    }

    if (!sockRef) {
        console.error(`[Scheduler] No sock available for reminder ${reminder.id}`);
        return;
    }

    try {
        const isOverdue = Date.now() > reminder.dueAt + 60000; // >1 min overdue
        // A scheduled MESSAGE is posted as-is; a REMINDER gets a prefix.
        const text = (reminder.kind === 'message')
            ? reminder.text
            : `${isOverdue ? '⏰ *Overdue Reminder:* ' : '⏰ *Reminder:* '}${reminder.text}`;

        await sockRef.sendMessage(reminder.chatJid, { text });

        // Recurring → schedule the next occurrence instead of finishing.
        if (reminder.recurring) {
            const next = nextOccurrence(reminder);
            if (next) {
                reminderStore.rescheduleReminder(reminder.id, next);
                const updated = reminderStore.getReminder(reminder.id);
                if (updated) scheduleTimer(updated);
                console.log(`[Scheduler] Rescheduled recurring ${reminder.id} → ${new Date(next).toISOString()}`);
                return;
            }
        }

        reminderStore.markDelivered(reminder.id);
        console.log(`[Scheduler] Delivered ${reminder.id}`);
    } catch (e) {
        console.error(`[Scheduler] Failed to deliver ${reminder.id}:`, e.message);
        // Mark as delivered so it doesn't retry endlessly
        reminderStore.markDelivered(reminder.id);
    }
}

/**
 * Cancel a timer (e.g. when user cancels a reminder).
 */
function cancelTimer(reminderId) {
    const timer = activeTimers.get(reminderId);
    if (timer) {
        clearTimeout(timer);
        activeTimers.delete(reminderId);
    }
}

/**
 * Schedule a new reminder that was just created.
 */
function scheduleNew(reminder) {
    scheduleTimer(reminder);
}

/**
 * Get count of active timers (for diagnostics).
 */
function getActiveCount() {
    return activeTimers.size;
}

/**
 * Shutdown all timers (for clean process exit).
 */
function shutdown() {
    for (const [id, timer] of activeTimers) {
        clearTimeout(timer);
    }
    activeTimers.clear();
    console.log('[Scheduler] Shut down all timers');
}

module.exports = {
    init,
    restorePending,
    scheduleNew,
    cancelTimer,
    deliverReminder,
    getActiveCount,
    shutdown
};
