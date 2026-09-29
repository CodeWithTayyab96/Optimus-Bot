/**
 * sessionInfo — describe what a WhatsApp session on disk actually is.
 *
 * Exists because "it HAS creds.json but still asks for a phone number" is the
 * single most confusing thing about linking. A creds.json FILE is not a LINKED
 * session: Baileys writes one with freshly generated keys as soon as the socket
 * connects, so the file can exist — and be rewritten — while `registered` is
 * still false. The only meaningful check is `creds.registered`.
 *
 * Kept out of index.js so it can be tested without starting the bot.
 */
const fs = require('fs');

/**
 * @param {object|null} creds   the loaded AuthenticationCreds (or null)
 * @param {string} credsPath    where creds.json lives
 */
function describeSession(creds, credsPath) {
    let size = null;
    try {
        size = fs.statSync(credsPath).size;
    } catch {
        /* absent */
    }

    // `me.id` looks like "923701609799:9@s.whatsapp.net" — the part before the
    // colon is the account number.
    const linkedJid = creds?.me?.id ? String(creds.me.id).split(':')[0] : '';

    return {
        path: credsPath,
        exists: size !== null,
        sizeBytes: size,
        registered: Boolean(creds?.registered),
        linkedJid,
    };
}

/** One-line summary for the console. Never includes key material. */
function sessionSummary(info) {
    return (
        `creds.json: ${info.exists ? `${info.sizeBytes} bytes` : 'MISSING'}` +
        ` · registered: ${info.registered}` +
        (info.linkedJid ? ` · linked as ${info.linkedJid}` : '')
    );
}

/** True when the bot will try to pair rather than connect. */
function needsPairing(info) {
    return !info.registered;
}

module.exports = { describeSession, sessionSummary, needsPairing };
