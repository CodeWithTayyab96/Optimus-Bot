const axios = require('axios');

const weatherCommand = async function (sock, chatId, message, city) {
    try {
        const apiKey = '4902c0f2550f58298ad4146a92b65e10';  // Replace with your OpenWeather API Key
        const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`);
        const weather = response.data;
        const weatherText = `Weather in ${weather.name}: ${weather.weather[0].description}. Temperature: ${weather.main.temp}°C.`;
        await sock.sendMessage(chatId, { text: weatherText }, { quoted: message }   );
    } catch (error) {
        console.error('Error fetching weather:', error);
        await sock.sendMessage(chatId, { text: 'Sorry, I could not fetch the weather right now.' }, { quoted: message } );
    }
};

module.exports = {
    name: 'weather',
    aliases: [],
    category: 'utility',
    description: 'Get the weather for a city',
    usage: '.weather <city>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const city = extra.userMessage.split(/\s+/).slice(1).join(' ').trim();
        if (city) {
            await weatherCommand(sock, extra.chatId, message, city);
        } else {
            await sock.sendMessage(extra.chatId, { text: 'Please specify a city, e.g., ' + extra.prefix + 'weather London', ...extra.channelInfo }, { quoted: message });
        }
    },

};
