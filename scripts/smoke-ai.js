// AI UI migration smoke test.
// Verifies, without any network access or API keys:
//   1. All 10 AI commands load with intact metadata (names/aliases/category/permissions).
//   2. Missing-input paths reply with the shared styled system (boxed/compact INVALID INPUT).
//   3. Raw provider errors are NOT leaked into user-visible text.
//   4. Processing helper used where the command genuinely waits.
//   5. Image/audio payload keys and quoted replies preserved.
//   6. Branding: no legacy bot names, captions use settings.botName.
// Usage: node scripts/smoke-ai.js

const fs = require('fs');
const path = require('path');
const style = require('../lib/messageStyle');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const ROOT = path.join(__dirname, '..');
const AI_DIR = path.join(ROOT, 'commands', 'ai');
const aiFiles = [
    'ai', 'gptimage', 'imagine', 'magicstudio', 'reply',
    'rewrite', 'stt', 'study', 'summarize', 'voicesummary'
];

const cmds = {};
const src = {};
for (const f of aiFiles) {
    cmds[f] = require(path.join(AI_DIR, f + '.js'));
    src[f] = fs.readFileSync(path.join(AI_DIR, f + '.js'), 'utf8');
    check(`${f}.js loads with execute()`, !!cmds[f] && typeof cmds[f].execute === 'function');
    check(`${f}.js category=ai`, cmds[f].category === 'ai');
    check(`${f}.js permission flags intact`,
        typeof cmds[f].ownerOnly === 'boolean' && typeof cmds[f].modOnly === 'boolean' &&
        typeof cmds[f].groupOnly === 'boolean' && typeof cmds[f].adminOnly === 'boolean');
}

// --- Styled responses via mocked sockets (pre-network paths only) ---
async function runWith(cmdName, msg, args, extra) {
    const sent = [];
    const sock = {
        sendMessage: async (chatId, content, opts) => { sent.push({ chatId, content, opts }); },
        react: async () => {},
        updateMediaMessage: async () => {}
    };
    const fullExtra = { chatId: '123@g.us', prefix: '.', commandName: cmdName === 'ai' ? 'gpt' : cmdName, reply: async (t) => { sent.push({ chatId: '123@g.us', content: { text: t }, opts: undefined }); }, ...(extra || {}) };
    const msgWithId = { key: { id: cmdName + '_' + Date.now() + '_' + Math.random() }, ...(msg || {}) };
    if (msgWithId.key && !msgWithId.key.remoteJid) msgWithId.key.remoteJid = '123@g.us';
    await cmds[cmdName].execute(sock, msgWithId, args || [], fullExtra);
    return sent;
}

function hasText(sent, substr) {
    return sent.some(s => typeof s.content?.text === 'string' && s.content.text.includes(substr));
}

(async () => {
    // 1) Missing-input / usage styled replies
    const usageCases = [
        ['ai', { message: {} }, [], 'INVALID INPUT'],
        ['ai', { message: {} }, [], '.gpt <question> | .gemini <question>'],
        ['reply', { message: {} }, [], 'INVALID INPUT'],
        ['rewrite', { message: {} }, [], 'INVALID INPUT'],
        ['summarize', { message: {} }, [], 'Reply to any message with .summarize'],
        ['imagine', { message: { conversation: '.imagine' } }, [], 'INVALID INPUT'],
        ['magicstudio', { message: {} }, [], 'INVALID INPUT'],
        ['gptimage', { message: {} }, [], '🎨 AI IMAGE'],
        ['stt', { message: {} }, [], 'INVALID INPUT'],
        ['voicesummary', { message: {} }, [], 'Reply to a voice note or audio with .voicesummary'],
        ['study', { message: {} }, [], '📄 AI STUDY'],
    ];
    for (const [cmdName, msg, args, substr] of usageCases) {
        const sent = await runWith(cmdName, msg, args);
        check(`${cmdName}: usage reply styled`, hasText(sent, substr), JSON.stringify(sent.map(s => s.content?.text)));
    }

    // 2) No raw provider error leaks in user-visible text
    for (const f of aiFiles) {
        check(`${f}: no raw error.message in reply text`,
            !src[f].includes('${error.message}') && !src[f].includes('${err.message}') &&
            !src[f].includes(': ${error.message}') && !src[f].includes('Failed to generate image: ${'),
            'found error.message interpolation');
    }
    check('gptimage: friendly final catch', src.gptimage.includes("couldn't edit the image right now"));
    check('magicstudio: friendly final catch', src.magicstudio.includes("couldn't generate the image right now"));
    check('imagine: provider-agnostic error (no Gemini name in user text)', !src.imagine.includes('Gemini may be'));

    // 3) Processing helper where work genuinely takes time
    check('study: style.processing used', src.study.includes("style.processing('Scanning document...')"));
    check('imagine: style.processing used', src.imagine.includes("style.processing('Creating your image...')"));
    check('processing output compact', style.processing('Creating your image...') === '⏳ Creating your image...');

    // 4) Payloads + quoted replies + channelInfo preserved
    const payloadChecks = [
        ['imagine', 'image: imageBuffer'],
        ['gptimage', 'image: resultImageBuffer'],
        ['magicstudio', 'image: imageBuffer'],
    ];
    for (const [f, needle] of payloadChecks) {
        check(`${f}: payload "${needle}" intact`, src[f].includes(needle));
    }
    check('quoted replies preserved in all AI sends', aiFiles.every(f => /quoted: message/.test(src[f])), 'some AI file lost its quoted reply');
    const channelFiles = ['ai', 'imagine', 'reply', 'rewrite', 'stt', 'study', 'summarize', 'voicesummary'];
    check('channelInfo spread preserved', channelFiles.every(f => src[f].includes('...channelInfo')), 'missing channelInfo spread');

    // 5) Branding
    check('no legacy bot names (KNIGHT-BOT) in AI files', aiFiles.every(f => !src[f].includes('KNIGHT-BOT')));
    check('imagine caption uses settings.botName', src.imagine.includes('settings.botName'));
    check('no hardcoded "Generated by Optimus Bot" in AI captions', !src.imagine.includes('Generated by Optimus Bot'));

    // 6) Metadata unchanged
    const expected = {
        ai: ['gpt', ['gemini']], gptimage: ['gptimage', ['gptimg', 'editimage', 'aiimage', 'gi']],
        imagine: ['imagine', []], magicstudio: ['magicstudio', ['magic', 'magicai', 'generate']],
        reply: ['reply', []], rewrite: ['rewrite', []], stt: ['stt', ['totext']],
        study: ['study', []], summarize: ['summarize', ['tldr']], voicesummary: ['voicesummary', ['vsum']]
    };
    for (const [f, [name, aliases]] of Object.entries(expected)) {
        check(`${f}: name "${name}" unchanged`, cmds[f].name === name, cmds[f].name);
        check(`${f}: aliases unchanged`, JSON.stringify(cmds[f].aliases) === JSON.stringify(aliases), JSON.stringify(cmds[f].aliases));
    }

    console.log(`\n${pass - fail}/${pass} AI checks passed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
    console.error('❌ smoke-ai crashed:', err);
    process.exit(1);
});
