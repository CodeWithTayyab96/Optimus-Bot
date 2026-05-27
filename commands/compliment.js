const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

async function complimentCommand(sock, chatId, message) {
    try {
        if (!message || !chatId) return;

        let userToCompliment;

        if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            userToCompliment = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
            userToCompliment = message.message.extendedTextMessage.contextInfo.participant;
        }

        if (!userToCompliment) {
            return await sock.sendMessage(chatId, {
                text: 'Please mention someone or reply to their message to compliment them!',
                ...channelInfo
            });
        }

        const compliment = await chat(
            'You are a warm, wholesome friend. Generate ONE unique, heartfelt compliment for someone. Be creative and genuine — avoid generic phrases. Keep it to 1-2 sentences. Just output the compliment, nothing else.',
            'Give me a random heartfelt compliment — pick any angle: personality, smile, intelligence, kindness, or energy.'
        );

        await sock.sendMessage(chatId, {
            text: `Hey @${userToCompliment.split('@')[0]}, ${compliment || 'you are absolutely amazing!'}`,
            mentions: [userToCompliment],
            ...channelInfo
        });
    } catch (error) {
        console.error('Error in compliment command:', error.message);
        await sock.sendMessage(chatId, { text: '❌ An error occurred while sending the compliment.', ...channelInfo });
    }
}

module.exports = { complimentCommand };
