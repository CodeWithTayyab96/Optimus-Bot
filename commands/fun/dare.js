const { dares, pick } = require('../../lib/funData');
const { channelInfo } = require('../../lib/messageConfig');

async function dareCommand(sock, chatId, message) {
    try {
        const dare = pick(dares);
        await sock.sendMessage(chatId, {
            text: `🎯 DARE\n\n${dare}`,
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Failed to get dare. Please try again later!', ...channelInfo }, { quoted: message });
    }
}

module.exports = {
    name: 'dare',
    aliases: [],
    category: 'fun',
    description: 'Get a random dare',
    usage: '.dare',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await dareCommand(sock, extra.chatId, message);
    },
    dareCommand,
};
