// Verifies lib/groupstats.js in-memory caching + periodic flush:
//  - getStats reflects unflushed in-memory adds immediately
//  - flush() persists to disk
//  - a fresh process (restart) reads the persisted data
// Usage: node scripts/smoke-groupstats.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dataDir = path.join(process.cwd(), 'data');
const statsPath = path.join(dataDir, 'groupStats.json');

const GROUP = '111222333444@g.us';
const USER_A = '100000000001@s.whatsapp.net';
const USER_B = '100000000002@s.whatsapp.net';

let failures = 0;
function check(label, ok) {
    console.log(`${ok ? '✅' : '❌'} ${label}`);
    if (!ok) failures++;
}

function inFreshProcess(expr) {
    return execFileSync(process.execPath, ['-e', expr], { encoding: 'utf8' }).trim();
}

const backup = fs.existsSync(statsPath) ? fs.readFileSync(statsPath, 'utf8') : null;

(async () => {
    try {
        fs.rmSync(statsPath, { force: true });

        // Fresh process: add messages, check live reads, flush, check file
        const out = inFreshProcess(`
            const gs = require('./lib/groupstats');
            gs.addMessage('${GROUP}', '${USER_A}');
            gs.addMessage('${GROUP}', '${USER_A}');
            gs.addMessage('${GROUP}', '${USER_B}', { mentions: ['${USER_A}'] });
            const live = gs.getStats('${GROUP}');
            const liveOk = live && live.total === 3 && live.users['${USER_A}'] === 2 && live.users['${USER_B}'] === 1 && live.mentioned['${USER_A}'] === 1;
            gs.flush().then(() => {
                const file = require('path').join(process.cwd(), 'data', 'groupStats.json');
                const onDisk = JSON.parse(require('fs').readFileSync(file, 'utf8'));
                const onDiskOk = onDisk['${GROUP}'] && Object.values(onDisk['${GROUP}'])[0].total === 3;
                console.log(JSON.stringify({ liveOk, onDiskOk, hasFile: require('fs').existsSync(file) }));
            });
        `);
        const first = JSON.parse(out);
        check('unflushed adds visible via getStats', first.liveOk === true);
        check('flush() persists stats to disk', first.onDiskOk === true && first.hasFile === true);

        // Restart: fresh process reads persisted data and keeps counting
        const out2 = inFreshProcess(`
            const gs = require('./lib/groupstats');
            gs.addMessage('${GROUP}', '${USER_A}'); // one more after restart
            console.log(JSON.stringify({ total: gs.getStats('${GROUP}').total }));
        `);
        const second = JSON.parse(out2);
        check('restart: persisted stats loaded and incremented', second.total === 4);

        // weekly stats aggregation works
        const out3 = inFreshProcess(`
            const gs = require('./lib/groupstats');
            const w = gs.getWeeklyStats('${GROUP}');
            console.log(JSON.stringify({ total: w.total, a: w.users['${USER_A}'] }));
        `);
        const weekly = JSON.parse(out3);
        check('weekly stats aggregate', weekly.total === 4 && weekly.a === 3);
    } finally {
        if (backup !== null) fs.writeFileSync(statsPath, backup);
        else fs.rmSync(statsPath, { force: true });
    }

    console.log(failures === 0 ? '\n✅ All groupstats checks passed' : `\n❌ ${failures} groupstats check(s) failed`);
    process.exit(failures === 0 ? 0 : 1);
})();
