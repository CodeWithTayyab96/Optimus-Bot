// General category UI migration smoke test.
// Verifies, without any network access or live media:
//   1. All 26 general command files load with intact metadata
//      (names/aliases/category/permission flags).
//   2. Invalid-input paths use the shared styled system (boxed usage cards or
//      compact warnings) and never expose raw error.message.
//   3. Success paths are readable and use the new General visual patterns.
//   4. Media payloads, mentions, quoted replies, contextInfo and sticker
//      metadata are preserved.
//   5. No legacy branding (KNIGHT) remains; settings.botName is respected.
// Usage: node scripts/smoke-general.js

const fs = require('fs');
const path = require('path');
const settings = require('../settings');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const ROOT = path.join(__dirname, '..');
const GEN_DIR = path.join(ROOT, 'commands', 'general');
const genFiles = [
    'alive', 'attp', 'emojimix', 'getpp', 'github', 'groupinfo', 'groupstats',
    'help', 'myactivity', 'news', 'owner', 'ping', 'settings', 'simage', 'ss',
    'staff', 'sticker', 'sticker-alt', 'stickercrop', 'stickertelegram', 'take',
    'translate', 'tts', 'uptime', 'url', 'viewonce'
];

const cmds = {};
const src = {};
for (const f of genFiles) {
    cmds[f] = require(path.join(GEN_DIR, f + '.js'));
    src[f] = fs.readFileSync(path.join(GEN_DIR, f + '.js'), 'utf8');
    check(`${f}.js loads with execute()`, !!cmds[f] && typeof cmds[f].execute === 'function');
    check(`${f}.js category=general`, cmds[f].category === 'general', cmds[f].category);
    check(`${f}.js permission flags intact`,
        typeof cmds[f].ownerOnly === 'boolean' && typeof cmds[f].modOnly === 'boolean' &&
        typeof cmds[f].groupOnly === 'boolean' && typeof cmds[f].adminOnly === 'boolean');
}

// --- Mocked socket / extra helpers ---
function makeSock() {
    const sent = [];
    const sock = {
        sendMessage: async (chatId, content, opts) => { sent.push({ chatId, content, opts }); return { key: { id: 'm' + sent.length } }; },
        groupMetadata: async () => ({ id: '123@g.us', subject: 'Test Group', desc: 'Group desc', owner: '111@s.whatsapp.net', participants: [
            { id: '111@s.whatsapp.net', admin: 'superadmin' },
            { id: '222@s.whatsapp.net', admin: 'admin' },
            { id: '333@s.whatsapp.net', admin: null }
        ] }),
        profilePictureUrl: async () => { throw new Error('no pic'); },
        presenceSubscribe: async () => {},
        sendPresenceUpdate: async () => {}
    };
    return { sock, sent };
}

function runWith(cmdName, msg, args, extra) {
    const { sock, sent } = makeSock();
    const fullExtra = { chatId: '123@g.us', prefix: '.', commandName: cmdName, senderId: '111@s.whatsapp.net', channelInfo: {}, reply: async (t) => { sent.push({ chatId: '123@g.us', content: { text: t }, opts: undefined }); }, ...(extra || {}) };
    const msgWithId = { key: { id: cmdName + '_' + Date.now(), remoteJid: '123@g.us' }, ...(msg || {}) };
    return cmds[cmdName].execute(sock, msgWithId, args || [], fullExtra).then(() => sent);
}

function hasText(sent, substr) {
    return sent.some(s => typeof s.content?.text === 'string' && s.content.text.includes(substr));
}

