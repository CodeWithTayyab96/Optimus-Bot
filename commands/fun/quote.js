const { getQuote } = require('../../lib/funContent');
const { channelInfo } = require('../../lib/messageConfig');

const quoteCommand = async function (sock, chatId, message) {
    try {
        const { text, author } = await getQuote();
        await sock.sendMessage(chatId, {
            text: `💭 QUOTE\n\n"${text}"\n— ${author}`,
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Failed to get a quote right now. Please try again later!', ...channelInfo }, { quoted: message });
    }
};

module.exports = {
    name: 'quote',
    aliases: [],
    category: 'fun',
    description: 'Get a random quote',
    usage: '.quote',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await quoteCommand(sock, extra.chatId, message);
    },

};
