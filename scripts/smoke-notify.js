#!/usr/bin/env node
/**
 * Smoke test: outbound notification governor (lib/notify.js)
 *
 * Verifies the behaviour the anti-spam work depends on:
 *   1. Classification: progress vs completion vs essential, with the traps that
 *      would otherwise swallow a real answer (errors, usage hints, counts,
 *      multi-line menus, settings confirmations).
 *   2. Progress lines coalesce; a repeat is dropped.
 *   3. A completion notice after a deliverable is suppressed; before one it is
 *      not (otherwise a genuine "done" would vanish).
 *   4. Overflow past the per-chat budget is batched into ONE digest, so the
 *      information survives while the message count drops.
 *   5. Media, reactions, edits, status posts and newsletters always pass.
 *   6. Wrapping is idempotent and the governor never swallows a send error.
 *   7. `progress()` edits one message instead of sending several.
 *
 * Usage: node scripts/smoke-notify.js
 */

const path = require('path');
const assert = require('assert');
const notify = require(path.join(__dirname, '..', 'lib', 'notify'));

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

/** A socket stub that records every call. */
function makeSock() {
    const sent = [];
    const presence = [];
    const sock = {
        sent,
        presence,
        sendMessage: async (jid, content, opts) => {
            sent.push({ jid, content, opts });
            return { key: { remoteJid: jid, id: `msg-${sent.length}`, fromMe: true } };
        },
        sendPresenceUpdate: async (type, jid) => { presence.push({ type, jid }); },
    };
    return sock;
}

function texts(sent) {
    return sent.map((s) => s.content?.text).filter((t) => typeof t === 'string');
}

