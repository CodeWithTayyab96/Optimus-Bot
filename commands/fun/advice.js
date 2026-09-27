const { getAdvice } = require('../../lib/funContent');
const { channelInfo } = require('../../lib/messageConfig');

const adviceCommand = async function (sock, chatId, message) {
    try {
        const advice = await getAdvice();
        await sock.sendMessage(chatId, {
            text: `💡 ADVICE\n\n${advice || 'Sorry, I could not come up with advice right now.'}`,
            ...channelInfo
        }, { quoted: message });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Failed to get advice. Try again!', ...channelInfo }, { quoted: message });
    }
};

module.exports = {
    name: 'advice',
    aliases: [],
    category: 'fun',
    description: 'Get a random piece of advice',
    usage: '.advice',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await adviceCommand(sock, extra.chatId, message);
    },

};
