const settings = require('../../settings');

function formatUptime(seconds) {
    if (seconds <= 0) {
        return '0 seconds';
    }

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];

    if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs} ${secs === 1 ? 'second' : 'seconds'}`);

    return parts.join(', ');
}

module.exports = {
    name: 'uptime',
    aliases: ['runtime', 'botuptime'],
    category: 'general',
    description: 'Show how long the bot has been running',
    usage: '.uptime',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const uptime = formatUptime(process.uptime());

            let text = `╭━━『 *Bot Uptime* 』━━╮\n\n`;
            text += `🤖 *Bot Name:* ${settings.botName || 'Optimus Bot'}\n`;
            text += `🧬 *Bot Version:* v${settings.version || '1.0.0'}\n`;
            text += `⏱️ *Uptime:* ${uptime}\n`;
            text += `\n╰━━━━━━━━━━━━━━━╯`;

            await extra.reply(text);
        } catch (error) {
            console.error('Error in uptime command:', error);
            await extra.reply('❌ An error occurred while fetching uptime information. Please try again later.');
        }
    }
};
