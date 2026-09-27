const style = require('../../lib/messageStyle');
const { geocode, airQuality, aqiCategory } = require('../../lib/weatherApi');

/**
 * .aqi <city> — air quality (PM2.5 / PM10 / AQI + gases).
 * Open-Meteo Air Quality API — free, no key.
 */
async function aqiCommand(sock, chatId, message, city) {
    try {
        const place = await geocode(city);
        if (!place) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput(`Couldn't find "${city}". Try a city name.`, '.aqi <city>', { box: false })
            }, { quoted: message });
        }

        const a = await airQuality(place.latitude, place.longitude);
        if (!a) throw new Error('no air-quality data');

        const [category, circle, square] = aqiCategory(a.us_aqi);

        const lines = [
            `📍 ${place.name}${place.country ? ', ' + place.country : ''}`,
            `${circle} US AQI: ${a.us_aqi} — ${category}`,
            `🇪🇺 European AQI: ${a.european_aqi}`,
            '',
            `• PM2.5: ${a.pm2_5} µg/m³`,
            `• PM10: ${a.pm10} µg/m³`,
            `• O₃: ${a.ozone} µg/m³`,
            `• NO₂: ${a.nitrogen_dioxide} µg/m³`,
            `• SO₂: ${a.sulphur_dioxide} µg/m³`,
            `• CO: ${a.carbon_monoxide} µg/m³`,
        ];

        // Tint the colour band to the AQI category (green → red).
        await sock.sendMessage(chatId, { text: style.box('🫁 AIR QUALITY', lines, square) }, { quoted: message });
    } catch (error) {
        console.error('[aqi] error:', error?.message || error);
        await sock.sendMessage(chatId, { text: style.error('Could not fetch air quality right now.') }, { quoted: message });
    }
}

module.exports = {
    name: 'aqi',
    aliases: ['air', 'airquality'],
    category: 'utility',
    description: 'Air quality (PM2.5 / AQI) for a city',
    usage: '.aqi <city>',
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
                text: style.invalidInput('Please specify a city.', '.aqi <city>', { box: false })
            }, { quoted: message });
        }
        await aqiCommand(sock, extra.chatId, message, city);
    },
    aqiCommand,
};
