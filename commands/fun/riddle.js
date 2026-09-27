const { riddles, pick } = require('../../lib/funData');
const { channelInfo } = require('../../lib/messageConfig');

const riddleCommand = async function (sock, chatId, message) {
    try {
        const riddle = pick(riddles);
        if (!riddle) return await sock.sendMessage(chatId, { text: '❌ Could not find a riddle.', ...channelInfo }, { quoted: message });

        await sock.sendMessage(chatId, {
            text: `🧩 RIDDLE\n\n${riddle.question}\n\n_Reply with your answer, then type_ *.answer* _to reveal!_`,
            ...channelInfo
        }, { quoted: message });

        setTimeout(async () => {
            await sock.sendMessage(chatId, {
                text: `💡 *Answer:* ${riddle.answer}`,
                ...channelInfo
            });
        }, 30000);
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Failed to get riddle. Try again!', ...channelInfo }, { quoted: message });
    }
};

module.exports = {
    name: 'riddle',
    aliases: [],
    category: 'fun',
    description: 'Get a random riddle',
    usage: '.riddle',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await riddleCommand(sock, extra.chatId, message);
    },

};
