#!/usr/bin/env node
/**
 * Smoke test: every outgoing status line uses the shared message design system.
 *
 * Two things drift back otherwise:
 *   1. a command hand-rolls "❌ Failed…" and the chat stops looking like one bot;
 *   2. lib/notify.js classifies by the `[TAG]` prefix, so an untagged progress
 *      line is treated as essential and bypasses coalescing — i.e. it spams.
 *
 * Entirely static; no commands are executed.
 * Usage: node scripts/smoke-style-consistency.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COMMANDS = path.join(ROOT, 'commands');
const style = require(path.join(ROOT, 'lib', 'messageStyle'));
const notify = require(path.join(ROOT, 'lib', 'notify'));

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const RAW = /\b(?:text\s*:|\breply\s*\()\s*['"`][✅❌⚠ℹ⏳]/u;
const HAS_STYLE_CALL = /\b(?:style|msgStyle)\.(?:success|error|warning|info|processing|invalidInput|box|card)\s*\(/;
const HAS_REQUIRE = /require\(['"][^'"]*lib\/messageStyle['"]\)/;

const files = [];
for (const cat of fs.readdirSync(COMMANDS).sort()) {
    const dir = path.join(COMMANDS, cat);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
        files.push({ file: path.join(dir, f), rel: `commands/${cat}/${f}` });
    }
}

(async () => {
    console.log('\n=== no raw emoji status lines left ===');
    {
        const offenders = [];
        for (const { file, rel } of files) {
            const src = fs.readFileSync(file, 'utf8');
            const lines = src.split('\n');
            lines.forEach((line, i) => {
                if (RAW.test(line)) offenders.push(`${rel}:${i + 1} ${line.trim().slice(0, 110)}`);
            });
        }
        check('all command status lines go through messageStyle',
            offenders.length === 0, offenders.slice(0, 8).join(' | '));
        console.log(`   scanned ${files.length} command files`);
    }

    console.log('\n=== every style consumer imports the module ===');
    {
        const missing = [];
        for (const { file, rel } of files) {
            const src = fs.readFileSync(file, 'utf8');
            if (HAS_STYLE_CALL.test(src) && !HAS_REQUIRE.test(src)) missing.push(rel);
        }
        check('no command calls a style helper without requiring it',
            missing.length === 0, missing.join(', '));
    }

    console.log('\n=== tags actually drive the outbound governor ===');
    {
        const tagged = style.processing('Clearing bot messages...');
        check('processing() produces a [PROCESS] line', /^\[PROCESS\] /.test(tagged), tagged);
        check('a tagged progress line is classified as progress',
            notify.classify({ text: tagged }) === 'progress');
        check('the old untagged form was classified as essential (the regression)',
            notify.classify({ text: '⏳ Clearing bot messages...' }) === 'essential');

        for (const [fn, label] of [
            [style.error, 'ERROR'], [style.success, 'SUCCESS'],
            [style.warning, 'WARNING'], [style.info, 'INFO'],
        ]) {
            check(`${label} lines are tagged`, fn('test').startsWith(`[${label}] `));
        }
        check('tagged errors are never suppressible',
            notify.classify({ text: style.error('Failed to get advice. Try again!') }) === 'essential');
        check('tagged warnings are never suppressible',
            notify.classify({ text: style.warning('No game in progress') }) === 'essential');
    }

    console.log('\n=== no hard-coded emoji prefix inside the design system ===');
    {
        const src = fs.readFileSync(path.join(ROOT, 'lib', 'messageStyle.js'), 'utf8');
        check('messageStyle still emits tags, not emoji prefixes',
            /const TAGS = Object\.freeze/.test(src) && /function tag\(/.test(src));
    }

    console.log(`\n${pass - fail}/${pass} style-consistency checks passed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
    console.error('❌ smoke-style-consistency crashed:', err);
    process.exit(1);
});
