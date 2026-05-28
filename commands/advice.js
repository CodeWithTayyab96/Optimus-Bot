const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

const areas = ['relationships', 'career', 'mindset', 'health', 'money', 'personal growth', 'productivity', 'confidence', 'social skills', 'habits', 'stress', 'decision making', 'creativity', 'communication', 'time management'];

module.exports = async function (sock, chatId, message) {
    try {
        const area = areas[Math.floor(Math.random() * areas.length)];
        const advice = await chat(
            'You are a wise life coach. Give ONE piece of genuine, thoughtful life advice. Be specific and actionable, not generic. Keep it to 2-3 sentences. Just the advice, nothing else.',
            `Give me advice about ${area}. (#${Date.now()})`
        );
        await sock.sendMessage(chatId, {
            text: `💡 *Advice*\n\n${advice || '❌ Could not generate advice.'}`,
            ...channelInfo
        }, { quoted: message });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Failed to get advice. Try again!', ...channelInfo }, { quoted: message });
    }
};
