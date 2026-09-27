const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'earthquake',
    aliases: ['quake'],
    category: 'utility',
    description: 'Latest earthquakes worldwide (USGS)',
    usage: '.earthquake [min magnitude]',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const parsed = parseFloat(args[0]);
            const minMagnitude = Number.isFinite(parsed) ? parsed : 4.5;

            await sock.sendMessage(extra.chatId, { react: { text: '🌍', key: message.key } });

            // USGS — free, no key.
            const data = await getJson('https://earthquake.usgs.gov/fdsnws/event/1/query', {
                params: { format: 'geojson', limit: 5, orderby: 'time', minmagnitude: minMagnitude },
            });

            const features = data && data.features;
            if (!Array.isArray(features) || features.length === 0) {
                return await extra.reply(style.info(`No earthquakes above magnitude ${minMagnitude} recently.`));
            }

            const lines = features.map((f, i) => {
                const p = f.properties || {};
                const when = p.time ? new Date(p.time).toUTCString() : '—';
                return `${i + 1}. M${p.mag ?? '?'} — ${p.place || 'Unknown'}\n    🕒 ${when}`;
            });

            await extra.reply(style.box('🌍 LATEST EARTHQUAKES', [
                `Min magnitude: ${minMagnitude}`,
                '',
                ...lines
            ]));
        } catch (error) {
            console.error('[earthquake] error:', error.message);
            return await extra.reply(style.error('Could not fetch earthquake data. Please try again.'));
        }
    },
};
