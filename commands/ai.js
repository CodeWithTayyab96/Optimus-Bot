const { chat, chatGemini } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

async function aiCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;

        if (!text) {
            return await sock.sendMessage(chatId, {
                text: "Please provide a question after .gpt or .gemini\n\nExample: .gpt write a basic html code",
                ...channelInfo
            }, { quoted: message });
        }

        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        const query = parts.slice(1).join(' ').trim();

        if (!query) {
            return await sock.sendMessage(chatId, {
                text: "Please provide a question after .gpt or .gemini",
                ...channelInfo
            }, { quoted: message });
        }

        // Show processing reaction
        await sock.sendMessage(chatId, {
            react: { text: '🤖', key: message.key }
        });

        const systemPrompt = 'You are a helpful AI assistant. Provide clear, accurate, and concise answers. Use markdown formatting where appropriate for readability.';

        let answer;
        if (command === '.gemini') {
            // Force Gemini for .gemini command
            answer = await chatGemini(systemPrompt, query);
            if (!answer) {
                // Fall back to Groq if Gemini fails
                answer = await chat(systemPrompt, query);
            }
        } else {
            // .gpt uses auto-fallback (Groq first, then Gemini)
            answer = await chat(systemPrompt, query);
        }

        if (!answer) {
            throw new Error('All AI providers failed');
        }

        await sock.sendMessage(chatId, {
            text: answer,
            ...channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('AI Command Error:', error.message);
        await sock.sendMessage(chatId, {
            text: "❌ Failed to get a response. Please try again later.",
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = aiCommand;
