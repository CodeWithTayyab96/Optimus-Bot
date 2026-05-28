const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

const topics = ['science', 'history', 'nature', 'space', 'animals', 'food', 'psychology', 'technology', 'ocean', 'human body', 'ancient civilizations', 'weather', 'music', 'geography', 'medicine', 'insects', 'languages', 'sports', 'economics', 'physics', 'chemistry', 'mythology', 'architecture', 'inventions', 'dinosaurs', 'volcanoes', 'dreams', 'plants', 'birds', 'math'];

module.exports = async function (sock, chatId, message) {
    try {
        const topic = topics[Math.floor(Math.random() * topics.length)];
        const fact = await chat(
            'You are a trivia expert. Generate ONE surprising, true, and interesting fact that most people don\'t know. Just state the fact directly — no intro like "Did you know". Keep it to 1-2 sentences. Make sure it is factually accurate.',
            `Tell me a surprising fact about ${topic}. (#${Date.now()})`
        );
        await sock.sendMessage(chatId, {
            text: fact || '❌ Could not generate a fact.',
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Could not fetch a fact. Please try again!', ...channelInfo }, { quoted: message });
    }
};
