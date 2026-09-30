/**
 * viewOnceToDm — reply-triggered "send this media to my DM".
 *
 * When the owner/sudo REPLIES to a media message (view-once image/video, or a
 * voice note) with an explicit save trigger (e.g. "save", "dm", 📥), the bot
 * downloads that media and forwards it to the sender's DM so it can be kept.
 *
 * This complements the `.vv` command (which re-sends the media into the SAME
 * chat). Here the whole point is to get it out of the group and into your DM —
 * so the confirmation goes to the DM too, never back into the group.
 *
 * Owner/sudo only (gated by the caller) — it never fires for other members.
 *
 * WHY THE TRIGGERS ARE SO NARROW (v2.2.1)
 *   They used to include ordinary conversational words — "nice", "good", "cool",
 *   "wow", "love", "yes", "yep" — plus chatty emojis (❤️ 👍 😍 🔥 💯). The idea was
 *   a low-friction save, but the effect was that replying "nice" to any media
 *   silently hijacked the message: the bot forwarded the media and posted a
 *   confirmation nobody asked for. A trigger has to be something a person would
 *   never type by accident. Only explicit save-intent survives.
 */
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { resolveDmJid } = require('./dmTarget');

// Reply must be EXACTLY one of these. Every entry has to read as a deliberate
// command — no conversational filler, or the bot fires on ordinary chat.
const TRIGGER_WORDS = new Set([
    'save', 'dm', 'keep', 'download', 'savethis', 'sendme',
]);
const TRIGGER_EMOJIS = ['📥', '💾'];

const ENVELOPE_KEYS = [
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'viewOnceMessage',
    'ephemeralMessage',
];

/** Recursively unwrap view-once / ephemeral envelopes to find the raw media node. */
function findMedia(content, depth = 0) {
    if (!content || depth > 10) return null;

    if (content.imageMessage) return { type: 'image', media: content.imageMessage };
    if (content.videoMessage) return { type: 'video', media: content.videoMessage };
    if (content.audioMessage) return { type: 'audio', media: content.audioMessage };

    for (const key of ENVELOPE_KEYS) {
        if (content[key]?.message) {
            const r = findMedia(content[key].message, depth + 1);
            if (r) return r;
        }
    }
    if (content.message && typeof content.message === 'object') {
        const r = findMedia(content.message, depth + 1);
        if (r) return r;
    }
    return null;
}

/** The text the user typed as their reply. */
function getReplyText(message) {
    const m = message?.message;
    if (!m) return '';
    return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        ''
    );
}

/** True when the reply text is exactly a trigger word or a trigger emoji. */
function isTrigger(replyText) {
    const t = (replyText || '').trim();
    if (!t) return false;
    if (TRIGGER_WORDS.has(t.toLowerCase())) return true;
    if (TRIGGER_EMOJIS.includes(t)) return true;
    return false;
}

// Private-target resolution lives in ./dmTarget — see that file for why
// `senderId` alone is not a safe DM target.

// (resolveDmJid used to live here — it now lives in ./dmTarget.)

async function downloadMedia(mediaNode, type) {
    const stream = await downloadContentFromMessage(mediaNode, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

/**
 * If this message is a trigger reply to a media message, forward that media to
 * the sender's DM. Returns true if handled (so the caller can stop processing).
 */
async function handleViewOnceReply(sock, message, chatId, senderId) {
    try {
        const replyText = getReplyText(message);
        if (!isTrigger(replyText)) return false;

        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) return false;

        const found = findMedia(quoted);
        if (!found) return false;

        let buffer;
        try {
            buffer = await downloadMedia(found.media, found.type);
        } catch (e) {
            console.error('[viewOnceToDm] download failed:', e.message);
            await sock.sendMessage(chatId, {
                text: '❌ Could not download that media (it may have expired).',
            }, { quoted: message });
            return true;
        }
        if (!buffer || !buffer.length) return false;

        // Resolve a genuinely private target — never the chat we are trying to
        // get this media OUT of. See resolveDmJid() for why senderId alone lies.
        const dmJid = resolveDmJid(sock, message, chatId, senderId);
        if (!dmJid) {
            console.error('[viewOnceToDm] could not resolve a DM target — not sending');
            return false;
        }

        const caption = found.media.caption || '';

        if (found.type === 'image') {
            await sock.sendMessage(dmJid, { image: buffer, caption });
        } else if (found.type === 'video') {
            await sock.sendMessage(dmJid, { video: buffer, caption });
        } else if (found.type === 'audio') {
            await sock.sendMessage(dmJid, {
                audio: buffer,
                mimetype: found.media.mimetype || 'audio/ogg; codecs=opus',
                ptt: true,
            });
        }

        // Confirm in the DM — NEVER in the source chat. Announcing "saved" in a
        // group tells everyone what the owner just kept, which defeats the whole
        // point of pulling the media out of there. When the trigger was typed in
        // the DM itself the media has simply appeared in this very chat.
        if (dmJid === chatId) {
            await sock.sendMessage(chatId, { text: '📥 Saved.' }, { quoted: message });
        } else {
            await sock.sendMessage(dmJid, { text: '📥 Saved to your DM.' });
        }
        return true;
    } catch (e) {
        console.error('[viewOnceToDm] error:', e.message);
        return false;
    }
}

module.exports = { handleViewOnceReply, isTrigger, findMedia };
