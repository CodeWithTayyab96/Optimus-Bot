const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

const types = ['wordplay', 'logic', 'math', 'lateral thinking', 'what am I', 'science', 'nature', 'tricky', 'classic', 'funny'];

module.exports = async function (sock, chatId, message) {
    try {
        const type = types[Math.floor(Math.random() * types.length)];
        const result = await chat(
            'You generate riddles. Output ONLY in this exact format:\nRIDDLE: <the riddle question>\nANSWER: <the answer>\n\nMake it clever but solvable. No extra text.',
            `Give me a ${type} riddle. (#${Date.now()})`
        );

        if (!result) return await sock.sendMessage(chatId, { text: '❌ Could not generate a riddle.', ...channelInfo }, { quoted: message });

        const riddleMatch = result.match(/RIDDLE:\s*(.+)/i);
        const answerMatch = result.match(/ANSWER:\s*(.+)/i);

        if (!riddleMatch) return await sock.sendMessage(chatId, { text: result, ...channelInfo }, { quoted: message });

        await sock.sendMessage(chatId, {
            text: `🧩 *Riddle*\n\n${riddleMatch[1].trim()}\n\n_Reply with your answer, then type_ *.answer* _to reveal!_`,
            ...channelInfo
        }, { quoted: message });

        if (answerMatch) {
            setTimeout(async () => {
                await sock.sendMessage(chatId, {
                    text: `💡 *Answer:* ${answerMatch[1].trim()}`,
                    ...channelInfo
                });
            }, 30000);
        }
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Failed to get riddle. Try again!', ...channelInfo }, { quoted: message });
    }
};
