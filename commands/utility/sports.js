const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

// TheSportsDB ships a public test key ('3'); override with SPORTSDB_KEY for a personal one.
const KEY = process.env.SPORTSDB_KEY || '3';

module.exports = {
    name: 'sports',
    aliases: ['team', 'sportsdb'],
    category: 'utility',
    description: 'Look up a sports team (TheSportsDB)',
    usage: '.sports <team name>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const query = args.join(' ').trim();
            if (!query) {
                return await extra.reply(style.invalidInput('Please provide a team name.', `${extra.prefix}sports <team name>`));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '🏆', key: message.key } });

            const data = await getJson(`https://www.thesportsdb.com/api/v1/json/${KEY}/searchteams.php`, {
                params: { t: query },
            });
            const teams = (data && data.teams) || [];

            if (teams.length === 0) {
                return await extra.reply(style.error('No team found for that name.'));
            }

            const t = teams[0];
            const badge = t.strTeamBadge || t.strBadge || null;

            const lines = [
                `📌 ${t.strTeam || query}`,
                `🏆 ${t.strLeague || '—'}${t.strCountry ? ` · 🌍 ${t.strCountry}` : ''}`,
                t.intFormedYear ? `📅 Formed: ${t.intFormedYear}` : '',
                t.strStadium ? `🏟 ${t.strStadium}` : '',
                '',
                String(t.strDescriptionEN || '').slice(0, 500)
            ].filter(Boolean);

            const caption = style.box('🏆 SPORTS TEAM', lines);

            // Best-effort: next scheduled event.
            let nextLine = '';
            try {
                const next = await getJson(`https://www.thesportsdb.com/api/v1/json/${KEY}/eventsnext.php`, {
                    params: { id: t.idTeam },
                });
                const ev = next && next.events && next.events[0];
                if (ev) {
                    nextLine = `\n\n📅 Next: ${ev.strHomeTeam} vs ${ev.strAwayTeam} — ${ev.dateEvent || ''}`;
                }
            } catch { /* next event is optional */ }

            const fullCaption = caption + nextLine;

            if (badge) {
                await sock.sendMessage(extra.chatId, { image: { url: badge }, caption: fullCaption }, { quoted: message });
            } else {
                await sock.sendMessage(extra.chatId, { text: fullCaption }, { quoted: message });
            }
        } catch (error) {
            console.error('[sports] error:', error.message);
            return await extra.reply(style.error('Could not fetch team info. Please try again.'));
        }
    },
};
