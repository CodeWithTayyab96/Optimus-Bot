const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { channelInfo } = require('../../lib/messageConfig');

/**
 * .vv — View-Once media re-send (image / video / audio)
 *
 * Uses downloadMediaMessage with a synthetic message object — the same
 * proven pattern used by the sticker command in this project.
 *
 * Includes diagnostic logging and a download timeout to prevent hangs.
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

    if (content.imageMessage) return { type: 'image', media: content.imageMessage, node: content };
    if (content.videoMessage) return { type: 'video', media: content.videoMessage, node: content };
    if (content.audioMessage) return { type: 'audio', media: content.audioMessage, node: content };

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

/**
 * Promise with timeout — rejects if the operation takes too long.
 * Clears the timer when the promise resolves to prevent open handle leaks.
 */
function withTimeout(promise, ms, label = 'operation') {
    let timer;
    return new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        promise.then(resolve, reject);
    }).finally(() => clearTimeout(timer));
}

const DOWNLOAD_TIMEOUT_MS = 30000; // 30 seconds

async function viewonceCommand(sock, chatId, message) {
    console.log('[VV] ENTER command');

    // 1. Extract quoted message
    const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    // 2. Try direct media (image/video/audio sent with .vv as caption)
    const directImage = message.message?.imageMessage;
    const directVideo = message.message?.videoMessage;
    const directAudio = message.message?.audioMessage;

    let mediaType = null;
    let mediaNode = null;
    let caption = '';
    let envelopePath = 'direct';

    if (quotedMsg) {
        console.log('[VV] quotedMessage exists: YES');
        console.log('[VV] quotedMessage keys:', Object.keys(quotedMsg));

        // Check for direct media first
        if (quotedMsg.imageMessage) {
            mediaType = 'image';
            mediaNode = quotedMsg.imageMessage;
            caption = mediaNode.caption || '';
            envelopePath = 'direct.imageMessage';
        } else if (quotedMsg.videoMessage) {
            mediaType = 'video';
            mediaNode = quotedMsg.videoMessage;
            caption = mediaNode.caption || '';
            envelopePath = 'direct.videoMessage';
        } else if (quotedMsg.audioMessage) {
            mediaType = 'audio';
            mediaNode = quotedMsg.audioMessage;
            caption = '';
            envelopePath = 'direct.audioMessage';
        } else {
            // Try envelope unwrapping
            console.log('[VV] No direct media, checking envelopes...');
            for (const key of ENVELOPE_KEYS) {
                if (quotedMsg[key]) {
                    console.log(`[VV] Found envelope: ${key}`);
                }
            }
            const found = findMedia(quotedMsg);
            if (found) {
                mediaType = found.type;
                mediaNode = found.media;
                caption = found.media.caption || '';
                envelopePath = `unwrapped.${found.type}`;
            }
        }
    } else {
        console.log('[VV] quotedMessage exists: NO');
    }

    // Check direct media
    if (!mediaType && directImage) {
        mediaType = 'image';
        mediaNode = directImage;
        caption = directImage.caption || '';
        envelopePath = 'direct.image';
    } else if (!mediaType && directVideo) {
        mediaType = 'video';
        mediaNode = directVideo;
        caption = directVideo.caption || '';
        envelopePath = 'direct.video';
    } else if (!mediaType && directAudio) {
        mediaType = 'audio';
        mediaNode = directAudio;
        caption = '';
        envelopePath = 'direct.audio';
    }

    console.log(`[VV] detected media type: ${mediaType || 'none'}`);
    console.log(`[VV] envelope path: ${envelopePath}`);

    // 3. No media found
    if (!mediaType || !mediaNode) {
        console.log('[VV] No media found, sending usage message');
        await sock.sendMessage(chatId, {
            text: '❌ Please reply to a view-once image or video.\n\n*Supported:*\n  🖼️ Image → View-Once image\n  🎬 Video → View-Once video\n  🎵 Audio → Voice note',
            ...channelInfo,
        }, { quoted: message });
        return;
    }

    // Log media node fields (safe — no secrets)
    console.log('[VV] media node keys:', Object.keys(mediaNode));
    console.log('[VV] media mimetype:', mediaNode.mimetype);
    console.log('[VV] has mediaKey:', !!mediaNode.mediaKey);
    console.log('[VV] has directPath:', !!mediaNode.directPath);
    console.log('[VV] has url:', !!mediaNode.url);

    // 4. Build the target message for downloadMediaMessage
    // This follows the exact same pattern as the sticker command
    const targetMessage = {
        key: {
            remoteJid: chatId,
            id: message.message?.extendedTextMessage?.contextInfo?.stanzaId,
            participant: message.message?.extendedTextMessage?.contextInfo?.participant,
        },
        message: quotedMsg || message.message,
    };

    console.log('[VV] download starting...');

    // 5. Download with timeout
    let buffer;
    try {
        buffer = await withTimeout(
            downloadMediaMessage(targetMessage, 'buffer', {}, {
                logger: undefined,
                reuploadRequest: sock.updateMediaMessage,
            }),
            DOWNLOAD_TIMEOUT_MS,
            'downloadMediaMessage'
        );
        console.log('[VV] download completed, bytes:', buffer ? buffer.length : 0);
    } catch (dlErr) {
        console.error(`[VV] Download failed: ${dlErr.message}`);

        // If downloadMediaMessage failed, try downloadContentFromMessage as fallback
        console.log('[VV] Trying downloadContentFromMessage fallback...');
        try {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const stream = await withTimeout(
                downloadContentFromMessage(mediaNode, mediaType),
                DOWNLOAD_TIMEOUT_MS,
                'downloadContentFromMessage'
            );
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            buffer = Buffer.concat(chunks);
            console.log('[VV] fallback download completed, bytes:', buffer.length);
        } catch (fallbackErr) {
            console.error(`[VV] Fallback download also failed: ${fallbackErr.message}`);
            await sock.sendMessage(chatId, {
                text: `❌ Failed to recover the View Once media.\n\nReason: ${fallbackErr.message.includes('timed out') ? 'Download timed out' : 'Media may have expired or is unavailable'}`,
                ...channelInfo,
            }, { quoted: message });
            return;
        }
    }

    if (!buffer || buffer.length === 0) {
        console.log('[VV] Buffer is empty');
        await sock.sendMessage(chatId, {
            text: '❌ Downloaded media is empty. Please try again.',
            ...channelInfo,
        }, { quoted: message });
        return;
    }

    // 6. Send the recovered media
    console.log('[VV] sending media...');
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
        console.log('[VV] send completed');
    } catch (sendErr) {
        console.error('[VV] Send error:', sendErr.message);
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
    description: 'Re-send media as a View-Once message (image, video, or audio)',
    usage: '.vv (reply to image/video/audio)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            await viewonceCommand(sock, extra.chatId, message);
        } catch (err) {
            console.error('[VV] UNCAUGHT ERROR:', err.message);
            console.error('[VV] Stack:', err.stack);
            try {
                await sock.sendMessage(extra.chatId, {
                    text: '❌ An unexpected error occurred while processing .vv',
                    ...channelInfo,
                }, { quoted: message });
            } catch (_) {}
        }
    },
};
