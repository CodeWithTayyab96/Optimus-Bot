const { chat } = require('../../lib/ai');
const { channelInfo } = require('../../lib/messageConfig');

const styles = ['pun', 'one-liner', 'dad joke', 'dark humor', 'knock-knock', 'observational', 'wordplay', 'anti-joke', 'absurd humor', 'tech joke', 'animal joke', 'food joke', 'math joke', 'science joke', 'relationship joke'];

const jokeCommand = async function (sock, chatId) {
    try {
        const style = styles[Math.floor(Math.random() * styles.length)];
        const joke = await chat(
            'You are a world-class comedian. Generate ONE original, funny joke. Just the joke — no intro, no labels, no "here\'s a joke". Keep it short (1-3 lines). Respond in Roman Urdu or English — you can mix both naturally.',
            `Tell me a ${style} joke. (#${Date.now()})`
        );
        await sock.sendMessage(chatId, {
            text: `😂 JOKE\n\n${joke || 'Sorry, I could not come up with a joke right now.'}`,
            ...channelInfo
        });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Could not generate a joke. Please try again!', ...channelInfo });
    }
};

module.exports = {
    name: 'joke',
    aliases: [],
    category: 'fun',
    description: 'Get a random joke',
    usage: '.joke',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await jokeCommand(sock, extra.chatId);
    },

};
