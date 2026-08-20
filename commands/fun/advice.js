const { chat } = require('../../lib/ai');
const { channelInfo } = require('../../lib/messageConfig');

const areas = ['relationships', 'career', 'mindset', 'health', 'money', 'personal growth', 'productivity', 'confidence', 'social skills', 'habits', 'stress', 'decision making', 'creativity', 'communication', 'time management'];

const adviceCommand = async function (sock, chatId, message) {
    try {
        const area = areas[Math.floor(Math.random() * areas.length)];
        const advice = await chat(
            'You are a wise life coach. Give ONE piece of genuine, thoughtful life advice. Be specific and actionable, not generic. Keep it to 2-3 sentences. Respond in Roman Urdu or English — you can mix both naturally. Just the advice, nothing else.',
            `Give me advice about ${area}. (#${Date.now()})`
        );
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
