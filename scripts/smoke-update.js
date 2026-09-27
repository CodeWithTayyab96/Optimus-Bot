// Verifies the .update runtime-state protection: data/, settings.js and
// baileys_store.json are backed up before the git reset/clean and restored
// afterwards, so mode, warnings, AFK, stats and config survive an update.
// Runs inside a temporary sandbox and never touches the real repo state.
// Usage: node scripts/smoke-update.js
const fs = require('fs');
const os = require('os');
const path = require('path');

const upd = require('../commands/owner/update');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'optimus-update-test-'));
const originalCwd = process.cwd();

let failures = 0;
function check(label, ok) {
    console.log(`${ok ? '✅' : '❌'} ${label}`);
    if (!ok) failures++;
}

const files = {
    'data/mode.json': JSON.stringify({ isPublic: false }, null, 2),
    'data/warnings.json': JSON.stringify({ '111222333444@g.us': { '100000000001@s.whatsapp.net': 2 } }, null, 2),
    'data/afk.json': JSON.stringify({ enabled: true, message: 'Away' }, null, 2),
    'data/messageStats.json': JSON.stringify({ '111222333444@g.us': { '100000000001@s.whatsapp.net': 7 } }, null, 2),
    'data/userGroupData.json': JSON.stringify({ antilink: {} }, null, 2),
    'settings.js': 'module.exports = { ownerNumber: "923701609799", prefix: "#" };\n',
    'baileys_store.json': JSON.stringify({ contacts: { x: { id: 'x' } } }, null, 2),
};

(async () => {
    try {
        process.chdir(sandbox);

        // 1. Create runtime state
        for (const [rel, content] of Object.entries(files)) {
            const full = path.join(sandbox, rel);
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, content);
        }

        // 2. Back up
        const backupDir = upd.backupRuntimeState();
        check('backup dir created under tmp/', fs.existsSync(backupDir));

        // 3. Simulate the destructive half of `git reset --hard` + `git clean -fd`:
        //    tracked data files reverted, untracked runtime files deleted.
        fs.rmSync(path.join(sandbox, 'data'), { recursive: true, force: true });
        fs.rmSync(path.join(sandbox, 'settings.js'), { force: true });
        fs.rmSync(path.join(sandbox, 'baileys_store.json'), { force: true });
        check('state destroyed before restore (simulation)', !fs.existsSync(path.join(sandbox, 'data')));

        // 4. Restore
        upd.restoreRuntimeState(backupDir);

        // 5. Verify every file is byte-identical
        let allMatch = true;
        for (const [rel, content] of Object.entries(files)) {
            const full = path.join(sandbox, rel);
            const ok = fs.existsSync(full) && fs.readFileSync(full, 'utf8') === content;
            if (!ok) { allMatch = false; console.log(`   mismatched: ${rel}`); }
        }
        check('all runtime files restored byte-identical', allMatch);

        // 6. Restored files are readable as JSON / requireable as JS
        const mode = JSON.parse(fs.readFileSync(path.join(sandbox, 'data/mode.json'), 'utf8'));
        check('mode.json restored (private mode intact)', mode.isPublic === false);
        const warnings = JSON.parse(fs.readFileSync(path.join(sandbox, 'data/warnings.json'), 'utf8'));
        check('warnings.json restored (2 warnings intact)', warnings['111222333444@g.us']['100000000001@s.whatsapp.net'] === 2);
        const stats = JSON.parse(fs.readFileSync(path.join(sandbox, 'data/messageStats.json'), 'utf8'));
        check('messageStats.json restored (7 messages intact)', stats['111222333444@g.us']['100000000001@s.whatsapp.net'] === 7);
        const settingsText = fs.readFileSync(path.join(sandbox, 'settings.js'), 'utf8');
        check('settings.js restored with custom prefix', settingsText.includes('prefix: "#"'));

        // 7. Backup cleanup
        fs.rmSync(backupDir, { recursive: true, force: true });
        check('backup dir cleaned up', !fs.existsSync(backupDir));
    } finally {
        process.chdir(originalCwd);
        fs.rmSync(sandbox, { recursive: true, force: true });
    }

    console.log(failures === 0 ? '\n✅ All update backup/restore checks passed' : `\n❌ ${failures} update check(s) failed`);
    process.exit(failures === 0 ? 0 : 1);
})();
