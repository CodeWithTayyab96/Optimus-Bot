#!/usr/bin/env node
/**
 * Smoke test: the terminal message design system (lib/messageStyle.js)
 *
 * The design contract, and the ways plain text can break it:
 *   1. Card shape — bold module heading, rule, body. Never an emoji band.
 *   2. Module names — emoji/punctuation stripped, upper-cased, `.SYS` appended;
 *      a label that already ends `.SYS` is passed through untouched.
 *   3. Primitives — tags, quotes, KEY = VALUE fields, numbered entries.
 *   4. Gutter alignment — every field in a block shares one column.
 *   5. Dynamic values are never truncated, escaped or re-flowed: long names,
 *      special characters, markdown-ish text and multiline bodies all survive.
 *   6. Empty states — a record list with no records still says so.
 *   7. Width — rules and headings never exceed the phone-screen budget.
 *   8. No HTML, no ANSI, no colour codes, no generated images.
 *
 * Usage: node scripts/smoke-terminal.js
 */

const path = require('path');
const style = require(path.join(__dirname, '..', 'lib', 'messageStyle'));

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const WIDTH_RE = /^(?:╔═ OPTIMUS · |╔═ |OPTIMUS \/ )?(.{0,44})$/;
const BAD_CHARS = /[\u001b\u009b]|<[a-z/][^>]*>|\x1b\[[0-9;]*m/i;

// ── card shape ───────────────────────────────────────────────────────────────
console.log('\n=== card shape ===');
{
    const card = style.box('📸 STATUS CACHE', ['[01] AUTO-SAVE :: ENABLED']);
    const lines = card.split('\n');

    check('line 1 is the top border carrying the module name',
        /^╔═ OPTIMUS · STATUS_CACHE\.SYS ═*╗$/.test(lines[0]), lines[0]);
    check('line 2 is the framed body row',
        lines[1].startsWith('║ [01] AUTO-SAVE :: ENABLED') && lines[1].endsWith('║'), lines[1]);
    check('line 3 is the bottom border', /^╚═+╝$/.test(lines[2]), lines[2]);
    check('every box line shares one width', new Set(lines.map((l) => l.length)).size === 1, JSON.stringify(lines.map((l) => l.length)));
    check('no colour band anywhere', !/🟩|🟥|🟨|🟦|🟪/.test(card), card.slice(-40));
    check('a card has no trailing blank line', card.trimEnd() === card, JSON.stringify(card.slice(-20)));

    // The heading is a *single* line, never two, whatever the label.
    for (const label of ['A', 'B'.repeat(40), 'with  double  spaces', 'dots.and.dashes', '']) {
        const head = style.header(label)[0];
        check(`heading stays one line for ${JSON.stringify(label.slice(0, 18))}`, head.split('\n').length === 1 && head.startsWith('OPTIMUS / '), head);
    }
}

// ── module naming ────────────────────────────────────────────────────────────
console.log('\n=== module names ===');
{
    const cases = [
        ['ACCESS.SYS', 'ACCESS.SYS'],
        ['STATUS_CACHE.SYS', 'STATUS_CACHE.SYS'],
        ['STATUS CACHE', 'STATUS_CACHE.SYS'],
        ['📸 STATUS CACHE', 'STATUS_CACHE.SYS'],
        ['🔴 DOWNLOAD SOURCE DOWN', 'DOWNLOAD_SOURCE_DOWN.SYS'],
        ['FUN ZONE', 'FUN_ZONE.SYS'],
        ['x', 'X.SYS'],
        ['', 'SYSTEM.SYS'],
    ];
    for (const [input, want] of cases) {
        check(`moduleName(${JSON.stringify(input)})`, style.moduleName(input) === want, style.moduleName(input));
    }

    check('emoji never reaches the heading', !/📸|🔴|✅/.test(style.box('📸 ✅ STATUS', ['x']).split('\n')[0]));
    check('the rule tracks the heading length',
        style.header('STATUS_CACHE.SYS')[1].length >= 12 && style.header('STATUS_CACHE.SYS')[1].length <= 24,
        style.header('STATUS_CACHE.SYS')[1]);
}

// ── primitives ───────────────────────────────────────────────────────────────
console.log('\n=== primitives ===');
{
    check('tag()', style.tag('system', 'READY') === '[SYSTEM] READY');
    check('tag() with no content', style.tag('error') === '[ERROR]');
    check('tag() defaults to SYSTEM for unknown kinds', style.tag('nonsense', 'x') === '[SYSTEM] x');
    check('quote()', style.quote('Hello') === '> Hello');
    check('field()', style.field('Name', 'Ali') === '  NAME = Ali');
    check('field() is upper-cased', style.field('name', 'x') === '  NAME = x');
    check('entry() is zero-padded', style.entry(3, 'Save') === '[03] SAVE      :: undefined'
        || style.entry(3, 'Save', '') === '[03] SAVE      :: ', style.entry(3, 'Save', ''));

    // Gutter alignment across a block.
    const block = style.fields([['Name', 'Bilal'], ['Number', '+923007777777'], ['Items', '1']]);
    const colons = block.map((l) => l.indexOf('='));
    check('fields share one gutter', new Set(colons).size === 1, JSON.stringify(block));

    // Undefined / empty values are dropped rather than printed as "undefined".
    check('fields() drops undefined values', style.fields([['A', undefined], ['B', '1']]).length === 1, JSON.stringify(style.fields([['A', undefined], ['B', '1']])));
    check('fields() drops empty values', style.fields([['A', ''], ['B', '1']]).length === 1);
    check('fields() on empty input', style.fields([]).length === 0);

    check('state() discriminates four ways',
        [style.state(true), style.state(false), style.state('unknown'), style.state(undefined)].join(',') ===
        'ENABLED,DISABLED,UNKNOWN,UNAVAILABLE',
        [style.state(true), style.state(false), style.state('unknown'), style.state(undefined)].join(','));

    check('entries() numbers from one',
        style.entries([['a', '1'], ['b', '2']])[0].startsWith('[01]') && style.entries([['a', '1'], ['b', '2']])[1].startsWith('[02]'));

    const rec = style.record('CONTACT_ENTRY_01', [['Name', 'Bilal Ahmed']]);
    check('record() opens with a quote', rec[0] === '> CONTACT_ENTRY_01', rec[0]);
    check('record() carries its fields', rec[1] === '  NAME = Bilal Ahmed', rec[1]);
    // The gutter is per-block: one field is tight, several align together.
    check('a one-field block is not padded out',
        style.fields([['Name', 'x']])[0] === '  NAME = x', style.fields([['Name', 'x']])[0]);
    check('a multi-field block aligns', new Set(style.fields([['A', '1'], ['BBBB', '2']]).map((l) => l.indexOf('='))).size === 1, JSON.stringify(style.fields([['A', '1'], ['BBBB', '2']])));
}

// ── dynamic values survive ──────────────────────────────────────────────────
console.log('\n=== dynamic values ===');
{
    const LONG_NAME = 'A'.repeat(120);
    const card = style.box('RECORDS.SYS', style.record(`RECORD_${'0'.repeat(60)}`, [['Name', LONG_NAME], ['Number', '+860000000000000000']]));
    check('a very long value is not truncated', card.includes(LONG_NAME), card.slice(0, 120));
    check('a very long id is not truncated', card.includes('0'.repeat(60)));
    check('the heading is still short', card.split('\n')[0].length < 60, card.split('\n')[0]);

    // Special characters must pass through untouched.
    const special = 'Ali <script> & "co" · 100% → *bold* ~x~ `code`';
    check('special characters survive', style.field('Note', special).includes(special), style.field('Note', special));

    // Markdown-ish content from a user must not break the card.
    const body = ['**bold**', '_italic_', '~strike~', '`mono`', '```block```', '*'];
    const md = style.box('TEST.SYS', body);
    check('markdown-ish lines do not break the card', body.every((l) => md.includes(l)), md.slice(0, 120));

    // Multiline text is split, not collapsed.
    const multi = style.field('Note', 'line one\nline two');
    check('a multiline value keeps its lines', multi.includes('line one') && multi.includes('line two'), multi);

    // Number-ish values stay as given.
    check('numbers are not reformatted', style.field('Items', 0) === '  ITEMS = 0', style.field('Items', 0));
    check('false is rendered', style.field('Flag', false) === '  FLAG = false', style.field('Flag', false));

    // Newlines in a heading label cannot inject a second line.
    check('a newline in the label cannot split the heading',
        style.header('A\nB')[0].split('\n').length === 1, style.header('A\nB')[0]);
}

// ── empty states ─────────────────────────────────────────────────────────────
console.log('\n=== empty states ===');
{
    const empty = style.emptyResult('CONTACTS', `Try ${'status save on'}`);
    check('empty state says what was not found', empty.some((l) => l.includes('NO CONTACTS')), JSON.stringify(empty));
    check('empty state carries a hint', empty.some((l) => l.includes('status save on')), JSON.stringify(empty));
    check('empty state is a block, not a shrug', empty.length >= 2);

    const card = style.box('RECORDS.SYS', [...style.emptyResult('RECORDS'), style.tag('system', '0 RECORDS')]);
    check('an empty list still renders a full card', card.startsWith('╔═') && card.includes('RECORDS.SYS') && card.includes('0 RECORDS'), card.slice(0, 80));
}

// ── compatibility ────────────────────────────────────────────────────────────
console.log('\n=== WhatsApp compatibility ===');
{
    const samples = [
        style.permissionDenied('owner'),
        style.permissionDenied('admin', { box: false }),
        style.notFound('Category "ai"'),
        style.notFound('Category "ai"', { box: false }),
        style.invalidInput('Give me a phone number.', '.status allow 92…'),
        style.invalidInput('Use on or off.', '.dlstatus monitor off', { box: false }),
        style.success('Done.'),
        style.error('Failed.'),
        style.box('X.SYS', ['a', 'b']),
        style.card('Y.SYS', [style.quote('z')]),
    ];
    check('no ANSI escape in any sample', samples.every((s) => !BAD_CHARS.test(s)), samples.find((s) => BAD_CHARS.test(s)));
    check('no HTML tags in any sample', samples.every((s) => !/<\/?(b|i|u|br|div|span)\b/i.test(s)));
    // The width budget applies to structural lines — headings, numbered entries
    // and field gutters — measured inside the rail. Body sentences are left to
    // WhatsApp's own wrapping, which is what a phone actually does with them.
    const structural = samples.flatMap((s) => s.split('\n')
        .map((l) => l.replace(/^[║\s]+/, '').replace(/[║\s]+$/, ''))
        .filter((l) =>
            l.startsWith('OPTIMUS · ') || l.startsWith('OPTIMUS / ') ||
            /^\[\d{2}\] /.test(l) || /^ +[A-Z][A-Z ]* = /.test(l)));
    check('every structural line fits a phone', structural.every((l) => WIDTH_RE.test(l)),
        structural.find((l) => !WIDTH_RE.test(l)));
    const borders = samples.flatMap((s) => s.split('\n')).filter((l) => /^╔═.*╗$|^╚═+╝$/.test(l));
    check('box borders stay within the phone budget', borders.every((l) => l.length <= 48), borders.find((l) => l.length > 48));
    check('no structural line is wider than 44 columns', structural.every((l) => l.length <= 44), structural.find((l) => l.length > 44));
    check('usage hints are preserved verbatim', style.invalidInput('x', '.video <name or url>').includes('.video <name or url>'));
    check('the words ACCESS DENIED survive', style.permissionDenied('owner').includes('ACCESS DENIED'));
    check('the words NOT FOUND survive', style.notFound('X').includes('NOT FOUND'));
    check('the words INVALID INPUT survive', style.invalidInput('x').includes('INVALID INPUT'));

    // Long bodies chunk rather than overflow.
    const chunks = style.splitBlocks([style.box('BIG.SYS', new Array(400).fill('[01] ITEM :: VALUE'))], 3000);
    check('a huge menu chunks at block boundaries', chunks.length > 1 && chunks.every((c) => c.length <= 3000), `${chunks.length} chunks`);
    check('no chunk splits a heading from its first body line',
        chunks.every((c) => /╔═ OPTIMUS · [A-Z_.]+\.SYS ═*╗\n║/.test(c) || !c.includes('OPTIMUS · ')));
}

// ── splitting ────────────────────────────────────────────────────────────────
console.log('\n=== chunking ===');
{
    const chunks = style.splitLong(new Array(50).fill('x'.repeat(200)).join('\n'), 3000);
    check('splitLong respects the limit', chunks.every((c) => c.length <= 3000));
    check('splitLong does not lose data', chunks.join('\n').split('\n').length === 50);

    // Blocks are atomic: a chunk never starts mid-block, however the budget
    // happens to fall.
    const blocks = style.splitBlocks(['A'.repeat(100), 'B'.repeat(100), 'C'.repeat(100)], 210);
    check('splitBlocks keeps blocks atomic', blocks.every((b) => ['A', 'B', 'C'].includes(b[0])), JSON.stringify(blocks.map((b) => b.length)));
    check('splitBlocks respects the budget', blocks.every((b) => b.length <= 210), JSON.stringify(blocks.map((b) => b.length)));
    check('splitBlocks never loses a block', blocks.join('\n\n').split('\n\n').length >= 3, JSON.stringify(blocks.map((b) => b.length)));
}

console.log(`\n${pass - fail}/${pass} terminal checks passed`);
process.exit(fail === 0 ? 0 : 1);
