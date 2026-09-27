// Smoke tests for the features ported from Shadow MD.
//
// Covers, for every ported feature:
//   1. command registration through the real loader
//   2. metadata (description/usage/permission flags)
//   3. pure logic (no network)
//   4. persistence round-trip
//   5. happy path with a stubbed HTTP client
//   6. API-failure / no-input / permission-denied behaviour
//
// Usage: node scripts/smoke-shadow-ports.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const { loadCommands } = require('../lib/commandLoader');
const store = require('../lib/index');
const antispam = require('../lib/antispam');
const antibot = require('../lib/antibot');

const antispamCmd = require('../commands/admin/antispam');
const antibotCmd = require('../commands/admin/antibot');
const protectCmd = require('../commands/admin/protect');
const antihijackCmd = require('../commands/admin/antihijack');
const autobioCmd = require('../commands/owner/autobio');
const defineCmd = require('../commands/utility/define');
const recipeCmd = require('../commands/utility/recipe');
const myipCmd = require('../commands/utility/myip');
const shorturlCmd = require('../commands/utility/shorturl');
const readqrCmd = require('../commands/utility/readqr');
const rpsCmd = require('../commands/fun/rps');
const slotCmd = require('../commands/fun/slot');
const diceCmd = require('../commands/fun/dice');
const coinflipCmd = require('../commands/fun/coinflip');
const settings = require('../settings');

const G1 = '111222333444@g.us';
const G2 = '555666777888@g.us';
const BOT = '1234567890@s.whatsapp.net';
const ADMIN = '100000000001@s.whatsapp.net';
const MEMBER = '100000000002@s.whatsapp.net';
const ATTACKER = '100000000003@s.whatsapp.net';
const OWNER = `${settings.ownerNumber}@s.whatsapp.net`;

const DATA_FILE = path.join(process.cwd(), 'data', 'userGroupData.json');
const AUTOBIO_FILE = path.join(process.cwd(), 'data', 'autobio.json');

let failures = 0;
function check(label, ok) {
    console.log(`${ok ? '✅' : '❌'} ${label}`);
    if (!ok) failures++;
}

// ---------------------------------------------------------------------------
// Mock socket
// ---------------------------------------------------------------------------
const sent = [];
const removed = [];
const promoted = [];
let botIsAdmin = true;

const mockSock = {
    user: { id: BOT },
    sendMessage: async (jid, content) => {
        sent.push({ jid, text: content?.text || '(media)', content });
        return { key: { id: 'mock' } };
    },
    groupMetadata: async () => ({
        participants: [
            { id: BOT, admin: botIsAdmin ? 'admin' : null },
            { id: ADMIN, admin: 'admin' },
            { id: MEMBER, admin: null },
            { id: ATTACKER, admin: 'admin' },
        ],
    }),
    groupParticipantsUpdate: async (jid, users, action) => {
        if (action === 'remove') removed.push(...users);
        if (action === 'promote') promoted.push(...users);
    },
    updateProfileStatus: async (text) => {
        sent.push({ jid: 'status', text, content: { status: text } });
        return true;
    },
};

function msg(chatId, sender, text = '', mentioned = []) {
    return {
        key: { remoteJid: chatId, fromMe: false, participant: sender, id: `M${Date.now()}${Math.random()}` },
        message: { extendedTextMessage: { text, contextInfo: { mentionedJid: mentioned } } },
    };
}

const extraFor = (chatId, senderId, args = []) => ({
    chatId,
    senderId,
    isGroup: true,
    prefix: '.',
    channelInfo: {},
    args,
    userMessage: `.cmd ${args.join(' ')}`.trim(),
    reply: async (c) => mockSock.sendMessage(chatId, typeof c === 'string' ? { text: c } : c),
});

const lastText = () => sent[sent.length - 1]?.text || '';

// ---------------------------------------------------------------------------
// HTTP stubbing
// ---------------------------------------------------------------------------
const realGet = axios.get;
const realPost = axios.post;
function stubGet(handler) { axios.get = handler; }
function stubPost(handler) { axios.post = handler; }
function restoreHttp() { axios.get = realGet; axios.post = realPost; }

