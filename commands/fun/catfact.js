const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'catfact',
    aliases: ['meowfact'],
    category: 'fun',
    description: 'Get a random cat fact',
    usage: '.catfact',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            await sock.sendMessage(extra.chatId, { react: { text: '🐾', key: message.key } });

            // catfact.ninja — free, no key.
            const data = await getJson('https://catfact.ninja/fact');
            if (!data || !data.fact) {
                return await extra.reply(style.error('Could not fetch a cat fact. Please try again.'));
            }

            await extra.reply(style.box('🐾 CAT FACT', [data.fact]));
        } catch (error) {
            console.error('[catfact] error:', error.message);
            return await extra.reply(style.error('Could not fetch a cat fact. Please try again.'));
        }
    },
};
