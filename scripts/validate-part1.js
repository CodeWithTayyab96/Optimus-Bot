// Offline validation for the Part 1 refactor.
// Run: node scripts/validate-part1.js
const path = require('path');
const { loadCommands } = require('../lib/commandLoader');

const commands = loadCommands();

// Unique command objects
const unique = new Map();
for (const [key, cmd] of commands) {
    if (!unique.has(cmd)) unique.set(cmd, []);
    unique.get(cmd).push(key);
}

console.log(`\nRegistered trigger words: ${commands.size}`);
console.log(`Unique commands: ${unique.size}\n`);

// Expected triggers from the OLD main.js switch — every one of these must resolve.
const expectedTriggers = [
    'simage', 'kick', 'mute', 'unmute', 'ban', 'unban', 'help', 'menu', 'bot', 'list',
    'sticker', 's', 'warnings', 'warn', 'tts', 'tovoice', 'totext', 'stt', 'delete', 'del',
    'attp', 'settings', 'mode', 'anticall', 'pmblocker', 'owner', 'tagall', 'tagnotadmin',
    'hidetag', 'tag', 'antilink', 'antitag', 'meme', 'joke', 'quote', 'fact', 'weather',
    'news', 'ttt', 'tictactoe', 'move', 'topmembers', 'hangman', 'guess', 'trivia', 'answer',
    'compliment', 'insult', '8ball', 'lyrics', 'simp', 'stupid', 'itssostupid', 'iss',
    'dare', 'truth', 'clear', 'promote', 'demote', 'ping', 'alive', 'mention', 'setmention',
    'blur', 'welcome', 'goodbye', 'git', 'github', 'sc', 'script', 'repo', 'antibadword',
    'chatbot', 'take', 'steal', 'flirt', 'character', 'wasted', 'waste', 'ship', 'groupinfo',
    'infogp', 'infogrupo', 'resetlink', 'revoke', 'anularlink', 'staff', 'admins',
    'listadmin', 'tourl', 'url', 'emojimix', 'emix', 'tg', 'stickertelegram', 'tgsticker',
    'telesticker', 'vv', 'clearsession', 'clearsesi', 'autostatus', 'metallic', 'ice',
    'snow', 'impressive', 'matrix', 'light', 'neon', 'devil', 'purple', 'thunder', 'leaves',
    '1917', 'arena', 'hacker', 'sand', 'blackpink', 'glitch', 'fire', 'antidelete',
    'surrender', 'cleartmp', 'setpp', 'setgdesc', 'setgname', 'setgpp', 'instagram',
    'insta', 'ig', 'igsc', 'igs', 'fb', 'facebook', 'music', 'spotify', 'play', 'mp3',
    'ytmp3', 'song', 'video', 'ytmp4', 'tiktok', 'tt', 'gpt', 'gemini', 'rewrite', 'reply',
    'voicesummary', 'vsum', 'translate', 'trt', 'ss', 'ssweb', 'screenshot', 'areact',
    'autoreact', 'autoreaction', 'sudo', 'goodnight', 'lovenight', 'gn', 'shayari',
    'shayri', 'roseday', 'imagine', 'study', 'advice', 'riddle', 'roast', 'motivate',
    'motivation', 'summarize', 'tldr', 'jid', 'autotyping', 'autoread', 'heart', 'horny',
    'circle', 'lgbt', 'lolice', 'simpcard', 'tonikawa', 'its-so-stupid', 'namecard',
    'oogway', 'oogway2', 'tweet', 'ytcomment', 'comrade', 'gay', 'glass', 'jail', 'passed',
    'triggered', 'animu', 'nom', 'poke', 'cry', 'kiss', 'pat', 'hug', 'wink', 'facepalm',
    'animuquote', 'loli', 'crop', 'pies', 'china', 'indonesia', 'japan', 'korea', 'india',
    'malaysia', 'thailand', 'update', 'removebg', 'rmbg', 'nobg', 'remini', 'enhance',
    'upscale', 'textmaker'
];

const missing = expectedTriggers.filter(t => !commands.has(t));
if (missing.length) {
    console.log('❌ MISSING TRIGGERS:', missing.join(', '));
} else {
    console.log(`✅ All ${expectedTriggers.length} expected triggers resolve`);
}

// Shape check on every unique command
const REQUIRED = ['name', 'category', 'description', 'usage'];
const FLAGS = ['ownerOnly', 'modOnly', 'groupOnly', 'privateOnly', 'adminOnly', 'botAdminNeeded'];
let shapeErrors = 0;
for (const [cmd, keys] of unique) {
    for (const field of REQUIRED) {
        if (typeof cmd[field] !== 'string') {
            console.log(`❌ ${keys[0]}: missing/invalid '${field}'`);
            shapeErrors++;
        }
    }
    for (const flag of FLAGS) {
        if (typeof cmd[flag] !== 'boolean') {
            console.log(`❌ ${cmd.name || keys[0]}: flag '${flag}' is ${typeof cmd[flag]}`);
            shapeErrors++;
        }
    }
    if (!Array.isArray(cmd.aliases)) {
        console.log(`❌ ${cmd.name || keys[0]}: aliases not an array`);
        shapeErrors++;
    }
}
console.log(shapeErrors ? `❌ ${shapeErrors} shape errors` : '✅ All command objects have the full shape');

