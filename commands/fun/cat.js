const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'cat',
    aliases: ['catpic'],
    category: 'fun',
    description: 'Get a random cat photo',
    usage: '.cat',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            await sock.sendMessage(extra.chatId, { react: { text: '🐱', key: message.key } });

            // TheCatAPI — free, no key for basic use.
            const data = await getJson('https://api.thecatapi.com/v1/images/search');
            const first = Array.isArray(data) ? data[0] : null;
            if (!first || !first.url) {
                return await extra.reply(style.error('Could not fetch a cat photo. Please try again.'));
            }

            await sock.sendMessage(extra.chatId, {
                image: { url: first.url },
                caption: '🐱 *cat*'
            }, { quoted: message });
        } catch (error) {
            console.error('[cat] error:', error.message);
            return await extra.reply(style.error('Could not fetch a cat photo. Please try again.'));
        }
    },
};
