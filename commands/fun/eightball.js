const { chat } = require('../../lib/ai');
const { channelInfo } = require('../../lib/messageConfig');
const style = require('../../lib/messageStyle');

async function eightBallCommand(sock, chatId, question) {
    if (!question) {
        await sock.sendMessage(chatId, { text: style.invalidInput('Please ask a question.', '.8ball <question>'), ...channelInfo });
        return;
    }

    try {
        const answer = await chat(
            'You are a mystical Magic 8-Ball oracle. Someone asks you a yes/no question. Give a short, mystical, dramatic answer (1 line max). Be creative — sometimes say yes, sometimes no, sometimes be cryptic and vague. Use a mystical/fortune-teller tone. Respond in Roman Urdu or English — you can mix both naturally. Just the answer, nothing else.',
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

module.exports = {
    name: '8ball',
    aliases: [],
    category: 'fun',
    description: 'Ask the magic 8-ball a question',
    usage: '.8ball <question>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await eightBallCommand(sock, extra.chatId, extra.userMessage.split(/\s+/).slice(1).join(' '));
    },
    eightBallCommand,
};
