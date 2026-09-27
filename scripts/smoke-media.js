// Media UI migration smoke test.
// Verifies, without any network access:
//   1. All 14 media commands load with intact metadata (name/aliases/category/permissions).
//   2. Missing-input / invalid-URL paths reply with the shared styled system
//      (boxed INVALID INPUT with usage, compact errors, no leaked internal errors).
//   3. Media payload keys (audio/video/image/sticker/document/caption/mimetype) are intact.
//   4. Branding: no hardcoded newsletter JID in media files, no foreign brand names,
//      captions use settings.botName / messageConfig.channelInfo.
// Usage: node scripts/smoke-media.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const style = require('../lib/messageStyle');
const messageConfig = require('../lib/messageConfig');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const ROOT = path.join(__dirname, '..');
const MEDIA_DIR = path.join(ROOT, 'commands', 'media');
const mediaFiles = [
    'facebook', 'igs', 'img-blur', 'instagram', 'lyrics', 'pinterest', 'play',
    'remini', 'removebg', 'song', 'spotify', 'tiktok', 'twitter', 'video',
    // Shadow-port downloaders
    'mediafire', 'apk', 'capcut', 'threads', 'soundcloud', 'ytsearch'
];

const cmds = {};
for (const f of mediaFiles) {
    const mod = require(path.join(MEDIA_DIR, f + '.js'));
    cmds[f] = mod;
    check(`${f}.js loads with execute()`, !!mod && typeof mod.execute === 'function');
    check(`${f}.js has name`, typeof mod.name === 'string' && mod.name.length > 0);
    check(`${f}.js category=media`, mod.category === 'media');
    check(`${f}.js permission flags intact`,
        typeof mod.ownerOnly === 'boolean' && typeof mod.modOnly === 'boolean' &&
        typeof mod.groupOnly === 'boolean' && typeof mod.adminOnly === 'boolean');
}

// --- Styled responses via mocked sockets (no network) ---
async function runWith(cmdName, msg, args, extra) {
    const sent = [];
    const sock = {
        sendMessage: async (chatId, content, opts) => { sent.push({ chatId, content, opts }); },
        react: async () => {}
    };
    const fullExtra = { chatId: '123@g.us', prefix: '.', reply: async (t) => { sent.push({ chatId: '123@g.us', content: { text: t }, opts: undefined }); }, ...(extra || {}) };
    const msgWithId = { key: { id: cmdName + '_' + Date.now() + '_' + Math.random() }, ...(msg || {}) };
    if (msgWithId.key && !msgWithId.key.remoteJid) msgWithId.key.remoteJid = '123@g.us';
    await cmds[cmdName].execute(sock, msgWithId, args || [], fullExtra);
    return sent;
}

function hasText(sent, substr) {
    return sent.some(s => typeof s.content?.text === 'string' && s.content.text.includes(substr));
}

