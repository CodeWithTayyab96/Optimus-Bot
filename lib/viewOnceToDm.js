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
const { downloadContentFromMessage, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { resolveDmJid } = require('./dmTarget');
const store = require('./lightweight_store');

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

function isTrigger(replyText) {
    const t = (replyText || '').trim();
    if (!t) return false;
    if (TRIGGER_WORDS.has(t.toLowerCase())) return true;
    if (TRIGGER_EMOJIS.includes(t)) return true;
    return false;
}

async function downloadMedia(mediaNode, type) {
    const stream = await downloadContentFromMessage(mediaNode, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

async function handleViewOnceReply(sock, message, chatId, senderId) {
    try {
        const replyText = getReplyText(message);
        if (!isTrigger(replyText)) return false;

        const ctx = message.message?.extendedTextMessage?.contextInfo;
        const quoted = ctx?.quotedMessage;
        if (!quoted) return false;

        let found = findMedia(quoted);
        if (!found) return false;

        const needsRecovery = !found.media.url && !found.media.directPath;
        let buffer;

        // Store lookup — update media node with stored credentials.
        if (needsRecovery) {
            const stanzaId = ctx?.stanzaId;
            if (stanzaId) {
                // Check proactive media cache first.
                const cached = store.loadCachedMedia(stanzaId);
                if (cached) {
                    console.log(`[viewOnceToDm] DEBUG: media cache hit for ${stanzaId}`);
                    buffer = cached.buffer;
                    found = { type: cached.type, media: { ...found.media, caption: cached.caption || found.media.caption } };
                }

                if (!buffer) {
                    const original = await store.loadMessage(chatId, stanzaId);
                    if (original?.message) {
                        const stored = findMedia(original.message);
                        if (stored) found = stored;
                    }
                }

                // Try downloadMediaMessage with reuploadRequest.
                if (!buffer) {
                    try {
                        const syntheticMsg = {
                            key: {
                                remoteJid: chatId,
                                id: stanzaId,
                                participant: ctx.participant,
                            },
                            message: quoted,
                        };
                        buffer = await downloadMediaMessage(syntheticMsg, 'buffer', {}, {
                            reuploadRequest: sock.updateMediaMessage,
                        });
                    } catch (reupErr) {
                        console.log(`[viewOnceToDm] DEBUG: downloadMediaMessage+reupload failed: ${reupErr.message}`);
                    }
                }
            }
        }

        if (!buffer) {
            try {
                buffer = await downloadMedia(found.media, found.type);
            } catch (e) {
                console.error('[viewOnceToDm] download failed:', e.message);
                await sock.sendMessage(chatId, {
                    text: '❌ Could not download that media (it may have expired).',
                }, { quoted: message });
                return true;
            }
        }

        if (!buffer || !buffer.length) return false;

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
