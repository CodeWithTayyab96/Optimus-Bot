const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

async function dareCommand(sock, chatId, message) {
    try {
        const dare = await chat(
            'You generate Truth or Dare challenges. Generate ONE fun, creative "Dare" challenge for a WhatsApp group chat game. The dare should be doable via chat/phone (not physical stunts). It should be fun and slightly embarrassing but safe. Just output the dare, nothing else.',
            'Give me a dare challenge'
        );

        await sock.sendMessage(chatId, {
            text: `🔥 *Dare:*\n\n${dare || 'Send a voice note singing your favorite song!'}`,
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        console.error('Error in dare command:', error.message);
        await sock.sendMessage(chatId, { text: '❌ Failed to get dare. Please try again later!', ...channelInfo }, { quoted: message });
    }
}

module.exports = { dareCommand };
