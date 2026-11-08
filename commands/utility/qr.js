const style = require('../../lib/messageStyle');
const qrcode = require('qrcode');

module.exports = {
    name: 'qr',
    aliases: ['qrcode'],
    category: 'utility',
    description: 'Generate a QR code from text',
    usage: '.qr <text>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            if (args.length === 0) {
                return extra.reply(style.error(`Usage: ${extra.prefix}qr <text>\n\nExample: ${extra.prefix}qr https://google.com`));
            }

            const text = args.join(' ');

            const qrBuffer = await qrcode.toBuffer(text, {
                type: 'png',
                width: 500,
                margin: 2
            });

            await sock.sendMessage(extra.chatId, {
                image: qrBuffer,
                caption: `✅ QR Code Generated!\n\n📝 Text: ${text}`
            }, { quoted: message });
        } catch (error) {
            console.error('Error in qr command:', error);
            await extra.reply(style.error('Failed to generate the QR code. Please try again.'));
        }
    }
};
