// Verifies the manual admin warning system is consistent:
// .warn writes warnings.json[chatId][userJid]; .warnings must read the same
// shape; .resetwarn clears it. Covers zero/one/multiple warnings, different
// groups, and different users in the same group.
// Usage: node scripts/smoke-warnings.js
const fs = require('fs');
const path = require('path');

const warningsPath = path.join(process.cwd(), 'data', 'warnings.json');

const warnCmd = require('../commands/admin/warn');
const warningsCmd = require('../commands/admin/warnings');
const resetwarnCmd = require('../commands/admin/resetwarn');

const G1 = '111222333444@g.us';
const G2 = '555666777888@g.us';
const USER_A = '100000000001@s.whatsapp.net';
const USER_B = '100000000002@s.whatsapp.net';
const BOT = '1234567890@s.whatsapp.net';

// Mock socket: admins pass checks; groupParticipantsUpdate is a no-op (kick at 3).
const sent = [];
const mockSock = {
    user: { id: '1234567890:1@s.whatsapp.net' },
    sendMessage: async (jid, content) => {
        sent.push({ jid, text: content?.text || '(no text)' });
        return { key: { id: 'mock' } };
    },
    groupMetadata: async () => ({
        participants: [
            { id: BOT, admin: 'admin' },
            { id: USER_A, admin: 'admin' },
            { id: USER_B, admin: 'admin' },
        ],
    }),
    groupParticipantsUpdate: async () => {},
};

function msgWithMention(chatId, sender, mentioned) {
    return {
        key: { remoteJid: chatId, fromMe: false, participant: sender, id: `W${Date.now()}${Math.random()}` },
        message: {
            extendedTextMessage: {
                text: '.warn',
                contextInfo: { mentionedJid: mentioned ? [mentioned] : [] },
            },
        },
    };
}

const extraFor = (chatId, senderId) => ({
    chatId,
    senderId,
    isGroup: true,
    prefix: '.',
    channelInfo: {},
    reply: async (content) => mockSock.sendMessage(chatId, typeof content === 'string' ? { text: content } : content),
});

let failures = 0;
function check(label, ok) {
    console.log(`${ok ? '✅' : '❌'} ${label}`);
    if (!ok) failures++;
}

async function lastReply() {
    return sent[sent.length - 1]?.text || '';
}

(async () => {
    // Backup and reset warnings.json
    const backup = fs.existsSync(warningsPath) ? fs.readFileSync(warningsPath, 'utf8') : null;
    fs.writeFileSync(warningsPath, JSON.stringify({}));

    try {
        // --- Zero warnings ---
        sent.length = 0;
        await warningsCmd.execute(mockSock, msgWithMention(G1, BOT, USER_A), [], extraFor(G1, BOT));
        check('zero warnings reports 0', /has 0 warning\(s\)/.test(await lastReply()));

        // --- One warning (warn once in G1) ---
        sent.length = 0;
        await warnCmd.execute(mockSock, msgWithMention(G1, BOT, USER_A), [], extraFor(G1, BOT));
        check('warn increments to 1', /Warning Count:\*? 1\/3/.test(await lastReply()));

        sent.length = 0;
        await warningsCmd.execute(mockSock, msgWithMention(G1, BOT, USER_A), [], extraFor(G1, BOT));
        check('.warnings sees 1 after one warn', /has 1 warning\(s\)/.test(await lastReply()));

        // --- Multiple warnings (warn twice more → 3 total) ---
        sent.length = 0;
        await warnCmd.execute(mockSock, msgWithMention(G1, BOT, USER_A), [], extraFor(G1, BOT));
        await warnCmd.execute(mockSock, msgWithMention(G1, BOT, USER_A), [], extraFor(G1, BOT));
        // Third warn triggers auto-kick at >= 3
        check('third warn auto-kicks', sent.some(s => /AUTO-KICK/.test(s.text)));

        sent.length = 0;
        await warningsCmd.execute(mockSock, msgWithMention(G1, BOT, USER_A), [], extraFor(G1, BOT));
        check('.warnings sees 0 after auto-kick clears', /has 0 warning\(s\)/.test(await lastReply()));

        // --- Different users in same group are independent ---
        sent.length = 0;
        await warnCmd.execute(mockSock, msgWithMention(G1, BOT, USER_B), [], extraFor(G1, BOT));
        await warningsCmd.execute(mockSock, msgWithMention(G1, BOT, USER_A), [], extraFor(G1, BOT));
        check('userA unaffected by userB warn (0)', /has 0 warning\(s\)/.test(await lastReply()));
        sent.length = 0;
        await warningsCmd.execute(mockSock, msgWithMention(G1, BOT, USER_B), [], extraFor(G1, BOT));
        check('userB has 1 warning in G1', /has 1 warning\(s\)/.test(await lastReply()));

        // --- Different groups are independent ---
        sent.length = 0;
        await warnCmd.execute(mockSock, msgWithMention(G2, BOT, USER_B), [], extraFor(G2, BOT));
        await warnCmd.execute(mockSock, msgWithMention(G2, BOT, USER_B), [], extraFor(G2, BOT));
        sent.length = 0;
        await warningsCmd.execute(mockSock, msgWithMention(G1, BOT, USER_B), [], extraFor(G1, BOT));
        check('userB still has 1 warning in G1 (group-scoped)', /has 1 warning\(s\)/.test(await lastReply()));
        sent.length = 0;
        await warningsCmd.execute(mockSock, msgWithMention(G2, BOT, USER_B), [], extraFor(G2, BOT));
        check('userB has 2 warnings in G2', /has 2 warning\(s\)/.test(await lastReply()));

        // --- resetwarn clears only the target in the current group ---
        sent.length = 0;
        await resetwarnCmd.execute(mockSock, msgWithMention(G2, BOT, USER_B), [], extraFor(G2, BOT));
        check('resetwarn clears G2 warnings', /Warnings Reset/.test(await lastReply()));
        sent.length = 0;
        await warningsCmd.execute(mockSock, msgWithMention(G2, BOT, USER_B), [], extraFor(G2, BOT));
        check('.warnings reports 0 after reset', /has 0 warning\(s\)/.test(await lastReply()));

        // resetwarn on a user with no warnings reports gracefully
        sent.length = 0;
        await resetwarnCmd.execute(mockSock, msgWithMention(G2, BOT, USER_A), [], extraFor(G2, BOT));
        check('resetwarn on zero-warning user is graceful', /has no warnings to reset/.test(await lastReply()));
    } finally {
        // Restore warnings.json exactly as it was
        if (backup !== null) {
            fs.writeFileSync(warningsPath, backup);
        } else {
            fs.rmSync(warningsPath, { force: true });
        }
    }

    console.log(failures === 0 ? '\n✅ All warnings checks passed' : `\n❌ ${failures} warnings check(s) failed`);
    process.exit(failures === 0 ? 0 : 1);
})();
