const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

const styles = ['witty', 'sarcastic', 'absurd', 'self-aware', 'backhanded compliment', 'comparison', 'exaggeration', 'deadpan', 'pop culture', 'tech roast'];

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

        const style = styles[Math.floor(Math.random() * styles.length)];
        const insult = await chat(
            'You are a witty roast comedian. Generate ONE playful, funny roast/insult. It should be light-hearted and humorous — mean enough to be funny but NOT truly hurtful or offensive. Think comedy roast style. Keep it to 1-2 sentences. Just output the roast, nothing else.',
            `Give me a ${style} roast. (#${Date.now()})`
        );

        await sock.sendMessage(chatId, {
            text: `Hey @${userToInsult.split('@')[0]}, ${insult || "you're like a software update — whenever I see you, I think 'not now'."}`,
            mentions: [userToInsult],
            ...channelInfo
        });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ An error occurred while sending the insult.', ...channelInfo });
    }
}

module.exports = { insultCommand };
