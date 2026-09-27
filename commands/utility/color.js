const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'color',
    aliases: ['colour'],
    category: 'utility',
    description: 'Look up a colour from a hex code',
    usage: '.color <hex>  (e.g. .color ff0000)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const hex = (args[0] || '').replace(/^#/, '').trim();

            if (!/^[0-9a-fA-F]{3,8}$/.test(hex)) {
                return await extra.reply(style.invalidInput('Please provide a valid hex colour (e.g. ff0000).', `${extra.prefix}color <hex>`));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '🎨', key: message.key } });

            // TheColorAPI — free, no key.
            const data = await getJson('https://www.thecolorapi.com/id', { params: { hex } });
            const name = data && data.name && data.name.value;

            if (!name) {
                return await extra.reply(style.error('Could not look up that colour. Please try again.'));
            }

            await extra.reply(style.box('🎨 COLOUR', [
                `📌 Name: ${name}`,
                `🔠 Hex: ${data.hex?.value || '#' + hex}`,
                `🖥 RGB: ${data.rgb?.value || '—'}`,
                `🌈 HSL: ${data.hsl?.value || '—'}`,
                `📐 HSV: ${data.hsv?.value || '—'}`
            ]));
        } catch (error) {
            console.error('[color] error:', error.message);
            return await extra.reply(style.error('Colour lookup failed. Please try again.'));
        }
    },
};