(async () => {
    // 1) Missing-input / invalid-URL styled replies
    const usageCases = [
        ['song', { message: {} }, [], '.song <song name or YouTube link>'],
        ['play', { message: { conversation: '.music' } }, [], '.music <song name>'],
        ['video', { message: { conversation: '.video' } }, [], '.video <name or url>'],
        ['instagram', { message: { conversation: '.instagram' } }, [], '.instagram <url>'],
        ['facebook', { message: { conversation: '.facebook' } }, [], '.facebook <url>'],
        ['igs', { message: { conversation: '.igs' } }, [], '.igs <url> | .igsc <url>'],
        ['spotify', { message: { conversation: '.spotify' } }, [], '.spotify <song/artist/keywords>'],
        ['tiktok', { message: { conversation: '.tiktok' } }, [], '.tiktok <url>'],
        // Shadow-port downloaders
        ['mediafire', { message: {} }, [], '.mediafire <mediafire link>'],
        ['apk', { message: {} }, [], '.apk <package name>'],
        ['soundcloud', { message: {} }, [], '.soundcloud <query>'],
        ['ytsearch', { message: {} }, [], '.ytsearch <query>'],
    ];
    for (const [cmdName, msg, args, usage] of usageCases) {
        const sent = await runWith(cmdName, msg, args);
        check(`${cmdName}: invalid input boxed with usage`, hasText(sent, 'INVALID INPUT') && hasText(sent, 'Usage:') && hasText(sent, usage), JSON.stringify(sent.map(s => s.content?.text)));
    }

    // twitter + pinterest use extra.reply
    let sent = await runWith('twitter', { message: {} }, []);
    check('twitter: missing URL boxed invalid input', hasText(sent, 'INVALID INPUT') && hasText(sent, '.twitter <url>'), JSON.stringify(sent.map(s => s.content?.text)));
    sent = await runWith('pinterest', { message: {} }, []);
    check('pinterest: usage card', hasText(sent, 'PINTEREST') && hasText(sent, 'Usage:') && hasText(sent, '.pinterest <Pinterest URL>'), JSON.stringify(sent.map(s => s.content?.text)));
    sent = await runWith('pinterest', { message: {} }, ['not-a-pin']);
    check('pinterest: invalid pin URL styled', hasText(sent, 'INVALID INPUT') && hasText(sent, 'valid Pinterest pin URL'), JSON.stringify(sent.map(s => s.content?.text)));

    // image tools
    sent = await runWith('remini', { message: {} }, ['not-a-url'], { userMessage: '.remini not-a-url' });
    check('remini: invalid URL styled', hasText(sent, 'INVALID INPUT') && hasText(sent, '.remini <image_url>'), JSON.stringify(sent.map(s => s.content?.text)));
    sent = await runWith('removebg', { message: {} }, ['not-a-url'], {});
    check('removebg: invalid URL styled', hasText(sent, 'INVALID INPUT') && hasText(sent, '.removebg <image_url>'), JSON.stringify(sent.map(s => s.content?.text)));
    sent = await runWith('img-blur', { message: {} }, []);
    check('img-blur: no-image directive styled', hasText(sent, 'Please reply to an image or send an image with caption .blur'), JSON.stringify(sent.map(s => s.content?.text)));

    // lyrics: exported handler with empty title
    {
        const sentLyrics = [];
        const sock = { sendMessage: async (c, content, o) => { sentLyrics.push(content); } };
        await cmds.lyrics.lyricsCommand(sock, '123@g.us', '', { key: { id: 'lyr1' } });
        check('lyrics: missing title styled', sentLyrics.some(m => typeof m.text === 'string' && m.text.includes('INVALID INPUT') && m.text.includes('.lyrics <song title>')), JSON.stringify(sentLyrics));
    }

    // 2) Failure path: no internal error leaked (play.js crashes pre-parse on empty message)
    sent = await runWith('play', { message: {} }, []);
    const playErr = sent.map(s => s.content?.text).find(t => typeof t === 'string' && t.toLowerCase().includes('failed'));
    check('play: failure styled, no stack/internal leak',
        !!playErr && playErr === '❌ Download failed. Please try again later.' &&
        !JSON.stringify(sent).includes('TypeError') && !JSON.stringify(sent).includes('at '),
        JSON.stringify(sent.map(s => s.content?.text)));

    // 3) processing helper still compact
    check('style.processing compact', style.processing('Fetching your audio...') === '⏳ Fetching your audio...', style.processing('Fetching your audio...'));

    // 4) Media payload keys intact in source
    const src = {};
    for (const f of mediaFiles) src[f] = fs.readFileSync(path.join(MEDIA_DIR, f + '.js'), 'utf8');
    const payloadChecks = [
        ['song', 'audio: normalized.buffer'],
        ['song', 'ptt: false'],
        ['song', 'mimetype: normalized.mimetype'],
        ['play', 'audio: normalized.buffer'],
        ['play', 'mimetype: normalized.mimetype'],
        ['video', 'video: { url:'],
        ['video', "mimetype: 'video/mp4'"],
        ['instagram', 'video: { url: mediaUrl }'],
        ['instagram', 'image: { url: mediaUrl }'],
        ['facebook', 'video: videoBuffer'],
        ['igs', 'sticker: finalSticker'],
        ['pinterest', 'video: videoBuffer'],
        ['pinterest', 'image: { url: mediaUrl }'],
        ['remini', 'image: imageResponse.data'],
        ['removebg', 'image: response.data'],
        ['spotify', 'audio: { url: audioUrl }'],
        ['tiktok', 'video: videoBuffer'],
        ['twitter', 'video: videoBuffer'],
        ['img-blur', 'image: blurredImage'],
        // Shadow-port downloaders
        ['mediafire', 'document: { url: direct }'],
        ['apk', "mimetype: 'application/vnd.android.package-archive'"],
        ['capcut', 'UNAVAILABLE'],
        ['threads', 'UNAVAILABLE'],
        ['soundcloud', 'searchSoundCloud'],
        ['ytsearch', 'yts(query)'],
    ];
    for (const [f, needle] of payloadChecks) {
        check(`${f}: payload "${needle}" intact`, src[f].includes(needle), 'missing from source');
    }
    check('quoted message preserved in media sends', mediaFiles.every(f => /quoted: (message|msg)/.test(src[f])), 'some media file lost its quoted reply');

    // 5) Branding
    check('no hardcoded newsletter JID in media files', mediaFiles.every(f => !src[f].includes('120363000000000000')), 'found hardcoded newsletter JID');
    check('no foreign brand name (KNIGHT-BOT) in media files', mediaFiles.every(f => !src[f].includes('KNIGHT-BOT')), 'KNIGHT-BOT still present');
    check('image tool captions use settings.botName', src.remini.includes('settings.botName') && src.removebg.includes('settings.botName') && src['img-blur'].includes('settings.botName'));
    check('messageConfig.channelInfo getter returns contextInfo', !!messageConfig.channelInfo.contextInfo && messageConfig.channelInfo.contextInfo.forwardingScore === 1 && !!messageConfig.channelInfo.contextInfo.forwardedNewsletterMessageInfo);

    // 6) No command removed / names & aliases unchanged
    const expectedNames = {
        facebook: 'facebook', igs: 'igs', 'img-blur': 'blur', instagram: 'instagram',
        lyrics: 'lyrics', pinterest: 'pinterest', play: 'music', remini: 'remini',
        removebg: 'removebg', song: 'song', spotify: 'spotify', tiktok: 'tiktok',
        twitter: 'twitter', video: 'video',
        mediafire: 'mediafire', apk: 'apk', capcut: 'capcut', threads: 'threads',
        soundcloud: 'soundcloud', ytsearch: 'ytsearch'
    };
    for (const [f, name] of Object.entries(expectedNames)) {
        check(`${f}: name "${name}" unchanged`, cmds[f].name === name, cmds[f].name);
    }
    const expectedAliases = {
        song: ['play', 'mp3', 'ytmp3'], video: ['ytmp4'], instagram: ['insta', 'ig'],
        facebook: ['fb'], igs: ['igsc'], pinterest: ['pin', 'pindl', 'pinterestdl'],
        remini: ['enhance', 'upscale'], removebg: ['rmbg', 'nobg'], tiktok: ['tt'],
        twitter: ['x', 'xdl', 'twitterdl', 'twdl'],
        mediafire: ['mfdl'], apk: ['apkdl'], capcut: ['capcutdl'], threads: ['threadsdl'],
        soundcloud: ['scsearch', 'soundcloudsearch'], ytsearch: ['yts']
    };
    for (const [f, aliases] of Object.entries(expectedAliases)) {
        check(`${f}: aliases unchanged`, JSON.stringify(cmds[f].aliases) === JSON.stringify(aliases), JSON.stringify(cmds[f].aliases));
    }

    console.log(`\n${pass - fail}/${pass} media checks passed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
    console.error('❌ smoke-media crashed:', err);
    process.exit(1);
});
