const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

async function shayariCommand(sock, chatId, message) {
    try {
        const shayari = await chat(
            'You are a master Urdu/Hindi poet. Generate ONE beautiful, original shayari (2-4 lines). Write it in Roman Urdu/Hindi script (Latin letters, not Devanagari or Arabic script). The shayari should be emotional, deep, and poetic. Topics can vary: love, heartbreak, life philosophy, friendship, nature. Just output the shayari, nothing else.',
            'Write me a shayari'
        );

        await sock.sendMessage(chatId, {
            text: shayari || '❌ Could not generate shayari.',
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        console.error('Error in shayari command:', error.message);
        await sock.sendMessage(chatId, { text: '❌ Failed to fetch shayari. Please try again later.', ...channelInfo }, { quoted: message });
    }
}

module.exports = { shayariCommand };
