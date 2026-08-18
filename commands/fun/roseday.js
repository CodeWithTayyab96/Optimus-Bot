const fetch = require('node-fetch');

async function rosedayCommand(sock, chatId, message) {
    try {
        
        const res = await fetch(`https://api.princetechn.com/api/fun/roseday?apikey=prince`);
        
        if (!res.ok) {
            throw await res.text();
        }
        
        const json = await res.json();
        const rosedayMessage = json.result;

        // Send the roseday message
        await sock.sendMessage(chatId, { text: `🌹 ROSEDAY\n\n${rosedayMessage}` }, { quoted: message });
    } catch (error) {
        console.error('Error in roseday command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to get roseday quote. Please try again later!' }, { quoted: message });
    }
}

module.exports = {
    name: 'roseday',
    aliases: [],
    category: 'fun',
    description: 'Send a rose day message',
    usage: '.roseday',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await rosedayCommand(sock, extra.chatId, message);
    },
    rosedayCommand,
};
