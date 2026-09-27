// Aggregated test runner used by `npm test`.
// 1. Syntax-checks every project JS file (excluding node_modules).
// 2. Runs the command-loader/help coverage check and every smoke test.
// Cleans up runtime artifacts the tests legitimately create so the tree stays tidy.
// Usage: node scripts/run-tests.js
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const NODE = process.execPath;

let failures = 0;
let ran = 0;

function run(label, cmd, args) {
    ran++;
    const res = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    const ok = res.status === 0;
    console.log(`${ok ? '✅' : '❌'} ${label}`);
    if (!ok) {
        failures++;
        console.log((res.stdout || '') + (res.stderr || ''));
    }
    return ok;
}

// --- 1. Syntax check all project JS ---
function jsFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...jsFiles(full));
        else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
}

const files = jsFiles(ROOT);
let syntaxOk = true;
for (const f of files) {
    const res = spawnSync(NODE, ['--check', f], { encoding: 'utf8' });
    if (res.status !== 0) {
        syntaxOk = false;
        console.log(`❌ syntax: ${path.relative(ROOT, f)}\n${res.stderr}`);
    }
}
ran++;
if (syntaxOk) console.log(`✅ syntax check (${files.length} files)`);
else failures++;

// --- 1b. Clean stale artifacts from prior interrupted runs ---
for (const rel of ['data/afk.json', 'data/groupStats.json', 'data/mode.json', 'data/messageStats.json', 'data/messageCount.json']) {
    fs.rmSync(path.join(ROOT, rel), { force: true });
}

// --- 2. Functional checks ---
const checks = [
    ['help coverage (all 143 commands documented)', NODE, ['scripts/check-help.js']],
    ['dispatch smoke', NODE, ['scripts/smoke-dispatch.js']],
    ['prefix-swap smoke', NODE, ['scripts/smoke-setprefix.js']],
    ['game routing smoke', NODE, ['scripts/smoke-games.js']],
    ['spread smoke', NODE, ['scripts/smoke-spread.js']],
    ['warnings smoke', NODE, ['scripts/smoke-warnings.js']],
    ['mode/stats smoke', NODE, ['scripts/smoke-mode-stats.js']],
    ['groupstats smoke', NODE, ['scripts/smoke-groupstats.js']],
    ['owner identification smoke', NODE, ['scripts/smoke-owner.js']],
    ['antibadword smoke', NODE, ['scripts/smoke-antibadword.js']],
    ['update backup/restore smoke', NODE, ['scripts/smoke-update.js']],
    ['jid resolver smoke', NODE, ['scripts/smoke-jid.js']],
    ['menu/style smoke', NODE, ['scripts/smoke-menu.js']],
    ['admin/owner migration smoke', NODE, ['scripts/smoke-migration.js']],
    ['media UI smoke', NODE, ['scripts/smoke-media.js']],
    ['AI UI smoke', NODE, ['scripts/smoke-ai.js']],
    ['fun/games UI smoke', NODE, ['scripts/smoke-fun-games.js']],
    ['general UI smoke', NODE, ['scripts/smoke-general.js']],
    ['anime UI smoke', NODE, ['scripts/smoke-anime.js']],
    ['textmaker UI smoke', NODE, ['scripts/smoke-textmaker.js']],
    ['cache smoke', NODE, ['scripts/smoke-cache.js']],
    ['model availability smoke', NODE, ['scripts/smoke-models.js']],
    ['AI config smoke', NODE, ['scripts/smoke-ai-config.js']],
    ['Shadow→Optimus port smoke', NODE, ['scripts/smoke-shadow-ports.js']],
];
for (const [label, cmd, args] of checks) {
    run(label, cmd, args);
}

// --- 3. Clean runtime artifacts created by tests ---
for (const rel of ['data/afk.json', 'data/groupStats.json', 'data/mode.json', 'data/messageStats.json']) {
    fs.rmSync(path.join(ROOT, rel), { force: true });
}

console.log(`\n${ran - failures}/${ran} checks passed`);
process.exit(failures === 0 ? 0 : 1);
