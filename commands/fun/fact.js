const { getFact } = require('../../lib/funContent');
const { channelInfo } = require('../../lib/messageConfig');

const factCommand = async function (sock, chatId, message) {
    try {
        const fact = await getFact();
        await sock.sendMessage(chatId, {
            text: `🧠 FACT\n\n${fact}`,
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Could not fetch a fact right now. Please try again!', ...channelInfo }, { quoted: message });
    }
};

module.exports = {
    name: 'fact',
    aliases: [],
    category: 'fun',
    description: 'Get a random fact',
    usage: '.fact',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await factCommand(sock, extra.chatId, message);
    },

};
