/**
 * Shared enforcement helper for the automatic moderation features
 * (antibadword / antilink / antispam / antibot).
 *
 * Each caller decides *what* triggered the sanction; this module decides
 * *how* to carry it out, so every feature behaves identically:
 *
 *   1. delete the offending message (always)
 *   2. then: delete  → notice only
 *            warn    → +1 strike on the shared warning counter, kick at limit
 *            kick    → remove the sender immediately
 *
 * The strike counter is the same one .warn / .warnings / .resetwarn use
 * (incrementWarningCount in lib/index.js), so manual and automatic warnings
 * add up toward one limit.
 */

const config = require('../config');
const style = require('./messageStyle');
const { incrementWarningCount, resetWarningCount } = require('./index');

const WARN_LIMIT = config.WARN_COUNT || 3;
const VALID_ACTIONS = ['delete', 'warn', 'kick'];
const DEFAULT_ACTION = 'warn';

function shortJid(jid) {
    return String(jid || '').split('@')[0];
}

function normalizeAction(action) {
    return VALID_ACTIONS.includes(action) ? action : DEFAULT_ACTION;
}

/**
 * @param {object} sock       Baileys socket
 * @param {string} chatId     group JID
 * @param {object} message    the offending message (used for delete + quote)
 * @param {string} senderId   participant JID
 * @param {string} action     'delete' | 'warn' | 'kick'
 * @param {string} reason     short human-readable reason used in the notice
 * @returns {Promise<boolean>} true when the message was removed
 */
async function applyAction(sock, chatId, message, senderId, action, reason) {
    const act = normalizeAction(action);

    try {
        await sock.sendMessage(chatId, { delete: message.key });
    } catch (e) {
        console.error('[moderationAction] failed to delete message:', e.message);
        return false;
    }

    const who = `@${shortJid(senderId)}`;

    if (act === 'delete') {
        await sock.sendMessage(chatId, {
            text: style.warning(`${who}, ${reason}`),
            mentions: [senderId]
        }).catch(() => { });
        return true;
    }

    if (act === 'kick') {
        try {
            await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
        } catch (e) {
            console.error('[moderationAction] failed to kick:', e.message);
        }
        await sock.sendMessage(chatId, {
            text: style.warning(`${who} was removed — ${reason}`),
            mentions: [senderId]
        }).catch(() => { });
        return true;
    }

    // act === 'warn'
    let count = 0;
    try {
        count = await incrementWarningCount(chatId, senderId);
    } catch (e) {
        console.error('[moderationAction] failed to record warning:', e.message);
    }

    if (count >= WARN_LIMIT) {
        await resetWarningCount(chatId, senderId);
        try {
            await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
        } catch (e) {
            console.error('[moderationAction] failed to kick after warnings:', e.message);
        }
        await sock.sendMessage(chatId, {
            text: style.warning(`${who} was removed after ${WARN_LIMIT} warnings — ${reason}`),
            mentions: [senderId]
        }).catch(() => { });
        return true;
    }

    await sock.sendMessage(chatId, {
        text: style.warning(`${who} warning ${count}/${WARN_LIMIT} — ${reason}`),
        mentions: [senderId]
    }).catch(() => { });
    return true;
}

module.exports = {
    applyAction,
    VALID_ACTIONS,
    DEFAULT_ACTION,
    WARN_LIMIT
};
