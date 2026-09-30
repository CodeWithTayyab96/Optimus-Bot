const { downloadContentFromMessage, toBuffer } = require('@whiskeysockets/baileys');
const { channelInfo } = require('../../lib/messageConfig');

/**
 * .vv — View-Once media re-send (image / video / audio)
 *
 * Uses downloadContentFromMessage as the PRIMARY download method,
 * matching the known-working Baileys pattern from other bots.
 *
 * Known-working pattern (from another bot):
 *   const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
 *   const quotedImage = quoted?.imageMessage;
 *   const stream = await downloadContentFromMessage(quotedImage, 'image');
 *   for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
 *
 * This implementation extends the pattern to also handle:
 *   - viewOnceMessage / viewOnceMessageV2 / viewOnceMessageV2Extension wrappers
 *   - ephemeralMessage wrappers
 *   - audio (sent as PTT)
 *   - direct media (image/video/audio with .vv as caption)
 */

const ENVELOPE_KEYS = [
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'viewOnceMessage',
    'ephemeralMessage',
];

/**
 * Recursively unwrap view-once / ephemeral envelopes to find the raw media node.
 */
function findMedia(content, depth = 0) {
    if (!content || depth > 10) return null;

    // Check for media at this level
    if (content.imageMessage) return { type: 'image', media: content.imageMessage };
    if (content.videoMessage) return { type: 'video', media: content.videoMessage };
    if (content.audioMessage) return { type: 'audio', media: content.audioMessage };

    // Try envelope wrappers
    for (const key of ENVELOPE_KEYS) {
        if (content[key]?.message) {
            const result = findMedia(content[key].message, depth + 1);
            if (result) return result;
        }
    }

    // Generic .message unwrapping
    if (content.message && typeof content.message === 'object') {
        const result = findMedia(content.message, depth + 1);
        if (result) return result;
    }

    return null;
}

/**
 * Download media using downloadContentFromMessage (the known-working method).
 * Collects stream chunks into a single Buffer.
 */
async function downloadMedia(mediaNode, type) {
    const stream = await downloadContentFromMessage(mediaNode, type);
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function viewonceCommand(sock, chatId, message) {
    // 1. Extract quoted message
    const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    // 2. Try direct media (image/video/audio sent with .vv as caption)
    const directImage = message.message?.imageMessage;
    const directVideo = message.message?.videoMessage;
    const directAudio = message.message?.audioMessage;

    let mediaType = null;
    let mediaNode = null;
    let caption = '';

    if (quotedMsg) {
        // 3a. Try direct media on quoted message first (simplest path — matches known-working bot)
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
            // 3b. Try unwrapping envelope wrappers
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

    // 4. No media found
    if (!mediaType || !mediaNode) {
        await sock.sendMessage(chatId, {
            text: '❌ Please reply to a view-once image or video.\n\n*Supported:*\n  🖼️ Image → View-Once image\n  🎬 Video → View-Once video\n  🎵 Audio → Voice note',
            ...channelInfo,
        }, { quoted: message });
        return;
    }

    // 5. Download the media
    let buffer;
    try {
        buffer = await downloadMedia(mediaNode, mediaType);
    } catch (dlErr) {
        console.error(`[.vv] Download failed for ${mediaType}:`, dlErr.message);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to download media. The view-once media may have expired or the download URL is no longer valid.',
            ...channelInfo,
        }, { quoted: message });
        return;
    }

    if (!buffer || buffer.length === 0) {
        await sock.sendMessage(chatId, {
            text: '❌ Downloaded media is empty. Please try again.',
            ...channelInfo,
        }, { quoted: message });
        return;
    }

    // 6. Send the recovered media
    try {
        if (mediaType === 'image') {
            await sock.sendMessage(chatId, {
                image: buffer,
                caption,
                viewOnce: true,
                ...channelInfo,
            }, { quoted: message });
        } else if (mediaType === 'video') {
            await sock.sendMessage(chatId, {
                video: buffer,
                caption,
                viewOnce: true,
                ...channelInfo,
            }, { quoted: message });
        } else if (mediaType === 'audio') {
            // WhatsApp doesn't support view-once for audio — send as PTT
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
            text: '❌ Failed to send media. Please try again.',
            ...channelInfo,
        }, { quoted: message });
    }
}

module.exports = {
    name: 'vv',
    aliases: [],
    category: 'general',
    description: 'Re-send media as a View-Once message. Tip: reply to a media with "save"/"dm"/📥 to get it in your DM.',
    usage: '.vv (reply to image/video/audio)  •  reply "save" to send it to your DM',
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
