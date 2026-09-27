// Command registry verification (§25).
// Loads every command module in commands/ and confirms:
//   1. All 10 AI commands load with execute().
//   2. No duplicate command NAMES across the entire command tree.
//   3. No duplicate ALIASES across the entire command tree (AI aliases must be unique).
//   4. AI aliases are intact (match the canonical list).
//   5. All AI commands declare category === 'ai'.
// Usage: node scripts/verify-ai-registry.js

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const ROOT = path.join(__dirname, '..');
const COMMANDS_DIR = path.join(ROOT, 'commands');

function walk(dir, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, acc);
        else if (entry.isFile() && entry.name.endsWith('.js')) acc.push(full);
    }
    return acc;
}

const files = walk(COMMANDS_DIR);
const registry = [];
for (const file of files) {
    try {
        const mod = require(file);
        if (mod && typeof mod.execute === 'function') {
            registry.push({
                file,
                name: mod.name,
                aliases: Array.isArray(mod.aliases) ? mod.aliases : [],
                category: mod.category,
            });
        }
    } catch (e) {
        console.log('⚠️  could not load ' + path.relative(ROOT, file) + ': ' + e.message);
    }
}

// 1. All 10 AI command files present & loaded
const aiFiles = ['ai', 'gptimage', 'imagine', 'magicstudio', 'reply', 'rewrite', 'stt', 'study', 'summarize', 'voicesummary'];
const loadedAi = registry.filter(r => aiFiles.includes(path.basename(r.file, '.js')));
check('All 10 AI command files loaded', loadedAi.length === aiFiles.length, loadedAi.map(r => path.basename(r.file)).join(','));

// 2. No duplicate command names across the whole tree
const nameCounts = {};
for (const r of registry) if (r.name) nameCounts[r.name] = (nameCounts[r.name] || 0) + 1;
const dupNames = Object.entries(nameCounts).filter(([, c]) => c > 1).map(([n]) => n);
check('No duplicate command names across tree', dupNames.length === 0, dupNames.join(', '));

// 3. No duplicate aliases across the whole tree
const aliasCounts = {};
for (const r of registry) for (const a of r.aliases) aliasCounts[a] = (aliasCounts[a] || 0) + 1;
const dupAliases = Object.entries(aliasCounts).filter(([, c]) => c > 1).map(([a]) => a);
check('No duplicate aliases across tree', dupAliases.length === 0, dupAliases.join(', '));

// 4. AI aliases intact
const expectedAI = {
    ai: ['gemini'],
    gptimage: ['gptimg', 'editimage', 'aiimage', 'gi'],
    imagine: [],
    magicstudio: ['magic', 'magicai', 'generate'],
    openai: ['oai', 'customai', 'llm', 'custom'],
    reply: [],
    rewrite: [],
    stt: ['totext'],
    study: [],
    summarize: ['tldr'],
    voicesummary: ['vsum'],
};
for (const [f, al] of Object.entries(expectedAI)) {
    const r = registry.find(x => path.basename(x.file, '.js') === f);
    const ok = r && JSON.stringify(r.aliases.slice().sort()) === JSON.stringify(al.slice().sort());
    check(`AI ${f} aliases intact`, ok, r ? JSON.stringify(r.aliases) : 'missing');
}

// 5. AI commands declare category === 'ai'
const aiCatOk = loadedAi.every(r => r.category === 'ai');
check('All AI commands have category "ai"', aiCatOk, loadedAi.filter(r => r.category !== 'ai').map(r => path.basename(r.file)).join(','));

console.log(`\n── Registry: ${pass}/${pass + fail} checks passed ──`);
console.log(`   ${registry.length} command modules scanned`);
process.exit(fail > 0 ? 1 : 0);
