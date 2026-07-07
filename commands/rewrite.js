const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

const MODES = {
    formal: 'Rewrite the text in a formal and polished tone.',
    friendly: 'Rewrite the text in a warm, friendly, natural tone.',
    short: 'Rewrite the text to be shorter and sharper while keeping the meaning.',
    professional: 'Rewrite the text in a professional tone suitable for work or business.',
    savage: 'Rewrite the text with a confident, savage style but keep it readable.',
    romantic: 'Rewrite the text in a soft, romantic tone.',
    fixgrammar: 'Fix grammar, spelling, punctuation, and clarity without changing the meaning too much.'
};

function extractRawText(message) {
    return message.message?.conversation?.trim()
        || message.message?.extendedTextMessage?.text?.trim()
        || message.message?.imageMessage?.caption?.trim()
        || message.message?.videoMessage?.caption?.trim()
        || '';
}

function extractQuotedText(message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    return quoted?.conversation?.trim()
        || quoted?.extendedTextMessage?.text?.trim()
        || quoted?.imageMessage?.caption?.trim()
        || quoted?.videoMessage?.caption?.trim()
        || '';
}

async function rewriteCommand(sock, chatId, message) {
    try {
        const rawText = extractRawText(message);
        const args = rawText.replace(/^\.\w+\s*/, '').trim();
        const quotedText = extractQuotedText(message);
        const parts = args ? args.split(/\s+/) : [];

        let mode = 'friendly';
        if (parts[0] && MODES[parts[0].toLowerCase()]) {
            mode = parts.shift().toLowerCase();
        }

        const inlineText = parts.join(' ').trim();
        const sourceText = quotedText || inlineText;

        if (!sourceText) {
            return await sock.sendMessage(chatId, {
                text: '✍️ Reply to text with `.rewrite <mode>` or use `.rewrite <mode> your text`\n\nModes: formal, friendly, short, professional, savage, romantic, fixgrammar',
                ...channelInfo
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            react: { text: '✍️', key: message.key }
        });

        const rewritten = await chat(
            `You are a rewriting assistant for WhatsApp. ${MODES[mode]} Keep the meaning intact unless the user clearly asks otherwise. Output only the rewritten version. Respond in Roman Urdu or English — match the original tone and language naturally.`,
            sourceText,
            { maxTokens: 512, temperature: 0.8 }
        );

        await sock.sendMessage(chatId, {
            text: rewritten || '❌ Could not rewrite that text.',
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        console.error('Rewrite command error:', error.message);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to rewrite text. Please try again later.',
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = rewriteCommand;
