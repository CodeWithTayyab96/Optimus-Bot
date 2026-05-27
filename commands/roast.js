const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

async function roastCommand(sock, chatId, message) {
    try {
        const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        const participant = message.message?.extendedTextMessage?.contextInfo?.participant;
        const sender = message.key?.participant || message.key?.remoteJid;

        const target = (mentioned && mentioned[0]) || participant || sender;
        const name = target?.split('@')[0] || 'you';

        const roast = await chat(
            'You are a savage roast comedian. Write ONE brutal but funny roast. Comedy roast style — mean enough to sting but clearly humorous. 1-2 sentences max. Just the roast, nothing else.',
            `Roast someone named ${name}. Make it personal to their name/number if possible.`
        );

        await sock.sendMessage(chatId, {
            text: `🔥 @${name}\n\n${roast || "You're so average, even your WiFi signal has more personality."}`,
            mentions: [target],
            ...channelInfo
        }, { quoted: message });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Failed to roast. Try again!', ...channelInfo }, { quoted: message });
    }
}

module.exports = { roastCommand };
