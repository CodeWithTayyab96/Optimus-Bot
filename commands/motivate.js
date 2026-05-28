const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

const themes = ['overcoming failure', 'chasing dreams', 'self-belief', 'hard work', 'resilience', 'discipline', 'consistency', 'starting over', 'facing fear', 'never giving up', 'patience', 'self-worth', 'embracing change', 'beating procrastination', 'finding purpose'];

module.exports = async function (sock, chatId, message) {
    try {
        const theme = themes[Math.floor(Math.random() * themes.length)];
        const speech = await chat(
            'You are an inspiring motivational coach. Write a short, powerful motivational message (3-5 sentences). Be genuine and energetic — not cliche. Just the message, nothing else.',
            `Motivate me about ${theme}. (#${Date.now()})`
        );
        await sock.sendMessage(chatId, {
            text: `🔥 *Motivation*\n\n${speech || '❌ Could not generate motivation.'}`,
            ...channelInfo
        }, { quoted: message });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Failed. Try again!', ...channelInfo }, { quoted: message });
    }
};
