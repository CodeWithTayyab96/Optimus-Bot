const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

const themes = ['life', 'success', 'love', 'courage', 'wisdom', 'change', 'perseverance', 'happiness', 'solitude', 'friendship', 'time', 'fear', 'ambition', 'kindness', 'growth', 'patience', 'loss', 'hope', 'strength', 'truth'];

module.exports = async function quoteCommand(sock, chatId, message) {
    try {
        const theme = themes[Math.floor(Math.random() * themes.length)];
        const quote = await chat(
            'You are a wise philosopher. Generate ONE original, meaningful, and inspirational quote. Format it as:\n"<quote>" — <Author Name>\n\nThe author can be a real historical figure or a fictional wise persona. Just output the quote, nothing else.',
            `Give me a quote about ${theme}. (#${Date.now()})`
        );
        await sock.sendMessage(chatId, {
            text: quote || '❌ Could not generate a quote.',
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Failed to get quote. Please try again later!', ...channelInfo }, { quoted: message });
    }
};
