/**
 * Optimus Bot — .wiki
 * Search Wikipedia and return a summary.
 *
 * API: Wikipedia REST API + MediaWiki search API
 * No API key required. User-Agent header required by Wikimedia policy.
 */
const axios = require('axios');
const style = require('../../lib/messageStyle');

const TIMEOUT = 10000;
const UA = 'OptimusBot/1.0 (https://github.com/CodeWithTayyab96/Optimus-Bot)';
const HEADERS = { 'User-Agent': UA };

async function handleWikiCommand(sock, chatId, message, userMessage) {
    try {
        const query = userMessage.trim().split(/\s+/).slice(1).join(' ').trim();
        if (!query) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput(
                    'Please provide a search query.',
                    '.wiki <query>\n\nExample: .wiki Albert Einstein'
                )
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: style.processing(`Searching Wikipedia for "${query}"`)
        }, { quoted: message });

        // Try direct page summary first (works for exact article names)
        const slug = query.replace(/\s+/g, '_');
        try {
            const summaryRes = await axios.get(
                `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`,
                { timeout: TIMEOUT, headers: HEADERS }
            );
            const page = summaryRes.data;
            if (page && page.extract && page.type !== 'disambiguation') {
                const extract = page.extract.length > 500
                    ? page.extract.substring(0, 500) + '...'
                    : page.extract;
                const lines = [
                    `📖 *${page.title}*`,
                    ``,
                    extract,
                    ``,
                    `🔗 ${page.content_urls?.desktop?.page || 'https://en.wikipedia.org/wiki/' + slug}`
                ];
                return sock.sendMessage(chatId, {
                    text: style.box('📚 WIKIPEDIA', lines)
                }, { quoted: message });
            }
        } catch (_) {
            // Direct lookup failed — fall through to search
        }

        // Fallback: search API
        const searchRes = await axios.get('https://en.wikipedia.org/w/api.php', {
            params: {
                action: 'query',
                list: 'search',
                srsearch: query,
                format: 'json',
                srlimit: 3
            },
            timeout: TIMEOUT,
            headers: HEADERS
        });

        const results = searchRes.data?.query?.search;
        if (!results || results.length === 0) {
            return sock.sendMessage(chatId, {
                text: style.warning(`No Wikipedia results found for "${query}".`)
            }, { quoted: message });
        }

        const lines = [`📚 *Wikipedia Search: ${query}*`, ``];
        for (const r of results) {
            const snippet = r.snippet
                ? r.snippet.replace(/<[^>]+>/g, '').substring(0, 150) + '...'
                : '';
            lines.push(`*${r.title}*`);
            if (snippet) lines.push(snippet);
            lines.push(`🔗 https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/\s/g, '_'))}`);
            lines.push('');
        }

        await sock.sendMessage(chatId, {
            text: style.box('📚 WIKIPEDIA', lines)
        }, { quoted: message });

    } catch (error) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            await sock.sendMessage(chatId, {
                text: style.error('Request timed out. Please try again.')
            }, { quoted: message });
        } else {
            console.error('[wiki] Error:', error);
            await sock.sendMessage(chatId, {
                text: style.error('Could not fetch Wikipedia results. Please try again.')
            }, { quoted: message });
        }
    }
}

module.exports = {
    name: 'wiki',
    aliases: ['wikipedia', 'encyclopedia'],
    category: 'utility',
    description: 'Search Wikipedia for information',
    usage: '.wiki <query>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await handleWikiCommand(sock, extra.chatId, message, extra.userMessage);
    },
};
