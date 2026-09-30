/**
 * dmTarget — work out a SAFE private JID to send something to.
 *
 * WHY THIS EXISTS
 *   Throughout this codebase `senderId` is
 *   `message.key.participant || message.key.remoteJid` (main.js). That value is
 *   NOT a DM, and treating it as one has already caused a real bug:
 *
 *     - A reply sent from the owner's OWN linked device carries no `participant`,
 *       so `senderId` collapses to the CHAT JID. In a group, that is the GROUP.
 *     - That path is reachable because the owner gate is
 *       `message.key.fromMe || senderIsOwnerOrSudo` — `fromMe` passes outright.
 *     - A group JID must never be used as a private target under any circumstance.
 *
 *   Anything that promises to send something "privately" must resolve its target
 *   through here rather than trusting senderId.
 */

/** '923701609799:12@s.whatsapp.net' → '923701609799@s.whatsapp.net' */
function toUserJid(jid) {
    if (!jid) return null;
    const s = String(jid);
    const at = s.indexOf('@');
    if (at < 1) return null;
    return `${s.slice(0, at).split(':')[0]}${s.slice(at)}`;
}

/** True for a group JID (never a valid private target). */
function isGroupJid(jid) {
    return String(jid || '').endsWith('@g.us');
}

/** The bot's own user JID, normalised. */
function selfJid(sock) {
    return toUserJid(sock?.user?.id || sock?.user?.jid);
}

/**
 * Where a private send should land.
 *
 * @param {object} sock      the live socket (for sock.user.id)
 * @param {object} message   the triggering message (for key.fromMe)
 * @param {string} chatId    the chat the trigger arrived in
 * @param {string} senderId  main.js's `participant || remoteJid`
 * @returns {string|null}    a user JID, or null when nothing safe can be derived
 */
function resolveDmJid(sock, message, chatId, senderId) {
    const self = selfJid(sock);

    // Own-device reply: `participant` is absent, so senderId is the chat itself.
    // Never trust it — go to the account's own chat.
    if (message?.key?.fromMe) return self;

    const candidate = toUserJid(senderId || chatId);
    if (!candidate || isGroupJid(candidate)) return self;
    return candidate;
}

module.exports = { toUserJid, isGroupJid, selfJid, resolveDmJid };
