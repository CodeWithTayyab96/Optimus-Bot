/**
 * Anti-spam (flood detection) for groups.
 *
 * Ported behaviour from Shadow MD (`drenox.js:5962` toggle + `drenox.js:1012`
 * enforcement) and re-implemented on top of Optimus infrastructure:
 *   - settings persist in data/userGroupData.json via lib/index.js
 *     (Shadow kept the counter in `global.spam` and lost it on restart)
 *   - admin / sudo / owner exemption via lib/isAdmin.js and lib/isOwner.js
 *   - warn strikes reuse the shared incrementWarningCount() store, so a flood
 *     counts toward the same 3-strike limit as .warn, antilink and antibadword
 *
 * Shadow kicks immediately at the threshold. Optimus defaults to `warn`
 * instead, and lets the group admin escalate to `kick` or downgrade to
 * `delete`.
 *
 * Behaviour: if a non-admin sends >= `threshold` messages within `window` ms,
 * the offending message is deleted and the configured action is applied.
 */

const isAdmin = require('./isAdmin');
const isOwnerOrSudo = require('./isOwner');
const { applyAction, VALID_ACTIONS, DEFAULT_ACTION } = require('./moderationAction');
const { getAntispam, isSudo } = require('./index');

const DEFAULT_THRESHOLD = 5;   // messages
const DEFAULT_WINDOW_MS = 5000; // ms

// `${chatId}|${senderId}` -> { count, first }
const hits = new Map();

// Upper bound before we prune, so the map can never grow without limit.
const MAX_TRACKED = 500;

function key(chatId, senderId) {
    return `${chatId}|${senderId}`;
}

/**
 * Records a message and returns the number of messages this sender has sent
 * inside the current window (including this one).
 */
function record(chatId, senderId, windowMs, now = Date.now()) {
    const k = key(chatId, senderId);
    const entry = hits.get(k);

    if (!entry || now - entry.first > windowMs) {
        hits.set(k, { count: 1, first: now });
        prune(windowMs, now);
        return 1;
    }

    entry.count += 1;

    // Rolling window: once the window has elapsed, start a fresh one.
    if (now - entry.first > windowMs) {
        hits.set(k, { count: 1, first: now });
        return 1;
    }

    return entry.count;
}

function prune(windowMs, now = Date.now()) {
    if (hits.size <= MAX_TRACKED) return;
    for (const [k, v] of hits) {
        if (now - v.first > windowMs) hits.delete(k);
    }
    // If still oversized (a very busy window), drop the oldest half.
    if (hits.size > MAX_TRACKED) {
        const keys = [...hits.keys()].slice(0, Math.floor(hits.size / 2));
        for (const k of keys) hits.delete(k);
    }
}

/** Forget a sender's counter (used after a sanction and by tests). */
function clear(chatId, senderId) {
    hits.delete(key(chatId, senderId));
}

/** Test/ops helper: drop all counters. */
function clearAll() {
    hits.clear();
}

function resolveConfig(groupId) {
    const stored = getAntispam(groupId) || {};
    return {
        enabled: stored.enabled === true,
        action: VALID_ACTIONS.includes(stored.action) ? stored.action : DEFAULT_ACTION,
        threshold: Number.isFinite(stored.threshold) && stored.threshold > 1
            ? Math.floor(stored.threshold)
            : DEFAULT_THRESHOLD,
        window: Number.isFinite(stored.window) && stored.window >= 1000
            ? Math.floor(stored.window)
            : DEFAULT_WINDOW_MS
    };
}

/**
 * Runs anti-spam for one incoming group message.
 * Returns true when the message was consumed and normal processing must stop.
 */
async function handleSpamDetection(sock, chatId, message, senderId) {
    try {
        if (!chatId || !String(chatId).endsWith('@g.us')) return false;
        if (!senderId || message?.key?.fromMe) return false;

        const cfg = resolveConfig(chatId);
        if (!cfg.enabled) return false;

        // Admins, sudo users and the owner are never sanctioned.
        try {
            const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
            if (isSenderAdmin) return false;
        } catch (_) { /* group metadata unavailable — fall through */ }

        if (await isSudo(senderId)) return false;
        try {
            if (await isOwnerOrSudo(senderId, sock, chatId)) return false;
        } catch (_) { /* non-fatal */ }

        const count = record(chatId, senderId, cfg.window);
        if (count < cfg.threshold) return false;

        clear(chatId, senderId);
        return await applyAction(sock, chatId, message, senderId, cfg.action, 'stop flooding the group');
    } catch (error) {
        console.error('[antispam] error:', error.message);
        return false;
    }
}

module.exports = {
    handleSpamDetection,
    resolveConfig,
    record,
    clear,
    clearAll,
    VALID_ACTIONS,
    DEFAULT_THRESHOLD,
    DEFAULT_WINDOW_MS,
    DEFAULT_ACTION
};
