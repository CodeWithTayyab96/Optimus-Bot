/**
 * Jest tests for enhanced search commands:
 *   .imdb       — movie lookup via OMDb
 *   .githubstalk — GitHub user profile lookup
 */

/* ─── Mock axios ───────────────────────────────────────────────── */
jest.mock('axios');

/* ─── Mock settings ────────────────────────────────────────────── */
jest.mock('../settings', () => ({
    omdbApiKey: 'test-omdb-key',
    botName: 'Optimus Bot',
}));

/* ─── Mock messageStyle ────────────────────────────────────────── */
jest.mock('../lib/messageStyle', () => ({
    success: (msg) => '✅ ' + msg,
    error: (msg) => '❌ ' + msg,
    warning: (msg) => '⚠️ ' + msg,
    info: (msg) => 'ℹ️ ' + msg,
    processing: (msg) => '⏳ ' + msg + '...',
    invalidInput: (what, usage) => '❌ ' + what + '\nUsage: ' + usage,
    box: (label, lines) => lines.join('\n'),
    ICONS: { success: '✅', error: '❌' },
}));

/* ─── Load commands after mocks ────────────────────────────────── */
const imdb = require('../commands/utility/imdb');
const githubstalk = require('../commands/general/githubstalk');
const axios = require('axios');
const settings = require('../settings');

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
   .imdb
   ═══════════════════════════════════════════════════════════════════ */
describe('.imdb', () => {
    beforeEach(() => jest.clearAllMocks());

    test('command loads with correct metadata', () => {
        expect(imdb.name).toBe('imdb');
        expect(imdb.aliases).toContain('movie');
        expect(imdb.aliases).toContain('film');
        expect(imdb.category).toBe('utility');
        expect(typeof imdb.execute).toBe('function');
        expect(imdb.ownerOnly).toBe(false);
    });

    test('missing query returns usage hint', async () => {
        const sock = mockSock();
        await imdb.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.imdb', prefix: '.' });
        expect(sock._calls[0].content.text).toMatch(/provide a movie title|Usage/i);
    });

    test('configured API key is used', async () => {
        settings.omdbApiKey = 'test-omdb-key';
        axios.get.mockResolvedValueOnce({
            data: { Response: 'True', Title: 'Test Movie', Year: '2024' }
        });
        const sock = mockSock();
        await imdb.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.imdb Test Movie', prefix: '.' });
        expect(axios.get).toHaveBeenCalledWith(
            'https://www.omdbapi.com/',
            expect.objectContaining({
                params: expect.objectContaining({ apikey: 'test-omdb-key' })
            })
        );
    });

    test('missing API key returns config message', async () => {
        settings.omdbApiKey = '';
        const sock = mockSock();
        await imdb.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.imdb Test', prefix: '.' });
        expect(sock._calls[0].content.text).toMatch(/not configured|API key/i);
        settings.omdbApiKey = 'test-omdb-key'; // restore
    });

    test('successful movie response', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                Response: 'True',
                Title: 'Interstellar',
                Year: '2014',
                Rated: 'PG-13',
                Runtime: '169 min',
                Genre: 'Adventure, Drama, Sci-Fi',
                Director: 'Christopher Nolan',
                Actors: 'Matthew McConaughey, Anne Hathaway',
                Plot: 'A team of explorers travel through a wormhole in space.',
                imdbRating: '8.7',
                imdbVotes: '1,800,000',
                imdbID: 'tt0816692',
            }
        });
        const sock = mockSock();
        await imdb.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.imdb Interstellar', prefix: '.' });
        const text = sock._calls[1].content.text;
        expect(text).toMatch(/Interstellar/);
        expect(text).toMatch(/2014/);
        expect(text).toMatch(/8\.7/);
        expect(text).toMatch(/imdb\.com\/title/);
    });

    test('movie not found returns warning', async () => {
        axios.get.mockResolvedValueOnce({
            data: { Response: 'False', Error: 'Movie not found!' }
        });
        const sock = mockSock();
        await imdb.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.imdb XYZNONEXISTENT', prefix: '.' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/not found|warning/i);
    });

    test('invalid API key returns error', async () => {
        axios.get.mockResolvedValueOnce({
            data: { Response: 'False', Error: 'Invalid API key!' }
        });
        const sock = mockSock();
        await imdb.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.imdb Test', prefix: '.' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/Invalid API key|not found|warning|error/i);
    });

    test('timeout returns friendly error', async () => {
        axios.get.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' });
        const sock = mockSock();
        await imdb.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.imdb Test', prefix: '.' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/timed out|error/i);
    });

    test('API key does not appear in user-facing message', async () => {
        settings.omdbApiKey = 'secret-key-12345';
        axios.get.mockResolvedValueOnce({
            data: { Response: 'True', Title: 'Test' }
        });
        const sock = mockSock();
        await imdb.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.imdb Test', prefix: '.' });
        const allText = sock._calls.map(c => JSON.stringify(c.content)).join('');
        expect(allText).not.toContain('secret-key-12345');
        settings.omdbApiKey = 'test-omdb-key'; // restore
    });

    test('no hardcoded API keys in source', () => {
        const fs = require('fs');
        const content = fs.readFileSync('commands/utility/imdb.js', 'utf8');
        expect(content).not.toMatch(/apikey.*['\"][A-Za-z0-9]{8,}['\"]|(?:api|key|token|secret).*[:=].*['\"][A-Za-z0-9]{10,}['\"]/i);
    });
});

