const axios = require('axios');
const settings = require('../../settings'); // Assuming the API key is stored here
const style = require('../../lib/messageStyle');

async function gifCommand(sock, chatId, query) {
    const apiKey = settings.giphyApiKey; // Replace with your Giphy API Key

    if (!query) {
        await sock.sendMessage(chatId, { text: style.invalidInput('Please provide a search term for the GIF.', '.gif <search term>') });
        return;
    }

    try {
        const response = await axios.get(`https://api.giphy.com/v1/gifs/search`, {
            params: {
                api_key: apiKey,
                q: query,
                limit: 1,
                rating: 'g'
            }
        });

        // WhatsApp needs MP4 for animated playback — a raw .gif sent as video arrives broken
        const images = response.data.data[0]?.images || {};
        const gifUrl = images.original_mp4?.mp4 || images.fixed_height?.mp4 || images.downsized_small?.mp4;

        if (gifUrl) {
            await sock.sendMessage(chatId, { video: { url: gifUrl }, mimetype: 'video/mp4', gifPlayback: true, caption: `Here is your GIF for "${query}"` });
        } else {
            await sock.sendMessage(chatId, { text: 'No GIFs found for your search term.' });
        }
    } catch (error) {
        console.error('Error fetching GIF:', error);
        await sock.sendMessage(chatId, { text: 'Failed to fetch GIF. Please try again later.' });
    }
}

module.exports = {
    name: 'gif',
    aliases: [],
    category: 'fun',
    description: 'Search and send a GIF',
    usage: '.gif <search term>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await gifCommand(sock, extra.chatId, args.join(' '));
    },

};
