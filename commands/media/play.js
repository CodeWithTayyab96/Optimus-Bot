const yts = require('yt-search');
const axios = require('axios');
const style = require('../../lib/messageStyle');

async function playCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        const searchQuery = text.split(' ').slice(1).join(' ').trim();
        
        if (!searchQuery) {
            return await sock.sendMessage(chatId, { 
                text: style.invalidInput('Please tell me what song to download.', '.music <song name>')
            });
        }

        // Search for the song
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
            return await sock.sendMessage(chatId, { 
                text: style.error('No songs found for your search.')
            });
        }

        // Send loading message
        await sock.sendMessage(chatId, {
            text: style.processing('Fetching your audio...')
        });

        // Get the first video result
        const video = videos[0];
        const urlYt = video.url;

        // Fetch audio data from API
        const response = await axios.get(`https://apis-keith.vercel.app/download/dlmp3?url=${urlYt}`);
        const data = response.data;

        if (!data || !data.status || !data.result || !data.result.downloadUrl) {
            return await sock.sendMessage(chatId, { 
                text: style.error('Failed to fetch the audio. Please try again later.')
            });
        }

        const audioUrl = data.result.downloadUrl;
        const title = data.result.title;

        // Send the audio
        await sock.sendMessage(chatId, {
            audio: { url: audioUrl },
            mimetype: "audio/mpeg",
            fileName: `${title}.mp3`
        }, { quoted: message });

    } catch (error) {
        console.error('Error in song2 command:', error);
        await sock.sendMessage(chatId, { 
            text: style.error('Download failed. Please try again later.')
        });
    }
}

module.exports = {
    name: 'music',
    aliases: [],
    category: 'media',
    description: 'Search and play music',
    usage: '.music <song name>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await playCommand(sock, extra.chatId, message);
    },

};

/*Powered by OPTIMUS-BOT*
*Credits to Keith MD*`*/