(async () => {
    const dataBackup = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE, 'utf8') : null;
    const autobioBackup = fs.existsSync(AUTOBIO_FILE) ? fs.readFileSync(AUTOBIO_FILE, 'utf8') : null;

    try {
        // ------------------------------------------------------------------
        // 1. Command registration
        // ------------------------------------------------------------------
        const registry = loadCommands();
        const expected = [
            'antispam', 'antibot', 'protect', 'antihijack',
            'autobio',
            'define', 'recipe', 'myip', 'shorturl', 'readqr',
            'rps', 'slot', 'dice', 'coinflip'
        ];
        for (const name of expected) {
            check(`registered: .${name}`, registry.has(name));
        }

        const meta = expected.map(n => registry.get(n));
        check('every ported command has a description', meta.every(c => c && typeof c.description === 'string' && c.description.length > 0));
        check('every ported command has usage', meta.every(c => c && typeof c.usage === 'string' && c.usage.length > 0));
        check('every ported command has execute()', meta.every(c => c && typeof c.execute === 'function'));
        check('owner-only autobio is flagged', registry.get('autobio').ownerOnly === true);
        check('group admin commands are group-scoped',
            ['antispam', 'antibot', 'protect', 'antihijack'].every(n => registry.get(n).groupOnly === true));
        check('utility commands are not admin-restricted',
            ['define', 'recipe', 'myip', 'shorturl', 'readqr'].every(n => !registry.get(n).adminOnly));

        // ------------------------------------------------------------------
        // 2. Pure logic — games
        // ------------------------------------------------------------------
        check('rps: rock beats scissors', rpsCmd.resolve('rock', 'scissors') === 'win');
        check('rps: scissors loses to rock', rpsCmd.resolve('scissors', 'rock') === 'lose');
        check('rps: paper beats rock', rpsCmd.resolve('paper', 'rock') === 'win');
        check('rps: same choice is a draw', rpsCmd.resolve('paper', 'paper') === 'draw');
        check('rps: short forms normalise', rpsCmd.normalize('r') === 'rock' && rpsCmd.normalize('S') === 'scissors');
        check('rps: junk rejected', rpsCmd.normalize('banana') === null);
        check('rps: bot choice is always valid', rpsCmd.CHOICES.includes(rpsCmd.pickBotChoice(() => 0.99)));

        check('slot: triple seven is a jackpot', slotCmd.evaluate(['7️⃣', '7️⃣', '7️⃣']) === 'jackpot');
        check('slot: triple match wins', slotCmd.evaluate(['🍒', '🍒', '🍒']) === 'win');
        check('slot: two matching is "two"', slotCmd.evaluate(['🍒', '🍒', '⭐']) === 'two');
        check('slot: no match loses', slotCmd.evaluate(['🍒', '🍋', '⭐']) === 'lose');
        check('slot: spin yields 3 valid symbols',
            slotCmd.spin(() => 0).every(s => slotCmd.REEL.includes(s)) && slotCmd.spin(() => 0).length === 3);

        check('dice: default is 1d6', JSON.stringify(diceCmd.parseSpec('')) === JSON.stringify({ count: 1, sides: 6 }));
        check('dice: "20" is one d20', diceCmd.parseSpec('20').sides === 20 && diceCmd.parseSpec('20').count === 1);
        check('dice: "3d6" parses', diceCmd.parseSpec('3d6').count === 3 && diceCmd.parseSpec('3d6').sides === 6);
        check('dice: invalid specs rejected', diceCmd.parseSpec('1') === null && diceCmd.parseSpec('99d6') === null && diceCmd.parseSpec('abc') === null);
        check('dice: roll is deterministic with a seeded rand', JSON.stringify(diceCmd.roll(3, 6, () => 0)) === JSON.stringify([1, 1, 1]));

        check('coinflip: guess normalises', coinflipCmd.normalizeGuess('h') === 'heads' && coinflipCmd.normalizeGuess('TAILS') === 'tails');
        check('coinflip: junk guess rejected', coinflipCmd.normalizeGuess('side') === null);
        check('coinflip: flip returns a valid side', coinflipCmd.SIDES.includes(coinflipCmd.flip(() => 0.1)));

        // ------------------------------------------------------------------
        // 3. Pure logic — utilities
        // ------------------------------------------------------------------
        const dictLines = defineCmd.formatEntries('serendipity', [{
            word: 'serendipity',
            phonetic: '/ˌsɛrənˈdɪpɪti/',
            meanings: [{
                partOfSpeech: 'noun',
                definitions: [{ definition: 'The occurrence of events by chance in a happy way.', example: 'A fortunate stroke of serendipity.' }],
                synonyms: ['chance', 'luck']
            }]
        }]);
        check('define: formats an entry', Array.isArray(dictLines) && dictLines.some(l => l.includes('serendipity')));
        check('define: includes the part of speech', dictLines.some(l => l.includes('noun')));
        check('define: includes the definition', dictLines.some(l => l.includes('by chance')));
        check('define: empty payload yields null', defineCmd.formatEntries('x', []) === null && defineCmd.formatEntries('x', null) === null);

        const mealLines = recipeCmd.formatMeal({
            strMeal: 'Teriyaki Chicken',
            strCategory: 'Chicken',
            strArea: 'Japanese',
            strIngredient1: 'soy sauce', strMeasure1: '3 tbsp',
            strIngredient2: 'chicken', strMeasure2: '2 lbs',
            strIngredient3: '', strMeasure3: '',
            strInstructions: 'Mix and cook.'
        });
        check('recipe: formats a meal', Array.isArray(mealLines) && mealLines.some(l => l.includes('Teriyaki Chicken')));
        check('recipe: measures are joined', mealLines.some(l => l.includes('3 tbsp soy sauce')));
        check('recipe: blank ingredient slots skipped', mealLines.filter(l => l.includes('undefined')).length === 0);
        check('recipe: null meal yields null', recipeCmd.formatMeal(null) === null);

        check('myip: formats ip + geo', myipCmd.formatResult('1.2.3.4', { city: 'Lahore', country_name: 'Pakistan' }).some(l => l.includes('Lahore')));
        check('myip: degrades without geo', myipCmd.formatResult('1.2.3.4', null).some(l => l.includes('Geolocation unavailable')));

        check('shorturl: accepts http/https', shorturlCmd.isValidHttpUrl('https://a.com/x') && shorturlCmd.isValidHttpUrl('http://a.com'));
        check('shorturl: rejects junk', !shorturlCmd.isValidHttpUrl('not a url') && !shorturlCmd.isValidHttpUrl('ftp://a.com'));

        check('readqr: object payload', readqrCmd.parseResponse({ symbol: [{ data: 'hello' }] })?.text === 'hello');
        check('readqr: array payload', readqrCmd.parseResponse([{ symbol: [{ data: 'hi' }] }])?.text === 'hi');
        check('readqr: no symbol yields null', readqrCmd.parseResponse({ symbol: [] }) === null);
        check('readqr: error symbol yields null', readqrCmd.parseResponse({ symbol: [{ data: null, error: 'no code' }] }) === null);

        // ------------------------------------------------------------------
        // 4. Persistence
        // ------------------------------------------------------------------
        store.setAntispam(G1, { enabled: true, action: 'kick', threshold: 3, window: 5000 });
        let cfg = antispam.resolveConfig(G1);
        check('antispam: settings persist', cfg.enabled === true && cfg.action === 'kick' && cfg.threshold === 3);
        store.removeAntispam(G1);
        check('antispam: settings clear', antispam.resolveConfig(G1).enabled === false);

        store.setAntibot(G2, { enabled: true, action: 'delete' });
        check('antibot: settings persist', antibot.resolveConfig(G2).enabled === true && antibot.resolveConfig(G2).action === 'delete');
        store.removeAntibot(G2);
        check('antibot: settings clear', antibot.resolveConfig(G2).enabled === false);

        store.setAntihijack(G1, true);
        check('antihijack: setting persists', store.getAntihijack(G1)?.enabled === true);
        store.setAntihijack(G1, false);
        check('antihijack: setting clears', store.getAntihijack(G1)?.enabled === false);

        store.addProtectedAdmin(G1, MEMBER);
        check('protect: admin added', store.isProtectedAdmin(G1, MEMBER) === true);
        check('protect: duplicate add is idempotent', (store.addProtectedAdmin(G1, MEMBER), store.getProtectedAdmins(G1).filter(j => j === MEMBER).length === 1));
        store.removeProtectedAdmin(G1, MEMBER);
        check('protect: admin removed', store.isProtectedAdmin(G1, MEMBER) === false);

        // ------------------------------------------------------------------
        // 5. Detection logic — anti-spam
        // ------------------------------------------------------------------
        store.setAntispam(G1, { enabled: true, action: 'delete', threshold: 3, window: 5000 });
        antispam.clearAll();
        let consumed = false;
        for (let i = 0; i < 2; i++) consumed = await antispam.handleSpamDetection(mockSock, G1, msg(G1, MEMBER), MEMBER);
        check('antispam: below threshold is ignored', consumed === false);
        sent.length = 0;
        consumed = await antispam.handleSpamDetection(mockSock, G1, msg(G1, MEMBER), MEMBER);
        check('antispam: threshold triggers action', consumed === true);
        check('antispam: offending message is deleted', sent.some(s => s.content?.delete));
        check('antispam: counter resets after a sanction', antispam.record(G1, MEMBER, 5000) === 1);

        // Admin exemption
        antispam.clearAll();
        let adminConsumed = false;
        for (let i = 0; i < 5; i++) adminConsumed = await antispam.handleSpamDetection(mockSock, G1, msg(G1, ADMIN), ADMIN);
        check('antispam: admins are exempt', adminConsumed === false);

        // Owner exemption
        antispam.clearAll();
        let ownerConsumed = false;
        for (let i = 0; i < 5; i++) ownerConsumed = await antispam.handleSpamDetection(mockSock, G1, msg(G1, OWNER), OWNER);
        check('antispam: owner is exempt', ownerConsumed === false);

        // Disabled by default
        store.removeAntispam(G1);
        antispam.clearAll();
        let offConsumed = false;
        for (let i = 0; i < 5; i++) offConsumed = await antispam.handleSpamDetection(mockSock, G1, msg(G1, MEMBER), MEMBER);
        check('antispam: inert when disabled', offConsumed === false);

        // Warn escalation reaches the shared 3-strike limit
        store.setAntispam(G1, { enabled: true, action: 'warn', threshold: 2, window: 5000 });
        store.resetWarningCount(G1, MEMBER);
        removed.length = 0;
        for (let round = 0; round < 3; round++) {
            antispam.clearAll();
            await antispam.handleSpamDetection(mockSock, G1, msg(G1, MEMBER), MEMBER);
            await antispam.handleSpamDetection(mockSock, G1, msg(G1, MEMBER), MEMBER);
        }
        check('antispam: 3 warn strikes remove the sender', removed.includes(MEMBER));
        store.resetWarningCount(G1, MEMBER);
        store.removeAntispam(G1);
        antispam.clearAll();

        // ------------------------------------------------------------------
        // 6. Detection logic — anti-bot
        // ------------------------------------------------------------------
        check('antibot: !play looks like a command', antibot.looksLikeCommand('!play') === true);
        check('antibot: /start looks like a command', antibot.looksLikeCommand('/start') === true);
        check('antibot: .unknowncommand looks like a command', antibot.looksLikeCommand('.unknowncommand') === true);
        check('antibot: plain text is not a command', antibot.looksLikeCommand('hello there') === false);
        check('antibot: a bare dot is not a command', antibot.looksLikeCommand('.') === false);

        store.setAntibot(G1, { enabled: true, action: 'delete' });
        sent.length = 0;
        const botHit = await antibot.handleBotCommandDetection(mockSock, G1, msg(G1, MEMBER, '!play'), MEMBER, '!play');
        check('antibot: foreign command is actioned', botHit === true);
        check('antibot: offending message is deleted', sent.some(s => s.content?.delete));

        sent.length = 0;
        const plainHit = await antibot.handleBotCommandDetection(mockSock, G1, msg(G1, MEMBER, 'hello'), MEMBER, 'hello');
        check('antibot: plain text is untouched', plainHit === false);

        sent.length = 0;
        const adminBotHit = await antibot.handleBotCommandDetection(mockSock, G1, msg(G1, ADMIN, '!play'), ADMIN, '!play');
        check('antibot: admins are exempt', adminBotHit === false);

        store.removeAntibot(G1);
        const offBotHit = await antibot.handleBotCommandDetection(mockSock, G1, msg(G1, MEMBER, '!play'), MEMBER, '!play');
        check('antibot: inert when disabled', offBotHit === false);

        // ------------------------------------------------------------------
        // 7. Anti-hijack
        // ------------------------------------------------------------------
        const antiHijack = require('../lib/antiHijack');

        // 7a. Protected admin, antihijack off → restore only, nobody removed
        store.setAntihijack(G1, false);
        store.addProtectedAdmin(G1, ADMIN);
        promoted.length = 0; removed.length = 0; sent.length = 0;
        let acted = await antiHijack.handleAntiHijack(mockSock, G1, [ADMIN], ATTACKER);
        check('antihijack: protected admin is restored', acted === true && promoted.includes(ADMIN));
        check('antihijack: nobody removed when antihijack is off', removed.length === 0);

        // 7b. antihijack on → also remove the demoter
        store.setAntihijack(G1, true);
        promoted.length = 0; removed.length = 0;
        await antiHijack.handleAntiHijack(mockSock, G1, [ADMIN], ATTACKER);
        check('antihijack: demoter removed when enabled', removed.includes(ATTACKER));

        // 7c. Non-protected victim + antihijack off → no intervention
        store.setAntihijack(G1, false);
        store.removeProtectedAdmin(G1, ADMIN);
        promoted.length = 0; removed.length = 0;
        acted = await antiHijack.handleAntiHijack(mockSock, G1, [ADMIN], ATTACKER);
        check('antihijack: inert with nothing configured', acted === false && promoted.length === 0);

        // 7d. Bot is not admin → cannot act, and says so
        store.setAntihijack(G1, true);
        botIsAdmin = false;
        promoted.length = 0; removed.length = 0; sent.length = 0;
        acted = await antiHijack.handleAntiHijack(mockSock, G1, [ADMIN], ATTACKER);
        check('antihijack: no action when the bot is not admin', acted === false);
        check('antihijack: explains it needs admin', sent.some(s => /need to be an admin/.test(s.text || '')));
        botIsAdmin = true;

        // 7e. Self-inflicted demotion must not remove the bot
        removed.length = 0;
        await antiHijack.handleAntiHijack(mockSock, G1, [ADMIN], BOT);
        check('antihijack: the bot never removes itself', removed.includes(BOT) === false);

        store.setAntihijack(G1, false);

        // ------------------------------------------------------------------
        // 8. Command surfaces (permission + happy path)
        // ------------------------------------------------------------------
        // antispam: non-admin denied
        sent.length = 0;
        await antispamCmd.execute(mockSock, msg(G1, MEMBER, '.antispam on'), ['on'], extraFor(G1, MEMBER));
        check('.antispam: non-admin denied', /permission|restricted|admin/i.test(lastText()));

        sent.length = 0;
        await antispamCmd.execute(mockSock, msg(G1, ADMIN, '.antispam on'), ['on'], extraFor(G1, ADMIN));
        check('.antispam on: succeeds for admin', /turned ON/i.test(lastText()));
        await antispamCmd.execute(mockSock, msg(G1, ADMIN, '.antispam off'), ['off'], extraFor(G1, ADMIN));
        check('.antispam off: succeeds', /turned OFF/i.test(lastText()));

        sent.length = 0;
        await antispamCmd.execute(mockSock, msg(G1, ADMIN, '.antispam set bogus'), ['set', 'bogus'], extraFor(G1, ADMIN));
        check('.antispam set: rejects an invalid action', /Invalid action/i.test(lastText()));

        await antibotCmd.execute(mockSock, msg(G1, ADMIN, '.antibot on'), ['on'], extraFor(G1, ADMIN));
        check('.antibot on: succeeds', /turned ON/i.test(lastText()));
        await antibotCmd.execute(mockSock, msg(G1, ADMIN, '.antibot off'), ['off'], extraFor(G1, ADMIN));
        check('.antibot off: succeeds', /turned OFF/i.test(lastText()));

        sent.length = 0;
        await protectCmd.execute(mockSock, msg(G1, ADMIN, '.protect add', [MEMBER]), ['add'], extraFor(G1, ADMIN));
        check('.protect add: succeeds', /protected admin/i.test(lastText()));
        check('.protect add: persisted', store.isProtectedAdmin(G1, MEMBER) === true);
        sent.length = 0;
        await protectCmd.execute(mockSock, msg(G1, ADMIN, '.protect list'), ['list'], extraFor(G1, ADMIN));
        check('.protect list: shows the member', /100000000002/.test(lastText()));
        await protectCmd.execute(mockSock, msg(G1, ADMIN, '.protect remove', [MEMBER]), ['remove'], extraFor(G1, ADMIN));
        check('.protect remove: succeeds', /no longer/i.test(lastText()));
        check('.protect remove: persisted', store.isProtectedAdmin(G1, MEMBER) === false);

        sent.length = 0;
        await protectCmd.execute(mockSock, msg(G1, ADMIN, '.protect add'), ['add'], extraFor(G1, ADMIN));
        check('.protect add: needs a target', /mention|reply/i.test(lastText()));

        await antihijackCmd.execute(mockSock, msg(G1, ADMIN, '.antihijack on'), ['on'], extraFor(G1, ADMIN));
        check('.antihijack on: succeeds', /turned ON/i.test(lastText()));
        await antihijackCmd.execute(mockSock, msg(G1, ADMIN, '.antihijack off'), ['off'], extraFor(G1, ADMIN));
        check('.antihijack off: succeeds', /turned OFF/i.test(lastText()));

        // autobio
        sent.length = 0;
        await autobioCmd.execute(mockSock, msg('me@s.whatsapp.net', MEMBER, '.autobio on'), ['on'], extraFor('me@s.whatsapp.net', MEMBER));
        check('.autobio: non-owner denied', /owner|permission|restricted/i.test(lastText()));

        sent.length = 0;
        await autobioCmd.execute(mockSock, msg('me@s.whatsapp.net', OWNER, '.autobio on'), ['on'], extraFor('me@s.whatsapp.net', OWNER));
        check('.autobio on: succeeds for owner', /ON/i.test(lastText()));
        check('.autobio on: writes the status', sent.some(s => s.jid === 'status'));
        check('.autobio on: state persisted', autobioCmd.loadState().enabled === true);

        await autobioCmd.execute(mockSock, msg('me@s.whatsapp.net', OWNER, '.autobio off'), ['off'], extraFor('me@s.whatsapp.net', OWNER));
        check('.autobio off: succeeds', /turned OFF/i.test(lastText()));
        check('.autobio off: state persisted', autobioCmd.loadState().enabled === false);
        check('.autobio: renders placeholders', !/\{time\}/.test(autobioCmd.render('{bot} | {time}')));

        // ------------------------------------------------------------------
        // 9. HTTP-backed commands — happy path
        // ------------------------------------------------------------------
        stubGet(async (url) => {
            if (url.startsWith('https://api.dictionaryapi.dev')) {
                return { data: [{ word: 'serendipity', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'happy chance' }] }] }] };
            }
            if (url.startsWith('https://www.themealdb.com')) {
                return { data: { meals: [{ strMeal: 'Pie', strInstructions: 'Bake it.', strIngredient1: 'flour', strMeasure1: '2 cups' }] } };
            }
            if (url.startsWith('https://api.ipify.org')) return { data: { ip: '1.2.3.4' } };
            if (url.startsWith('https://ipapi.co')) return { data: { city: 'Lahore', country_name: 'Pakistan' } };
            if (url.startsWith('https://tinyurl.com')) return { data: 'https://tinyurl.com/abc123' };
            throw new Error('unexpected GET ' + url);
        });

        sent.length = 0;
        await defineCmd.execute(mockSock, msg(G1, MEMBER, '.define serendipity'), ['serendipity'], extraFor(G1, MEMBER));
        check('.define: returns a definition', /happy chance/.test(lastText()));

        sent.length = 0;
        await recipeCmd.execute(mockSock, msg(G1, MEMBER, '.recipe pie'), ['pie'], extraFor(G1, MEMBER));
        check('.recipe: returns a recipe', /Pie/.test(lastText()));

        sent.length = 0;
        await myipCmd.execute(mockSock, msg(G1, MEMBER, '.myip'), [], extraFor(G1, MEMBER));
        check('.myip: returns the ip', /1\.2\.3\.4/.test(lastText()));
        check('.myip: includes geolocation', /Lahore/.test(lastText()));

        sent.length = 0;
        await shorturlCmd.execute(mockSock, msg(G1, MEMBER, '.shorturl https://a.com'), ['https://a.com'], extraFor(G1, MEMBER));
        check('.shorturl: returns the short url', /tinyurl\.com\/abc123/.test(lastText()));

        // ------------------------------------------------------------------
        // 10. HTTP-backed commands — failure and input handling
        // ------------------------------------------------------------------
        sent.length = 0;
        await defineCmd.execute(mockSock, msg(G1, MEMBER, '.define'), [], extraFor(G1, MEMBER));
        check('.define: missing word prompts for one', /provide a word/i.test(lastText()));

        stubGet(async () => { const e = new Error('404'); e.response = { status: 404 }; throw e; });
        sent.length = 0;
        await defineCmd.execute(mockSock, msg(G1, MEMBER, '.define zzzz'), ['zzzz'], extraFor(G1, MEMBER));
        check('.define: 404 reports not-found', /No dictionary entry/i.test(lastText()));

        stubGet(async () => { throw new Error('network down'); });
        sent.length = 0;
        await defineCmd.execute(mockSock, msg(G1, MEMBER, '.define zzzz'), ['zzzz'], extraFor(G1, MEMBER));
        check('.define: network failure replies with an error', /Could not reach|error/i.test(lastText()));

        sent.length = 0;
        await recipeCmd.execute(mockSock, msg(G1, MEMBER, '.recipe zzzz'), ['zzzz'], extraFor(G1, MEMBER));
        check('.recipe: network failure replies with an error', /Could not reach|error/i.test(lastText()));

        sent.length = 0;
        await myipCmd.execute(mockSock, msg(G1, MEMBER, '.myip'), [], extraFor(G1, MEMBER));
        check('.myip: network failure replies with an error', /Could not determine|error/i.test(lastText()));

        sent.length = 0;
        await shorturlCmd.execute(mockSock, msg(G1, MEMBER, '.shorturl nope'), ['nope'], extraFor(G1, MEMBER));
        check('.shorturl: rejects a non-URL', /not a valid/i.test(lastText()));

        stubGet(async () => ({ data: 'Service Unavailable' }));
        sent.length = 0;
        await shorturlCmd.execute(mockSock, msg(G1, MEMBER, '.shorturl https://a.com'), ['https://a.com'], extraFor(G1, MEMBER));
        check('.shorturl: rejects a non-URL response', /unexpected response|Could not shorten/i.test(lastText()));

        // geo failure must not break .myip
        stubGet(async (url) => {
            if (url.startsWith('https://api.ipify.org')) return { data: { ip: '9.9.9.9' } };
            throw new Error('geo down');
        });
        sent.length = 0;
        await myipCmd.execute(mockSock, msg(G1, MEMBER, '.myip'), [], extraFor(G1, MEMBER));
        check('.myip: still returns the ip when geo fails', /9\.9\.9\.9/.test(lastText()) && /Geolocation unavailable/i.test(lastText()));

        // readqr with no image
        sent.length = 0;
        await readqrCmd.execute(mockSock, msg(G1, MEMBER, '.readqr'), [], extraFor(G1, MEMBER));
        check('.readqr: without an image shows usage', /Reply to an image|Usage/i.test(lastText()));

        // .readqr decoder against a stubbed upload endpoint
        stubPost(async () => ({ data: { symbol: [{ data: 'https://example.com' }] } }));
        const decoded = await readqrCmd.decodeQr(Buffer.from('fake-png'));
        check('.readqr: decodes a code', decoded?.text === 'https://example.com');

        stubPost(async () => ({ data: { symbol: [{ data: null, error: 'no code detected' }] } }));
        check('.readqr: unreadable image yields null', (await readqrCmd.decodeQr(Buffer.from('x'))) === null);

        stubPost(async () => { throw new Error('upload failed'); });
        let decodeThrew = false;
        try { await readqrCmd.decodeQr(Buffer.from('x')); } catch (_) { decodeThrew = true; }
        check('.readqr: decoder failure surfaces to the command', decodeThrew === true);

        // ------------------------------------------------------------------
        // 11. Fun commands via execute()
        // ------------------------------------------------------------------
        sent.length = 0;
        await rpsCmd.execute(mockSock, msg(G1, MEMBER, '.rps rock'), ['rock'], extraFor(G1, MEMBER));
        check('.rps: responds with a result', /You win|I win|Draw/.test(lastText()));
        sent.length = 0;
        await rpsCmd.execute(mockSock, msg(G1, MEMBER, '.rps'), [], extraFor(G1, MEMBER));
        check('.rps: missing choice shows usage', /Usage/.test(lastText()));

        sent.length = 0;
        await slotCmd.execute(mockSock, msg(G1, MEMBER, '.slot'), [], extraFor(G1, MEMBER));
        check('.slot: responds with reels', /SLOT MACHINE/.test(lastText()));

        sent.length = 0;
        await diceCmd.execute(mockSock, msg(G1, MEMBER, '.dice'), [], extraFor(G1, MEMBER));
        check('.dice: default roll responds', /DICE/.test(lastText()));
        sent.length = 0;
        await diceCmd.execute(mockSock, msg(G1, MEMBER, '.dice 3d6'), ['3d6'], extraFor(G1, MEMBER));
        check('.dice 3d6: shows three rolls', /Rolls:/.test(lastText()));
        sent.length = 0;
        await diceCmd.execute(mockSock, msg(G1, MEMBER, '.dice 1'), ['1'], extraFor(G1, MEMBER));
        check('.dice: invalid die size rejected', /die size|Invalid/i.test(lastText()));

        sent.length = 0;
        await coinflipCmd.execute(mockSock, msg(G1, MEMBER, '.coinflip'), [], extraFor(G1, MEMBER));
        check('.coinflip: responds with a side', /HEADS|TAILS/.test(lastText()));
        sent.length = 0;
        await coinflipCmd.execute(mockSock, msg(G1, MEMBER, '.coinflip heads'), ['heads'], extraFor(G1, MEMBER));
        check('.coinflip: with a guess reports the call', /You called it|Better luck/.test(lastText()));
        sent.length = 0;
        await coinflipCmd.execute(mockSock, msg(G1, MEMBER, '.coinflip side'), ['side'], extraFor(G1, MEMBER));
        check('.coinflip: invalid guess rejected', /heads or tails/i.test(lastText()));

        console.log(`\n── Shadow port checks: ${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'} ──`);
    } catch (err) {
        console.error('smoke-shadow-ports crashed:', err);
        failures++;
    } finally {
        restoreHttp();
        autobioCmd.stopAutobio();
        // Restore the real data files so the tree is left as we found it.
        if (dataBackup !== null) fs.writeFileSync(DATA_FILE, dataBackup);
        else fs.rmSync(DATA_FILE, { force: true });
        if (autobioBackup !== null) fs.writeFileSync(AUTOBIO_FILE, autobioBackup);
        else fs.rmSync(AUTOBIO_FILE, { force: true });
    }

    process.exit(failures === 0 ? 0 : 1);
})();
