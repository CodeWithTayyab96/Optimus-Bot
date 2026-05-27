const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

module.exports = async function quoteCommand(sock, chatId, message) {
    try {
        const quote = await chat(
            'You are a wise philosopher. Generate ONE original, meaningful, and inspirational quote. Format it as:\n"<quote>" — <Author Name>\n\nThe author can be a real historical figure or a fictional wise persona. Just output the quote, nothing else.',
            'Give me a random inspirational or thought-provoking quote — pick any theme: life, success, love, wisdom, courage, etc.'
        );

        await sock.sendMessage(chatId, {
            text: quote || '❌ Could not generate a quote.',
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        console.error('Error in quote command:', error.message);
        await sock.sendMessage(chatId, { text: '❌ Failed to get quote. Please try again later!', ...channelInfo }, { quoted: message });
    }
};
