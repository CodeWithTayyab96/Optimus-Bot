const sharp = require('sharp');
const style = require('../../lib/messageStyle');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

/**
 * .toimg — convert a sticker back to an image (PNG).
 * Reply to a sticker. Animated (webp) stickers are flattened to their first
 * frame. Uses sharp (already a dependency) — no ffmpeg/temp files needed.
 */
async function toimgCommand(sock, chatId, message) {
    try {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted || !quoted.stickerMessage) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput('Reply to a sticker to convert it to an image.', '.toimg (reply to sticker)', { box: false })
            }, { quoted: message });
        }

        const stream = await downloadContentFromMessage(quoted.stickerMessage, 'sticker');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        if (!buffer.length) throw new Error('empty sticker');

        // webp → PNG (first frame for animated stickers)
        const png = await sharp(buffer).png().toBuffer();
        if (!png || !png.length) throw new Error('conversion produced empty image');

        await sock.sendMessage(chatId, {
            image: png,
            caption: '🖼️ Converted from sticker'
        }, { quoted: message });
    } catch (error) {
        console.error('[toimg] error:', error?.message || error);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to convert the sticker to an image.')
        }, { quoted: message });
    }
}

module.exports = {
    name: 'toimg',
    aliases: ['sticker2img', 'toimage', 's2i'],
    category: 'media',
    description: 'Convert a sticker to an image',
    usage: '.toimg (reply to sticker)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await toimgCommand(sock, extra.chatId, message);
    },
};
