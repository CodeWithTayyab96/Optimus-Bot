// Verifies antibadword moderation:
//  - exact-word matching keeps analysis/analyst/analytical safe
//  - removed common words (pot, hell, damn) no longer trigger
//  - genuine bad words still trigger deletion
// Usage: node scripts/smoke-antibadword.js
const fs = require('fs');
const path = require('path');

const { handleBadwordDetection } = require('../lib/antibadword');
const userGroupDataPath = path.join(process.cwd(), 'data', 'userGroupData.json');

const GROUP = '111222333444@g.us';
const SENDER = '100000000001@s.whatsapp.net';
const BOT = '1234567890@s.whatsapp.net';

const sent = [];
const mockSock = {
    user: { id: '1234567890:1@s.whatsapp.net' },
    sendMessage: async (jid, content) => {
        sent.push(content);
        return { key: { id: 'mock' } };
    },
    groupMetadata: async () => ({
        participants: [
            { id: BOT, admin: 'admin' },
            { id: SENDER, admin: null },
        ],
    }),
};

function msg(text) {
    return {
        key: { remoteJid: GROUP, fromMe: false, participant: SENDER, id: 'M' + Math.random() },
        message: { conversation: text },
    };
}

let failures = 0;
function check(label, ok) {
    console.log(`${ok ? '✅' : '❌'} ${label}`);
    if (!ok) failures++;
}

function wasDeleted() {
    return sent.some(s => s && typeof s === 'object' && 'delete' in s);
}

(async () => {
    const backup = fs.existsSync(userGroupDataPath) ? fs.readFileSync(userGroupDataPath, 'utf8') : null;
    try {
        // Enable antibadword for the test group (delete action)
        fs.writeFileSync(userGroupDataPath, JSON.stringify({
            antibadword: { [GROUP]: { enabled: true, action: 'delete' } },
        }));

        const cases = [
            // [message, shouldBeDeleted, label]
            ['fuck this', true, 'genuine bad word still deleted'],
            ['madarchod', true, 'Hindi bad word still deleted'],
            ['you are an idiot', true, 'insult word still deleted'],
            ['analysis of the data', false, 'analysis does NOT trigger'],
            ['the analyst called', false, 'analyst does NOT trigger'],
            ['analytical thinking', false, 'analytical does NOT trigger'],
            ['a pot of tea on the stove', false, 'pot (innocent) does NOT trigger'],
            ['what the hell is going on', false, 'hell (innocent) does NOT trigger'],
            ['damn that was close', false, 'damn (innocent) does NOT trigger'],
            ['normal sentence with zero issues', false, 'normal sentence does NOT trigger'],
        ];

        for (const [text, expectDelete, label] of cases) {
            sent.length = 0;
            await handleBadwordDetection(mockSock, GROUP, msg(text), text, SENDER);
            await new Promise(r => setTimeout(r, 10));
            check(label, wasDeleted() === expectDelete);
        }
    } finally {
        if (backup !== null) fs.writeFileSync(userGroupDataPath, backup);
        else fs.rmSync(userGroupDataPath, { force: true });
    }

    console.log(failures === 0 ? '\n✅ All antibadword checks passed' : `\n❌ ${failures} antibadword check(s) failed`);
    process.exit(failures === 0 ? 0 : 1);
})();
