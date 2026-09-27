const { motivation, pick } = require('../../lib/funData');
const { channelInfo } = require('../../lib/messageConfig');

const motivateCommand = async function (sock, chatId, message) {
    try {
        const speech = pick(motivation);
        await sock.sendMessage(chatId, {
            text: `🔥 MOTIVATION\n\n${speech}`,
            ...channelInfo
        }, { quoted: message });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Failed. Try again!', ...channelInfo }, { quoted: message });
    }
};

module.exports = {
    name: 'motivate',
    aliases: ['motivation'],
    category: 'fun',
    description: 'Get a motivational quote',
    usage: '.motivate',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await motivateCommand(sock, extra.chatId, message);
    },

};
