const { chat, chatGemini } = require('../../lib/ai');
const { channelInfo } = require('../../lib/messageConfig');
const style = require('../../lib/messageStyle');

function wantsDetailedAnswer(query) {
    return /(detailed|detail me|explain in detail|step by step|full|complete|long|deep|elaborate|essay|full guide|full explanation)/i.test(query);
}

function formatAiReply(text, detailed) {
    if (!text) return text;

    let cleaned = String(text)
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();

    if (detailed) {
        return cleaned;
    }

    const lines = cleaned.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length > 8) {
        cleaned = lines.slice(0, 8).join('\n');
    }

    if (cleaned.length > 900) {
        cleaned = cleaned.slice(0, 900).trim();
        const lastPunctuation = Math.max(
            cleaned.lastIndexOf('.'),
            cleaned.lastIndexOf('!'),
            cleaned.lastIndexOf('?'),
            cleaned.lastIndexOf('\n')
        );
        if (lastPunctuation > 200) {
            cleaned = cleaned.slice(0, lastPunctuation + 1).trim();
        }
    }

    return cleaned;
}

async function aiCommand(sock, chatId, message, commandName) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;

        if (!text) {
            return await sock.sendMessage(chatId, {
                text: style.invalidInput('Please provide a question after .gpt or .gemini.\n\nExample: .gpt write a basic html code', '.gpt <question> | .gemini <question>'),
                ...channelInfo
            }, { quoted: message });
        }

        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        const query = parts.slice(1).join(' ').trim();

        if (!query) {
            return await sock.sendMessage(chatId, {
                text: style.invalidInput('Please provide a question after .gpt or .gemini.', '.gpt <question> | .gemini <question>'),
                ...channelInfo
            }, { quoted: message });
        }

        // Show processing reaction
        await sock.sendMessage(chatId, {
            react: { text: '🤖', key: message.key }
        });

        const detailed = wantsDetailedAnswer(query);
        const systemPrompt = detailed
            ? 'You are a helpful AI assistant. Provide clear, accurate, well-structured answers. Use short headings or bullets when useful. Respond in Roman Urdu or English — match the language of the question or mix both naturally. Avoid fluff and repetition.'
            : 'You are a helpful AI assistant. Keep answers concise, clean, and easy to read. For normal questions, reply in 3-7 short lines max unless detail is truly necessary. Prefer bullets only when they improve clarity. Avoid long intros, repeated points, and unnecessary explanation. Respond in Roman Urdu or English — match the language of the question or mix both naturally.';

        let answer;
        if (commandName === 'gemini') {
            // Force Gemini for .gemini command
            answer = await chatGemini(systemPrompt, query, {
                maxTokens: detailed ? 900 : 320,
                temperature: detailed ? 0.7 : 0.55
            });
            if (!answer) {
                // Fall back to Groq if Gemini fails
                answer = await chat(systemPrompt, query, {
                    maxTokens: detailed ? 900 : 320,
                    temperature: detailed ? 0.7 : 0.55
                });
            }
        } else {
            // .gpt uses auto-fallback (Groq first, then Gemini)
            answer = await chat(systemPrompt, query, {
                maxTokens: detailed ? 900 : 320,
                temperature: detailed ? 0.7 : 0.55
            });
        }

        if (!answer) {
            throw new Error('All AI providers failed');
        }

        answer = formatAiReply(answer, detailed);

        await sock.sendMessage(chatId, {
            text: answer,
            ...channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('AI Command Error:', error.message);
        await sock.sendMessage(chatId, {
            text: style.error("I couldn't generate a response right now. Please try again."),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = {
    name: 'gpt',
    aliases: ['gemini'],
    category: 'ai',
    description: 'Ask the AI assistant a question',
    usage: '.gpt <question> | .gemini <question>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await aiCommand(sock, extra.chatId, message, extra.commandName);
    },

};
