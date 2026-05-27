const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

module.exports = async function (sock, chatId, message) {
    try {
        const speech = await chat(
            'You are an inspiring motivational coach. Write a short, powerful motivational message (3-5 sentences). Be genuine and energetic — not cliché. Just the message, nothing else.',
            'Give me a random motivational speech — pick any theme: overcoming failure, chasing dreams, self-belief, hard work, or resilience.'
        );
        await sock.sendMessage(chatId, {
            text: `🔥 *Motivation*\n\n${speech || '❌ Could not generate motivation.'}`,
            ...channelInfo
        }, { quoted: message });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Failed. Try again!', ...channelInfo }, { quoted: message });
    }
};
