const { chat } = require('../../lib/ai');
const { channelInfo } = require('../../lib/messageConfig');

const themes = ['life', 'success', 'love', 'courage', 'wisdom', 'change', 'perseverance', 'happiness', 'solitude', 'friendship', 'time', 'fear', 'ambition', 'kindness', 'growth', 'patience', 'loss', 'hope', 'strength', 'truth'];

const quoteCommand = async function (sock, chatId, message) {
    try {
        const theme = themes[Math.floor(Math.random() * themes.length)];
        const quote = await chat(
            'You are a wise philosopher. Generate ONE original, meaningful, and inspirational quote. Format it as:\n"<quote>" — <Author Name>\n\nThe author can be a real historical figure or a fictional wise persona. Respond in Roman Urdu or English — you can mix both naturally. Just output the quote, nothing else.',
            `Give me a quote about ${theme}. (#${Date.now()})`
        );
        await sock.sendMessage(chatId, {
            text: `💭 QUOTE\n\n${quote || 'Sorry, I could not come up with a quote right now.'}`,
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Failed to get quote. Please try again later!', ...channelInfo }, { quoted: message });
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
