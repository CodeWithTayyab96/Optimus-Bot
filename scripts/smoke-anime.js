// Anime category UI migration smoke test.
// Verifies, without any live network:
//   1. Command metadata unchanged (name/aliases/category/permissions).
//   2. Every supported anime type stays reachable through the real execute()
//      path with a mocked API; alias command names map to the right types.
//   3. Missing input shows the boxed INVALID INPUT usage card (both the
//      dynamic-API and static-fallback variants).
//   4. Unsupported types get a compact friendly warning.
//   5. API-supplied quote content is sent unboxed; sticker/image payloads and
//      quoted replies are preserved; no raw error.message reaches users.
// Usage: node scripts/smoke-anime.js

const fs = require('fs');
const path = require('path');
const axios = require('axios');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const ROOT = path.join(__dirname, '..');
const cmd = require(path.join(ROOT, 'commands', 'anime', 'anime.js'));
const src = fs.readFileSync(path.join(ROOT, 'commands', 'anime', 'anime.js'), 'utf8');

// --- Metadata ---
check('anime.js loads with execute()', !!cmd && typeof cmd.execute === 'function');
check('category=anime', cmd.category === 'anime', cmd.category);
check('name "animu" unchanged', cmd.name === 'animu', cmd.name);
check('aliases unchanged', JSON.stringify(cmd.aliases) === JSON.stringify(['nom', 'poke', 'cry', 'kiss', 'pat', 'hug', 'wink', 'facepalm', 'animuquote', 'loli']), JSON.stringify(cmd.aliases));
check('permission flags intact',
    typeof cmd.ownerOnly === 'boolean' && typeof cmd.modOnly === 'boolean' &&
    typeof cmd.groupOnly === 'boolean' && typeof cmd.adminOnly === 'boolean');

const SUPPORTED = ['nom', 'poke', 'cry', 'kiss', 'pat', 'hug', 'wink', 'face-palm', 'quote'];

function makeSock() {
    const sent = [];
    const sock = { sendMessage: async (chatId, content, opts) => { sent.push({ chatId, content, opts }); }, };
    return { sock, sent };
}

async function runWith(msg, args, extra) {
    const { sock, sent } = makeSock();
    const fullExtra = { chatId: '123@g.us', prefix: '.', commandName: 'animu', userMessage: '.animu', ...(extra || {}) };
    const msgWithId = { key: { id: 'a' + Date.now(), remoteJid: '123@g.us' }, ...(msg || {}) };
    await cmd.execute(sock, msgWithId, args || [], fullExtra);
    return sent;
}

function hasText(sent, substr) {
    return sent.some(s => typeof s.content?.text === 'string' && s.content.text.includes(substr));
}

(async () => {
    const origGet = axios.get;

    // --- 1) Usage path: dynamic types from the API (mocked) ---
    axios.get = async () => ({ data: { types: ['/animu/nom', '/animu/poke', '/animu/quote'] } });
    try {
        let sent = await runWith({ message: {} }, [], { userMessage: '.animu' });
        check('usage: boxed INVALID INPUT with dynamic types', hasText(sent, 'INVALID INPUT') && hasText(sent, '.animu <type>') && hasText(sent, 'nom, poke, quote'), JSON.stringify(sent.map(s => s.content?.text)));

        // --- 2) Usage path: static fallback when the API is unreachable ---
        axios.get = async () => { throw new Error('network down'); };
        sent = await runWith({ message: {} }, [], { userMessage: '.animu' });
        check('usage: boxed INVALID INPUT with static types fallback', hasText(sent, 'INVALID INPUT') && hasText(sent, 'face-palm') && hasText(sent, 'wink'), JSON.stringify(sent.map(s => s.content?.text)));

        // --- 3) Unsupported type: compact friendly warning (no API needed) ---
        sent = await runWith({ message: {} }, [], { userMessage: '.animu bogus' });
        check('unsupported type: compact warning with valid types', hasText(sent, '⚠️ Unsupported anime type: bogus') && hasText(sent, 'face-palm'), JSON.stringify(sent.map(s => s.content?.text)));

        // --- 4) Every supported type reachable; quote content sent unboxed ---
        axios.get = async () => ({ data: { quote: 'Fake anime quote' } });
        for (const type of SUPPORTED) {
            const sent = await runWith({ message: {} }, [], { userMessage: `.animu ${type}` });
            const quoteMsg = sent.find(s => typeof s.content?.text === 'string');
            check(`type "${type}" reachable -> unboxed quote`, !!quoteMsg && quoteMsg.content.text === 'Fake anime quote' && !quoteMsg.content.text.includes('╭'), JSON.stringify(sent.map(s => s.content?.text)));
            check(`type "${type}": quoted reply preserved`, !!quoteMsg && quoteMsg.opts && quoteMsg.opts.quoted, 'missing quoted opts');
        }

        // --- 5) Alias command names map to supported types ---
        const facepalmSent = await runWith({ message: {} }, [], { commandName: 'facepalm' });
        check('alias "facepalm" maps to face-palm', hasText(facepalmSent, 'Fake anime quote'), JSON.stringify(facepalmSent.map(s => s.content?.text)));
        const quoteSent = await runWith({ message: {} }, [], { commandName: 'animuquote' });
        check('alias "animuquote" maps to quote', hasText(quoteSent, 'Fake anime quote'), JSON.stringify(quoteSent.map(s => s.content?.text)));

        // --- 6) API failure inside sendAnimu: friendly, no leak ---
        axios.get = async () => ({ data: {} });
        const failSent = await runWith({ message: {} }, [], { userMessage: '.animu hug' });
        check('API failure: friendly message, no raw error', hasText(failSent, "I couldn't fetch the anime content right now"), JSON.stringify(failSent.map(s => s.content?.text)));
    } finally {
        axios.get = origGet;
    }

    // --- 7) Source-level payload + leak checks ---
    check('no raw error.message interpolation', !/\$\{(error|err|e)\.message\}/.test(src), 'found ${error.message}');
    check('sticker payload preserved', src.includes('sticker: stickerBuf'), 'sticker payload missing');
    check('image fallback payload + caption preserved', src.includes('image: { url: link }') && src.includes('caption: `anime: ${type}`'), 'image payload missing');
    check('API quote content sent unboxed', src.includes('text: data.quote'), 'quote branch changed');
    check('sticker metadata preserved (Anime Stickers pack)', src.includes("'sticker-pack-name': 'Anime Stickers'") && src.includes("'emojis': ['🎌']"), 'sticker metadata changed');
    check('ffmpeg conversion preserved', src.includes('convertMediaToSticker') && src.includes('ffmpegCmd'), 'conversion changed');
    check('quoted replies preserved', (src.match(/quoted: message/g) || []).length >= 6, 'quoted replies lost');
    check('no channelInfo duplication introduced', !src.includes('channelInfo'), 'channelInfo was added');
    check('no legacy branding introduced', !/KNIGHT/i.test(src), 'KNIGHT brand present');

    console.log(`\n${pass - fail}/${pass} anime checks passed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
    console.error('❌ smoke-anime crashed:', err);
    process.exit(1);
});
