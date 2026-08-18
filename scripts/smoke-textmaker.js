// Textmaker category UI migration smoke test.
// Verifies, without calling the real ephoto360 API:
//   1. Command metadata unchanged (name/aliases/category/permissions).
//   2. Usage card shown for missing style / missing text; unknown styles get a
//      compact warning. Style matching logic untouched.
//   3. Processing message shown before the API wait.
//   4. Generated image payload preserved; caption uses settings.botName.
//   5. API failure is friendly (no error.message / API details leaked);
//      ephoto endpoint URLs and request parameters unchanged.
// Usage: node scripts/smoke-textmaker.js

const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const mumaker = require('mumaker');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const ROOT = path.join(__dirname, '..');
const cmd = require(path.join(ROOT, 'commands', 'textmaker', 'textmaker.js'));
const src = fs.readFileSync(path.join(ROOT, 'commands', 'textmaker', 'textmaker.js'), 'utf8');

const STYLES = ['metallic', 'ice', 'snow', 'impressive', 'matrix', 'light', 'neon', 'devil', 'purple', 'thunder', 'leaves', '1917', 'arena', 'hacker', 'sand', 'blackpink', 'glitch', 'fire'];

// --- Metadata ---
check('textmaker.js loads with execute()', !!cmd && typeof cmd.execute === 'function');
check('category=textmaker', cmd.category === 'textmaker', cmd.category);
check('name "textmaker" unchanged', cmd.name === 'textmaker', cmd.name);
check('all 18 style aliases unchanged', JSON.stringify(cmd.aliases) === JSON.stringify(STYLES), JSON.stringify(cmd.aliases));
check('permission flags intact',
    typeof cmd.ownerOnly === 'boolean' && typeof cmd.modOnly === 'boolean' &&
    typeof cmd.groupOnly === 'boolean' && typeof cmd.adminOnly === 'boolean');

// --- Helpers ---
function makeSock() {
    const sent = [];
    const sock = { sendMessage: async (chatId, content, opts) => { sent.push({ chatId, content, opts }); }, };
    return { sock, sent };
}

async function runWith(args, extra) {
    const { sock, sent } = makeSock();
    const fullExtra = { chatId: '123@g.us', prefix: '.', commandName: 'textmaker', userMessage: '.textmaker', ...(extra || {}) };
    const msg = { key: { id: 't' + Date.now(), remoteJid: '123@g.us' } };
    await cmd.execute(sock, msg, args || [], fullExtra);
    return sent;
}

function hasText(sent, substr) {
    return sent.some(s => typeof s.content?.text === 'string' && s.content.text.includes(substr));
}

(async () => {
    const origEphoto = mumaker.ephoto;

    try {
        // --- 1) Usage card (no style given) ---
        let sent = await runWith([], { userMessage: '.textmaker' });
        check('usage: TEXTMAKER card with real syntax', hasText(sent, '🎨 TEXTMAKER') && hasText(sent, '.textmaker <style> <text>'), JSON.stringify(sent.map(s => s.content?.text)));
        check('usage: real style names listed', hasText(sent, 'metallic') && hasText(sent, 'blackpink') && hasText(sent, 'fire'), JSON.stringify(sent.map(s => s.content?.text)));
        check('usage: quoted reply preserved', sent.some(s => s.opts && s.opts.quoted), 'missing quoted opts');

        // --- 2) Unknown style: compact warning ---
        sent = await runWith(['bogus', 'hi'], { userMessage: '.textmaker bogus hi' });
        check('unknown style: compact warning', hasText(sent, '⚠️ Unknown text style: bogus') && hasText(sent, '.textmaker'), JSON.stringify(sent.map(s => s.content?.text)));

        // --- 3) Missing text: usage card with hint ---
        sent = await runWith(['metallic'], { userMessage: '.textmaker metallic' });
        check('missing text: usage card with hint', hasText(sent, 'Please provide text to generate.') && hasText(sent, '🎨 TEXTMAKER'), JSON.stringify(sent.map(s => s.content?.text)));

        // --- 4) Success path: processing + image payload + settings.botName caption ---
        mumaker.ephoto = async () => ({ image: 'https://example.com/out.png' });
        sent = await runWith(['metallic', 'Nick'], { userMessage: '.textmaker metallic Nick' });
        const proc = sent.find(s => typeof s.content?.text === 'string' && s.content.text.startsWith('⏳'));
        const img = sent.find(s => s.content && s.content.image);
        check('processing message shown before the API wait', !!proc && proc.content.text.includes('Creating your text image'), JSON.stringify(sent.map(s => s.content?.text)));
        check('image payload preserved (url)', !!img && img.content.image && img.content.image.url === 'https://example.com/out.png', JSON.stringify(sent.map(s => Object.keys(s.content))));
        check('caption keeps user text + settings.botName', !!img && img.content.caption.includes('Nick') && img.content.caption.includes(settings.botName || 'Optimus Bot'), img && img.content.caption);
        check('success: contextInfo branding preserved', !!img && !!img.content.contextInfo && !!img.content.contextInfo.forwardedNewsletterMessageInfo, 'missing contextInfo');

        // --- 5) Alias style routing (fire) unchanged ---
        sent = await runWith(['Nick'], { commandName: 'fire', userMessage: '.fire Nick' });
        check('alias "fire" generates an image', sent.some(s => s.content && s.content.image), JSON.stringify(sent.map(s => Object.keys(s.content))));

        // --- 6) API failure: friendly boxed error, no leak ---
        mumaker.ephoto = async () => { throw new Error('ephoto API exploded'); };
        sent = await runWith(['metallic', 'Nick'], { userMessage: '.textmaker metallic Nick' });
        check('failure: TEXTMAKER FAILED card', hasText(sent, 'TEXTMAKER FAILED') && hasText(sent, "couldn't generate the text image"), JSON.stringify(sent.map(s => s.content?.text)));
        check('failure: no raw error.message leaked', !JSON.stringify(sent).includes('ephoto API exploded'), 'leaked error detail');
    } finally {
        mumaker.ephoto = origEphoto;
    }

    // --- 7) Source-level safety checks ---
    check('no raw error.message interpolation', !/\$\{(error|err|e)\.message\}/.test(src), 'found ${error.message}');
    check('no legacy KNIGHT branding', !/KNIGHT/i.test(src), 'KNIGHT brand present');
    check('no hardcoded "Optimus Bot" (uses settings.botName)', !/caption: ['"]Optimus Bot/.test(src) && src.includes("settings.botName || 'Optimus Bot'"), 'hardcoded bot name in caption');
    check('ephoto endpoint URLs intact (18 styles)', (src.match(/en\.ephoto360\.com/g) || []).length >= 18, 'ephoto URLs changed');
    check('mumaker.ephoto calls preserved', (src.match(/mumaker\.ephoto\(/g) || []).length === 18, 'API calls changed');
    check('image payload preserved', src.includes('image: { url: imageUrl }'), 'image payload changed');
    check('quoted reply preserved', /quoted: message/.test(src), 'quoted reply lost');
    check('contextInfo branding preserved', src.includes('contextInfo: channelInfo'), 'contextInfo lost');

    console.log(`\n${pass - fail}/${pass} textmaker checks passed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
    console.error('❌ smoke-textmaker crashed:', err);
    process.exit(1);
});
