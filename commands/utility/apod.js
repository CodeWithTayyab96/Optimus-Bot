const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

// NASA's public demo key works out of the box; set NASA_API_KEY for your own.
const KEY = process.env.NASA_API_KEY || 'DEMO_KEY';

module.exports = {
    name: 'apod',
    aliases: ['nasa'],
    category: 'utility',
    description: "NASA Astronomy Picture of the Day",
    usage: '.apod',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            await sock.sendMessage(extra.chatId, { react: { text: '🌌', key: message.key } });

            const data = await getJson('https://api.nasa.gov/planetary/apod', {
                params: { api_key: KEY, thumbs: true },
            });

            if (!data || !data.url) {
                return await extra.reply(style.error('Could not fetch the NASA image right now. Please try again.'));
            }

            const caption = style.box('🌌 NASA — ASTRONOMY PICTURE', [
                `📅 ${data.date || ''}`,
                `📌 ${data.title || ''}`,
                '',
                String(data.explanation || '').slice(0, 700)
            ]);

            if (data.media_type === 'image') {
                await sock.sendMessage(extra.chatId, { image: { url: data.url }, caption }, { quoted: message });
            } else {
                await sock.sendMessage(extra.chatId, { text: `${caption}\n\n🔗 ${data.url}` }, { quoted: message });
            }
        } catch (error) {
            console.error('[apod] error:', error.message);
            return await extra.reply(style.error('Could not fetch the NASA image right now. Please try again.'));
        }
    },
};
