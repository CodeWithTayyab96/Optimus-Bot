/**
 * Smoke tests for the .menu / .help command.
 *
 * Verifies:
 *  - categorized menu generation (9 category headers)
 *  - correct command placement per category
 *  - alphabetical sorting within categories
 *  - aliases don't create duplicate entries
 *  - no API keys / secrets in generated text
 *  - branding / channel info is present
 */

jest.mock('../lib/messageConfig', () => ({
    channelInfo: {
        contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363000000000000@newsletter',
                newsletterName: 'Optimus Bot',
                serverMessageId: -1,
            },
        },
    },
}));

// Mock commandLoader to return a representative set of test commands
// without loading all 144 real command files (some have native deps).
jest.mock('../lib/commandLoader', () => {
    const testCommands = new Map([
        // GENERAL
        ['alive', { name: 'alive', aliases: [], category: 'general', description: 'Check bot alive', usage: '.alive', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['help', { name: 'help', aliases: ['menu', 'bot', 'list'], category: 'general', description: 'Show menu', usage: '.help', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['ping', { name: 'ping', aliases: ['p'], category: 'general', description: 'Ping', usage: '.ping', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['sticker', { name: 'sticker', aliases: ['s'], category: 'general', description: 'Sticker', usage: '.sticker', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['translate', { name: 'translate', aliases: ['tr'], category: 'general', description: 'Translate', usage: '.translate', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['vv', { name: 'vv', aliases: [], category: 'general', description: 'View once', usage: '.vv', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        // ADMIN
        ['antilink', { name: 'antilink', aliases: [], category: 'admin', description: 'Anti link', usage: '.antilink', ownerOnly: false, adminOnly: true, execute: jest.fn() }],
        ['antitag', { name: 'antitag', aliases: [], category: 'admin', description: 'Anti tag', usage: '.antitag', ownerOnly: false, adminOnly: true, execute: jest.fn() }],
        ['clear', { name: 'clear', aliases: [], category: 'admin', description: 'Clear', usage: '.clear', ownerOnly: false, adminOnly: true, execute: jest.fn() }],
        ['delete', { name: 'delete', aliases: ['del'], category: 'admin', description: 'Delete', usage: '.delete', ownerOnly: false, adminOnly: true, execute: jest.fn() }],
        ['hidetag', { name: 'hidetag', aliases: [], category: 'admin', description: 'Hide tag', usage: '.hidetag', ownerOnly: false, adminOnly: true, execute: jest.fn() }],
        ['warn', { name: 'warn', aliases: [], category: 'admin', description: 'Warn', usage: '.warn', ownerOnly: false, adminOnly: true, execute: jest.fn() }],
        ['warnings', { name: 'warnings', aliases: [], category: 'admin', description: 'Warnings', usage: '.warnings', ownerOnly: false, adminOnly: true, execute: jest.fn() }],
        // OWNER
        ['aistatus', { name: 'aistatus', aliases: [], category: 'owner', description: 'AI status', usage: '.aistatus', ownerOnly: true, adminOnly: false, execute: jest.fn() }],
        ['pair', { name: 'pair', aliases: [], category: 'owner', description: 'Pair', usage: '.pair', ownerOnly: true, adminOnly: false, execute: jest.fn() }],
        ['sudo', { name: 'sudo', aliases: [], category: 'owner', description: 'Sudo', usage: '.sudo', ownerOnly: true, adminOnly: false, execute: jest.fn() }],
        ['update', { name: 'update', aliases: [], category: 'owner', description: 'Update', usage: '.update', ownerOnly: true, adminOnly: false, execute: jest.fn() }],
        // AI
        ['gpt', { name: 'gpt', aliases: [], category: 'ai', description: 'GPT', usage: '.gpt', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['gptimage', { name: 'gptimage', aliases: [], category: 'ai', description: 'GPT Image', usage: '.gptimage', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['imagine', { name: 'imagine', aliases: [], category: 'ai', description: 'Imagine', usage: '.imagine', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['stt', { name: 'stt', aliases: [], category: 'ai', description: 'Speech to text', usage: '.stt', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        // FUN
        ['joke', { name: 'joke', aliases: [], category: 'fun', description: 'Joke', usage: '.joke', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['meme', { name: 'meme', aliases: [], category: 'fun', description: 'Meme', usage: '.meme', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['quote', { name: 'quote', aliases: [], category: 'fun', description: 'Quote', usage: '.quote', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['trivia', { name: 'trivia', aliases: [], category: 'fun', description: 'Trivia', usage: '.trivia', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        // MEDIA (DOWNLOADER)
        ['facebook', { name: 'facebook', aliases: ['fb'], category: 'media', description: 'Facebook', usage: '.facebook', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['instagram', { name: 'instagram', aliases: ['ig'], category: 'media', description: 'Instagram', usage: '.instagram', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['spotify', { name: 'spotify', aliases: [], category: 'media', description: 'Spotify', usage: '.spotify', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['tiktok', { name: 'tiktok', aliases: ['tt'], category: 'media', description: 'TikTok', usage: '.tiktok', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['video', { name: 'video', aliases: [], category: 'media', description: 'Video', usage: '.video', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        // ANIME
        ['animu', { name: 'animu', aliases: [], category: 'anime', description: 'Anime', usage: '.animu', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        // TEXTMAKER
        ['textmaker', { name: 'textmaker', aliases: [], category: 'textmaker', description: 'Textmaker', usage: '.textmaker', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        // UTILITY
        ['calc', { name: 'calc', aliases: [], category: 'utility', description: 'Calculator', usage: '.calc', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['qr', { name: 'qr', aliases: [], category: 'utility', description: 'QR code', usage: '.qr', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
        ['weather', { name: 'weather', aliases: [], category: 'utility', description: 'Weather', usage: '.weather', ownerOnly: false, adminOnly: false, execute: jest.fn() }],
    ]);
    return { loadCommands: jest.fn(() => testCommands) };
});

const help = require('../commands/general/help');

const OWNER_VIEWER = { isOwnerOrSudo: true, isAdmin: true, userName: '@owner' };
const GUEST_VIEWER = { isOwnerOrSudo: false, isAdmin: false, userName: '@guest' };

const EXPECTED_CATEGORIES = [
    'GENERAL',
    'ADMIN',
    'OWNER',
    'AI',
    'FUN ZONE',
    'DOWNLOADER',
    'ANIME',
    'TEXTMAKER',
    'UTILITY',
];

// ── Category presence ────────────────────────────────────────────────────────

describe('Menu categorization', () => {
    let menuText;

    beforeAll(() => {
        menuText = help.buildMenuText(OWNER_VIEWER);
    });

    test('menu is a non-empty string', () => {
        expect(typeof menuText).toBe('string');
        expect(menuText.length).toBeGreaterThan(100);
    });

    for (const cat of EXPECTED_CATEGORIES) {
        test(`contains category header "${cat}"`, () => {
            expect(menuText).toContain(`「 ${cat} 」`);
        });
    }

    test('does NOT contain an "MISC" or "UNKNOWN" category', () => {
        expect(menuText).not.toContain('「 MISC 」');
        expect(menuText).not.toContain('「 UNKNOWN 」');
    });
});

// ── Known commands in correct categories ─────────────────────────────────────

describe('Command placement', () => {
    let menuText;

    beforeAll(() => {
        menuText = help.buildMenuText(OWNER_VIEWER);
    });

    function getCategoryBlock(cat) {
        const startMarker = `「 ${cat} 」`;
        const startIdx = menuText.indexOf(startMarker);
        if (startIdx === -1) return '';
        const blockStart = menuText.lastIndexOf('╭─', startIdx);
        const blockEnd = menuText.indexOf('╰────────────', startIdx);
        return menuText.substring(blockStart, blockEnd + 14);
    }

    const CATEGORY_COMMANDS = {
        GENERAL: ['alive', 'help', 'ping', 'sticker', 'translate', 'vv'],
        ADMIN: ['antilink', 'antitag', 'clear', 'delete', 'hidetag', 'warn', 'warnings'],
        OWNER: ['aistatus', 'pair', 'sudo', 'update'],
        AI: ['gpt', 'gptimage', 'imagine', 'stt'],
        'FUN ZONE': ['joke', 'meme', 'quote', 'trivia'],
        DOWNLOADER: ['facebook', 'instagram', 'spotify', 'tiktok', 'video'],
        ANIME: ['animu'],
        TEXTMAKER: ['textmaker'],
        UTILITY: ['calc', 'qr', 'weather'],
    };

    for (const [cat, commands] of Object.entries(CATEGORY_COMMANDS)) {
        for (const cmd of commands) {
            test(`${cmd} appears under ${cat}`, () => {
                const block = getCategoryBlock(cat);
                expect(block).toContain(`✦ ${cmd}`);
            });
        }
    }
});

// ── Alphabetical sort within categories ──────────────────────────────────────

describe('Alphabetical sorting', () => {
    let menuText;

    beforeAll(() => {
        menuText = help.buildMenuText(OWNER_VIEWER);
    });

    function getCommandsInCategory(cat) {
        const marker = `「 ${cat} 」`;
        const startIdx = menuText.indexOf(marker);
        if (startIdx === -1) return [];
        const endIdx = menuText.indexOf('╰────────────', startIdx);
        const block = menuText.substring(startIdx, endIdx);
        const commands = [];
        const regex = /✦ (\S+)/g;
        let m;
        while ((m = regex.exec(block)) !== null) commands.push(m[1]);
        return commands;
    }

    test('GENERAL commands are alphabetically sorted', () => {
        const cmds = getCommandsInCategory('GENERAL');
        const sorted = [...cmds].sort();
        expect(cmds).toEqual(sorted);
    });

    test('AI commands are alphabetically sorted', () => {
        const cmds = getCommandsInCategory('AI');
        const sorted = [...cmds].sort();
        expect(cmds).toEqual(sorted);
    });

    test('ADMIN commands are alphabetically sorted', () => {
        const cmds = getCommandsInCategory('ADMIN');
        const sorted = [...cmds].sort();
        expect(cmds).toEqual(sorted);
    });
});

// ── Alias deduplication ─────────────────────────────────────────────────────

describe('Alias deduplication', () => {
    test('no command name appears more than once in the full menu', () => {
        const menuText = help.buildMenuText(OWNER_VIEWER);
        const regex = /✦ (\S+)/g;
        const seen = new Set();
        const dupes = [];
        let m;
        while ((m = regex.exec(menuText)) !== null) {
            if (seen.has(m[1])) dupes.push(m[1]);
            seen.add(m[1]);
        }
        expect(dupes).toEqual([]);
    });
});

// ── Branding / header ────────────────────────────────────────────────────────

describe('Branding', () => {
    let menuText;

    beforeAll(() => {
        menuText = help.buildMenuText(OWNER_VIEWER);
    });

    test('header shows OPTIMUS BOT', () => {
        expect(menuText).toContain('OPTIMUS BOT');
    });

    test('header shows Welcome', () => {
        expect(menuText).toContain('Welcome');
    });

    test('footer shows channel link', () => {
        expect(menuText).toContain('whatsapp.com/channel');
    });

    test('shows mode', () => {
        expect(menuText).toContain('Mode');
    });

    test('shows prefix', () => {
        expect(menuText).toContain('Prefix');
    });
});

// ── Visibility / permissions ────────────────────────────────────────────────

describe('Visibility', () => {
    test('guest viewer does not see owner-only commands', () => {
        const guestText = help.buildMenuText(GUEST_VIEWER);
        expect(guestText).not.toContain('✦ aistatus');
        expect(guestText).not.toContain('✦ sudo');
    });

    test('owner viewer sees all commands', () => {
        const ownerText = help.buildMenuText(OWNER_VIEWER);
        expect(ownerText).toContain('✦ aistatus');
        expect(ownerText).toContain('✦ sudo');
    });

    test('visibleCommandCount for owner > visibleCommandCount for guest', () => {
        expect(help.visibleCommandCount(OWNER_VIEWER))
            .toBeGreaterThan(help.visibleCommandCount(GUEST_VIEWER));
    });
});

// ── No secrets ──────────────────────────────────────────────────────────────

describe('No secrets in menu output', () => {
    test('no API keys or tokens in menu text', () => {
        const menuText = help.buildMenuText(OWNER_VIEWER);
        expect(menuText).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
        expect(menuText).not.toMatch(/bearer/i);
        expect(menuText).not.toMatch(/ghp_|gho_/);
        expect(menuText).not.toMatch(/api[_-]?key/i);
        expect(menuText).not.toMatch(/token/i);
    });
});

// ── Command detail ──────────────────────────────────────────────────────────

describe('Command detail card', () => {
    test('.help help shows detail card', () => {
        const detail = help.buildCommandDetail('help', OWNER_VIEWER);
        expect(detail).toContain('COMMAND INFO');
        expect(detail).toContain('help');
        // categoryTitle() converts "general" → "General"
        expect(detail).toContain('General');
    });

    test('.help nonexistent shows null', () => {
        const detail = help.buildCommandDetail('nonexistent123', OWNER_VIEWER);
        expect(detail).toBeNull();
    });
});

// ── Chunks ──────────────────────────────────────────────────────────────────

describe('Menu chunks', () => {
    test('buildMenuChunks returns an array of strings', () => {
        const chunks = help.buildMenuChunks(OWNER_VIEWER);
        expect(Array.isArray(chunks)).toBe(true);
        expect(chunks.length).toBeGreaterThanOrEqual(1);
        chunks.forEach(c => expect(typeof c).toBe('string'));
    });

    test('each chunk is under 3000 characters', () => {
        const chunks = help.buildMenuChunks(OWNER_VIEWER);
        chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(3000));
    });
});
