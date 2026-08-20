// Verifies the messageCount.json split:
//  - one-time migration from legacy data/messageCount.json into
//    data/mode.json + data/messageStats.json
//  - .mode public/private switching via the real command
//  - message counting + .topmembers
//  - persistence across a simulated restart (separate process)
// Usage: node scripts/smoke-mode-stats.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dataDir = path.join(process.cwd(), 'data');
const modeFile = path.join(dataDir, 'mode.json');
const statsFile = path.join(dataDir, 'messageStats.json');
const legacyFile = path.join(dataDir, 'messageCount.json');

const GROUP = '111222333444@g.us';
const USER_A = '100000000001@s.whatsapp.net';
const USER_B = '100000000002@s.whatsapp.net';

let failures = 0;
function check(label, ok) {
    console.log(`${ok ? '✅' : '❌'} ${label}`);
    if (!ok) failures++;
}

function backup(file) {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}
function restore(file, content) {
    if (content === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, content);
}

// Runs an expression in a fresh node process (simulates a restart / fresh boot).
function inFreshProcess(expr) {
    return execFileSync(process.execPath, ['-e', expr], { encoding: 'utf8' }).trim();
}

const mockSock = {
    user: { id: '1234567890:1@s.whatsapp.net' },
    sendMessage: async (jid, content) => {
        return { key: { id: 'mock' } };
    },
};
const sent = [];
mockSock.sendMessage = async (jid, content) => {
    sent.push({ jid, text: content?.text || '(no text)' });
    return { key: { id: 'mock' } };
};

(async () => {
    const bMode = backup(modeFile);
    const bStats = backup(statsFile);
    const bLegacy = backup(legacyFile);

    try {
        // ---- Seed legacy file, remove new files ----
        fs.rmSync(modeFile, { force: true });
        fs.rmSync(statsFile, { force: true });
        fs.writeFileSync(legacyFile, JSON.stringify({
            isPublic: false, // private mode to prove migration carries it
            messageCount: {},
            [GROUP]: { [USER_A]: 7, [USER_B]: 3 }, // legacy group counts
        }));

        // ---- Fresh process: migration must run and persist ----
        const out1 = inFreshProcess(`
            const mode = require('./lib/mode');
            const stats = require('./lib/messageStats');
            mode.readMode();
            const g = stats.getGroupStats('${GROUP}');
            console.log(JSON.stringify({ isPublic: mode.readMode(), counts: g }));
        `);
        const migrated = JSON.parse(out1);
        check('mode migrates from legacy file', migrated.isPublic === false);
        check('group counts migrate from legacy file', migrated.counts[USER_A] === 7 && migrated.counts[USER_B] === 3);
        check('mode.json written after migration', fs.existsSync(modeFile));
        check('messageStats.json written after migration', fs.existsSync(statsFile));

        // ---- Restart: state must persist (fresh process reads files, no legacy) ----
        const out2 = inFreshProcess(`
            const mode = require('./lib/mode');
            const stats = require('./lib/messageStats');
            stats.increment('${GROUP}', '${USER_A}'); // +1 after "restart"
            stats.flush().then(() => {
                console.log(JSON.stringify({ isPublic: mode.readMode(), a: stats.getGroupStats('${GROUP}')[${JSON.stringify(USER_A)}] }));
            });
        `);
        const restarted = JSON.parse(out2);
        check('mode survives restart', restarted.isPublic === false);
        check('counts survive restart and continue incrementing', restarted.a === 8);

        // ---- .mode switching via the real command ----
        const modeCmd = require('../commands/owner/mode');
        sent.length = 0;
        await modeCmd.execute(mockSock, { key: { remoteJid: 'x' } }, [], {
            chatId: '111222333444@s.whatsapp.net',
            channelInfo: {},
        });
        check('.mode with no args shows current mode', sent.some(s => /private/.test(s.text)));

        sent.length = 0;
        await modeCmd.execute(mockSock, { key: { remoteJid: 'x' } }, ['public'], {
            chatId: '111222333444@s.whatsapp.net',
            channelInfo: {},
        });
        check('.mode public switches mode', sent.some(s => /now in \*public\* mode/.test(s.text)));
        const fresh = JSON.parse(inFreshProcess(`console.log(require('./lib/mode').readMode())`));
        check('mode.json updated to public', fresh === true);

        sent.length = 0;
        await modeCmd.execute(mockSock, { key: { remoteJid: 'x' } }, ['private'], {
            chatId: '111222333444@s.whatsapp.net',
            channelInfo: {},
        });
        const fresh2 = JSON.parse(inFreshProcess(`console.log(require('./lib/mode').readMode())`));
        check('.mode private persists', fresh2 === false);

        // ---- .topmembers output via the real command ----
        const topCmd = require('../commands/fun/topmembers');
        sent.length = 0;
        await topCmd.execute(mockSock, { key: { remoteJid: GROUP } }, [], {
            chatId: GROUP,
            isGroup: true,
        });
        const topText = sent.map(s => s.text).join('\n');
        check('.topmembers lists migrated counts', topText.includes('@100000000001 - 8 messages'));
        check('.topmembers lists second member', topText.includes('@100000000002 - 3 messages'));

        // topmembers in a private chat is refused
        sent.length = 0;
        await topCmd.execute(mockSock, { key: { remoteJid: 'x' } }, [], {
            chatId: 'x@s.whatsapp.net',
            isGroup: false,
        });
        check('.topmembers refused outside groups', sent.some(s => /only available in group chats/.test(s.text)));
    } finally {
        restore(modeFile, bMode);
        restore(statsFile, bStats);
        restore(legacyFile, bLegacy);
    }

    console.log(failures === 0 ? '\n✅ All mode/stats checks passed' : `\n❌ ${failures} mode/stats check(s) failed`);
    process.exit(failures === 0 ? 0 : 1);
})();
