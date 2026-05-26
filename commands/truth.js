const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

async function truthCommand(sock, chatId, message) {
    try {
        const truth = await chat(
            'You generate Truth or Dare questions. Generate ONE interesting, fun "Truth" question for a group chat game. The question should be juicy and fun but not too personal or offensive. Just output the question, nothing else. Vary between romantic, embarrassing, funny, and deep questions.',
            'Give me a truth question'
        );

        await sock.sendMessage(chatId, {
            text: `🤔 *Truth:*\n\n${truth || 'What is the most embarrassing thing you have done?'}`,
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        console.error('Error in truth command:', error.message);
        await sock.sendMessage(chatId, { text: '❌ Failed to get truth. Please try again later!', ...channelInfo }, { quoted: message });
    }
}

module.exports = { truthCommand };
