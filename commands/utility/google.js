/**
 * Optimus Bot — .google
 * Web search using DuckDuckGo (free, no API key required).
 *
 * Strategy:
 *   1. Try DuckDuckGo instant-answer API for direct answers.
 *   2. Parse DuckDuckGo Lite HTML for web results.
 *   3. Fall back to instant-answer related topics.
 *
 * This command provides web search functionality. It is not affiliated with Google.
 */
const axios = require('axios');
const style = require('../../lib/messageStyle');

const TIMEOUT = 12000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Parse DuckDuckGo Lite HTML to extract search results.
 * Returns array of { title, url, snippet }.
 */
function parseLiteResults(html) {
    const results = [];
    // Match result links and snippets from the lite format
    const linkRegex = /<a[^>]+class="result-link"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

    const links = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        links.push({ url: match[1], title: match[2].trim() });
    }

    const snippets = [];
    while ((match = snippetRegex.exec(html)) !== null) {
        snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
    }

    for (let i = 0; i < Math.min(links.length, 5); i++) {
        results.push({
            title: links[i].title,
            url: links[i].url,
            snippet: snippets[i] || ''
        });
    }
    return results;
}

async function handleGoogleCommand(sock, chatId, message, userMessage) {
    try {
        const query = userMessage.trim().split(/\s+/).slice(1).join(' ').trim();
        if (!query) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput(
                    'Please provide a search query.',
                    '.google <query>\n\nExample: .google Node.js tutorial'
                )
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: style.processing(`Searching the web for "${query}"`)
        }, { quoted: message });

        // Strategy 1: Try DuckDuckGo Lite HTML for real web results
        let results = [];
        let lastError = null;
        try {
            const liteRes = await axios.get('https://lite.duckduckgo.com/lite/', {
                params: { q: query, kl: 'wt-wt' },
                timeout: TIMEOUT,
                headers: { 'User-Agent': UA }
            });
            results = parseLiteResults(liteRes.data);
        } catch (err) {
            lastError = err;
        }

        // Strategy 2: If no results from Lite, try instant-answer API
        if (results.length === 0) {
            try {
                const instantRes = await axios.get('https://api.duckduckgo.com/', {
                    params: { q: query, format: 'json', no_html: 1 },
                    timeout: TIMEOUT
                });
                const data = instantRes.data;
                if (data.Abstract) {
                    results.push({
                        title: data.Heading || query,
                        url: data.AbstractURL || '',
                        snippet: data.Abstract.substring(0, 200)
                    });
                }
                // Add related topics
                if (data.RelatedTopics) {
                    for (const topic of data.RelatedTopics) {
                        if (topic.Text && results.length < 5) {
                            results.push({
                                title: topic.Text.substring(0, 60),
                                url: topic.FirstURL || '',
                                snippet: topic.Text.substring(0, 120)
                            });
                        }
                    }
                }
            } catch (err) {
                lastError = err;
            }
        }

        if (results.length === 0) {
            if (lastError && (lastError.code === 'ECONNABORTED' || lastError.message?.includes('timeout'))) {
                return sock.sendMessage(chatId, {
                    text: style.error('Search timed out. Please try again.')
                }, { quoted: message });
            }
            return sock.sendMessage(chatId, {
                text: style.warning(`No results found for "${query}".`)
            }, { quoted: message });
        }

        const lines = [`🔍 *Search: ${query}*`, ``];
        for (let i = 0; i < Math.min(results.length, 5); i++) {
            const r = results[i];
            const snippet = r.snippet ? r.snippet.substring(0, 120) : '';
            lines.push(`${i + 1}. *${r.title}*`);
            if (snippet) lines.push(`   ${snippet}`);
            if (r.url) lines.push(`   🔗 ${r.url}`);
            lines.push('');
        }

        lines.push(`🌐 Powered by DuckDuckGo`);

        await sock.sendMessage(chatId, {
            text: style.box('🔍 WEB SEARCH', lines)
        }, { quoted: message });

    } catch (error) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            await sock.sendMessage(chatId, {
                text: style.error('Search timed out. Please try again.')
            }, { quoted: message });
        } else {
            console.error('[google] Error:', error);
            await sock.sendMessage(chatId, {
                text: style.error('Search is temporarily unavailable. Please try again.')
            }, { quoted: message });
        }
    }
}

module.exports = {
    name: 'google',
    aliases: ['search', 'gsearch', 'ggle', 'websearch'],
    category: 'utility',
    description: 'Search the web',
    usage: '.google <query>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await handleGoogleCommand(sock, extra.chatId, message, extra.userMessage);
    },
};