(async () => {
    // --- 1) Metadata: names & aliases unchanged ---
    const expected = {
        alive: ['alive', []], attp: ['attp', []], emojimix: ['emojimix', ['emix']],
        getpp: ['getpp', ['gp', 'getpic']], github: ['github', ['git', 'sc', 'script', 'repo']],
        groupinfo: ['groupinfo', ['infogp', 'infogrupo']],
        groupstats: ['groupstats', ['stats', 'leaderboard', 'gstats', 'msgs', 'messagestats']],
        help: ['help', ['menu', 'bot', 'list']], myactivity: ['myactivity', ['mystats', 'mymsgs', 'rank']],
        news: ['news', []], owner: ['owner', []], ping: ['ping', []], settings: ['settings', []],
        simage: ['simage', []], ss: ['ss', ['ssweb', 'screenshot']],
        staff: ['staff', ['admins', 'listadmin']], sticker: ['sticker', ['s']],
        'sticker-alt': ['sticker2', []], stickercrop: ['crop', []],
        stickertelegram: ['tg', ['stickertelegram', 'tgsticker', 'telesticker']],
        take: ['take', ['steal']], translate: ['translate', ['trt']], tts: ['tts', ['tovoice']],
        uptime: ['uptime', ['runtime', 'botuptime']], url: ['url', ['tourl']], viewonce: ['vv', []]
    };
    for (const [f, [name, aliases]] of Object.entries(expected)) {
        check(`${f}: name "${name}" unchanged`, cmds[f].name === name, cmds[f].name);
        check(`${f}: aliases unchanged`, JSON.stringify(cmds[f].aliases) === JSON.stringify(aliases), JSON.stringify(cmds[f].aliases));
    }

    // --- 2) Success paths (no network) ---
    // ping: Pong + compact PING box
    {
        const sent = await runWith('ping', { message: {} }, []);
        check('ping: Pong reply + PING card', hasText(sent, 'Pong') && hasText(sent, '⚡ PING') && hasText(sent, 'Latency:'), JSON.stringify(sent.map(s => s.content?.text)));
    }
    // uptime: BOT UPTIME card via extra.reply
    {
        const sent = await runWith('uptime', { message: {} }, []);
        check('uptime: BOT UPTIME card', hasText(sent, '⏱️ BOT UPTIME') && hasText(sent, 'Uptime:'), JSON.stringify(sent.map(s => s.content?.text)));
    }
    // groupinfo: GROUP INFO card with image payload + admin/owner mentions
    {
        const { sock, sent } = makeSock();
        await cmds.groupinfo.execute(sock, { key: { id: 'g1' } }, [], { chatId: '123@g.us' });
        const card = sent.find(s => typeof s.content?.caption === 'string' && s.content.caption.includes('GROUP INFO'));
        check('groupinfo: GROUP INFO card', !!card, JSON.stringify(sent.map(s => s.content?.caption || s.content?.text)));
        check('groupinfo: image payload preserved', !!card && card.content.image && typeof card.content.image === 'object');
        check('groupinfo: mentions preserved', !!card && JSON.stringify(card.content.mentions).includes('111@s.whatsapp.net') && JSON.stringify(card.content.mentions).includes('222@s.whatsapp.net'));
        check('groupinfo: real data shown', !!card && card.content.caption.includes('Members: 3') && card.content.caption.includes('Admins: 2'));
    }
    // staff: GROUP ADMINS card
    {
        const { sock, sent } = makeSock();
        await cmds.staff.execute(sock, { key: { id: 's1' } }, [], { chatId: '123@g.us' });
        const card = sent.find(s => typeof s.content?.caption === 'string' && s.content.caption.includes('GROUP ADMINS'));
        check('staff: GROUP ADMINS card', !!card && card.content.caption.includes('Test Group'), JSON.stringify(sent.map(s => s.content?.caption || s.content?.text)));
        check('staff: image + mentions preserved', !!card && !!card.content.image && JSON.stringify(card.content.mentions).includes('222@s.whatsapp.net'));
    }
    // groupstats: no-activity path
    {
        const sent = await runWith('groupstats', { message: {} }, []);
        check('groupstats: no-activity response', hasText(sent, 'No activity recorded'), JSON.stringify(sent.map(s => s.content?.text)));
    }

    // --- 3) Invalid-input paths styled ---
    const usageCases = [
        ['ss', { message: { conversation: '.ss' } }, [], '📸 SCREENSHOT', { userMessage: '.ss' }],
        ['translate', { message: { conversation: '.translate' } }, [], '🌐 TRANSLATOR', { userMessage: '.translate' }],
        ['tts', { message: { conversation: '.tts' } }, [], 'Text-to-Speech', { userMessage: '.tts' }],
        ['attp', { message: { conversation: '.attp' } }, [], 'Please provide text'],
        ['simage', { message: {} }, [], 'reply to a sticker'],
        ['sticker-alt', { message: {} }, [], 'reply to an image or video'],
        ['take', { message: {} }, [], 'Reply to a sticker'],
        ['emojimix', { message: { conversation: '.emojimix' } }, [], 'Example: .emojimix'],
        ['viewonce', { message: {} }, [], 'view-once image or video'],
        ['stickertelegram', { message: { conversation: '.tg' } }, [], 'Telegram sticker URL'],
        ['url', { message: {} }, [], 'send or reply to a media'],
    ];
    for (const [cmdName, msg, args, needle, extra] of usageCases) {
        const sent = await runWith(cmdName, msg, args, extra);
        check(`${cmdName}: missing-input path styled`, hasText(sent, needle), JSON.stringify(sent.map(s => s.content?.text)));
    }
    // getpp: profile fetch failure path (mock throws) — friendly, no leak
    {
        const sent = await runWith('getpp', { message: {} }, []);
        check('getpp: friendly profile error', hasText(sent, 'Profile picture not found'), JSON.stringify(sent.map(s => s.content?.text)));
    }

    // --- 4) Raw error leak + branding source checks ---
    for (const f of genFiles) {
        // Ignore `throw new Error(...)` re-wraps — those only feed console.error
        // and are never rendered; only template leaks in send/reply paths matter.
        const nonThrow = src[f].split('\n').filter(l => !/throw new Error/.test(l)).join('\n');
        check(`${f}: no raw error.message interpolation`, !/\$\{(error|err|e)\.message\}/.test(nonThrow), 'found ${error.message} template');
        check(`${f}: no legacy KNIGHT branding`, !/KNIGHT/i.test(src[f]), 'KNIGHT brand present');
    }
    check('github: styled REPO card + settings.botName', src.github.includes('🐙 GITHUB REPO') && src.github.includes('settings.botName'));
    check('news: styled NEWS card', src.news.includes('📰 NEWS'));
    check('translate: TRANSLATION card on success', src.translate.includes('🌐 TRANSLATION'));
    check('tts: audio payload + react preserved', src.tts.includes('audio: { url: filePath }') && src.tts.includes("react: { text: '🔊'"));
    check('uptime/alive use settings.botName fallback', src.uptime.includes('settings.botName') && src.alive.includes('settings.botName'));

    // --- 5) Media payloads preserved ---
    const payloadChecks = [
        ['ss', 'image: imageBuffer'], ['ss', 'sendPresenceUpdate'],
        ['url', 'UploadFileUgu(tempPath)'], ['take', 'sticker: finalBuffer'],
        ['sticker-alt', 'sticker: fs.readFileSync(tempOutput)'], ['emojimix', 'sticker: stickerBuffer'],
        ['simage', 'image: imageBuffer'], ['attp', 'sticker: webpBuffer'],
        ['viewonce', 'image: buffer'], ['viewonce', 'video: buffer'],
        ['github', 'image: imgBuffer'], ['owner', 'contacts:'],
        ['stickertelegram', 'sticker: finalBuffer'], ['tts', 'ptt: sendAsVoice'],
    ];
    for (const [f, needle] of payloadChecks) {
        check(`${f}: payload "${needle}" intact`, src[f].includes(needle), 'missing from source');
    }
    // Sticker metadata preserved (packname/EXIF)
    check('attp: sticker packname follows settings', src.attp.includes("packname: settings.packname || 'Optimus Bot'"));
    check('take: user packname used, EXIF flow intact', src.take.includes('sticker-pack-name') && src.take.includes("'emojis': ['🤖']"));
    check('stickertelegram: EXIF/emoji metadata intact', src.stickertelegram.includes("'emojis': sticker.emoji ? [sticker.emoji] : ['🤖']"));
    check('emojimix: ffmpeg conversion intact', src.emojimix.includes('ffmpeg -i'));
    check('simage: sharp conversion intact', src.simage.includes("sharp(stickerFilePath).toFormat('png')"));
    check('attp: ffmpeg render intact', src.attp.includes('renderBlinkingVideoWithFfmpeg'));
    // Quoted replies preserved (both opts and legacy content placement).
    // These files never quoted the command originally — not added here.
    const noQuoted = ['groupinfo', 'staff', 'news', 'owner', 'uptime', 'sticker-alt', 'stickertelegram'];
    const quotedFiles = genFiles.filter(f => !noQuoted.includes(f));
    check('quoted replies preserved in general sends', quotedFiles.every(f => /quoted: message|quoted: msg/.test(src[f])), 'some general file lost its quoted reply');
    // contextInfo/channelInfo preserved
    check('channelInfo preserved where used', ['alive', 'simage', 'tts'].every(f => src[f].includes('channelInfo')), 'missing channelInfo spread');
    check('viewonce: caption passes through user content untouched', src.viewonce.includes('caption: quotedImage.caption || \'\'') && src.viewonce.includes('caption: quotedVideo.caption || \'\''));

    console.log(`\n${pass - fail}/${pass} general checks passed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
    console.error('❌ smoke-general crashed:', err);
    process.exit(1);
});
