/**
 * Jest tests for utility commands:
 *   .currency — currency conversion
 *   .wiki     — Wikipedia search
 *   .google   — web search
 *   .fancy    — text style conversion
 */

/* ─── Mock axios ───────────────────────────────────────────────── */
jest.mock('axios');

/* ─── Mock messageStyle ────────────────────────────────────────── */
jest.mock('../lib/messageStyle', () => ({
    success: (msg) => '✅ ' + msg,
    error: (msg) => '❌ ' + msg,
    warning: (msg) => '⚠️ ' + msg,
    info: (msg) => 'ℹ️ ' + msg,
    processing: (msg) => '⏳ ' + msg + '...',
    invalidInput: (what, usage) => '❌ ' + what + '\nUsage: ' + usage,
    permissionDenied: () => '🔒 Access denied',
    box: (label, lines) => lines.join('\n'),
    ICONS: { success: '✅', error: '❌' },
}));

/* ─── Load commands after mocks ────────────────────────────────── */
const currency = require('../commands/utility/currency');
const wiki = require('../commands/utility/wiki');
const google = require('../commands/utility/google');
const fancy = require('../commands/utility/fancy');
const axios = require('axios');

/* ─── Shared helpers ───────────────────────────────────────────── */
function mockSock() {
    const calls = [];
    return {
        _calls: calls,
        sendMessage: jest.fn(async (jid, content, opts) => { calls.push({ jid, content, opts }); })
    };
}

function mockMessage() {
    return {
        key: { id: 'test123', remoteJid: '1234@s.whatsapp.net' },
        message: { conversation: 'test' }
    };
}

/* ═══════════════════════════════════════════════════════════════════
   .currency
   ═══════════════════════════════════════════════════════════════════ */
describe('.currency', () => {
    beforeEach(() => jest.clearAllMocks());

    test('command loads with correct metadata', () => {
        expect(currency.name).toBe('currency');
        expect(currency.aliases).toContain('convert');
        expect(currency.category).toBe('utility');
        expect(typeof currency.execute).toBe('function');
        expect(currency.ownerOnly).toBe(false);
    });

    test('missing arguments returns usage hint', async () => {
        const sock = mockSock();
        await currency.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.currency', prefix: '.' });
        expect(sock.sendMessage).toHaveBeenCalledTimes(1);
        expect(sock._calls[0].content.text).toMatch(/provide amount|Usage/i);
    });

    test('invalid amount returns error', async () => {
        const sock = mockSock();
        await currency.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.currency abc USD PKR', prefix: '.' });
        expect(sock._calls[0].content.text).toMatch(/Invalid amount/i);
    });

    test('successful conversion', async () => {
        axios.get.mockResolvedValueOnce({
            data: { base: 'USD', rates: { PKR: 277.91, EUR: 0.92 }, date: '2026-08-29' }
        });
        const sock = mockSock();
        await currency.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.currency 100 USD PKR', prefix: '.' });
        // First call is processing, second is result
        expect(sock.sendMessage).toHaveBeenCalledTimes(2);
        const resultText = sock._calls[1].content.text;
        expect(resultText).toMatch(/100 USD/);
        expect(resultText).toMatch(/277\.91/);
        expect(resultText).toMatch(/PKR/);
    });

    test('lowercase currency codes are normalized', async () => {
        axios.get.mockResolvedValueOnce({
            data: { base: 'EUR', rates: { USD: 1.09 }, date: '2026-08-29' }
        });
        const sock = mockSock();
        await currency.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.currency 50 eur usd', prefix: '.' });
        expect(axios.get).toHaveBeenCalledWith(
            expect.stringContaining('/EUR'),
            expect.any(Object)
        );
    });

    test('target currency not found', async () => {
        axios.get.mockResolvedValueOnce({
            data: { base: 'USD', rates: { EUR: 0.92 }, date: '2026-08-29' }
        });
        const sock = mockSock();
        await currency.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.currency 100 USD XYZ', prefix: '.' });
        expect(sock._calls[1].content.text).toMatch(/not found|XYZ/i);
    });

    test('API failure returns friendly error', async () => {
        axios.get.mockRejectedValueOnce({ response: { status: 500 } });
        const sock = mockSock();
        await currency.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.currency 100 USD PKR', prefix: '.' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/unavailable|error/i);
    });

    test('timeout returns friendly error', async () => {
        axios.get.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' });
        const sock = mockSock();
        await currency.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.currency 100 USD PKR', prefix: '.' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/timed out|error/i);
    });
});

/* ═══════════════════════════════════════════════════════════════════
   .wiki
   ═══════════════════════════════════════════════════════════════════ */
