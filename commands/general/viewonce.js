const style = require('../../lib/messageStyle');
const { downloadContentFromMessage, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { channelInfo } = require('../../lib/messageConfig');
const store = require('../../lib/lightweight_store');

const ENVELOPE_KEYS = [
    'viewOnceMessageV2Extension',
    'viewOnceMessageV2',
    'viewOnceMessage',
    'ephemeralMessage',
];

/**
 * Recursively unwrap view-once / ephemeral envelopes to find the raw media node.
 */
function findMedia(content, depth = 0) {
    if (!content || depth > 10) return null;

    if (content.imageMessage) return { type: 'image', media: content.imageMessage };
    if (content.videoMessage) return { type: 'video', media: content.videoMessage };
    if (content.audioMessage) return { type: 'audio', media: content.audioMessage };

    for (const key of ENVELOPE_KEYS) {
        if (content[key]?.message) {
            const result = findMedia(content[key].message, depth + 1);
            if (result) return result;
        }
    }

    if (content.message && typeof content.message === 'object') {
        const result = findMedia(content.message, depth + 1);
        if (result) return result;
    }

    return null;
}

async function downloadMedia(mediaNode, type) {
    const stream = await downloadContentFromMessage(mediaNode, type);
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function viewonceCommand(sock, chatId, message) {
    const ctx =
        message.message?.extendedTextMessage?.contextInfo ||
        message.message?.imageMessage?.contextInfo ||
        message.message?.videoMessage?.contextInfo ||
        message.message?.buttonsResponseMessage?.contextInfo ||
        message.message?.listResponseMessage?.contextInfo;
    const quotedMsg = ctx?.quotedMessage;

    const directImage = message.message?.imageMessage;
    const directVideo = message.message?.videoMessage;
    const directAudio = message.message?.audioMessage;

    let mediaType = null;
    let mediaNode = null;
    let caption = '';

    if (quotedMsg) {
        if (quotedMsg.imageMessage) {
            mediaType = 'image';
            mediaNode = quotedMsg.imageMessage;
            caption = mediaNode.caption || '';
        } else if (quotedMsg.videoMessage) {
            mediaType = 'video';
            mediaNode = quotedMsg.videoMessage;
            caption = mediaNode.caption || '';
        } else if (quotedMsg.audioMessage) {
            mediaType = 'audio';
            mediaNode = quotedMsg.audioMessage;
            caption = '';
        } else {
            const found = findMedia(quotedMsg);
            if (found) {
                mediaType = found.type;
                mediaNode = found.media;
                caption = found.media.caption || '';
            }
        }
    } else if (directImage) {
        mediaType = 'image';
        mediaNode = directImage;
        caption = directImage.caption || '';
    } else if (directVideo) {
        mediaType = 'video';
        mediaNode = directVideo;
        caption = directVideo.caption || '';
    } else if (directAudio) {
        mediaType = 'audio';
        mediaNode = directAudio;
        caption = '';
    }

    if (!mediaType || !mediaNode) {
        await sock.sendMessage(chatId, {
            text: style.error('Please reply to a view-once image or video.\n\n*Supported:*\n  🖼️ Image → View-Once image\n  🎬 Video → View-Once video\n  🎵 Audio → Voice note'),
            ...channelInfo,
        }, { quoted: message });
        return;
    }

    // 5. Credentials missing — use the same downloadMediaMessage +
    // reuploadRequest pattern that sticker.js / trace.js use. This lets
    // Baileys re-request fresh download credentials from WhatsApp's
    // server, which is the standard recovery for view-once messages whose
    // quotedMessage has been stripped of url / directPath / mediaKey.
    const needsRecovery = !mediaNode.url && !mediaNode.directPath;
    let buffer;

    // --- DEBUG (temporary) — log exactly what the store lookup sees ---
    if (needsRecovery && ctx?.stanzaId) {
        console.log(`[.vv] DEBUG: quoted node stripped (url=${mediaNode.url}, directPath=${mediaNode.directPath}, mediaKey=${mediaNode.mediaKey ? 'present' : 'MISSING'}), stanzaId=${ctx.stanzaId}`);
        const storedMsg = await store.loadMessage(chatId, ctx.stanzaId);
        if (storedMsg?.message) {
            const storedMedia = findMedia(storedMsg.message);
            console.log(`[.vv] DEBUG: store hit — storedMedia=${storedMedia ? storedMedia.type : 'null'}, url=${storedMedia?.media?.url ? 'present' : 'MISSING'}, mediaKey=${storedMedia?.media?.mediaKey ? 'present' : 'MISSING'}, directPath=${storedMedia?.media?.directPath ? 'present' : 'MISSING'}`);
            if (storedMedia) {
                mediaType = storedMedia.type;
                mediaNode = storedMedia.media;
                caption = storedMedia.media.caption || '';
            }
        } else {
            console.log(`[.vv] DEBUG: store miss — loadMessage(${chatId}, ${ctx.stanzaId}) returned ${storedMsg === null ? 'null' : typeof storedMsg}`);
        }
    }

    // 5a. Check proactive media cache first (media downloaded at arrival).
    if (needsRecovery && ctx?.stanzaId) {
        const cached = store.loadCachedMedia(ctx.stanzaId);
        if (cached) {
            console.log(`[.vv] DEBUG: media cache hit for ${ctx.stanzaId}, type=${cached.type}, bytes=${cached.buffer.length}`);
            buffer = cached.buffer;
            mediaType = cached.type;
            caption = cached.caption || caption;
        }
    }

    // 5b. If no cache hit, try downloadMediaMessage with reuploadRequest.
    // Construct a synthetic message object from contextInfo (same pattern
    // as sticker.js and trace.js) so Baileys can re-request credentials.
    if (!buffer && needsRecovery && ctx?.stanzaId && quotedMsg) {
        try {
            const syntheticMsg = {
                key: {
                    remoteJid: chatId,
                    id: ctx.stanzaId,
                    participant: ctx.participant,
                },
                message: quotedMsg,
            };
            console.log(`[.vv] DEBUG: trying downloadMediaMessage with reuploadRequest`);
            buffer = await downloadMediaMessage(syntheticMsg, 'buffer', {}, {
                reuploadRequest: sock.updateMediaMessage,
            });
            console.log(`[.vv] DEBUG: downloadMediaMessage succeeded, bytes=${buffer?.length}`);
        } catch (reupErr) {
            console.log(`[.vv] DEBUG: downloadMediaMessage+reupload failed: ${reupErr.message}`);
        }
    }

    // 5c. Try the store's media node with downloadContentFromMessage.
    if (!buffer) {
        try {
            buffer = await downloadMedia(mediaNode, mediaType);
        } catch (dlErr) {
            console.error(`[.vv] Download failed for ${mediaType}:`, dlErr.message);
            if (!mediaNode.mediaKey) {
                await sock.sendMessage(chatId, {
                    text: style.error('Sorry, I cannot recover this one. WhatsApp did not include the download key in this view-once message, so there is nothing for me to download. This happens with view-once messages you sent yourself, and with ones already opened. Reply .vv to a view-once message someone else sent you and it works.'),
                    ...channelInfo,
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, {
                    text: style.error('Failed to download media. The view-once media may have expired or the download URL is no longer valid.'),
                    ...channelInfo,
                }, { quoted: message });
            }
            return;
        }
    }

    if (!buffer || buffer.length === 0) {
        await sock.sendMessage(chatId, {
            text: style.error('Downloaded media is empty. Please try again.'),
            ...channelInfo,
        }, { quoted: message });
        return;
    }

    try {
        if (mediaType === 'image') {
            await sock.sendMessage(chatId, {
                image: buffer,
                caption,
                ...channelInfo,
            }, { quoted: message });
        } else if (mediaType === 'video') {
            await sock.sendMessage(chatId, {
                video: buffer,
                caption,
                ...channelInfo,
            }, { quoted: message });
        } else if (mediaType === 'audio') {
            await sock.sendMessage(chatId, {
                audio: buffer,
                mimetype: mediaNode.mimetype || 'audio/ogg; codecs=opus',
                ptt: true,
                ...channelInfo,
            }, { quoted: message });
        }
    } catch (sendErr) {
        console.error('[.vv] Send error:', sendErr.message);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to send media. Please try again.'),
            ...channelInfo,
        }, { quoted: message });
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
