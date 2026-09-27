// Cross-checks the dynamic menu generated from the command registry:
//   1. Every registered command name appears as a menu entry (✦ name)
//      for a viewer who can see everything (owner/sudo).
//   2. .help <command> resolves for every command from its own metadata.
//   3. Permission filtering hides owner-only commands from normal users.
//   4. No menu chunk exceeds the safe size and blocks are never split.
const { loadCommands } = require('../lib/commandLoader');
const help = require('../commands/general/help.js');

const commands = loadCommands();

// --- 1. Owner view: every unique command name must be a menu entry ---
const ownerMenu = help.buildMenuText({ isOwnerOrSudo: true, isAdmin: true });

const seen = new Set();
const missing = [];
let total = 0;
for (const [, cmd] of commands) {
    if (seen.has(cmd.name)) continue;
    seen.add(cmd.name);
    total++;
    if (!new RegExp('✦\\s+' + cmd.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)').test(ownerMenu)) {
        missing.push(`${cmd.category}/${cmd.name}`);
    }
}
console.log('Unique commands:', total);
console.log('Missing from owner menu:', missing.length);
missing.sort().forEach(m => console.log('  -', m));

// --- 2. Detail view resolves from metadata for every command ---
const detailFailures = [];
const detailSeen = new Set();
for (const [, cmd] of commands) {
    if (detailSeen.has(cmd.name)) continue;
    detailSeen.add(cmd.name);
    const detail = help.buildCommandDetail(cmd.name, { isOwnerOrSudo: true });
    if (!detail || !detail.includes(cmd.name)) {
        detailFailures.push(cmd.name);
    }
}
console.log('Detail failures:', detailFailures.length);
detailFailures.forEach(m => console.log('  -', m));

// --- 3. Normal user menu hides owner-only commands ---
const userMenu = help.buildMenuText({ isOwnerOrSudo: false, isAdmin: false });
const leaked = [];
for (const [, cmd] of commands) {
    if (!seen.has(cmd.name)) continue;
    if (cmd.ownerOnly && new RegExp('✦\\s+' + cmd.name + '(\\s|$)').test(userMenu)) {
        leaked.push(cmd.name);
    }
}
console.log('Owner-only commands leaked to normal users:', leaked.length);
leaked.forEach(m => console.log('  -', m));

// --- 4. Chunk sizing + block atomicity ---
const chunks = help.buildMenuChunks({ isOwnerOrSudo: true }, { maxLen: 3000 });
const badChunks = chunks.filter(c => c.length > 3000);
let splitBlock = false;
for (const c of chunks) {
    for (const part of c.split('\n\n')) {
        if (part.includes('✦') && !/^\*[^\n]+\*/.test(part)) splitBlock = true;
    }
}
console.log('Menu chunks:', chunks.length, '| oversized:', badChunks.length, '| split blocks:', splitBlock ? 'YES' : 'no');

const ok = missing.length === 0 && detailFailures.length === 0 && leaked.length === 0
    && badChunks.length === 0 && !splitBlock;
console.log(ok ? '✅ help coverage OK' : '❌ help coverage FAILED');
process.exit(ok ? 0 : 1);
