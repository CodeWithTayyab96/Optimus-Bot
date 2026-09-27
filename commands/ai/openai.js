/**
 * .openai — Chat with the configured OpenAI-Compatible model.
 *
 * Uses lib/ai.chatOpenAI(), which talks to any endpoint implementing
 * /chat/completions (OpenAI, OpenRouter, Together, local LLMs, etc.) using
 * settings.openaiBaseUrl / settings.openaiApiKey / settings.openaiModel.
 *
 * Makes 0 network requests when the provider is not configured — it surfaces a
 * clear "not configured" message instead of failing silently.
 */
const { chatOpenAI } = require('../../lib/ai');
const aiConfig = require('../../lib/aiConfig');
const { channelInfo } = require('../../lib/messageConfig');
const style = require('../../lib/messageStyle');
const { getPrompt } = require('../../lib/aiHelpers');

function formatReply(text) {
    if (!text) return text;
    return String(text)
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
}

module.exports = {
    name: 'openai',
    aliases: ['oai', 'customai', 'llm', 'custom'],
    category: 'ai',
    description: 'Ask the configured OpenAI-compatible model (custom endpoint)',
    usage: '.openai <question>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const query = getPrompt(args, message, extra.prefix);

            if (!query) {
                return await sock.sendMessage(extra.chatId, {
                    text: style.invalidInput(
                        'Please provide a question for the OpenAI-compatible model.',
                        `${extra.prefix}openai <question>`
                    ),
                    ...channelInfo
                }, { quoted: message });
            }

            // Not configured → clear message, zero network requests.
            if (!aiConfig.isProviderReady('openai')) {
                return await sock.sendMessage(extra.chatId, {
                    text: style.error(
                        'OpenAI-compatible provider is not configured. '
                        + 'Set openaiApiKey (and optionally openaiBaseUrl / openaiModel) in settings.'
                    ),
                    ...channelInfo
                }, { quoted: message });
            }

            // Show processing reaction
            await sock.sendMessage(extra.chatId, {
                react: { text: '🤖', key: message.key }
            });

            const systemPrompt = 'You are a helpful AI assistant. Provide clear, accurate, well-structured answers. '
                + 'Respond in Roman Urdu or English — match the language of the question or mix both naturally.';

            const answer = await chatOpenAI(systemPrompt, query, { maxTokens: 700, temperature: 0.7 });

            if (!answer) {
                throw new Error('OpenAI-compatible provider returned no answer');
            }

            await sock.sendMessage(extra.chatId, {
                text: formatReply(answer),
                ...channelInfo
            }, { quoted: message });
        } catch (error) {
            console.error('OpenAI Command Error:', error.message);
            await sock.sendMessage(extra.chatId, {
                text: style.error("I couldn't generate a response right now. Please try again."),
                ...channelInfo
            }, { quoted: message });
        }
    },
};
