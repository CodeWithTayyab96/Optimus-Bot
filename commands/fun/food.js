const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

// Foodish — free, no API key. Returns a random food image, optionally by category.
// Docs: https://freeapihub.com/apis/foodish-api  ·  https://foodish-api.com
const BASE = 'https://foodish-api.com/api';

async function foodCommand(sock, chatId, message, category) {
    await sock.sendMessage(chatId, { react: { text: '🍔', key: message.key } });

    const fetchRandom = async () => getJson(`${BASE}/images/random`, { timeout: 20000 });

    try {
        let data;
        if (category) {
            // A bad category 404s — fall back to a plain random image rather than erroring.
            data = await getJson(`${BASE}/images/${encodeURIComponent(category.toLowerCase())}/random`, { timeout: 20000 })
                .catch(() => null) || (await fetchRandom());
        } else {
            data = await fetchRandom();
        }

        const image = data && data.image;
        if (!image) {
            await sock.sendMessage(chatId, { text: style.error('Could not fetch a food image. Please try again.') }, { quoted: message });
            return;
        }

        await sock.sendMessage(
            chatId,
            { image: { url: image }, caption: `🍔 ${category ? category : 'Random food'} — from Foodish` },
            { quoted: message }
        );
    } catch (err) {
        console.error('[food] error:', err.message);
        await sock.sendMessage(chatId, { text: style.error('Could not fetch a food image. Please try again.') }, { quoted: message });
    }
}

module.exports = {
    name: 'food',
    aliases: ['foodpic', 'foodimage'],
    category: 'fun',
    description: 'Send a random food photo (optionally by category: pizza, dessert, biryani…)',
    usage: '.food  ·  .food <category>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await foodCommand(sock, extra.chatId, message, args.join(' ').trim());
    },
};
