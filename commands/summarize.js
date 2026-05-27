const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

module.exports = async function (sock, chatId, message) {
    try {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const textToSummarize = quoted?.conversation
            || quoted?.extendedTextMessage?.text
            || quoted?.imageMessage?.caption
            || quoted?.videoMessage?.caption;

        if (!textToSummarize) {
            return await sock.sendMessage(chatId, {
                text: '📝 Reply to any message with *.summarize* to get a TL;DR.',
                ...channelInfo
            }, { quoted: message });
        }

        const summary = await chat(
            'You are a concise summarizer. Summarize the given text in 1-3 bullet points. Be brief and capture only the key points. Use • for bullets.',
            textToSummarize
        );

        await sock.sendMessage(chatId, {
            text: `📝 *TL;DR*\n\n${summary || '❌ Could not summarize.'}`,
            ...channelInfo
        }, { quoted: message });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Failed to summarize. Try again!', ...channelInfo }, { quoted: message });
    }
};
