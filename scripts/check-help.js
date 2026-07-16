// Cross-checks every registered command against what help.js displays.
// A command counts as shown if its name or any alias appears as ".word" in the help text.
const { loadCommands } = require('../lib/commandLoader');
const fs = require('fs');
const path = require('path');

const commands = loadCommands();
const helpSrc = fs.readFileSync(path.join(__dirname, '../commands/general/help.js'), 'utf8');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const seen = new Set();
const missing = [];
for (const [, cmd] of commands) {
    if (seen.has(cmd.name)) continue;
    seen.add(cmd.name);
    const triggers = [cmd.name, ...(cmd.aliases || [])];
    const shown = triggers.some(t => new RegExp('\\.' + escapeRe(t) + '\\b', 'i').test(helpSrc));
    if (!shown) {
        missing.push(`${cmd.category}/${cmd.name}` + (cmd.aliases?.length ? ` (aliases: ${cmd.aliases.join(',')})` : ''));
    }
}
console.log('Unique commands:', seen.size);
console.log('Missing from help.js:', missing.length);
missing.sort().forEach(m => console.log('  -', m));
process.exit(0);
