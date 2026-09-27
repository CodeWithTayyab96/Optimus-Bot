const { chat } = require('../../lib/ai');
const { channelInfo } = require('../../lib/messageConfig');
const style = require('../../lib/messageStyle');
const { getPrompt } = require('../../lib/aiHelpers');

const MODES = {
    formal: 'Rewrite the text in a formal and polished tone.',
    friendly: 'Rewrite the text in a warm, friendly, natural tone.',
    short: 'Rewrite the text to be shorter and sharper while keeping the meaning.',
    professional: 'Rewrite the text in a professional tone suitable for work or business.',
    savage: 'Rewrite the text with a confident, savage style but keep it readable.',
    romantic: 'Rewrite the text in a soft, romantic tone.',
    fixgrammar: 'Fix grammar, spelling, punctuation, and clarity without changing the meaning too much.'
};

function extractQuotedText(message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    return quoted?.conversation?.trim()
        || quoted?.extendedTextMessage?.text?.trim()
        || quoted?.imageMessage?.caption?.trim()
        || quoted?.videoMessage?.caption?.trim()
        || '';
}

async function rewriteCommand(sock, chatId, message, args, extra) {
    try {
        const quotedText = extractQuotedText(message);
        const full = getPrompt(args, message, extra.prefix);
        const parts = full ? full.split(/\s+/) : [];

        let mode = 'friendly';
        if (parts[0] && MODES[parts[0].toLowerCase()]) {
            mode = parts.shift().toLowerCase();
        }

        const inlineText = parts.join(' ').trim();
        const sourceText = quotedText || inlineText;

        if (!sourceText) {
            return await sock.sendMessage(chatId, {
                text: style.invalidInput(`Reply to text with ${extra.prefix}rewrite <mode> or use ${extra.prefix}rewrite <mode> your text.\n\nModes: ${Object.keys(MODES).join(', ')}`, `${extra.prefix}rewrite <text>`),
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
            text: rewritten || style.error("I couldn't rewrite that text right now. Please try again."),
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        console.error('Rewrite command error:', error.message);
        await sock.sendMessage(chatId, {
            text: style.error("I couldn't rewrite that text right now. Please try again."),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = {
    name: 'rewrite',
    aliases: [],
    category: 'ai',
    description: 'Rewrite text with AI',
    usage: '.rewrite <text>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await rewriteCommand(sock, extra.chatId, message, args, extra);
    },

};
