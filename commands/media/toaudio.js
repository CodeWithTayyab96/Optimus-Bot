/**
 * Optimus Bot — .toaudio
 * Convert a quoted audio or video message to MP3.
 *
 * Uses lib/converter.js → toAudio() — no duplicate FFmpeg logic.
 */
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { toAudio } = require('../../lib/converter');
const style = require('../../lib/messageStyle');

/** Detect a sensible file extension from a Baileys MIME type string. */
function extFromMime(mime) {
    if (!mime) return null;
    if (mime.includes('mp4') || mime.includes('video'))  return 'mp4';
    if (mime.includes('mpeg') || mime.includes('mp3'))   return 'mp3';
    if (mime.includes('ogg'))                            return 'ogg';
    if (mime.includes('opus'))                           return 'opus';
    if (mime.includes('wav'))                            return 'wav';
    if (mime.includes('aac'))                            return 'aac';
    if (mime.includes('flac'))                           return 'flac';
    if (mime.includes('audio'))                          return 'mp3'; // safe default for audio/*
    return null;
}

/** Detect extension from a WhatsApp message type key. */
function extFromType(type) {
    if (!type) return null;
    const map = { audioMessage: 'mp3', videoMessage: 'mp4', stickerMessage: 'webp' };
    return map[type] || null;
}

async function toaudioCommand(sock, chatId, message) {
    try {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
            await sock.sendMessage(chatId, {
                text: style.invalidInput(
                    'Please reply to an audio or video message.',
                    '.toaudio (reply to audio/video)'
                )
            }, { quoted: message });
            return;
        }

        // Determine which media node to download
        const mediaNode = quoted.audioMessage || quoted.videoMessage;
        if (!mediaNode) {
            await sock.sendMessage(chatId, {
                text: style.error('Unsupported media type. Please reply to an audio or video message.')
            }, { quoted: message });
            return;
        }

        const mediaType = quoted.audioMessage ? 'audio' : 'video';
        const mime = mediaNode.mimetype || '';
        const ext = extFromMime(mime) || extFromType(Object.keys(quoted).find(k => k.endsWith('Message'))) || 'mp3';

        // Already MP3? Just forward it.
        if (ext === 'mp3' && mediaType === 'audio') {
            const stream = await downloadContentFromMessage(mediaNode, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (!buffer || buffer.length === 0) {
                await sock.sendMessage(chatId, { text: style.error('Downloaded media is empty.') }, { quoted: message });
                return;
            }

            await sock.sendMessage(chatId, {
                audio: buffer,
                mimetype: 'audio/mpeg',
                fileName: `converted.mp3`,
                ptt: false
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

        // Convert to MP3 via lib/converter.js
        let mp3Buffer;
        try {
            mp3Buffer = await toAudio(buffer, ext);
        } catch (convErr) {
            console.error('[toaudio] Conversion failed:', convErr);
            await sock.sendMessage(chatId, {
                text: style.error('Audio conversion failed. The format may not be supported.')
            }, { quoted: message });
            return;
        }

        if (!mp3Buffer || mp3Buffer.length === 0) {
            await sock.sendMessage(chatId, {
                text: style.error('Conversion produced an empty file.')
            }, { quoted: message });
            return;
        }

        // Send the converted MP3
        await sock.sendMessage(chatId, {
            audio: mp3Buffer,
            mimetype: 'audio/mpeg',
            fileName: 'converted.mp3',
            ptt: false
        }, { quoted: message });

    } catch (err) {
        console.error('[toaudio] Error:', err);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to convert the media. Please try again.')
        }, { quoted: message });
    }
}

module.exports = {
    name: 'toaudio',
    aliases: ['mp3convert', 'tomp3'],
    category: 'media',
    description: 'Convert quoted audio or video to MP3',
    usage: '.toaudio (reply to audio/video)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await toaudioCommand(sock, extra.chatId, message);
    },
};
