const style = require('../../lib/messageStyle');
const { geocode, forecast } = require('../../lib/weatherApi');

function toMinutes(hhmm) {
    const [h, m] = String(hhmm).split(':').map(Number);
    return (h * 60) + (m || 0);
}

/**
 * .sun <city> — sunrise, sunset and day length.
 * Uses Open-Meteo (free, no key) — same source as .weather.
 */
async function sunCommand(sock, chatId, message, city) {
    try {
        const place = await geocode(city);
        if (!place) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput(`Couldn't find "${city}". Try a city name.`, '.sun <city>', { box: false })
            }, { quoted: message });
        }

        const data = await forecast(place.latitude, place.longitude, 1);
        const d = data.daily;
        const sunrise = d.sunrise[0].slice(11);
        const sunset = d.sunset[0].slice(11);
        const len = toMinutes(sunset) - toMinutes(sunrise);

        const lines = [
            `📍 ${place.name}${place.country ? ', ' + place.country : ''}`,
            `🌅 Sunrise: ${sunrise}`,
            `🌇 Sunset: ${sunset}`,
            `☀️ Day length: ${Math.floor(len / 60)}h ${len % 60}m`,
            `🔆 Max UV: ${d.uv_index_max[0] == null ? '—' : Math.round(d.uv_index_max[0])}`,
            `🌧️ Rain today: ${d.precipitation_sum[0]} mm`,
        ];

        await sock.sendMessage(chatId, { text: style.box('🌅 SUN TIMES', lines) }, { quoted: message });
    } catch (error) {
        console.error('[sun] error:', error?.message || error);
        await sock.sendMessage(chatId, { text: style.error('Could not fetch sun times right now.') }, { quoted: message });
    }
}

module.exports = {
    name: 'sun',
    aliases: ['sunrise', 'sunset', 'suntimes'],
    category: 'utility',
    description: 'Sunrise / sunset / day length for a city',
    usage: '.sun <city>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const city = args.join(' ').trim();
        if (!city) {
            return sock.sendMessage(extra.chatId, {
                text: style.invalidInput('Please specify a city.', '.sun <city>', { box: false })
            }, { quoted: message });
        }
        await sunCommand(sock, extra.chatId, message, city);
    },
    sunCommand,
};