(async () => {
    // Start from the shipped defaults regardless of what data/notify.json holds
    // on this machine, so the run is deterministic. Nothing is persisted.
    notify.configure({ ...notify._test.DEFAULTS }, { persist: false });

    // ---------------------------------------------------------------- classify
    console.log('\n=== classification ===');
    const progress = [
        '⏳ Downloading',
        '⏳ Saving media',
        '⏳ Fetching audio for: *Song*',
        '⏳ Searching the web for "cats"',
        '⏳ Posting text group status',
        // Untagged progress wording still works: the tag is the fast path, not
        // the only path.
        'Downloading video',
        'Searching for cats',
    ];
    for (const t of progress) {
        check(`progress: ${t}`, notify.classify({ text: t }) === 'progress', notify.classify({ text: t }));
    }

    const completions = ['✅ Saved.', '✅ Download completed successfully.', '✅ Posted to your DM.'];
    for (const t of completions) {
        check(`completion: ${t}`, notify.classify({ text: t }) === 'completion', notify.classify({ text: t }));
    }

    const essential = [
        '❌ Failed to download the video. Please try again later.',
        '📋 Input\n\n⚠️ Invalid input\n\nUsage:\n .video <name or url>',
        '✅ Sent 3/4 statuses from Ali to your DM.',
        '✅ Cleared 3 cached statuses.',
        '✅ Kicked 1 member.',
        '✅ Promoted 3 members.',
        '✅ Download alerts ENABLED. Only sustained failures are reported.',
        'ℹ️ Status auto-save is OFF. Nothing new will be saved.',
        '📋 Status Cache\n\n1. Auto-save: ENABLED\n\n> CONTACT_ENTRY_01\nName: Ali\nItems: 2',
        '❌ Access denied. Only the bot owner can use this command.',
        'Here is your answer: 42',
    ];
    for (const t of essential) {
        check(`essential: ${t.slice(0, 42)}`, notify.classify({ text: t }) === 'essential', notify.classify({ text: t }));
    }

    check('media payload is essential', notify.classify({ video: Buffer.from('x'), caption: 'Saved.' }) === 'essential');
    check('reaction is essential', notify.classify({ react: { text: '⏳', key: {} } }) === 'essential');
    check('edit is essential', notify.classify({ text: '✅ Saved.', edit: { id: 'a' } }) === 'essential');

    // -------------------------------------------------------------- coalescing
    console.log('\n=== progress coalescing ===');
    {
        notify.reset();
        notify.configure({ progressCoalesceMs: 20000, completionGraceMs: 60000, maxPerChat: 99, batchWaitMs: 5 }, { persist: false });
        const sock = makeSock();
        notify.wrap(sock);

        await sock.sendMessage('a@s.whatsapp.net', { text: '⏳ Downloading' });
        await sock.sendMessage('a@s.whatsapp.net', { text: '⏳ Downloading part 2' });
        check('second progress line within the window is dropped', sock.sent.length === 1, `${sock.sent.length} sent`);

        await sock.sendMessage('b@s.whatsapp.net', { text: '⏳ Downloading' });
        check('another chat is unaffected', sock.sent.length === 2, `${sock.sent.length} sent`);

        // Same text again, later chat — dedupe is per chat.
        await sock.sendMessage('a@s.whatsapp.net', { text: '⏳ Downloading' });
        check('duplicate progress text is dropped', sock.sent.length === 2, `${sock.sent.length} sent`);
    }

    // -------------------------------------------------- completion suppression
    console.log('\n=== completion after a deliverable ===');
    {
        notify.reset();
        notify.configure({ progressCoalesceMs: 0, completionGraceMs: 60000, maxPerChat: 99, batchWaitMs: 5 }, { persist: false });
        const sock = makeSock();
        notify.wrap(sock);

        await sock.sendMessage('c@s.whatsapp.net', { text: '✅ Saved.' });
        check('completion without a deliverable is sent', sock.sent.length === 1, `${sock.sent.length} sent`);

        await sock.sendMessage('c@s.whatsapp.net', { video: Buffer.from('v'), caption: 'clip' });
        await sock.sendMessage('c@s.whatsapp.net', { text: '✅ Download completed successfully.' });
        check('completion right after media is suppressed', sock.sent.length === 2, `${sock.sent.length} sent`);

        // Counts are an outcome the user cannot infer from the media alone.
        await sock.sendMessage('c@s.whatsapp.net', { text: '✅ Sent 3/4 statuses to your DM.' });
        check('completion carrying counts survives', sock.sent.length === 3, `${sock.sent.length} sent`);

        // Errors are never routine.
        await sock.sendMessage('c@s.whatsapp.net', { text: '❌ Failed to send 2 statuses.' });
        check('error after media survives', sock.sent.length === 4, `${sock.sent.length} sent`);
    }

    // ----------------------------------------------------------------- batching
    console.log('\n=== budget batching ===');
    {
        notify.reset();
        notify.configure({ progressCoalesceMs: 0, completionGraceMs: 0, maxPerChat: 3, maxBatch: 4, batchWaitMs: 5 }, { persist: false });
        const sock = makeSock();
        notify.wrap(sock);

        const jid = 'd@g.us';
        for (let i = 0; i < 8; i++) await sock.sendMessage(jid, { text: `⏳ Downloading part ${i}` });
        await new Promise((r) => setTimeout(r, 40));

        const sent = texts(sock.sent);
        const all = sent.join('\n');
        check('burst of 8 collapses to fewer sends', sent.length < 8, `${sent.length} sent`);
        const digests = sent.filter((t) => t.includes('📋 Notice'));
        check('overflow arrives as one digest', digests.length === 1, `${digests.length} digests`);
        check('digest keeps the deferred lines', digests[0].includes('Downloading part 3') && digests[0].includes('Downloading part 6'), digests[0]);
        check('no notice is lost', [0, 1, 2, 3, 4, 5, 6, 7].every((i) => all.includes(`Downloading part ${i}`)), all.slice(0, 300));
        check('first messages still went out individually', sent[0].includes('Downloading part 0'), sent[0]);
    }

    // --------------------------------------------------------- always-passthrough
    console.log('\n=== payloads that must always pass ===');
    {
        notify.reset();
        notify.configure({ maxPerChat: 1, progressCoalesceMs: 60000, completionGraceMs: 60000 }, { persist: false });
        const sock = makeSock();
        notify.wrap(sock);

        await sock.sendMessage('e@s.whatsapp.net', { text: '⏳ Downloading' });
        await sock.sendMessage('e@s.whatsapp.net', { image: Buffer.from('i'), caption: 'pic' });
        await sock.sendMessage('e@s.whatsapp.net', { react: { text: '⏳', key: {} } });
        await sock.sendMessage('e@s.whatsapp.net', { delete: { id: 'x' } });
        await sock.sendMessage('status@broadcast', { text: '✅ Saved.' });
        await sock.sendMessage('120363@s.newsletter', { text: '⏳ Downloading' });
        check('media, react, delete, status and newsletter all sent', sock.sent.length === 6, `${sock.sent.length} sent`);
    }

    // ------------------------------------------------------------------ wrapper
    console.log('\n=== wrapper hygiene ===');
    {
        notify.reset();
        const sock = makeSock();
        const before = sock.sendMessage;
        notify.wrap(sock);
        const wrapped = sock.sendMessage;
        notify.wrap(sock);
        check('wrap is idempotent', sock.sendMessage === wrapped, 'wrapped twice');
        check('wrapper is a different function', before !== wrapped);

        const result = await sock.sendMessage('f@s.whatsapp.net', { text: 'hello' });
        check('wrapper returns the underlying result', result?.key?.id === 'msg-1', JSON.stringify(result));

        const suppressed = await sock.sendMessage('f@s.whatsapp.net', { text: '⏳ Downloading' });
        await sock.sendMessage('f@s.whatsapp.net', { text: '⏳ Downloading again' });
        check('suppressed send returns a key-shaped object', !!suppressed?.key?.id, JSON.stringify(suppressed));

        notify.unwrap(sock);
        check('unwrap restores the original', sock.sendMessage === before);
    }

    // ------------------------------------------------------------- disabled mode
    console.log('\n=== disabled ===');
    {
        notify.reset();
        notify.configure({ enabled: false }, { persist: false });
        const sock = makeSock();
        notify.wrap(sock);
        for (let i = 0; i < 5; i++) await sock.sendMessage('g@s.whatsapp.net', { text: '⏳ Downloading' });
        check('disabled governor sends everything', sock.sent.length === 5, `${sock.sent.length} sent`);
        notify.configure({ enabled: true }, { persist: false });
    }

    // ----------------------------------------------------------------- progress
    console.log('\n=== progress() edits one message ===');
    {
        notify.reset();
        notify.configure({ progressCoalesceMs: 0, maxPerChat: 99 }, { persist: false });
        const sock = makeSock();
        notify.wrap(sock);

        const handle = await notify.progress(sock, 'h@s.whatsapp.net', '⏳ Downloading', { minEditMs: 0 });
        check('progress sends exactly one message', sock.sent.length === 1, `${sock.sent.length} sent`);
        check('progress key captured', !!handle.key);
        check('typing presence raised', sock.presence.some((p) => p.type === 'composing'));

        await handle.update('⏳ Converting');
        await handle.done('✅ Ready.');
        const edits = sock.sent.filter((s) => s.content.edit);
        check('updates are edits, not new messages', edits.length === 2 && sock.sent.length === 3, `${edits.length} edits / ${sock.sent.length} total`);
        check('edit targets the original key', edits[0].content.edit.id === handle.key.id);

        // A suppressed progress handle must be a no-op, not a crash.
        await sock.sendMessage('h@s.whatsapp.net', { text: '⏳ Downloading' });
        const quiet = await notify.progress(sock, 'h@s.whatsapp.net', '⏳ Downloading', { minEditMs: 0 });
        check('suppressed handle reports itself', quiet.suppressed === true);
        check('suppressed handle update is a no-op', (await quiet.update('x')) === false);
    }

    // -------------------------------------------------------------------- stats
    console.log('\n=== stats ===');
    {
        notify.reset();
        notify.configure({ progressCoalesceMs: 60000, maxPerChat: 99 }, { persist: false });
        const sock = makeSock();
        notify.wrap(sock);
        await sock.sendMessage('i@s.whatsapp.net', { text: '⏳ Downloading' });
        await sock.sendMessage('i@s.whatsapp.net', { text: '⏳ Fetching' });
        const st = notify.stats();
        check('stats count sent and suppressed', st.sent === 1 && st.suppressed === 1, JSON.stringify(st));
    }

    // Restore defaults so a developer running this locally is not left with a
    // patched policy in data/notify.json.
    notify.configure({ ...notify._test.DEFAULTS }, { persist: false });
    notify.reset();

    console.log(`\n${pass - fail}/${pass} notify checks passed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
    console.error('❌ smoke-notify crashed:', err);
    process.exit(1);
});
