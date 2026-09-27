const style = require('../../lib/messageStyle');
const { geocode, forecast, describe, windDir } = require('../../lib/weatherApi');

/**
 * .weather <city> — current conditions + a 4-day forecast.
 * Uses Open-Meteo (free, no API key) — replaces the old hardcoded OpenWeatherMap
 * key. Data is far richer: feels-like, humidity, wind, pressure, cloud,
 * visibility, UV, precipitation, sunrise/sunset and a daily forecast.
 */
async function weatherCommand(sock, chatId, message, city) {
    try {
        const place = await geocode(city);
        if (!place) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput(`Couldn't find "${city}". Try a city name.`, '.weather <city>', { box: false })
            }, { quoted: message });
        }

        const data = await forecast(place.latitude, place.longitude, 4);
        const c = data.current;
        const d = data.daily;
        const [desc, icon] = describe(c.weather_code);

        const lines = [
            `📍 ${place.name}${place.country ? ', ' + place.country : ''}`,
            `${icon} ${desc}`,
            `🌡️ ${Math.round(c.temperature_2m)}°C (feels ${Math.round(c.apparent_temperature)}°C)`,
            `💧 Humidity: ${c.relative_humidity_2m}%`,
            `💨 Wind: ${Math.round(c.wind_speed_10m)} km/h ${windDir(c.wind_direction_10m)}`,
            `🧭 Pressure: ${Math.round(c.pressure_msl)} hPa`,
            `☁️ Cloud: ${c.cloud_cover}%  ·  👁️ Vis: ${(c.visibility / 1000).toFixed(1)} km`,
            `🔆 UV index: ${c.uv_index == null ? '—' : Math.round(c.uv_index)}  ·  🌧️ Rain: ${c.precipitation} mm`,
            `🌅 ${d.sunrise[0].slice(11)}  ·  🌇 ${d.sunset[0].slice(11)}`,
            '',
            '*📅 4-DAY FORECAST*',
        ];
        for (let i = 0; i < d.time.length; i++) {
            const [dayDesc, dayIcon] = describe(d.weather_code[i]);
            const day = new Date(d.time[i] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
            lines.push(`${dayIcon} ${day}: ${Math.round(d.temperature_2m_max[i])}° / ${Math.round(d.temperature_2m_min[i])}° · ${dayDesc}`);
        }

        await sock.sendMessage(chatId, { text: style.box('🌦️ WEATHER', lines) }, { quoted: message });
    } catch (error) {
        console.error('[weather] error:', error?.message || error);
        await sock.sendMessage(chatId, { text: style.error('Could not fetch the weather right now.') }, { quoted: message });
    }
}

module.exports = {
    name: 'weather',
    aliases: [],
    category: 'utility',
    description: 'Get current weather + a 4-day forecast for a city',
    usage: '.weather <city>',
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
                text: style.invalidInput('Please specify a city.', '.weather <city>', { box: false })
            }, { quoted: message });
        }
        await weatherCommand(sock, extra.chatId, message, city);
    },
    weatherCommand,
};
