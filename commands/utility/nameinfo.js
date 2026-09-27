const axios = require('axios');
const style = require('../../lib/messageStyle');

const HEADERS = { 'User-Agent': 'OptimusBot/1.0', 'Accept': 'application/json' };

/** Fetch one predictor API, tolerating failure (returns null). */
function grab(url, name) {
    return axios.get(url, { params: { name }, headers: HEADERS, timeout: 12000 })
        .then((r) => r.data)
        .catch(() => null);
}

/**
 * .nameinfo <name> — guesses gender, age and likely nationality from a first
 * name. Uses three free, no-key APIs (genderize / agify / nationalize).
 */
async function nameinfoCommand(sock, chatId, message, name) {
    try {
        const [ge, ag, na] = await Promise.all([
            grab('https://api.genderize.io', name),
            grab('https://api.agify.io', name),
            grab('https://api.nationalize.io', name),
        ]);

        const lines = [`🔎 Name: *${name}*`];

        if (ge && ge.gender) lines.push(`👤 Gender: ${ge.gender} (${Math.round((ge.probability || 0) * 100)}%)`);
        else lines.push('👤 Gender: unknown');

        if (ag && ag.age != null) lines.push(`🎂 Predicted age: ${ag.age}`);
        else lines.push('🎂 Predicted age: unknown');

        if (na && Array.isArray(na.country) && na.country.length) {
            const top = na.country.slice(0, 3)
                .map((c) => `${c.country_id} ${Math.round(c.probability * 100)}%`)
                .join(', ');
            lines.push(`🌍 Likely country: ${top}`);
        } else {
            lines.push('🌍 Likely country: unknown');
        }

        lines.push('', '_Guesses from first-name statistics — not exact._');

        await sock.sendMessage(chatId, { text: style.box('🔮 NAME INFO', lines) }, { quoted: message });
    } catch (error) {
        console.error('[nameinfo] error:', error?.message || error);
        await sock.sendMessage(chatId, { text: style.error('Could not look up that name right now.') }, { quoted: message });
    }
}

module.exports = {
    name: 'nameinfo',
    aliases: ['nameage', 'guessname', 'namelook'],
    category: 'utility',
    description: 'Guess age, gender and nationality from a name',
    usage: '.nameinfo <name>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const name = args.join(' ').trim();
        if (!name) {
            return sock.sendMessage(extra.chatId, {
                text: style.invalidInput('Please provide a name.', '.nameinfo <name>', { box: false })
            }, { quoted: message });
        }
        await nameinfoCommand(sock, extra.chatId, message, name);
    },
    nameinfoCommand,
};
