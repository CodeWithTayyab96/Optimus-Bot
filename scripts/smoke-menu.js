// Smoke test for lib/messageStyle.js and the dynamic registry-driven menu
// (commands/general/help.js): style builders, permission-aware visibility,
// .help <command> details, long-message splitting and block atomicity.
// Usage: node scripts/smoke-menu.js
const style = require('../lib/messageStyle');
const help = require('../commands/general/help.js');
const { loadCommands } = require('../lib/commandLoader');

let failures = 0;
function check(label, ok, extra = '') {
    console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : extra}`);
    if (!ok) failures++;
}

// ---------------- style builders ----------------
check('success compact', style.success('Done') === '✅ Done');
check('error compact', style.error('Oops') === '❌ Oops');
check('warning compact', style.warning('Careful') === '⚠️ Careful');
check('info compact', style.info('Heads up') === 'ℹ️ Heads up');
check('processing', style.processing('Downloading') === '⏳ Downloading...');
check('completed aliases success', style.completed('Done') === style.success('Done'));

const errBox = style.error('Bad input', { box: true, usage: '.x <y>' });
check('error boxed has title bar', errBox.includes('╭━━〔 ❌ ERROR 〕━━╮'));
check('error boxed has usage', errBox.includes('Usage:') && errBox.includes('.x <y>'));
check('error boxed has footer', errBox.includes('╰━━━━━━━━━━━━━━━━━━━━━━╯'));

check('permission owner', style.permissionDenied('owner', { box: false }) === '👑 Only the bot owner can use this command.');
check('permission ownerOrSudo boxed', style.permissionDenied('ownerOrSudo').includes('╭━━〔 🔒 ACCESS DENIED 〕━━╮'));
check('permission admin', style.permissionDenied('admin', { box: false }) === '🛡️ Only group admins can use this command.');
check('permission group', style.permissionDenied('group', { box: false }).includes('groups'));
check('permission botAdmin', style.permissionDenied('botAdmin', { box: false }).includes('admin'));
check('notFound', style.notFound('User', { box: false }) === '❌ User not found.');
check('invalidInput with usage', style.invalidInput('Nope.', '.x <y>').includes('Usage:'));

// ---------------- splitting ----------------
const long = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
const chunks = style.splitLong(long, 200);
check('splitLong splits into chunks', chunks.length > 1 && chunks.every(c => c.length <= 200));
check('splitLong keeps lines whole', chunks.every(c => !c.split('\n').some(l => !/^line \d+$/.test(l))));

const blocks = ['AAAA', 'BBBB', 'CCCC', 'DDDD'];
const blockChunks = style.splitBlocks(blocks, 10);
check('splitBlocks keeps blocks atomic', blockChunks.every(c => c.split('\n\n').every(part => ['AAAA', 'BBBB', 'CCCC', 'DDDD'].includes(part))));
check('splitBlocks merges when possible', blockChunks.length === 2 && blockChunks[0].includes('AAAA') && blockChunks[1].includes('CCCC'));

// ---------------- dynamic menu ----------------
const commands = loadCommands();
const uniqueNames = new Set();
for (const [, cmd] of commands) uniqueNames.add(cmd.name);

const ownerMenu = help.buildMenuText({ isOwnerOrSudo: true, isAdmin: true });
const userMenu = help.buildMenuText({ isOwnerOrSudo: false, isAdmin: false });
const adminMenu = help.buildMenuText({ isOwnerOrSudo: false, isAdmin: true });

check('owner menu contains all commands', [...uniqueNames].every(n => new RegExp('✦\\s+' + n + '(\\s|$)').test(ownerMenu)));
check('owner menu has every category present in registry', [...new Set([...commands.values()].map(c => c.category))].every(c => ownerMenu.includes('「 ' + (help.categoryLabel(c)) + ' 」')));

const ownerOnly = [...uniqueNames].filter(n => commands.get(n).ownerOnly);
const adminOnly = [...uniqueNames].filter(n => commands.get(n).adminOnly);
check('normal user menu hides owner-only commands', ownerOnly.every(n => !new RegExp('✦\\s+' + n + '(\\s|$)').test(userMenu)));
check('admin menu hides owner-only commands too', ownerOnly.every(n => !new RegExp('✦\\s+' + n + '(\\s|$)').test(adminMenu)));
check('admin menu shows admin-only commands', adminOnly.every(n => new RegExp('✦\\s+' + n + '(\\s|$)').test(adminMenu)));
check('normal user menu hides admin-only commands', adminOnly.every(n => !new RegExp('✦\\s+' + n + '(\\s|$)').test(userMenu)));

// ---------------- .help <command> detail ----------------
const detail = help.buildCommandDetail('jid', { isOwnerOrSudo: true });
check('detail has name', detail.includes('Name     : jid'));
check('detail has category', detail.includes('Category : Owner'));
check('detail has description', detail.includes('Description:'));
check('detail has usage', detail.includes('Usage:'));
check('detail has aliases section', detail.includes('Aliases:'));
check('detail fallback for missing description', help.buildCommandDetail('ping', { isOwnerOrSudo: true }).includes('Description:'));

// hidden owner command queried by normal user → permission, not leak
const hidden = help.buildCommandDetail('jid', { isOwnerOrSudo: false });
check('owner command detail hidden from normal user', hidden === null);
const hiddenReply = help.buildCommandDetail('antidelete', { isOwnerOrSudo: false });
check('antidelete hidden from normal user', hiddenReply === null);

check('unknown command → null', help.buildCommandDetail('nonexistentxyz', { isOwnerOrSudo: true }) === null);

// ---------------- long menu splitting ----------------
const smallChunks = help.buildMenuChunks({ isOwnerOrSudo: true, isAdmin: true }, { maxLen: 600 });
check('menu splits under small maxLen', smallChunks.length > 1);
check('no chunk exceeds maxLen', smallChunks.every(c => c.length <= 600));
check('blocks never split across chunks', smallChunks.every(c => {
    const starts = c.match(/╭─「/g) || [];
    const ends = c.match(/╰────────────/g) || [];
    return starts.length === ends.length;
}));

// ---------------- mode reflected in header ----------------
const { readMode, setMode } = require('../lib/mode');
const modePath = require('path').join(process.cwd(), 'data', 'mode.json');
const modeBackup = require('fs').existsSync(modePath) ? require('fs').readFileSync(modePath, 'utf8') : null;
try {
    const original = readMode();
    setMode(true);
    check('menu shows public mode', help.buildMenuText({}).includes('Mode   : public'));
    setMode(false);
    check('menu shows private mode', help.buildMenuText({}).includes('Mode   : private'));
    setMode(original);
} finally {
    if (modeBackup !== null) require('fs').writeFileSync(modePath, modeBackup);
    else require('fs').rmSync(modePath, { force: true });
}

console.log(failures === 0 ? '\n✅ All menu/style smoke checks passed' : `\n❌ ${failures} menu/style check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