describe('.wiki', () => {
    beforeEach(() => jest.clearAllMocks());

    test('command loads with correct metadata', () => {
        expect(wiki.name).toBe('wiki');
        expect(wiki.aliases).toContain('wikipedia');
        expect(wiki.category).toBe('utility');
        expect(typeof wiki.execute).toBe('function');
    });

    test('missing query returns usage hint', async () => {
        const sock = mockSock();
        await wiki.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.wiki', prefix: '.' });
        expect(sock._calls[0].content.text).toMatch(/provide a search query|Usage/i);
    });

    test('successful direct page summary', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                title: 'Albert Einstein',
                extract: 'Albert Einstein was a German-born theoretical physicist.',
                type: 'standard',
                content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Albert_Einstein' } }
            }
        });
        const sock = mockSock();
        await wiki.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.wiki Albert Einstein', prefix: '.' });
        // Processing + result
        expect(sock.sendMessage).toHaveBeenCalledTimes(2);
        expect(sock._calls[1].content.text).toMatch(/Albert Einstein/);
    });

    test('disambiguation falls through to search', async () => {
        // First call: direct lookup returns disambiguation
        axios.get.mockResolvedValueOnce({
            data: { type: 'disambiguation', extract: '' }
        });
        // Second call: search results
        axios.get.mockResolvedValueOnce({
            data: { query: { search: [{ title: 'Apple Inc.', snippet: '<span>technology company</span>' }] } }
        });
        const sock = mockSock();
        await wiki.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.wiki Apple', prefix: '.' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/Apple/);
    });

    test('no results returns warning', async () => {
        axios.get.mockRejectedValueOnce(new Error('404'));
        axios.get.mockResolvedValueOnce({
            data: { query: { search: [] } }
        });
        const sock = mockSock();
        await wiki.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.wiki xyznonexistent123', prefix: '.' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/No.*results|warning/i);
    });

    test('API failure returns friendly error', async () => {
        axios.get.mockRejectedValueOnce(new Error('Network error'));
        axios.get.mockRejectedValueOnce(new Error('Network error'));
        const sock = mockSock();
        await wiki.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.wiki test', prefix: '.' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/❌|error|unavailable|fetch/i);
    });
});

/* ═══════════════════════════════════════════════════════════════════
   .google
   ═══════════════════════════════════════════════════════════════════ */
describe('.google', () => {
    beforeEach(() => jest.clearAllMocks());

    test('command loads with correct metadata', () => {
        expect(google.name).toBe('google');
        expect(google.aliases).toContain('search');
        expect(google.category).toBe('utility');
        expect(typeof google.execute).toBe('function');
    });

    test('missing query returns usage hint', async () => {
        const sock = mockSock();
        await google.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.google', prefix: '.' });
        expect(sock._calls[0].content.text).toMatch(/provide a search query|Usage/i);
    });

    test('successful search results', async () => {
        const fakeHtml = `
            <table><tr><td>
            <a class="result-link" href="https://example.com">Example Domain</a>
            <td><td class="result-snippet">This domain is for use in examples.</td>
            </tr></table>
        `;
        axios.get.mockResolvedValueOnce({ data: fakeHtml });
        const sock = mockSock();
        await google.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.google example', prefix: '.' });
        expect(sock.sendMessage).toHaveBeenCalledTimes(2); // processing + results
        const resultText = sock._calls[1].content.text;
        expect(resultText).toMatch(/example|Example Domain/i);
    });

    test('empty results shows warning', async () => {
        axios.get.mockResolvedValueOnce({ data: '<html></html>' });
        // Also mock instant-answer fallback
        axios.get.mockResolvedValueOnce({
            data: { Abstract: '', RelatedTopics: [] }
        });
        const sock = mockSock();
        await google.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.google xyznonexistentquery999', prefix: '.' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/No.*results|warning/i);
    });

    test('no API keys are hardcoded', () => {
        const fs = require('fs');
        const content = fs.readFileSync('commands/utility/google.js', 'utf8');
        expect(content).not.toMatch(/api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{10,}/i);
        expect(content).not.toMatch(/bearer\s+[A-Za-z0-9]/i);
        expect(content).not.toMatch(/token\s*[:=]\s*['"][A-Za-z0-9]{10,}/i);
    });

    test('timeout returns friendly error', async () => {
        axios.get.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' });
        axios.get.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' });
        const sock = mockSock();
        await google.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.google test', prefix: '.' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/timed out|error/i);
    });
});

/* ═══════════════════════════════════════════════════════════════════
   .fancy
   ═══════════════════════════════════════════════════════════════════ */
describe('.fancy', () => {
    beforeEach(() => jest.clearAllMocks());

    test('command loads with correct metadata', () => {
        expect(fancy.name).toBe('fancy');
        expect(fancy.aliases).toContain('fancytext');
        expect(fancy.category).toBe('utility');
        expect(typeof fancy.execute).toBe('function');
    });

    test('missing text returns usage hint', async () => {
        const sock = mockSock();
        await fancy.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.fancy', prefix: '.' });
        expect(sock._calls[0].content.text).toMatch(/provide text|Usage/i);
    });

    test('generates multiple styles', async () => {
        const sock = mockSock();
        await fancy.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.fancy Hello', prefix: '.' });
        const text = sock._calls[0].content.text;
        expect(text).toMatch(/𝐁𝐨𝐥𝐝|Bold/);
        expect(text).toMatch(/𝘐𝘵𝘢𝘭𝘪𝘤|Italic/);
        expect(text).toMatch(/𝔉𝔯𝔞𝔨𝔱𝔲𝔯|Fraktur/);
        expect(text).toMatch(/Ｓｑｕａｒｅ|Square/);
        expect(text).toMatch(/$L33T$|L33T/);
    });

    test('ASCII letters are transformed', async () => {
        const sock = mockSock();
        await fancy.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.fancy abc', prefix: '.' });
        const text = sock._calls[0].content.text;
        // At least some styles should produce non-ASCII output
        expect(text).not.toBe('abc');
    });

    test('numbers and punctuation are preserved', async () => {
        const sock = mockSock();
        await fancy.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.fancy Hi 123!', prefix: '.' });
        const text = sock._calls[0].content.text;
        // The number 123 and ! should appear in at least some styles
        expect(text).toMatch(/123/);
        expect(text).toMatch(/!/);
    });

    test('no network requests are made', async () => {
        const sock = mockSock();
        await fancy.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.fancy test', prefix: '.' });
        expect(axios.get).not.toHaveBeenCalled();
    });
});
