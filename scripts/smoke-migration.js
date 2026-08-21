// Migration smoke test: verifies the Admin/Owner UI migration kept behavior
// intact while adopting the shared message style:
//   - admin success / permission error / invalid usage
//   - owner success / permission error
//   - mentions and quoted-message resolution preserved
//   - no command disappeared from the registry
// Usage: node scripts/smoke-migration.js
const fs = require('fs');
const path = require('path');
const style = require('../lib/messageStyle');
const { loadCommands } = require('../lib/commandLoader');

const GROUP = '111222333444@g.us';
const ADMIN = '100000000001@s.whatsapp.net';
const TARGET = '100000000002@s.whatsapp.net';
const NORMAL = '100000000099@s.whatsapp.net';
const BOT_ID = '1234567890:1@s.whatsapp.net';
const BOT_LID = '1400000000000000:1@lid';

let failures = 0;
function check(label, ok, extra = '') {
    console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : extra}`);
    if (!ok) failures++;
}

// --- shared mocks ---
// Realistic group participant (id + distinct lid) so empty-LID comparisons
// in kick's bot-detection and lib/isAdmin never collapse.
function participant(jid, lid, admin) {
    const p = { id: jid, lid };
    if (admin) p.admin = admin;
    return p;
}

function captureSock(participants, overrides = {}) {
    const sent = [];
    const sock = {
        user: { id: BOT_ID, lid: BOT_LID },
        sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'mock' } }; },
        groupMetadata: async () => ({ participants }),
        groupParticipantsUpdate: async () => {},
        updateBlockStatus: async () => {},
        ...overrides
    };
    return { sock, sent };
}

function msg(chatId, sender, contextInfo = {}) {
    return {
        key: { remoteJid: chatId, fromMe: false, participant: sender, id: `M${Date.now()}${Math.random()}` },
        message: { extendedTextMessage: { text: '.cmd', contextInfo } }
    };
}

const extraFor = (chatId, senderId) => ({
    chatId,
    senderId,
    isGroup: true,
    isSenderAdmin: true,
    senderIsSudo: false,
    prefix: '.',
    channelInfo: {},
    userMessage: '.cmd',
    reply: async (content) => ({ content }),
});

const allAdmins = [
    participant(BOT_ID.split(':')[0] + '@s.whatsapp.net', '1400000000000000:1@lid', 'admin'),
    participant(ADMIN, '1400000000000001:1@lid', 'admin'),
    participant(TARGET, '1400000000000002:1@lid'),
];

(async () => {
    // backup runtime files the commands touch
    const bannedPath = path.join(process.cwd(), 'data', 'banned.json');
    const bannedBackup = fs.existsSync(bannedPath) ? fs.readFileSync(bannedPath, 'utf8') : null;
    const modePath = path.join(process.cwd(), 'data', 'mode.json');
    const modeBackup = fs.existsSync(modePath) ? fs.readFileSync(modePath, 'utf8') : null;
    const userGroupDataPath = path.join(process.cwd(), 'data', 'userGroupData.json');
    const ugdBackup = fs.existsSync(userGroupDataPath) ? fs.readFileSync(userGroupDataPath, 'utf8') : null;

    try {
        // ---------------- Admin: success (mention) with mentions intact ----------------
        const banCmd = require('../commands/admin/ban');
        const { sock: sockBan, sent: sentBan } = captureSock(allAdmins);
        await banCmd.execute(sockBan, msg(GROUP, ADMIN, { mentionedJid: [TARGET] }), [], extraFor(GROUP, ADMIN));
        const banMsg = sentBan[sentBan.length - 1];
        check('ban success uses ✅ style', banMsg && /^✅ /.test(banMsg.content.text));
        check('ban keeps mentions', banMsg && Array.isArray(banMsg.content.mentions) && banMsg.content.mentions.includes(TARGET));

        // ---------------- Admin: success via quoted message ----------------
        const { sock: sockBanQ, sent: sentBanQ } = captureSock(allAdmins);
        await banCmd.execute(sockBanQ, msg(GROUP, ADMIN, { participant: TARGET, stanzaId: 'q1', quotedMessage: { conversation: 'hi' } }), [], extraFor(GROUP, ADMIN));
        const banQMsg = sentBanQ[sentBanQ.length - 1];
        check('ban quoted-message target resolved + mentioned', banQMsg && Array.isArray(banQMsg.content.mentions) && banQMsg.content.mentions.includes(TARGET));

        // ---------------- Admin: invalid usage ----------------
        const { sock: sockBanBad, sent: sentBanBad } = captureSock(allAdmins);
        await banCmd.execute(sockBanBad, msg(GROUP, ADMIN), [], extraFor(GROUP, ADMIN));
        check('ban invalid usage is actionable', sentBanBad.length > 0 && /Please mention the user/.test(sentBanBad[sentBanBad.length - 1].content.text));

        // ---------------- Admin: permission error (sender not admin) ----------------
        const warnCmd = require('../commands/admin/warn');
        const senderNotAdmin = [
            participant(BOT_ID.split(':')[0] + '@s.whatsapp.net', '1400000000000000:1@lid', 'admin'),
            participant(NORMAL, '1400000000000003:1@lid'),
        ];
        const { sock: sockWarn, sent: sentWarn } = captureSock(senderNotAdmin);
        await warnCmd.execute(sockWarn, msg(GROUP, NORMAL, { mentionedJid: [TARGET] }), [], extraFor(GROUP, NORMAL));
        const warnMsg = sentWarn[sentWarn.length - 1];
        check('warn permission error for non-admin', warnMsg && /Only group admins/.test(warnMsg.content.text));

        // ---------------- Admin: bot-admin error ----------------
        const noBotAdmin = [
            participant(ADMIN, '1400000000000001:1@lid', 'admin'),
            participant(TARGET, '1400000000000002:1@lid'),
        ];
        const { sock: sockWarn2, sent: sentWarn2 } = captureSock(noBotAdmin);
        await warnCmd.execute(sockWarn2, msg(GROUP, ADMIN, { mentionedJid: [TARGET] }), [], extraFor(GROUP, ADMIN));
        const warnMsg2 = sentWarn2[sentWarn2.length - 1];
        check('warn bot-admin error', warnMsg2 && /Please make the bot an admin/.test(warnMsg2.content.text));

        // ---------------- Admin: kick keeps mentions ----------------
        const kickCmd = require('../commands/admin/kick');
        const { sock: sockKick, sent: sentKick } = captureSock(allAdmins);
        await kickCmd.execute(sockKick, msg(GROUP, ADMIN, { mentionedJid: [TARGET] }), [], extraFor(GROUP, ADMIN));
        const kickMsg = sentKick[sentKick.length - 1];
        check('kick success uses ✅ style', kickMsg && /^✅ /.test(kickMsg.content.text));
        check('kick keeps mentions', kickMsg && Array.isArray(kickMsg.content.mentions) && kickMsg.content.mentions.includes(TARGET));

        // ---------------- Owner: mode success + invalid ----------------
        const modeCmd = require('../commands/owner/mode');
        const { sock: sockMode, sent: sentMode } = captureSock(allAdmins);
        await modeCmd.execute(sockMode, msg(GROUP, ADMIN, {}), ['public'], extraFor(GROUP, ADMIN));
        check('mode success uses ✅ style', sentMode.length > 0 && /^✅ /.test(sentMode[sentMode.length - 1].content.text));

        const { sock: sockModeBad, sent: sentModeBad } = captureSock(allAdmins);
        await modeCmd.execute(sockModeBad, msg(GROUP, ADMIN, {}), ['banana'], extraFor(GROUP, ADMIN));
        check('mode invalid usage is actionable', sentModeBad.length > 0 && /Invalid mode/.test(sentModeBad[sentModeBad.length - 1].content.text));

        // ---------------- Owner: permission error ----------------
        const updateCmd = require('../commands/owner/update');
        const { sock: sockUpd, sent: sentUpd } = captureSock(allAdmins);
        await updateCmd.execute(sockUpd, msg(GROUP, NORMAL, {}), [], extraFor(GROUP, NORMAL));
        check('update permission error for non-owner', sentUpd.length > 0 && /owner or sudo/.test(sentUpd[sentUpd.length - 1].content.text));

        // ---------------- Style sanity ----------------
        check('error formatting compact', style.error('x') === '❌ x');
        check('success formatting compact', style.success('x') === '✅ x');

        // ---------------- No command disappeared ----------------
        const commands = loadCommands();
        const unique = new Set();
        for (const [, cmd] of commands) unique.add(cmd.name);
        check(`registry has expected unique commands (expected >= 144, got ${unique.size})`, unique.size >= 144, ` (got ${unique.size})`);
        for (const name of ['ban', 'unban', 'warn', 'warnings', 'resetwarn', 'kick', 'promote', 'demote', 'mute', 'unmute', 'delete', 'clear', 'antilink', 'antitag', 'antibadword', 'welcome', 'goodbye', 'pending', 'grouplink', 'resetlink', 'groupstatus', 'chatbot', 'mode', 'jid', 'sudo', 'broadcast', 'setprefix', 'setbotname', 'setnewsletter', 'setmenuimage', 'setpp', 'afk', 'pair', 'pmblocker', 'update', 'restart', 'antidelete', 'autoread', 'autostatus', 'autotyping', 'areact', 'block', 'unblock', 'clearsession', 'cleartmp']) {
            check(`command "${name}" still registered`, commands.has(name));
        }
        check('setgdesc (groupmanage.js) still registered', commands.has('setgdesc'));
        check('setgname alias still registered', commands.has('setgname'));
        check('setgpp alias still registered', commands.has('setgpp'));
    } finally {
        // restore runtime files
        if (bannedBackup !== null) fs.writeFileSync(bannedPath, bannedBackup); else fs.rmSync(bannedPath, { force: true });
        if (modeBackup !== null) fs.writeFileSync(modePath, modeBackup); else fs.rmSync(modePath, { force: true });
        if (ugdBackup !== null) fs.writeFileSync(userGroupDataPath, ugdBackup); else fs.rmSync(userGroupDataPath, { force: true });
    }

    console.log(failures === 0 ? '\n✅ All migration smoke checks passed' : `\n❌ ${failures} migration check(s) failed`);
    process.exit(failures === 0 ? 0 : 1);
})();
