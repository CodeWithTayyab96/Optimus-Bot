#!/usr/bin/env node
/**
 * Smoke test: WhatsApp status cache identity + `.status` command
 *
 * The bug this pins down: the cache listing printed `entry.number`, and for a
 * LID-addressed status that is an opaque digit string — so every row looked like
 * a random number and there was no way to tell which contact it belonged to.
 *
 * Verified here:
 *   1. Capture records the poster's push name, phone number and LID.
 *   2. LIDs resolve to real phone numbers when the signal store can do it.
 *   3. Legacy entries (number = LID digits, no name) are normalised on read and
 *      back-filled, so an existing cache becomes readable instead of staying
 *      opaque.
 *   4. Every reference form the listing shows works in both `.status <ref>` and
 *      `.status clear <ref>`: `#N`, phone number, LID, name, JID.
 *   5. Ambiguous names are reported rather than guessed at.
 *   6. `.status clear` with no argument still wipes everything.
 *
 * Usage: node scripts/smoke-status.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const statusCache = require(path.join(ROOT, 'lib', 'statusCache'));
const statusCmd = require(path.join(ROOT, 'commands', 'owner', 'status.js'));

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'opt-status-'));
const PREV_DIR = statusCache._test.setDataDir(TMP);

/** A socket stub: LID → PN mapping, contact names, and a send recorder. */
function makeSock({ pnByLid = {}, names = {} } = {}) {
    const sent = [];
    const sock = {
        sent,
        user: { id: '999:1@s.whatsapp.net' },
        sendMessage: async (jid, content) => {
            sent.push({ jid, content });
            return { key: { remoteJid: jid, id: `m-${sent.length}`, fromMe: true } };
        },
        sendPresenceUpdate: async () => { },
        getName: async (jid) => names[jid] || null,
        signalRepository: {
            lidMapping: {
                getPNForLID: async (lid) => pnByLid[lid] || null,
            },
        },
    };
    return sock;
}

let seq = 0;
const BASE_TS = Math.floor(Date.now() / 1000) - 600;
function statusMsg({ participant, pushName, text, ts }) {
    seq += 1;
    return {
        key: {
            remoteJid: 'status@broadcast',
            participant,
            id: `STATUS${String(seq).padStart(4, '0')}`,
            fromMe: false,
        },
        pushName,
        // Distinct, increasing timestamps: the listing is ordered by time, and
        // same-second entries would make the #N assertions flaky.
        messageTimestamp: ts || BASE_TS + seq,
        message: { conversation: text || 'hello' },
    };
}

async function capture(sock, msg) {
    await statusCache.capture(sock, { messages: [msg] });
}

