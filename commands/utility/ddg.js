const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'ddg',
    aliases: ['instantanswer'],
    category: 'utility',
    description: 'DuckDuckGo instant answer for a query',
    usage: '.ddg <query>',
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
                return await extra.reply(style.invalidInput('Please provide a query.', `${extra.prefix}ddg <query>`));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '🔍', key: message.key } });

            // DuckDuckGo Instant Answer — free, no key.
            const data = await getJson('https://api.duckduckgo.com/', {
                params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
            });

            const answer = data && (data.AbstractText || data.Answer);
            const related = (data && Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [])
                .map(t => t.Text || '')
                .filter(Boolean)
                .slice(0, 5);

            if (!answer && related.length === 0) {
                return await extra.reply(style.error(`No instant answer found for "${query}". Try a more specific query.`));
            }

            const lines = [];
            if (data.Heading) lines.push(`📌 ${data.Heading}`, '');
            if (answer) lines.push(answer);
            if (related.length) {
                lines.push('', 'Related:');
                for (const r of related) lines.push(`• ${r}`);
            }
            if (data.AbstractURL) lines.push('', `🔗 ${data.AbstractURL}`);

            await extra.reply(style.box('🔍 DUCKDUCKGO', lines));
        } catch (error) {
            console.error('[ddg] error:', error.message);
            return await extra.reply(style.error('Search failed. Please try again.'));
        }
    },
};
