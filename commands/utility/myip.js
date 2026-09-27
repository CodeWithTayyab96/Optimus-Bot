/**
 * Optimus Bot — .myip
 * Show the public IP address the bot is running behind, plus rough geolocation.
 *
 * Providers: api.ipify.org (IP) and ipapi.co (geo). Neither needs a key.
 * Behaviour ported from Shadow MD (`drenox.js:12354`).
 *
 * Note: this reports the address of the machine hosting the bot, not the
 * address of whoever typed the command. That is the same thing Shadow reports;
 * the description says so explicitly so nobody is misled.
 */
const axios = require('axios');
const style = require('../../lib/messageStyle');

const TIMEOUT = 10000;
const IP_API = 'https://api.ipify.org?format=json';

/** Exported for unit testing without network access. */
function formatResult(ip, geo) {
    const lines = [`🌐 *Public IP:* \`${ip}\``, ''];
    if (geo && typeof geo === 'object') {
        const parts = [
            geo.city,
            geo.region,
            geo.country_name || geo.country
        ].filter(Boolean);
        if (parts.length) lines.push(`📍 ${parts.join(', ')}`);
        if (geo.org || geo.asn) lines.push(`🏢 ${geo.org || geo.asn}`);
        if (geo.timezone) lines.push(`🕐 ${geo.timezone}`);
    } else {
        lines.push('_Geolocation unavailable._');
    }
    lines.push('');
    lines.push('_This is the address of the server running the bot._');
    return lines;
}

async function myipCommand(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { text: style.processing('Checking public IP') }, { quoted: message });

        const ipRes = await axios.get(IP_API, { timeout: TIMEOUT });
        const ip = ipRes.data?.ip;

        if (!ip) {
            return sock.sendMessage(chatId, {
                text: style.error('Could not determine the public IP address.')
            }, { quoted: message });
        }

        let geo = null;
        try {
            const geoRes = await axios.get(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { timeout: TIMEOUT });
            // ipapi.co answers 200 with an `error` object when it throttles.
            if (geoRes.data && !geoRes.data.error) geo = geoRes.data;
        } catch (_) {
            // Geolocation is optional — the IP on its own is still useful.
        }

        return sock.sendMessage(chatId, {
            text: style.box('🌐 NETWORK', formatResult(ip, geo))
        }, { quoted: message });
    } catch (error) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            return sock.sendMessage(chatId, {
                text: style.error('The IP lookup timed out. Please try again.')
            }, { quoted: message });
        }
        console.error('[myip] Error:', error.message);
        return sock.sendMessage(chatId, {
            text: style.error('Could not determine the public IP address.')
        }, { quoted: message });
    }
}

module.exports = {
    name: 'myip',
    aliases: ['ip', 'whatismyip'],
    category: 'utility',
    description: 'Show the public IP of the server running the bot',
    usage: '.myip',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await myipCommand(sock, extra.chatId, message);
    },
    myipCommand,
    formatResult,
};