(async () => {
    statusCache.setEnabled(true);

    // ------------------------------------------------------------ capture ---
    console.log('\n=== capture records who posted ===');

    const ALI_PN = '923001234567';
    const ALI_LID = '112233445566778';
    const SARA_PN = '923009999999';

    // A status addressed by phone number, with a push name.
    const sockA = makeSock();
    await capture(sockA, statusMsg({ participant: `${ALI_PN}@s.whatsapp.net`, pushName: 'Ali Khan', text: 'first' }));

    // A status addressed by LID, resolvable through the signal store.
    const sockB = makeSock({ pnByLid: { [`${ALI_LID}@lid`]: `${ALI_PN}@s.whatsapp.net` } });
    await capture(sockB, statusMsg({ participant: `${ALI_LID}@lid`, pushName: 'Ali Khan', text: 'second' }));

    // A LID we cannot resolve at all.
    const sockC = makeSock();
    await capture(sockC, statusMsg({ participant: '998877665544332@lid', pushName: 'Ghost', text: 'third' }));

    // Another contact, by phone number, no push name (name comes from the store).
    const sockD = makeSock({ names: { [`${SARA_PN}@s.whatsapp.net`]: 'Sara B' } });
    await capture(sockD, statusMsg({ participant: `${SARA_PN}@s.whatsapp.net`, pushName: undefined, text: 'fourth' }));

    let contacts = statusCache.listContacts();
    check('four distinct posters cached', contacts.length === 3, `${contacts.length}`);

    const ali = contacts.find((c) => c.number === ALI_PN);
    check('phone-number status keeps its number', !!ali, JSON.stringify(contacts.map((c) => c.label)));
    check('LID status resolved to the same phone number', ali && ali.count === 2, JSON.stringify(ali));
    check('LID is still recorded alongside the number', ali && ali.lid === ALI_LID, JSON.stringify(ali));
    check('push name captured', ali && ali.name === 'Ali Khan', JSON.stringify(ali));
    check('label shows name AND number', ali && ali.label === `Ali Khan (+${ALI_PN})`, ali && ali.label);

    const ghost = contacts.find((c) => c.lid === '998877665544332');
    check('unresolvable LID is not shown as a bare number', ghost && !ghost.number, JSON.stringify(ghost));
    check('unresolvable LID still identifies the contact', ghost && !/^\d{6,}$/.test(ghost.label), ghost && ghost.label);
    check('unresolvable LID keeps its push name', ghost && ghost.name === 'Ghost', JSON.stringify(ghost));

    const sara = contacts.find((c) => c.number === SARA_PN);
    check('name falls back to the contact store', sara && sara.name === 'Sara B', JSON.stringify(sara));

    // ------------------------------------------------------------- lookups ---
    console.log('\n=== every reference form resolves ===');

    const byIndex = statusCache.resolveRef('#1');
    check('#1 resolves to the newest contact', byIndex.contact && byIndex.contact.key === contacts[0].key, JSON.stringify(byIndex.contact));

    check('phone number resolves', statusCache.resolveRef(ALI_PN).contact?.number === ALI_PN);
    check('number with + and spaces resolves', statusCache.resolveRef(`+${ALI_PN.slice(0, 2)} ${ALI_PN.slice(2, 5)} ${ALI_PN.slice(5)}`).contact?.number === ALI_PN);
    check('LID resolves', statusCache.resolveRef(ALI_LID).contact?.number === ALI_PN);
    check('JID resolves', statusCache.resolveRef(`${SARA_PN}@s.whatsapp.net`).contact?.number === SARA_PN);
    check('name resolves (case-insensitive)', statusCache.resolveRef('sara').contact?.number === SARA_PN);
    check('unknown reference reports not-found', statusCache.resolveRef('nobody-here').reason === 'not-found');
    check('out-of-range #index reports not-found', statusCache.resolveRef('#99').reason === 'not-found');

    check('listFor(name) returns that contact only', statusCache.listFor('Sara B').length === 1, `${statusCache.listFor('Sara B').length}`);
    check('listFor(number) returns every entry', statusCache.listFor(ALI_PN).length === 2, `${statusCache.listFor(ALI_PN).length}`);
    check('listFor(#index) agrees with listFor(number)',
        statusCache.listFor('#1').length === statusCache.listFor(contacts[0].number).length);

    // ------------------------------------------------------------- command ---
    console.log('\n=== .status output ===');

    const cmdSock = makeSock();
    const owner = '999@s.whatsapp.net';
    const msg = { key: { remoteJid: owner, fromMe: true, id: 'CMD1' } };
    const extra = { chatId: owner, prefix: '.' };
    const lastText = () => {
        const t = cmdSock.sent.filter((s) => typeof s.content?.text === 'string').map((s) => s.content.text);
        return t[t.length - 1] || '';
    };

    cmdSock.sent.length = 0;
    await statusCmd.execute(cmdSock, msg, [], extra);
    let out = lastText();
    check('listing uses the terminal STATUS_CACHE module', out.includes('OPTIMUS · STATUS_CACHE.SYS'), out.slice(0, 80));
    check('listing shows the contact name', out.includes('Ali Khan'), out.slice(0, 300));
    check('listing shows the phone number', out.includes(ALI_PN), out.slice(0, 300));
    check('listing offers #1 as a fetch handle', /FETCH: \.status #1/.test(out), out.slice(0, 400));
    check('listing explains how to fetch one', out.includes('.status #1') && out.includes('clear #1'), out.slice(0, 400));
    check('listing does not show a bare LID as a phone number', !out.includes(`+${ALI_LID}`), out.slice(0, 400));

    // .status #1 → sends that contact's statuses to the DM
    const newest = statusCache.listContacts()[0];
    cmdSock.sent.length = 0;
    await statusCmd.execute(cmdSock, msg, ['#1'], extra);
    const body = cmdSock.sent.map((s) => s.content?.text || '').join('\n');
    check('.status #1 sends the newest contact\'s statuses', body.includes(`[SYSTEM] STATUS FROM ${newest.label.toUpperCase()}`), body.slice(0, 200));
    check('.status #1 reports a count', new RegExp(`Sent ${newest.count}/${newest.count} status`).test(body), body.slice(-120));

    // .status <number> still works, exactly as before
    cmdSock.sent.length = 0;
    await statusCmd.execute(cmdSock, msg, [SARA_PN], extra);
    check('.status <number> still works', /\[SYSTEM\] STATUS FROM SARA B/.test(cmdSock.sent.map((s) => s.content?.text || '').join('\n')));

    // .status <name> works too
    cmdSock.sent.length = 0;
    await statusCmd.execute(cmdSock, msg, ['Ghost'], extra);
    check('.status <name> works', /Ghost/.test(cmdSock.sent.map((s) => s.content?.text || '').join('\n')));

    // unknown reference explains itself instead of failing silently
    cmdSock.sent.length = 0;
    await statusCmd.execute(cmdSock, msg, ['nobody'], extra);
    check('.status <unknown> explains what is cached', /NOTHING CACHED FOR NOBODY/.test(lastText()), lastText().slice(0, 200));

    // ------------------------------------------------------------ ambiguity ---
    console.log('\n=== ambiguous names ===');
    await capture(makeSock(), statusMsg({ participant: '923007777777@s.whatsapp.net', pushName: 'Ali Raza', text: 'fifth' }));
    cmdSock.sent.length = 0;
    await statusCmd.execute(cmdSock, msg, ['Ali'], extra);
    out = lastText();
    check('ambiguous name lists the matches', /MATCHES MORE THAN ONE/.test(out), out.slice(0, 200));
    check('ambiguous listing shows both candidates', out.includes('Ali Khan') && out.includes('Ali Raza'), out.slice(0, 300));
    check('ambiguous reference deletes nothing', statusCache.listFor('Ali Khan').length === 2);

    // ----------------------------------------------------------------- clear ---
    console.log('\n=== .status clear ===');
    const beforeClear = statusCache.listContacts();
    const newestNow = beforeClear[0];

    cmdSock.sent.length = 0;
    await statusCmd.execute(cmdSock, msg, ['clear', '#1'], extra);
    check('clear #N reports the contact by name', lastText().includes(newestNow.label), lastText());
    check('clear #N removed only that contact', statusCache.listFor(newestNow.label).length === 0, `${statusCache.listFor(newestNow.label).length}`);
    check('other contacts untouched', statusCache.listContacts().length === beforeClear.length - 1, `${statusCache.listContacts().length}`);
    check('the other Ali is still cached', statusCache.listFor(ALI_PN).length === 2, `${statusCache.listFor(ALI_PN).length}`);

    cmdSock.sent.length = 0;
    await statusCmd.execute(cmdSock, msg, ['clear', 'does-not-exist'], extra);
    check('clear with an unknown ref deletes nothing and says so', /NOTHING CACHED FOR DOES-NOT-EXIST/.test(lastText()), lastText().slice(0, 200));
    check('cache still intact after the failed clear', statusCache.listContacts().length === beforeClear.length - 1, `${statusCache.listContacts().length}`);

    cmdSock.sent.length = 0;
    await statusCmd.execute(cmdSock, msg, ['clear'], extra);
    check('bare clear still wipes everything', statusCache.listContacts().length === 0, `${statusCache.listContacts().length}`);

    // ------------------------------------------------------ legacy migration ---
    console.log('\n=== legacy index (opaque IDs) is migrated ===');
    {
        const LEGACY_LID = '554433221100998';
        const LEGACY_PN = '923005555555';
        const now = Math.floor(Date.now() / 1000);
        const legacy = [{
            id: 'OLDSTATUS0001',
            jid: `${LEGACY_LID}@lid`,
            number: LEGACY_LID, // exactly what the old version stored
            type: 'text',
            ts: now,
            caption: 'legacy status',
            mimetype: null,
            file: null,
            size: 0,
        }];
        const indexFile = path.join(TMP, 'status-cache', 'index.json');
        fs.mkdirSync(path.dirname(indexFile), { recursive: true });
        fs.writeFileSync(indexFile, JSON.stringify(legacy, null, 2));

        let rows = statusCache.listContacts();
        check('legacy LID is not printed as a phone number', rows.length === 1 && !rows[0].number, JSON.stringify(rows));
        check('legacy entry is labelled as an unknown contact', rows.length === 1 && /unknown contact/.test(rows[0].label), rows[0]?.label);

        const sockE = makeSock({
            pnByLid: { [`${LEGACY_LID}@lid`]: `${LEGACY_PN}@s.whatsapp.net` },
            names: { [`${LEGACY_LID}@lid`]: 'Legacy Contact' },
        });
        const improved = await statusCache.backfill(sockE);
        check('backfill reports what it improved', improved === 1, `${improved}`);

        rows = statusCache.listContacts();
        check('backfill resolved the phone number', rows[0].number === LEGACY_PN, JSON.stringify(rows[0]));
        check('backfill resolved the name', rows[0].name === 'Legacy Contact', JSON.stringify(rows[0]));
        check('legacy entry is now readable', rows[0].label === `Legacy Contact (+${LEGACY_PN})`, rows[0].label);
        check('legacy entry is reachable by its old LID', statusCache.listFor(LEGACY_LID).length === 1);

        const persisted = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        check('backfill persisted the identity', persisted[0].number === LEGACY_PN && persisted[0].name === 'Legacy Contact', JSON.stringify(persisted[0]));
    }

    // --------------------------------------------------------------- cleanup ---
    statusCache._test.setDataDir(PREV_DIR);
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* windows locks */ }

    console.log(`\n${pass - fail}/${pass} status checks passed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
    console.error('❌ smoke-status crashed:', err);
    try { statusCache._test.setDataDir(PREV_DIR); } catch { /* ignore */ }
    process.exit(1);
});
