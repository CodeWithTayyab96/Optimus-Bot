const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

async function eightBallCommand(sock, chatId, question) {
    if (!question) {
        await sock.sendMessage(chatId, { text: '🎱 Please ask a question!\nExample: .8ball Will I pass my exam?', ...channelInfo });
        return;
    }

    try {
        const answer = await chat(
            'You are a mystical Magic 8-Ball oracle. Someone asks you a yes/no question. Give a short, mystical, dramatic answer (1 line max). Be creative — sometimes say yes, sometimes no, sometimes be cryptic and vague. Use a mystical/fortune-teller tone. Just the answer, nothing else.',
            question
        );

        await sock.sendMessage(chatId, {
            text: `🎱 *Magic 8-Ball*\n\n❓ ${question}\n🔮 ${answer || 'The spirits are unclear... try again.'}`,
            ...channelInfo
        });
    } catch (error) {
        console.error('Error in 8ball command:', error.message);
        await sock.sendMessage(chatId, { text: '🎱 The magic 8-ball is cloudy... try again later!', ...channelInfo });
    }
}

module.exports = { eightBallCommand };
