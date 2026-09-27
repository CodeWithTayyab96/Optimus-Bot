const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'book',
    aliases: ['booksearch'],
    category: 'utility',
    description: 'Search books on Open Library',
    usage: '.book <title or author>',
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
                return await extra.reply(style.invalidInput('Please provide a book title or author.', `${extra.prefix}book <title or author>`));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '📚', key: message.key } });

            // Open Library — free, no key.
            const data = await getJson('https://openlibrary.org/search.json', {
                params: { q: query, limit: 5 },
            });
            const docs = (data && data.docs) || [];

            if (docs.length === 0) {
                return await extra.reply(style.error('No books found for that query.'));
            }

            const rows = docs.map((d, i) => {
                const author = Array.isArray(d.author_name) && d.author_name.length
                    ? ` — ${d.author_name.slice(0, 2).join(', ')}`
                    : '';
                const year = d.first_publish_year ? ` (${d.first_publish_year})` : '';
                return `${i + 1}. ${d.title}${author}${year}`;
            });

            const caption = style.box('📚 OPEN LIBRARY', [
                `Results for: ${query}`,
                '',
                ...rows
            ]);

            const cover = docs[0].cover_i
                ? `https://covers.openlibrary.org/b/id/${docs[0].cover_i}-L.jpg`
                : null;

            if (cover) {
                await sock.sendMessage(extra.chatId, { image: { url: cover }, caption }, { quoted: message });
            } else {
                await sock.sendMessage(extra.chatId, { text: caption }, { quoted: message });
            }
        } catch (error) {
            console.error('[book] error:', error.message);
            return await extra.reply(style.error('Book search failed. Please try again.'));
        }
    },
};
