const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

module.exports = async function (sock, chatId) {
    try {
        const joke = await chat(
            'You are a world-class comedian. Generate ONE original, funny joke. Just the joke — no intro, no labels, no "here\'s a joke". Keep it short (1-3 lines). Vary between puns, one-liners, observational humor, and dad jokes.',
            'Tell me a joke'
        );

        await sock.sendMessage(chatId, {
            text: joke || 'Sorry, I could not come up with a joke right now.',
            ...channelInfo
        });
    } catch (error) {
        console.error('Error in joke command:', error.message);
        await sock.sendMessage(chatId, { text: '❌ Could not generate a joke. Please try again!', ...channelInfo });
    }
};