/* ═══════════════════════════════════════════════════════════════════
   .githubstalk
   ═══════════════════════════════════════════════════════════════════ */
describe('.githubstalk', () => {
    beforeEach(() => jest.clearAllMocks());

    test('command loads with correct metadata', () => {
        expect(githubstalk.name).toBe('githubstalk');
        expect(githubstalk.aliases).toContain('gitstalk');
        expect(githubstalk.category).toBe('general');
        expect(typeof githubstalk.execute).toBe('function');
        expect(githubstalk.ownerOnly).toBe(false);
    });

    test('missing username returns usage hint', async () => {
        const sock = mockSock();
        await githubstalk.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.githubstalk', prefix: '.' });
        expect(sock._calls[0].content.text).toMatch(/provide a GitHub username|Usage/i);
    });

    test('successful user lookup', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                login: 'torvalds',
                name: 'Linus Torvalds',
                bio: 'Creator of Linux',
                company: null,
                location: 'Portland, OR',
                public_repos: 12,
                followers: 318000,
                following: 0,
                created_at: '2011-09-03T15:26:22Z',
                html_url: 'https://github.com/torvalds'
            }
        });
        const sock = mockSock();
        await githubstalk.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.githubstalk torvalds', prefix: '.' });
        const text = sock._calls[1].content.text;
        expect(text).toMatch(/torvalds/);
        expect(text).toMatch(/Linus Torvalds/);
        expect(text).toMatch(/Creator of Linux/);
        expect(text).toMatch(/318000/);
        expect(text).toMatch(/github\.com\/torvalds/);
    });

    test('404 returns user not found', async () => {
        axios.get.mockRejectedValueOnce({ response: { status: 404 } });
        const sock = mockSock();
        await githubstalk.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.githubstalk nonexistentuser999', prefix: '.' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/not found/i);
    });

    test('rate limit returns friendly error', async () => {
        axios.get.mockRejectedValueOnce({ response: { status: 403 } });
        const sock = mockSock();
        await githubstalk.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.githubstalk test', prefix: '.' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/rate limit|error/i);
    });

    test('timeout returns friendly error', async () => {
        axios.get.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' });
        const sock = mockSock();
        await githubstalk.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.githubstalk test', prefix: '.' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/timed out|error/i);
    });

    test('optional fields omitted when null', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                login: 'minimal',
                name: null,
                bio: null,
                company: null,
                location: null,
                blog: '',
                email: null,
                public_repos: 1,
                followers: 0,
                following: 0,
                created_at: '2020-01-01T00:00:00Z',
                html_url: 'https://github.com/minimal'
            }
        });
        const sock = mockSock();
        await githubstalk.execute(sock, mockMessage(), [], { chatId: '1234@g.us', userMessage: '.githubstalk minimal', prefix: '.' });
        const text = sock._calls[1].content.text;
        expect(text).toMatch(/minimal/);
        // Should not contain null/undefined placeholders
        expect(text).not.toMatch(/null|undefined/i);
    });

    test('no API key required', () => {
        const fs = require('fs');
        const content = fs.readFileSync('commands/general/githubstalk.js', 'utf8');
        expect(content).not.toMatch(/api[_-]?key|apikey|token|secret|authorization/i);
    });
});
