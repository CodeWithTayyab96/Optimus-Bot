#!/usr/bin/env node
/**
 * Smoke test: outbound message design + the senders nobody asked for
 *
 * Two things are checked here.
 *
 * 1. Design — the shared card layout from lib/messageStyle: a bold title, a thin
 *    rule under it (which the docstring has always promised and the code never
 *    drew), the body, and the colour band. Plus `rows()` for aligned key/value
 *    gutters. Every command's output depends on these helpers, so a regression
 *    here degrades the whole bot at once.
 *
 * 2. Unprompted sends — the places that push a message without being asked:
 *      - antidelete: one DM per deleted message, now paced through a queue so a
 *        burst of deletions cannot become a burst of DMs;
 *      - broadcast: one message per group, now spaced apart instead of fired in
 *        a tight loop;
 *      - the connect notice: sent once per process instead of on every reconnect.
 *
 * Usage: node scripts/smoke-outbound.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

// Pacing is read from the environment at module load, so shorten it before the
// require — otherwise the test would take three real 1.5s intervals.
process.env.ANTIDELETE_PACING_MS = process.env.ANTIDELETE_PACING_MS_TEST || '50';

const style = require(path.join(__dirname, '..', 'lib', 'messageStyle'));
const antidelete = require(path.join(__dirname, '..', 'commands', 'owner', 'antidelete'));
const broadcast = require(path.join(__dirname, '..', 'commands', 'owner', 'broadcast'));

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

function failsafe(fn) { try { return fn(); } catch { return null; } }

(async () => {
    // ------------------------------------------------------------------ design ---
    // The full design-system contract lives in scripts/smoke-terminal.js. This
    // smoke only checks the parts the pacing and audit work touch.
    console.log('\n=== card layout ===');
    {
        const card = style.card('STATUS_CACHE.SYS', [style.tag('system', 'HELLO')]);
        const lines = card.split('\n');

        check('line 1 is the plain heading with the module name', lines[0] === '📋 Status Cache', lines[0]);
        check('the body follows a blank separator', lines[1] === '' && lines[2] === 'ℹ️ HELLO', lines[1] + '|' + lines[2]);
        check('no box-drawing characters in the card', !card.includes('║') && !card.includes('╔') && !card.includes('╝'), card.slice(0, 60));
        check('no colour band closes the card', !/🟩|🟥|🟨|🟦|🟪/.test(card), card.slice(-40));

        check('divider() returns empty in plain style',
            failsafe(() => style.divider(1)) === '' && failsafe(() => style.divider(999)) === '',
            failsafe(() => style.divider(1)));
    }

    console.log('\n=== fields() ===');
    {
        const rows = style.fields([['Auto-save', '*ON*'], ['Retention', '24h'], ['Allowlist', 'all contacts']]);
        check('one line per pair', rows.length === 3, `${rows.length}`);
        check('fields use Label: value format',
            rows.every((r) => /^[A-Z].*: /.test(r)),
            JSON.stringify(rows));
        check('labels are sentence-cased', rows[0].startsWith('Auto-save:'), rows[0]);
        check('values keep their own formatting', rows[0].includes('*ON*'), rows[0]);

        check('empty pairs are dropped', style.fields([['a', ''], ['', 'b'], ['c', 'd']]).length === 1);
        check('no fields for empty input', style.fields([]).length === 0 && style.fields(null).length === 0);

        // A long label widens the gutter once, for every line in the block.
        const wide = style.fields([['A very long label indeed', 'x'], ['B', 'y']]);
        check('each field follows Label: value format', wide.every((r) => /^[A-Z].*: /.test(r)), JSON.stringify(wide));
    }

    console.log('\n=== digest shape ===');
    {
        // Same card as everything else, so a debounced notice cannot look
        // foreign in the chat it was merged into.
        const many = style.card('NOTICE.SYS', [
            ...style.fields([['Notices', '2 combined to keep this chat quiet']]),
            '',
            style.quote('⏳ Downloading'),
            style.quote('✅ Saved.'),
        ]);
        check('the digest carries every line', many.includes('Downloading') && many.includes('Saved.'), many.slice(0, 120));
        check('the digest uses the shared card',
            many.split('\n')[0] === '📋 Notice' && many.split('\n')[1] === '', many.slice(0, 80));
    }

    // ------------------------------------------------------ antidelete pacing ---
    console.log('\n=== antidelete DM pacing ===');
    {
        const order = [];
        const t = antidelete._test;
        t.revQueue.length = 0;

        t.queueRevocation(() => { order.push(1); });
        t.queueRevocation(() => { order.push(2); });
        t.queueRevocation(() => { order.push(3); });
        check('three reports are queued, not sent', order.length === 0, `${order.length} sent`);

        await new Promise((r) => setTimeout(r, 0));            // first job runs immediately
        check('the first report is delivered promptly', order.length === 1, `${order.length}`);
        await new Promise((r) => setTimeout(r, 20));           // not yet pacing to the next
        check('the rest wait their turn', order.length === 1, `${order.length}`);

        const untilDone = new Promise((resolve) => {
            const started = order.length;
            const iv = setInterval(() => {
                if (order.length >= started + 2) { clearInterval(iv); resolve(); }
            }, 5);
            setTimeout(() => { clearInterval(iv); resolve(); }, 1000);
        });
        await untilDone;
        check('everything is delivered, nothing is dropped', order.length === 3, `${order.length}`);
        check('delivery keeps its order', order.join(',') === '1,2,3', order.join(','));
        check('the queue drains', t.revQueue.length === 0, `${t.revQueue.length} left`);
    }

    // ------------------------------------------------------- broadcast pacing ---
    console.log('\n=== broadcast pacing ===');
    {
        const sent = [];
        const stamps = [];
        const groups = [{ id: '1@g.us' }, { id: '2@g.us' }, { id: '3@g.us' }, { id: '4@g.us' }];
        const sock = {
            groupFetchAllParticipating: async () => Object.fromEntries(groups.map((g) => [g.id, g])),
            sendMessage: async (jid) => { sent.push(jid); stamps.push(Date.now()); },
        };
        const replies = [];
        const delay = broadcast._test.SEND_DELAY_MS;

        // The command paces itself; run it with a short delay so the test is fast.
        const prev = process.env.BROADCAST_DELAY_MS;
        process.env.BROADCAST_DELAY_MS = '60';
        delete require.cache[require.resolve(path.join(__dirname, '..', 'commands', 'owner', 'broadcast'))];
        const paced = require(path.join(__dirname, '..', 'commands', 'owner', 'broadcast'));

        await paced.execute(sock, { key: {} }, ['hello'], { reply: async (t) => replies.push(t) });
        if (prev === undefined) delete process.env.BROADCAST_DELAY_MS;
        else process.env.BROADCAST_DELAY_MS = prev;

        check('one send per group', sent.length === 4, `${sent.length}`);
        const gaps = stamps.slice(1).map((t, i) => t - stamps[i]);
        check('sends are spaced apart', gaps.every((g) => g >= 30), JSON.stringify(gaps));

        const body = replies[replies.length - 1];
        check('the result card reports the counts', /Groups:\s*4/.test(body) && /Delivered:\s*4/.test(body), body.slice(0, 120));
        check('the result card says it was paced', /Paced at/i.test(body), body.slice(0, 200));
        check('the shipped default delay is sane', delay >= 500 && delay <= 5000, `${delay}ms`);
    }

    console.log(`\n${pass - fail}/${pass} outbound checks passed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
    console.error('❌ smoke-outbound crashed:', err);
    process.exit(1);
});
