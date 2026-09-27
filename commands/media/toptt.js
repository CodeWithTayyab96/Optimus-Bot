/**
 * Optimus Bot — .toptt
 * Convert a quoted audio message to a WhatsApp voice note (PTT).
 *
 * Uses lib/converter.js → toPTT() — no duplicate FFmpeg logic.
 */
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { toPTT } = require('../../lib/converter');
const style = require('../../lib/messageStyle');

/** Detect a sensible file extension from a Baileys MIME type string. */
function extFromMime(mime) {
    if (!mime) return null;
    if (mime.includes('mpeg') || mime.includes('mp3'))   return 'mp3';
    if (mime.includes('ogg'))                            return 'ogg';
    if (mime.includes('opus'))                           return 'opus';
    if (mime.includes('wav'))                            return 'wav';
    if (mime.includes('aac'))                            return 'aac';
    if (mime.includes('flac'))                           return 'flac';
    if (mime.includes('mp4') || mime.includes('video'))  return 'mp4';
    if (mime.includes('audio'))                          return 'mp3';
    return null;
}

async function topttCommand(sock, chatId, message) {
    try {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
            await sock.sendMessage(chatId, {
                text: style.invalidInput(
                    'Please reply to an audio message.',
                    '.toptt (reply to audio)'
                )
            }, { quoted: message });
            return;
        }

        const mediaNode = quoted.audioMessage;
        if (!mediaNode) {
            await sock.sendMessage(chatId, {
                text: style.error('Unsupported media type. Please reply to an audio message.')
            }, { quoted: message });
            return;
        }

        const mime = mediaNode.mimetype || '';
        const ext = extFromMime(mime) || 'mp3';

        // Download the audio
        const stream = await downloadContentFromMessage(mediaNode, 'audio');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        if (!buffer || buffer.length === 0) {
            await sock.sendMessage(chatId, { text: style.error('Downloaded audio is empty.') }, { quoted: message });
            return;
        }

        // Already Opus/OGG? Send directly as PTT without conversion.
        if (ext === 'ogg' || ext === 'opus') {
            await sock.sendMessage(chatId, {
                audio: buffer,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            }, { quoted: message });
            return;
        }

        // Convert to Opus via lib/converter.js
        let opusBuffer;
        try {
            opusBuffer = await toPTT(buffer, ext);
        } catch (convErr) {
            console.error('[toptt] Conversion failed:', convErr);
            await sock.sendMessage(chatId, {
                text: style.error('Voice note conversion failed. The format may not be supported.')
            }, { quoted: message });
            return;
        }

        if (!opusBuffer || opusBuffer.length === 0) {
            await sock.sendMessage(chatId, {
                text: style.error('Conversion produced an empty file.')
            }, { quoted: message });
            return;
        }

        // Send as PTT (push-to-talk / voice note)
        await sock.sendMessage(chatId, {
            audio: opusBuffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
        }, { quoted: message });

    } catch (err) {
        console.error('[toptt] Error:', err);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to convert to voice note. Please try again.')
        }, { quoted: message });
    }
}

module.exports = {
    name: 'toptt',
    aliases: ['voice', 'tovn'],
    category: 'media',
    description: 'Convert quoted audio to a WhatsApp voice note',
    usage: '.toptt (reply to audio)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await topttCommand(sock, extra.chatId, message);
    },
};
