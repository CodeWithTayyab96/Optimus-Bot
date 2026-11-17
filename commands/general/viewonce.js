const { downloadContentFromMessage, downloadMediaMessage } = require('@whiskeysockets/baileys');
const store = require('../../lib/lightweight_store');

const ENVELOPES = ['viewOnceMessageV2', 'viewOnceMessageV2Extension', 'viewOnceMessage', 'ephemeralMessage'];

// Find the media node inside a (possibly wrapped) quoted message.
function findMedia(content, depth = 0) {
    if (!content || depth > 10) return null;
    if (content.imageMessage) return { type: 'image', media: content.imageMessage };
    if (content.videoMessage) return { type: 'video', media: content.videoMessage };
    if (content.audioMessage) return { type: 'audio', media: content.audioMessage };
    for (const key of ENVELOPES) {
        if (content[key]?.message) {
            const r = findMedia(content[key].message, depth + 1);
            if (r) return r;
        }
    }
    return null;
}

function isViewOnce(quoted, found) {
    return !!(quoted.viewOnceMessageV2 || quoted.viewOnceMessageV2Extension ||
        quoted.viewOnceMessage || found?.media?.viewOnce);
}

async function toBuffer(stream) {
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

async function viewonceCommand(sock, chatId, message) {
    const ctx = message.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    let found = quoted ? findMedia(quoted) : null;

    if (!found || !isViewOnce(quoted, found)) {
        return sock.sendMessage(chatId, { text: '❌ Please reply to a view-once image, video or voice note.' }, { quoted: message });
    }

    try {
        let buffer;
        // WhatsApp often strips url/mediaKey from quoted view-once media:
        // recover it from the proactive cache / message store first.
        if (!found.media.url && !found.media.directPath && ctx.stanzaId) {
            const cached = store.loadCachedMedia && store.loadCachedMedia(ctx.stanzaId);
            if (cached?.buffer) {
                buffer = cached.buffer;
                found = { type: cached.type || found.type, media: { ...found.media, caption: cached.caption || found.media.caption } };
            } else {
                const original = store.loadMessage && await store.loadMessage(chatId, ctx.stanzaId);
                const stored = original?.message && findMedia(original.message);
                if (stored) found = stored;
            }
        }
        if (!buffer) {
            try {
                buffer = await toBuffer(await downloadContentFromMessage(found.media, found.type));
            } catch (e) {
                // Last resort: ask WhatsApp to re-upload the media.
                buffer = await downloadMediaMessage(
                    { key: { remoteJid: chatId, id: ctx.stanzaId, participant: ctx.participant }, message: quoted },
                    'buffer', {}, { reuploadRequest: sock.updateMediaMessage }
                );
            }
        }

        const caption = found.media.caption || '';
        const payload = found.type === 'image' ? { image: buffer, caption, fileName: 'media.jpg' }
            : found.type === 'video' ? { video: buffer, caption, fileName: 'media.mp4', mimetype: 'video/mp4' }
            : { audio: buffer, ptt: true, mimetype: 'audio/ogg; codecs=opus' };
        await sock.sendMessage(chatId, payload, { quoted: message });
    } catch (error) {
        const diag = store.diagnose ? store.diagnose(chatId, ctx?.stanzaId) : '';
        console.error('[vv]', error?.message || error, '|', diag);
        await sock.sendMessage(chatId, { text: '❌ Could not download that media.\n\n🔎 ' + diag }, { quoted: message });
    }
}

module.exports = {
    name: 'vv',
    aliases: [],
    category: 'general',
    description: 'Recover view-once media as a normal message so it stays viewable. Tip: reply "save"/"dm"/📥 to get it in your DM.',
    usage: '.vv (reply to a view-once image/video/audio)  •  reply "save" to send it to your DM',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await viewonceCommand(sock, extra.chatId, message);
    },
};
