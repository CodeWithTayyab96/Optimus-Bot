const fetch = require('node-fetch');
const style = require('../../lib/messageStyle');

async function lyricsCommand(sock, chatId, songTitle, message) {
    if (!songTitle) {
        await sock.sendMessage(chatId, { 
            text: style.invalidInput('Please enter the song name to get the lyrics.', '.lyrics <song title>')
        },{ quoted: message });
        return;
    }

    try {
        // Use lyricsapi.fly.dev and return only the raw lyrics text
        const apiUrl = `https://lyricsapi.fly.dev/api/lyrics?q=${encodeURIComponent(songTitle)}`;
        const res = await fetch(apiUrl);
        
        if (!res.ok) {
            const errText = await res.text();
            throw errText;
        }
        
        const data = await res.json();

        const lyrics = data && data.result && data.result.lyrics ? data.result.lyrics : null;
        if (!lyrics) {
            await sock.sendMessage(chatId, {
                text: style.error(`Sorry, I couldn't find any lyrics for "${songTitle}".`)
            },{ quoted: message });
            return;
        }

        const maxChars = 4096;
        const output = lyrics.length > maxChars ? lyrics.slice(0, maxChars - 3) + '...' : lyrics;

        await sock.sendMessage(chatId, { text: output }, { quoted: message });
    } catch (error) {
        console.error('Error in lyrics command:', error);
        await sock.sendMessage(chatId, { 
            text: style.error(`An error occurred while fetching the lyrics for "${songTitle}".`)
        },{ quoted: message });
    }
}

module.exports = {
    name: 'lyrics',
    aliases: [],
    category: 'media',
    description: 'Find song lyrics',
    usage: '.lyrics <song title>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await lyricsCommand(sock, extra.chatId, extra.userMessage.split(/\s+/).slice(1).join(' '), message);
    },
    lyricsCommand,
};
