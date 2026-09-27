/**
 * weatherApi — shared Open-Meteo helpers (FREE, no API key).
 *
 * Used by .weather / .aqi / .sun. Open-Meteo needs no key and no signup, which
 * makes it far more reliable than the old hardcoded OpenWeatherMap key the
 * .weather command used to depend on.
 *
 *   geocode(city)        → { name, country, latitude, longitude, timezone }
 *   forecast(lat, lon)   → current + daily (Open-Meteo forecast)
 *   airQuality(lat, lon) → current PM2.5 / PM10 / AQI / gases
 */
const axios = require('axios');

const HEADERS = { 'User-Agent': 'OptimusBot/1.0', 'Accept': 'application/json' };
const TIMEOUT = 12000;

async function geocode(city) {
    const r = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
        params: { name: city, count: 1, language: 'en', format: 'json' },
        headers: HEADERS, timeout: TIMEOUT,
    });
    const hit = r.data && r.data.results && r.data.results[0];
    if (!hit) return null;
    return {
        name: hit.name,
        country: hit.country || hit.country_code || '',
        admin1: hit.admin1 || '',
        latitude: hit.latitude,
        longitude: hit.longitude,
        timezone: hit.timezone || 'auto',
    };
}

// WMO weather interpretation codes → [description, emoji]
const WMO = {
    0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
    45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'],
    51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Dense drizzle', '🌧️'],
    56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
    61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
    66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
    71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
    80: ['Light showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Violent showers', '⛈️'],
    85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '❄️'],
    95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm + hail', '⛈️'], 99: ['Thunderstorm + hail', '⛈️'],
};
function describe(code) { return WMO[code] || ['Unknown', '🌡️']; }

async function forecast(lat, lon, days = 4) {
    const r = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
            latitude: lat, longitude: lon,
            current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,cloud_cover,visibility,uv_index',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum',
            timezone: 'auto', forecast_days: days,
        },
        headers: HEADERS, timeout: TIMEOUT,
    });
    return r.data;
}

async function airQuality(lat, lon) {
    const r = await axios.get('https://air-quality-api.open-meteo.com/v1/air-quality', {
        params: {
            latitude: lat, longitude: lon,
            current: 'pm10,pm2_5,us_aqi,european_aqi,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone',
        },
        headers: HEADERS, timeout: TIMEOUT,
    });
    return r.data && r.data.current;
}

/** US AQI → [category, circle emoji, square emoji] */
function aqiCategory(usAqi) {
    if (usAqi == null || isNaN(usAqi)) return ['Unknown', '⚪', '⬜'];
    if (usAqi <= 50) return ['Good', '🟢', '🟩'];
    if (usAqi <= 100) return ['Moderate', '🟡', '🟨'];
    if (usAqi <= 150) return ['Unhealthy (sensitive)', '🟠', '🟧'];
    if (usAqi <= 200) return ['Unhealthy', '🔴', '🟥'];
    if (usAqi <= 300) return ['Very unhealthy', '🟣', '🟪'];
    return ['Hazardous', '🟤', '🟫'];
}

/** Degrees → compass point. */
function windDir(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(((Number(deg) % 360) / 45)) % 8];
}

module.exports = { geocode, forecast, airQuality, describe, aqiCategory, windDir };
