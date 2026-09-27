/**
 * Optimus Bot — .tovideo
 * Convert a quoted audio or sticker message to MP4 video.
 *
 * Uses lib/converter.js → toVideo() — no duplicate FFmpeg logic.
 */
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { toVideo } = require('../../lib/converter');
const style = require('../../lib/messageStyle');

/** Detect a sensible file extension from a Baileys MIME type string. */
function extFromMime(mime) {
    if (!mime) return null;
    if (mime.includes('ogg'))                            return 'ogg';
    if (mime.includes('opus'))                           return 'opus';
    if (mime.includes('mpeg') || mime.includes('mp3'))   return 'mp3';
    if (mime.includes('wav'))                            return 'wav';
    if (mime.includes('aac'))                            return 'aac';
    if (mime.includes('flac'))                           return 'flac';
    if (mime.includes('webp'))                           return 'webp';
    if (mime.includes('image'))                          return 'png';
    if (mime.includes('mp4') || mime.includes('video'))  return 'mp4';
    if (mime.includes('audio'))                          return 'mp3';
    return null;
}

/** Detect extension from a WhatsApp message type key. */
function extFromType(type) {
    if (!type) return null;
    const map = {
        audioMessage: 'mp3',
        videoMessage: 'mp4',
        stickerMessage: 'webp',
        imageMessage: 'png'
    };
    return map[type] || null;
}

async function tovideoCommand(sock, chatId, message) {
    try {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
            await sock.sendMessage(chatId, {
                text: style.invalidInput(
                    'Please reply to an audio, sticker, or video message.',
                    '.tovideo (reply to audio/sticker/video)'
                )
            }, { quoted: message });
            return;
        }

        // Determine which media node to download
        const mediaNode = quoted.audioMessage || quoted.stickerMessage || quoted.videoMessage;
        if (!mediaNode) {
            await sock.sendMessage(chatId, {
                text: style.error('Unsupported media type. Please reply to an audio, sticker, or video message.')
            }, { quoted: message });
            return;
        }

        const mediaType = quoted.audioMessage ? 'audio'
            : quoted.stickerMessage ? 'sticker'
            : 'video';

        const mime = mediaNode.mimetype || '';
        const typeKey = Object.keys(quoted).find(k => k.endsWith('Message'));
        const ext = extFromMime(mime) || extFromType(typeKey) || 'mp3';

        // Already MP4 and is video? Just forward it.
        if (ext === 'mp4' && mediaType === 'video') {
            const stream = await downloadContentFromMessage(mediaNode, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (!buffer || buffer.length === 0) {
                await sock.sendMessage(chatId, { text: style.error('Downloaded media is empty.') }, { quoted: message });
                return;
            }

            await sock.sendMessage(chatId, {
                document: buffer,
                mimetype: 'video/mp4',
                fileName: 'converted.mp4'
            }, { quoted: message });
            return;
        }

        // Download the media
        const stream = await downloadContentFromMessage(mediaNode, mediaType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        if (!buffer || buffer.length === 0) {
            await sock.sendMessage(chatId, { text: style.error('Downloaded media is empty.') }, { quoted: message });
            return;
        }

        // Convert to MP4 via lib/converter.js
        let mp4Buffer;
        try {
            mp4Buffer = await toVideo(buffer, ext);
        } catch (convErr) {
            console.error('[tovideo] Conversion failed:', convErr);
            await sock.sendMessage(chatId, {
                text: style.error('Video conversion failed. The format may not be supported.')
            }, { quoted: message });
            return;
        }

        if (!mp4Buffer || mp4Buffer.length === 0) {
            await sock.sendMessage(chatId, {
                text: style.error('Conversion produced an empty file.')
            }, { quoted: message });
            return;
        }

        // Send as MP4 document
        await sock.sendMessage(chatId, {
            document: mp4Buffer,
            mimetype: 'video/mp4',
            fileName: 'converted.mp4'
        }, { quoted: message });

    } catch (err) {
        console.error('[tovideo] Error:', err);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to convert to video. Please try again.')
        }, { quoted: message });
    }
}

module.exports = {
    name: 'tovideo',
    aliases: ['mp4convert', 'tomp4'],
    category: 'media',
    description: 'Convert quoted audio/sticker/video to MP4',
    usage: '.tovideo (reply to audio/sticker/video)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await tovideoCommand(sock, extra.chatId, message);
    },
};
