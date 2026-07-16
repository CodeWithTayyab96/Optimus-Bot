const { chat } = require('../../lib/ai');
const { channelInfo } = require('../../lib/messageConfig');

const themes = ['overcoming failure', 'chasing dreams', 'self-belief', 'hard work', 'resilience', 'discipline', 'consistency', 'starting over', 'facing fear', 'never giving up', 'patience', 'self-worth', 'embracing change', 'beating procrastination', 'finding purpose'];

const motivateCommand = async function (sock, chatId, message) {
    try {
        const theme = themes[Math.floor(Math.random() * themes.length)];
        const speech = await chat(
            'You are an inspiring motivational coach. Write a short, powerful motivational message (3-5 sentences). Be genuine and energetic — not cliche. Respond in Roman Urdu or English — you can mix both naturally. Just the message, nothing else.',
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

module.exports = {
    name: 'motivate',
    aliases: ['motivation'],
    category: 'fun',
    description: 'Get a motivational quote',
    usage: '.motivate',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await motivateCommand(sock, extra.chatId, message);
    },

};
