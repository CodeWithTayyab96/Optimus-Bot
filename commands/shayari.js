const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

const themes = ['love', 'heartbreak', 'life philosophy', 'friendship', 'nature', 'separation', 'longing', 'betrayal', 'self-respect', 'mother', 'fate', 'rain', 'eyes', 'dreams', 'time'];

async function shayariCommand(sock, chatId, message) {
    try {
        const theme = themes[Math.floor(Math.random() * themes.length)];
        const shayari = await chat(
            'You are a master Urdu/Hindi poet. Generate ONE beautiful, original shayari (2-4 lines). Write it in Roman Urdu/Hindi script (Latin letters, not Devanagari or Arabic script). The shayari should be emotional, deep, and poetic. Just output the shayari, nothing else.',
            `Write a shayari about ${theme}. (#${Date.now()})`
        );
        await sock.sendMessage(chatId, {
            text: shayari || '❌ Could not generate shayari.',
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Failed to fetch shayari. Please try again later.', ...channelInfo }, { quoted: message });
    }
}

module.exports = { shayariCommand };
