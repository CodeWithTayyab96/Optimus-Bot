const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

async function insultCommand(sock, chatId, message) {
    try {
        if (!message || !chatId) return;

        let userToInsult;

        if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            userToInsult = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
            userToInsult = message.message.extendedTextMessage.contextInfo.participant;
        }

        if (!userToInsult) {
            return await sock.sendMessage(chatId, {
                text: 'Please mention someone or reply to their message to roast them!',
                ...channelInfo
            });
        }

        const insult = await chat(
            'You are a witty roast comedian. Generate ONE playful, funny roast/insult. It should be light-hearted and humorous — mean enough to be funny but NOT truly hurtful or offensive. Think comedy roast style. Keep it to 1-2 sentences. Just output the roast, nothing else.',
            'Give me a random playful roast — pick any style: witty, sarcastic, absurd, or self-aware humor.'
        );

        await sock.sendMessage(chatId, {
            text: `Hey @${userToInsult.split('@')[0]}, ${insult || "you're like a software update — whenever I see you, I think 'not now'."}`,
            mentions: [userToInsult],
            ...channelInfo
        });
    } catch (error) {
        console.error('Error in insult command:', error.message);
        await sock.sendMessage(chatId, { text: '❌ An error occurred while sending the insult.', ...channelInfo });
    }
}

module.exports = { insultCommand };
