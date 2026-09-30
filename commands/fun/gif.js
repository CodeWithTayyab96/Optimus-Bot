const axios = require('axios');
const settings = require('../../settings');
const style = require('../../lib/messageStyle');

// Giphy's terms require visible attribution whenever their content is shown.
// https://developers.giphy.com/docs/api — "Powered by GIPHY"
const ATTRIBUTION = 'Powered by GIPHY';

/** True when the key is absent or still the placeholder shipped in .env. */
function keyMissing(key) {
    const v = String(key || '').trim();
    return !v || /^YOUR_/i.test(v);
}

async function gifCommand(sock, chatId, query) {
    const apiKey = settings.giphyApiKey;

    if (!query) {
        await sock.sendMessage(chatId, { text: style.invalidInput('Please provide a search term for the GIF.', '.gif <search term>') });
        return;
    }

    // Without this the request goes out with a placeholder key, Giphy answers
    // 401, and the user is told "try again later" — which tells them nothing
    // about the one thing they could actually fix.
    if (keyMissing(apiKey)) {
        await sock.sendMessage(chatId, {
            text: style.error(
                'GIF search is not configured yet.\n' +
                    'Get a free key at developers.giphy.com, then set GIPHY_API_KEY in your .env and restart.'
            ),
        });
        return;
    }

    try {
        const response = await axios.get('https://api.giphy.com/v1/gifs/search', {
            params: { api_key: apiKey, q: query, limit: 1, rating: 'g' },
            timeout: 20000,
        });

        // WhatsApp needs MP4 for animated playback — a raw .gif sent as video arrives broken.
        const images = response.data?.data?.[0]?.images || {};
        const gifUrl = images.original_mp4?.mp4 || images.fixed_height?.mp4 || images.downsized_small?.mp4;

        if (!gifUrl) {
            await sock.sendMessage(chatId, { text: `No GIFs found for "${query}". Try a broader search term.` });
            return;
        }

        await sock.sendMessage(chatId, {
            video: { url: gifUrl },
            mimetype: 'video/mp4',
            gifPlayback: true,
            caption: `${ATTRIBUTION} — "${query}"`,
        });
    } catch (error) {
        const status = error.response && error.response.status;
        console.error('[gif] Giphy request failed:', status || '', error.message);

        if (status === 401 || status === 403) {
            await sock.sendMessage(chatId, {
                text: style.error(
                    'Giphy rejected the API key (401/403). Check GIPHY_API_KEY in your .env — ' +
                        'beta keys are also refused on some endpoints, so apply for a production key.'
                ),
            });
            return;
        }
        if (status === 429) {
            await sock.sendMessage(chatId, {
                text: style.error(
                    'Giphy rate limit reached (429). Beta keys are limited — try again shortly, ' +
                        'or request a production key at developers.giphy.com.'
                ),
            });
            return;
        }
        await sock.sendMessage(chatId, { text: style.error('Could not reach Giphy. Please try again later.') });
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