// Permission flag expectations (from old main.js gating)
const expectFlags = {
    mute: { adminOnly: true, botAdminNeeded: true },
    unmute: { adminOnly: true, botAdminNeeded: true },
    ban: { adminOnly: true, botAdminNeeded: true },
    unban: { adminOnly: true, botAdminNeeded: true },
    promote: { adminOnly: true, botAdminNeeded: true },
    demote: { adminOnly: true, botAdminNeeded: true },
    kick: { adminOnly: true, botAdminNeeded: true },
    tagall: { adminOnly: true, botAdminNeeded: true },
    tagnotadmin: { adminOnly: true, botAdminNeeded: true },
    hidetag: { botAdminNeeded: true, groupOnly: true },
    antilink: { botAdminNeeded: true, groupOnly: true },
    antitag: { botAdminNeeded: true, groupOnly: true },
    antibadword: { botAdminNeeded: true, groupOnly: true },
    setgdesc: { botAdminNeeded: true, groupOnly: true },
    chatbot: { adminOnly: true, groupOnly: true },
    welcome: { adminOnly: true, groupOnly: true },
    goodbye: { adminOnly: true, groupOnly: true },
    ship: { groupOnly: true },
    groupinfo: { groupOnly: true },
    resetlink: { groupOnly: true },
    staff: { groupOnly: true },
    mode: { ownerOnly: true },
    autostatus: { ownerOnly: true },
    antidelete: { ownerOnly: true },
    cleartmp: { ownerOnly: true },
    setpp: { ownerOnly: true },
    clearsession: { ownerOnly: true },
    areact: { ownerOnly: true },
    autotyping: { ownerOnly: true },
    autoread: { ownerOnly: true },
    pmblocker: { ownerOnly: true },
    anticall: { ownerOnly: true },
};
let flagErrors = 0;
for (const [trigger, flags] of Object.entries(expectFlags)) {
    const cmd = commands.get(trigger);
    if (!cmd) continue; // already reported as missing
    for (const [flag, val] of Object.entries(flags)) {
        if (cmd[flag] !== val) {
            console.log(`❌ ${trigger}: expected ${flag}=${val}, got ${cmd[flag]}`);
            flagErrors++;
        }
    }
}
console.log(flagErrors ? `❌ ${flagErrors} flag mismatches` : '✅ Permission flags match old gating');

// Secondary exports main.js/index.js depend on
const secondaryChecks = [
    ['owner/autotyping', ['handleAutotypingForMessage', 'showTypingAfterCommand']],
    ['owner/autoread', ['handleAutoread']],
    ['owner/antidelete', ['handleMessageRevocation', 'storeMessage']],
    ['owner/autostatus', ['handleStatusUpdate']],
    ['owner/pmblocker', ['readState']],
    ['owner/anticall', ['readState']],
    ['fun/tictactoe', ['handleTicTacToeMove']],
    ['fun/topmembers', ['incrementMessageCount']],
    ['admin/antitag', ['handleTagDetection']],
    ['admin/mention', ['handleMentionDetection']],
    ['admin/chatbot', ['handleChatbotResponse']],
    ['admin/welcome', ['handleJoinEvent']],
    ['admin/goodbye', ['handleLeaveEvent']],
    ['admin/promote', ['handlePromotionEvent']],
    ['admin/demote', ['handleDemotionEvent']],
    ['admin/antilink', ['handleLinkDetection']],
    ['general/stickercrop', ['stickercropFromBuffer']],
];
let secErrors = 0;
for (const [mod, fns] of secondaryChecks) {
    try {
        const m = require(path.join(__dirname, '..', 'commands', mod));
        for (const fn of fns) {
            if (typeof m[fn] !== 'function') {
                console.log(`❌ commands/${mod}: missing secondary export '${fn}'`);
                secErrors++;
            }
        }
    } catch (e) {
        console.log(`❌ commands/${mod}: require failed: ${e.message}`);
        secErrors++;
    }
}
console.log(secErrors ? `❌ ${secErrors} secondary-export errors` : '✅ All secondary exports intact');

// main.js must load cleanly
try {
    const main = require('../main.js');
    const ok = ['handleMessages', 'handleGroupParticipantUpdate', 'handleStatus']
        .every(k => typeof main[k] === 'function');
    console.log(ok ? '✅ main.js loads and exports handlers' : '❌ main.js exports incomplete');
} catch (e) {
    console.log('❌ main.js failed to load:', e.message);
}

process.exit(0);
