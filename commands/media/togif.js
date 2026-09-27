const style = require('../../lib/messageStyle');
const { toVideo } = require('../../lib/converter');
const { ensureH264 } = require('../../lib/ffmpeg');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function streamToBuffer(node, type) {
    const stream = await downloadContentFromMessage(node, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

/**
 * .togif — turn a replied video or sticker into a WhatsApp "GIF".
 *
 * WhatsApp GIFs are MP4s sent with `gifPlayback: true` (auto-play, loop, mute).
 * A video is re-sent as-is (normalised to H.264 for safety); a sticker (webp)
 * is converted to MP4 first via lib/converter.js.
 */
async function togifCommand(sock, chatId, message) {
    try {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const videoNode = quoted?.videoMessage;
        const stickerNode = quoted?.stickerMessage;

        if (!videoNode && !stickerNode) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput('Reply to a video or sticker to turn it into a GIF.', '.togif (reply to video/sticker)', { box: false })
            }, { quoted: message });
        }

        if (videoNode) {
            let buffer = await streamToBuffer(videoNode, 'video');
            if (!buffer.length) throw new Error('empty video');
            buffer = ensureH264(buffer); // normalise codec so WhatsApp doesn't show black
            await sock.sendMessage(chatId, {
                video: buffer,
                gifPlayback: true,
                mimetype: 'video/mp4',
                caption: '🎞️ GIF'
            }, { quoted: message });
            return;
        }

        // Sticker (webp) → MP4, then send as a looping GIF.
        const buffer = await streamToBuffer(stickerNode, 'sticker');
        if (!buffer.length) throw new Error('empty sticker');

        const mp4 = await toVideo(buffer, 'webp');
        if (!mp4 || !mp4.length) throw new Error('conversion produced empty file');

        await sock.sendMessage(chatId, {
            video: mp4,
            gifPlayback: true,
            mimetype: 'video/mp4',
            caption: '🎞️ GIF'
        }, { quoted: message });
    } catch (error) {
        console.error('[togif] error:', error?.message || error);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to create the GIF.')
        }, { quoted: message });
    }
}

module.exports = {
    name: 'togif',
    aliases: ['togiphy', 'gifconvert'],
    category: 'media',
    description: 'Convert a video or sticker to a GIF',
    usage: '.togif (reply to video/sticker)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await togifCommand(sock, extra.chatId, message);
    },
};
