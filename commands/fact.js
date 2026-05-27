const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

module.exports = async function (sock, chatId, message) {
    try {
        const fact = await chat(
            'You are a trivia expert. Generate ONE surprising, true, and interesting fact that most people don\'t know. Just state the fact directly — no intro like "Did you know". Keep it to 1-2 sentences. Make sure it is factually accurate.',
            'Give me a completely random surprising fact I probably don\'t know. Pick any topic — science, history, nature, space, animals, food, psychology, etc.'
        );

        await sock.sendMessage(chatId, {
            text: fact || '❌ Could not generate a fact.',
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        console.error('Error in fact command:', error.message);
        await sock.sendMessage(chatId, { text: '❌ Could not fetch a fact. Please try again!', ...channelInfo }, { quoted: message });
    }
};
