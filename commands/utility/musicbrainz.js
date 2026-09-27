const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'musicbrainz',
    aliases: ['mb', 'musicinfo'],
    category: 'utility',
    description: 'Look up artists on MusicBrainz',
    usage: '.musicbrainz <artist>',
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
                return await extra.reply(style.invalidInput('Please provide an artist name.', `${extra.prefix}musicbrainz <artist>`));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '🎼', key: message.key } });

            // MusicBrainz — free, no key (a descriptive User-Agent is sent by lib/http).
            const data = await getJson('https://musicbrainz.org/ws/2/artist', {
                params: { query, fmt: 'json', limit: 5 },
            });
            const artists = (data && data.artists) || [];

            if (artists.length === 0) {
                return await extra.reply(style.error('No artists found on MusicBrainz for that query.'));
            }

            const rows = artists.map((a, i) => {
                const bits = [a.country, a.type, a.disambiguation].filter(Boolean).join(' · ');
                return `${i + 1}. ${a.name}${bits ? `\n    ${bits}` : ''}`;
            });

            await extra.reply(style.box('🎼 MUSICBRAINZ', [
                `Results for: ${query}`,
                '',
                ...rows
            ]));
        } catch (error) {
            console.error('[musicbrainz] error:', error.message);
            return await extra.reply(style.error('MusicBrainz lookup failed. Please try again.'));
        }
    },
};
