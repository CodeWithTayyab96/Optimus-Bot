/**
 * Anti-bot — keeps other WhatsApp bots out of a group.
 *
 * Behaviour ported from Shadow MD (`drenox.js:5994` toggle +
 * `drenox.js:1048` enforcement) but with one important correction.
 *
 * Shadow flags any message whose first character is `. ! / #` and deletes it.
 * Because that check runs *before* command dispatch, Shadow also deletes its
 * own commands — the feature is self-defeating.
 *
 * Optimus instead hooks the *unknown command* branch in main.js: a message is
 * only treated as a foreign bot command when it looks like a command AND no
 * registered Optimus command matched it. That catches `!play`, `/start`,
 * `#cmd`, `!yt` from rival bots while leaving `.ping`, `.help` and friends
 * untouched. It also catches a rival bot that shares Optimus's own prefix,
 * because an unknown `.something` is exactly what a foreign bot produces.
 *
 * Settings persist in data/userGroupData.json via lib/index.js
 * (Shadow kept the flag in an in-memory Set).
 */

const isAdmin = require('./isAdmin');
const isOwnerOrSudo = require('./isOwner');
const { applyAction, VALID_ACTIONS, DEFAULT_ACTION } = require('./moderationAction');
const { getAntibot, isSudo } = require('./index');

// Characters WhatsApp bots commonly use as a command prefix.
const PREFIX_CHARS = '.!/#*&+$@';

function resolveConfig(groupId) {
    const stored = getAntibot(groupId) || {};
    return {
        enabled: stored.enabled === true,
        action: VALID_ACTIONS.includes(stored.action) ? stored.action : DEFAULT_ACTION
    };
}

/**
 * True when the text looks like a bot command, e.g. `!play`, `/start`,
 * `.song hello`. A bare `.` or `..` is not a command.
 */
function looksLikeCommand(text) {
    const t = String(text || '').trim();
    if (t.length < 2) return false;
    if (!PREFIX_CHARS.includes(t[0])) return false;
    // Must have a command word after the prefix.
    return /^\S{2,}$/.test(t.slice(1).trim()) || t.slice(1).trim().length > 0;
}

/**
 * Runs anti-bot for one incoming group message that matched no known command.
 * Returns true when the message was consumed and normal processing must stop.
 */
async function handleBotCommandDetection(sock, chatId, message, senderId, text) {
    try {
        if (!chatId || !String(chatId).endsWith('@g.us')) return false;
        if (!senderId || message?.key?.fromMe) return false;

        const cfg = resolveConfig(chatId);
        if (!cfg.enabled) return false;

        if (!looksLikeCommand(text)) return false;

        try {
            const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
            if (isSenderAdmin) return false;
        } catch (_) { /* group metadata unavailable — fall through */ }

        if (await isSudo(senderId)) return false;
        try {
            if (await isOwnerOrSudo(senderId, sock, chatId)) return false;
        } catch (_) { /* non-fatal */ }

        return await applyAction(
            sock, chatId, message, senderId, cfg.action,
            'bot commands are not allowed in this group'
        );
    } catch (error) {
        console.error('[antibot] error:', error.message);
        return false;
    }
}

module.exports = {
    handleBotCommandDetection,
    looksLikeCommand,
    resolveConfig,
    PREFIX_CHARS,
    VALID_ACTIONS,
    DEFAULT_ACTION
};
