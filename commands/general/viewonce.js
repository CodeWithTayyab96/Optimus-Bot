const { downloadMediaMessage } = require('@whiskeysockets/baileys');
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
 * Unwrap a view-once / ephemeral envelope so we reach the inner
 * imageMessage / videoMessage / audioMessage.
 *
 * Baileys stores view-once media inside one of these wrappers:
 *   viewOnceMessageV2.message.{imageMessage,videoMessage,audioMessage}
 *   viewOnceMessageV2Extension.message.{...}
 *   viewOnceMessage.message.{...}
 *   ephemeralMessage.message.{...}
 */
function unwrapMedia(content) {
    if (!content) return null;
    const inner =
        content.viewOnceMessageV2?.message ||
        content.viewOnceMessageV2Extension?.message ||
        content.viewOnceMessage?.message ||
        content.ephemeralMessage?.message ||
        content;
    const image = inner.imageMessage || null;
    const video = inner.videoMessage || null;
    const audio = inner.audioMessage || null;
    const sticker = inner.stickerMessage || null;
    if (image) return { type: 'image', media: image, caption: image.caption || '', inner };
    if (video) return { type: 'video', media: video, caption: video.caption || '', inner };
    if (audio) return { type: 'audio', media: audio, caption: '', inner };
    if (sticker) return { type: 'sticker', media: sticker, caption: '', inner };
    return null;
}

// ---------------------------------------------------------------------------
// Main command logic
// ---------------------------------------------------------------------------

async function viewonceCommand(sock, chatId, message) {
    // 1. Determine the source media

    // Try quoted message first
    const quotedInfo = message.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = quotedInfo?.quotedMessage;
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
            // Build a synthetic WAMessage so downloadMediaMessage works
            source.targetMessage = {
                key: {
                    remoteJid: chatId,
                    id: quotedInfo.stanzaId,
                    participant: quotedInfo.participant,
                },
                message: quotedMsg,
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

    // 4. Download the media

    let buffer;
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
    } catch (err) {
        console.error('.vv download error:', err);
        await sock.sendMessage(chatId, {
            text: '\u274c Failed to download media. The message may have been revoked or expired.',
            ...channelInfo,
        }, { quoted: message });
        return;
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
            if (source.isDirect) {
                await sock.sendMessage(chatId, {
                    image: buffer,
                    caption: source.caption || '',
                    viewOnce: true,
                    ...channelInfo,
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, {
                    image: buffer,
                    caption: quotedImage.caption || '',
                    viewOnce: true,
                    ...channelInfo,
                }, { quoted: message });
            }
        } else if (source.type === 'video') {
            if (source.isDirect) {
                await sock.sendMessage(chatId, {
                    video: buffer,
                    caption: source.caption || '',
                    viewOnce: true,
                    ...channelInfo,
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, {
                    video: buffer,
                    caption: quotedVideo.caption || '',
                    viewOnce: true,
                    ...channelInfo,
                }, { quoted: message });
            }
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
