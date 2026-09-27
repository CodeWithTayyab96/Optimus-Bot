const { getJoke } = require('../../lib/funContent');
const { channelInfo } = require('../../lib/messageConfig');

const jokeCommand = async function (sock, chatId, message) {
    try {
        const { text } = await getJoke();
        await sock.sendMessage(chatId, {
            text: `😂 JOKE\n\n${text}`,
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Could not fetch a joke right now. Please try again!', ...channelInfo }, { quoted: message });
    }
};

module.exports = {
    name: 'joke',
    aliases: [],
    category: 'fun',
    description: 'Get a random joke',
    usage: '.joke',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await jokeCommand(sock, extra.chatId, message);
    },

};
