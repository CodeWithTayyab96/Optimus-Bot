const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'dog',
    aliases: ['dogpic'],
    category: 'fun',
    description: 'Get a random dog photo',
    usage: '.dog',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            await sock.sendMessage(extra.chatId, { react: { text: '🐶', key: message.key } });

            // Dog CEO — free, no key.
            const data = await getJson('https://dog.ceo/api/breeds/image/random');
            if (!data || data.status !== 'success' || !data.message) {
                return await extra.reply(style.error('Could not fetch a dog photo. Please try again.'));
            }

            // Breed is embedded in the URL: /breeds/<breed>/<file>
            const match = String(data.message).match(/breeds\/([^/]+)\//);
            const breed = match ? match[1].replace(/-/g, ' ') : 'dog';

            await sock.sendMessage(extra.chatId, {
                image: { url: data.message },
                caption: `🐶 *${breed}*`
            }, { quoted: message });
        } catch (error) {
            console.error('[dog] error:', error.message);
            return await extra.reply(style.error('Could not fetch a dog photo. Please try again.'));
        }
    },
};
