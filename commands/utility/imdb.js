/**
 * Optimus Bot — .imdb
 * Look up movie information from OMDb.
 *
 * API: https://www.omdbapi.com/
 * Key configured in settings.js → omdbApiKey
 */
const axios = require('axios');
const settings = require('../../settings');
const style = require('../../lib/messageStyle');

const TIMEOUT = 10000;

async function handleImdbCommand(sock, chatId, message, userMessage) {
    try {
        const query = userMessage.trim().split(/\s+/).slice(1).join(' ').trim();
        if (!query) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput(
                    'Please provide a movie title.',
                    '.imdb <movie title>\n\nExample: .imdb Interstellar'
                )
            }, { quoted: message });
        }

        const apiKey = settings.omdbApiKey;
        if (!apiKey) {
            return sock.sendMessage(chatId, {
                text: style.error(
                    'OMDb API key is not configured.\n' +
                    'Get a free key at: https://www.omdbapi.com/apikey.aspx\n' +
                    'Then set omdbApiKey in settings.js'
                )
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: style.processing(`Looking up "${query}"`)
        }, { quoted: message });

        const response = await axios.get('https://www.omdbapi.com/', {
            params: { t: query, apikey: apiKey },
            timeout: TIMEOUT
        });

        const data = response.data;

        if (!data || data.Response === 'False') {
            const reason = data.Error || 'Movie not found';
            return sock.sendMessage(chatId, {
                text: style.warning(`Could not find "${query}". ${reason}`)
            }, { quoted: message });
        }

        // Build compact movie card
        const lines = [];

        if (data.Title) lines.push(`🎬 *${data.Title}* (${data.Year || 'N/A'})`);
        if (data.Released && data.Released !== 'N/A') lines.push(`📅 Released: ${data.Released}`);
        if (data.Rated && data.Rated !== 'N/A') lines.push(` Rated: ${data.Rated}`);
        if (data.Runtime && data.Runtime !== 'N/A') lines.push(`⏱️ Runtime: ${data.Runtime}`);
        if (data.Genre && data.Genre !== 'N/A') lines.push(`🎭 Genre: ${data.Genre}`);
        if (data.Director && data.Director !== 'N/A') lines.push(`🎬 Director: ${data.Director}`);
        if (data.Actors && data.Actors !== 'N/A') lines.push(`👥 Cast: ${data.Actors}`);
        if (data.Language && data.Language !== 'N/A') lines.push(`🌐 Language: ${data.Language}`);
        if (data.Country && data.Country !== 'N/A') lines.push(`🌍 Country: ${data.Country}`);
        if (data.Plot && data.Plot !== 'N/A') {
            const plot = data.Plot.length > 200 ? data.Plot.substring(0, 200) + '...' : data.Plot;
            lines.push(`📖 Plot: ${plot}`);
        }
        if (data.Awards && data.Awards !== 'N/A') lines.push(`🏆 Awards: ${data.Awards}`);
        if (data.imdbRating && data.imdbRating !== 'N/A') lines.push(`⭐ IMDb: ${data.imdbRating}/10 (${data.imdbVotes || 'N/A'} votes)`);
        if (data.imdbID) lines.push(`🔗 https://www.imdb.com/title/${data.imdbID}`);

        if (lines.length === 0) {
            return sock.sendMessage(chatId, {
                text: style.warning(`Found "${query}" but no details available.`)
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: style.box('🎬 IMDb', lines)
        }, { quoted: message });

    } catch (error) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            await sock.sendMessage(chatId, {
                text: style.error('Request timed out. Please try again.')
            }, { quoted: message });
        } else if (error.response) {
            await sock.sendMessage(chatId, {
                text: style.error('OMDb service is temporarily unavailable.')
            }, { quoted: message });
        } else {
            console.error('[imdb] Error:', error);
            await sock.sendMessage(chatId, {
                text: style.error('Failed to look up movie information.')
            }, { quoted: message });
        }
    }
}

module.exports = {
    name: 'imdb',
    aliases: ['movie', 'film'],
    category: 'utility',
    description: 'Look up movie information from IMDb/OMDb',
    usage: '.imdb <movie title>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await handleImdbCommand(sock, extra.chatId, message, extra.userMessage);
    },
};
