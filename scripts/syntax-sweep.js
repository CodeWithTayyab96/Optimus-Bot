// Fast syntax sweep — compiles every project JS file with vm.Script inside a
// SINGLE node process (no per-file spawn). Does not execute any module.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DIRS = ['lib', 'commands', 'scripts', '__tests__'];

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules') continue;
            walk(p, out);
        } else if (e.isFile() && p.endsWith('.js')) {
            out.push(p);
        }
    }
    return out;
}

let files = [];
for (const d of DIRS) files = files.concat(walk(path.join(ROOT, d)));
// root-level .js files
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.js')) files.push(path.join(ROOT, e.name));
}

let ok = 0;
const bad = [];
for (const f of files) {
    try {
        const code = fs.readFileSync(f, 'utf8');
        new vm.Script(code, { filename: f });
        ok++;
    } catch (err) {
        bad.push(`${f} — ${err.message}`);
    }
}

console.log(`checked=${files.length}  syntax_ok=${ok}  failures=${bad.length}`);
for (const b of bad) console.log('  FAIL ' + b);
process.exit(bad.length > 0 ? 1 : 0);
