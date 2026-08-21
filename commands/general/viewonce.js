const { downloadMediaMessage, downloadContentFromMessage, toBuffer } = require('@whiskeysockets/baileys');
const { channelInfo } = require('../../lib/messageConfig');

/**
 * .vv — View-Once media re-send (image / video / audio)
 *
 * Downloads media from a quoted message (or a direct media caption)
 * and re-sends it as a WhatsApp View-Once message.
 *
 * WhatsApp / Baileys limitation:
 *   True "view-once" wrapping only exists for image and video.
 *   Audio messages cannot be sent as view-once.  When the input is
 *   audio the command sends it as a PTT (voice note) instead, which
 *   is the closest supported behaviour.  This limitation is clearly
 *   documented in the usage card.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Known envelope wrappers used by WhatsApp for view-once / ephemeral media.
 * Checked at each nesting level until we reach the actual media message.
 */
const ENVELOPE_KEYS = [
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'viewOnceMessage',
    'ephemeralMessage',
];

/**
 * Recursively unwrap view-once / ephemeral envelopes so we reach the inner
 * imageMessage / videoMessage / audioMessage, regardless of nesting depth.
 *
 * Handles arbitrary combinations such as:
 *   ephemeralMessage.message.viewOnceMessageV2.message.imageMessage
 *   viewOnceMessage.message.ephemeralMessage.message.videoMessage
 *   viewOnceMessageV2.message.imageMessage  (single level)
 */
function unwrapMedia(content, _depth = 0) {
    if (!content || _depth > 10) return null; // safety limit

    // Check for media at this level first
    const image = content.imageMessage || null;
    const video = content.videoMessage || null;
    const audio = content.audioMessage || null;
    const sticker = content.stickerMessage || null;
    if (image) return { type: 'image', media: image, caption: image.caption || '', inner: content };
    if (video) return { type: 'video', media: video, caption: video.caption || '', inner: content };
    if (audio) return { type: 'audio', media: audio, caption: '', inner: content };
    if (sticker) return { type: 'sticker', media: sticker, caption: '', inner: content };

    // No media here — try unwrapping one envelope layer and recurse
    for (const key of ENVELOPE_KEYS) {
        if (content[key]?.message) {
            const result = unwrapMedia(content[key].message, _depth + 1);
            if (result) return result;
        }
    }

    // Also check if content itself has a .message property (some Baileys structures)
    if (content.message && typeof content.message === 'object') {
        const result = unwrapMedia(content.message, _depth + 1);
        if (result) return result;
    }

    return null;
}

/**
 * Find the deepest inner message node (for building synthetic download targets).
 * Walks the same envelope keys as unwrapMedia but returns the raw message object.
 */
function deepestMessage(content, _depth = 0) {
    if (!content || _depth > 10) return content;
    for (const key of ENVELOPE_KEYS) {
        if (content[key]?.message) {
            return deepestMessage(content[key].message, _depth + 1);
        }
    }
    return content;
}

// ---------------------------------------------------------------------------
// Main command logic
// ---------------------------------------------------------------------------

