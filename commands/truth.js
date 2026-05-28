const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

const categories = ['romantic', 'embarrassing', 'childhood memories', 'funny', 'deep', 'secrets', 'relationships', 'school life', 'fears', 'guilty pleasures', 'social media', 'crushes', 'regrets', 'family', 'money'];

async function truthCommand(sock, chatId, message) {
    try {
        const cat = categories[Math.floor(Math.random() * categories.length)];
        const truth = await chat(
            'You generate Truth or Dare questions. Generate ONE interesting, fun "Truth" question for a group chat game. The question should be juicy and fun but not too personal or offensive. Just output the question, nothing else.',
            `Give me a truth question about ${cat}. (#${Date.now()})`
        );
        await sock.sendMessage(chatId, {
            text: `🤔 *Truth:*\n\n${truth || 'What is the most embarrassing thing you have done?'}`,
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Failed to get truth. Please try again later!', ...channelInfo }, { quoted: message });
    }
}

module.exports = { truthCommand };
