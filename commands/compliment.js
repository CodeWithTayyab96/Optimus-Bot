const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

const angles = ['personality', 'smile', 'intelligence', 'kindness', 'energy', 'humor', 'creativity', 'style', 'loyalty', 'strength', 'vibe', 'eyes', 'voice', 'heart'];

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

        const angle = angles[Math.floor(Math.random() * angles.length)];
        const compliment = await chat(
            'You are a warm, wholesome friend. Generate ONE unique, heartfelt compliment for someone. Be creative and genuine — avoid generic phrases. Keep it to 1-2 sentences. Just output the compliment, nothing else.',
            `Compliment someone's ${angle}. (#${Date.now()})`
        );

        await sock.sendMessage(chatId, {
            text: `Hey @${userToCompliment.split('@')[0]}, ${compliment || 'you are absolutely amazing!'}`,
            mentions: [userToCompliment],
            ...channelInfo
        });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ An error occurred while sending the compliment.', ...channelInfo });
    }
}

module.exports = { complimentCommand };