async function viewonceCommand(sock, chatId, message) {
    // 1. Determine the source media

    // Try quoted message first
    const quotedInfo = message.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = quotedInfo?.quotedMessage;
    // Caption is extracted by unwrapMedia() which handles recursive nesting.
    // The quotedImage/quotedVideo flat lookups below are kept as a safety net
    // for the caption fallback if unwrapMedia somehow returns no caption.
    const quotedImage =
        quotedMsg?.imageMessage ||
        quotedMsg?.viewOnceMessageV2?.message?.imageMessage ||
        quotedMsg?.viewOnceMessageV2Extension?.message?.imageMessage ||
        quotedMsg?.viewOnceMessage?.message?.imageMessage ||
        quotedMsg?.ephemeralMessage?.message?.imageMessage ||
        {};
    const quotedVideo =
        quotedMsg?.videoMessage ||
        quotedMsg?.viewOnceMessageV2?.message?.videoMessage ||
        quotedMsg?.viewOnceMessageV2Extension?.message?.videoMessage ||
        quotedMsg?.viewOnceMessage?.message?.videoMessage ||
        quotedMsg?.ephemeralMessage?.message?.videoMessage ||
        {};

    // Try direct media (image/video/audio sent with .vv as caption)
    const directImage = message.message?.imageMessage || null;
    const directVideo = message.message?.videoMessage || null;
    const directAudio = message.message?.audioMessage || null;

    let source = null;

    if (quotedMsg) {
        source = unwrapMedia(quotedMsg);
        if (source) {
            // Build the synthetic message for downloadMediaMessage.
            // Use the deepest unwrapped message node so Baileys can find
            // the media fields (mimetype, mediaKey, directPath, url) directly.
            const deepest = deepestMessage(quotedMsg);
            source.targetMessage = {
                key: {
                    remoteJid: chatId,
                    id: quotedInfo.stanzaId,
                    participant: quotedInfo.participant,
                },
                message: deepest,
                // Also keep the full quoted message for fallback download
                _fullQuotedMessage: quotedMsg,
            };
            source.isDirect = false;
        }
    } else if (directImage || directVideo || directAudio) {
        const mediaMsg = directImage || directVideo || directAudio;
        const type = directImage ? 'image' : directVideo ? 'video' : 'audio';
        source = {
            type,
            media: mediaMsg,
            caption: mediaMsg.caption || '',
            inner: message.message,
            targetMessage: message,
            isDirect: true,
        };
    }

    // 2. No media -> usage card

    if (!source) {
        const usageText =
            '\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\n' +
            '\u2551  \u274c *No supported media found*\n' +
            '\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d\n\n' +
            '\ud83d\udccb *Usage:* Reply to a view-once image or video with `.vv`,\n' +
            'or send media with `.vv` as the caption.\n\n' +
            '*Supported media:*\n' +
            '  \ud83d\uddbc\ufe0f  Image (sent as View-Once image)\n' +
            '  \ud83c\udfa5  Video (sent as View-Once video)\n' +
            '  \ud83c\udfb5  Audio / Voice (sent as voice note)\n\n' +
            '_\u26a0\ufe0f Note: WhatsApp does not support View-Once for audio.\n' +
            'Audio is sent as a regular voice note instead._';
        await sock.sendMessage(chatId, { text: usageText, ...channelInfo }, { quoted: message });
        return;
    }

    // 3. Unsupported media type

    if (!['image', 'video', 'audio'].includes(source.type)) {
        const errText =
            '\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\n' +
            '\u2551  \u274c *Unsupported media type*\n' +
            '\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d\n\n' +
            'Only *image*, *video*, and *audio* are supported.\n' +
            'Received: `' + source.type + '`';
        await sock.sendMessage(chatId, { text: errText, ...channelInfo }, { quoted: message });
        return;
    }

    // 4. Download the media (with fallback)

    let buffer = null;

    // Primary path: downloadMediaMessage
    try {
        buffer = await downloadMediaMessage(
            source.targetMessage,
            'buffer',
            {},
            {
                logger: undefined,
                reuploadRequest: sock.updateMediaMessage,
            },
        );
    } catch (primaryErr) {
        console.error('.vv downloadMediaMessage failed, trying fallback:', primaryErr.message);
    }

    // Fallback path: downloadContentFromMessage + toBuffer
    if (!buffer || buffer.length === 0) {
        try {
            const mediaNode = source.media; // the extracted imageMessage/videoMessage/audioMessage
            if (mediaNode && mediaNode.mimetype && (mediaNode.directPath || mediaNode.url)) {
                const stream = await downloadContentFromMessage(
                    {
                        mediaKey: mediaNode.mediaKey,
                        directPath: mediaNode.directPath,
                        url: mediaNode.url,
                        mimetype: mediaNode.mimetype,
                    },
                    mediaNode.mimetype.split('/')[0], // 'image', 'video', 'audio'
                );
                buffer = await toBuffer(stream);
            }
        } catch (fallbackErr) {
            console.error('.vv downloadContentFromMessage fallback failed:', fallbackErr.message);
        }
    }

    if (!buffer || buffer.length === 0) {
        await sock.sendMessage(chatId, {
            text: '\u274c Downloaded media is empty. Please try again.',
            ...channelInfo,
        }, { quoted: message });
        return;
    }

    // 5. Re-send as View-Once (image / video) or voice note (audio)

    try {
        if (source.type === 'image') {
            await sock.sendMessage(chatId, {
                image: buffer,
                caption: source.caption || quotedImage.caption || '',
                viewOnce: true,
                ...channelInfo,
            }, { quoted: message });
        } else if (source.type === 'video') {
            await sock.sendMessage(chatId, {
                video: buffer,
                caption: source.caption || quotedVideo.caption || '',
                viewOnce: true,
                ...channelInfo,
            }, { quoted: message });
        } else if (source.type === 'audio') {
            // WhatsApp / Baileys does NOT support view-once for audio.
            // Send as a PTT (voice note) which is the closest behaviour.
            const mimetype = source.media.mimetype || 'audio/ogg; codecs=opus';
            await sock.sendMessage(chatId, {
                audio: buffer,
                mimetype,
                ptt: true,
                ...channelInfo,
            }, { quoted: message });
        }
    } catch (err) {
        console.error('.vv send error:', err);
        await sock.sendMessage(chatId, {
            text: '\u274c Failed to send media. Please try again.',
            ...channelInfo,
        }, { quoted: message });
    }
}

// ---------------------------------------------------------------------------
// Command export
// ---------------------------------------------------------------------------

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
        await viewonceCommand(sock, extra.chatId, message);
    },
};
