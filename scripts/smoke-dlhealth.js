#!/usr/bin/env node
/**
 * Smoke test: download-source alert debouncing (lib/dlHealth.js)
 *
 * The bug this pins down: the monitor alerted on every single probe flip, and
 * YouTube's "confirm you're not a bot" challenge alternates pass/fail on a
 * datacenter IP. The owner got DOWN / RECOVERED / DOWN forever, an hour apart.
 *
 * Verified here:
 *   1. A flapping probe never alerts, however long it flaps.
 *   2. A source must fail N checks in a row before DOWN is reported.
 *   3. A source must pass N checks in a row before RECOVERED is reported —
 *      one lucky check between failures cannot fake a recovery.
 *   4. RECOVERED is only sent for an outage that was actually announced.
 *   5. Repeat DOWNs are muted for the cooldown window and capped per day.
 *   6. Every change found in one run arrives as ONE message.
 *   7. `.dlstatus monitor off` silences everything; on restores it.
 *   8. A legacy boolean state file is migrated, not re-announced.
 *
 * Usage: node scripts/smoke-dlhealth.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const dlHealth = require(path.join(__dirname, '..', 'lib', 'dlHealth'));

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'opt-dlh-'));
const PREV_DIR = dlHealth._test.setDataDir(TMP);

const YT = 'YouTube download (yt-dlp)';
const IG = 'Instagram (ruhend igdl)';

const ok = (name) => ({ name, ok: true, detail: 'ok' });
const bad = (name, detail = 'not a bot') => ({ name, ok: false, detail });

const HOUR = 60 * 60 * 1000;
const FAIL_N = dlHealth._test.FAIL_THRESHOLD;
const RECOVER_N = dlHealth._test.RECOVER_THRESHOLD;
const COOLDOWN = dlHealth._test.ALERT_COOLDOWN_MS;

/** Run `n` evaluations of the same result set, stepping the clock each time. */
function runTimes(state, results, n, { start = 1_000_000_000, step = 20 * 60 * 1000 } = {}) {
    let s = state;
    let now = start;
    const events = [];
    for (let i = 0; i < n; i++) {
        const out = dlHealth.evaluate(results, s, now);
        s = out.next;
        for (const r of out.broke) events.push({ kind: 'down', name: r.name, at: now });
        for (const r of out.fixed) events.push({ kind: 'up', name: r.name, at: now });
        now += step;
    }
    return { state: s, events, now };
}

(async () => {
    // ------------------------------------------------------------ flapping ---
    console.log('\n=== a flapping probe stays silent ===');
    {
        let state = {};
        let now = 1_000_000_000;
        const events = [];
        // 48 checks ≈ 16 hours of fail/pass/fail/pass — the exact pattern that
        // produced the DOWN/RECOVERED/DOWN spam.
        for (let i = 0; i < 48; i++) {
            const out = dlHealth.evaluate([bad(YT)], state, now);
            state = out.next;
            events.push(...out.broke);
            now += 20 * 60 * 1000;
            const out2 = dlHealth.evaluate([ok(YT)], state, now);
            state = out2.next;
            events.push(...out2.fixed);
            now += 20 * 60 * 1000;
        }
        check('96 alternating checks produce no alerts', events.length === 0, `${events.length} alerts`);
    }

    // ------------------------------------------------------- sustained down ---
    console.log('\n=== a sustained failure is reported once ===');
    {
        const down = runTimes({}, [bad(YT)], FAIL_N - 1);
        check(`no alert after ${FAIL_N - 1} failures`, down.events.length === 0, `${down.events.length}`);

        const hit = runTimes(down.state, [bad(YT)], 1, { start: down.now });
        check(`alert after ${FAIL_N} consecutive failures`, hit.events.length === 1 && hit.events[0].kind === 'down', JSON.stringify(hit.events));

        const more = runTimes(hit.state, [bad(YT)], 5, { start: hit.now });
        check('a persistently dead source is not re-announced', more.events.length === 0, `${more.events.length}`);

        // ------------------------------------------------------------ recovery
        const oneOk = runTimes(more.state, [ok(YT)], 1, { start: more.now });
        check('one success does not count as a recovery', oneOk.events.length === 0, `${oneOk.events.length}`);

        const recovered = runTimes(oneOk.state, [ok(YT)], RECOVER_N - 1, { start: oneOk.now });
        check(`recovery needs ${RECOVER_N} consecutive successes`, recovered.events.length === 1 && recovered.events[0].kind === 'up', JSON.stringify(recovered.events));
    }

    // ------------------------------------------------ unannounced recovery ---
    console.log('\n=== recovery for an outage nobody heard about is silent ===');
    {
        // Brand-new probe that is healthy: no DOWN was ever sent, so the first
        // "up" must not be announced as a recovery.
        const fresh = runTimes({}, [ok(YT)], RECOVER_N + 2);
        check('healthy probe from cold start stays silent', fresh.events.length === 0, `${fresh.events.length}`);

        // Legacy state that said "down" without a lastAlertKind (the old format
        // had none). The outage was already announced by the old code, so the
        // recovery is the natural closing message — exactly one, not a loop.
        const legacy = { [YT]: false };
        const rec = runTimes(legacy, [ok(YT)], RECOVER_N + 1);
        check('legacy "down" closes with exactly one recovery', rec.events.length === 1 && rec.events[0].kind === 'up', JSON.stringify(rec.events));

        // Legacy "up" that is still up must say nothing at all.
        const quiet = runTimes({ [YT]: true }, [ok(YT)], RECOVER_N + 1);
        check('legacy "up" stays silent', quiet.events.length === 0, JSON.stringify(quiet.events));
    }

    // ------------------------------------------------------------- cooldown ---
    console.log('\n=== repeats are muted for the cooldown window ===');
    {
        // Down, reported, recovered, then down again well inside the cooldown.
        const first = runTimes({}, [bad(YT)], FAIL_N);
        const up = runTimes(first.state, [ok(YT)], RECOVER_N, { start: first.now });
        const again = runTimes(up.state, [bad(YT)], FAIL_N, { start: up.now });

        check('first outage was reported', first.events.length === 1, JSON.stringify(first.events));
        check('recovery was reported', up.events.length === 1, JSON.stringify(up.events));
        check('second outage inside the cooldown is muted', again.events.length === 0, JSON.stringify(again.events));

        const later = runTimes(again.state, [bad(YT)], 1, { start: up.now + COOLDOWN + 1000 });
        check('it is reported again once the cooldown expires', later.events.length === 1, JSON.stringify(later.events));
    }

    // ------------------------------------------------------------ daily cap ---
    console.log('\n=== daily cap ===');
    {
        const now = Date.now();
        const day = new Date(now).toDateString();
        const cap = dlHealth._test.MAX_ALERTS_PER_DAY;
        // Streak is already long enough and the cooldown has expired, so the
        // only thing that can stop this alert is the per-day budget.
        const base = {
            ok: false, failStreak: 2, okStreak: 0, reported: 'up',
            lastAlertAt: now - COOLDOWN - 1000, lastAlertKind: 'down',
            alertsToday: cap, day,
        };

        const capped = dlHealth.evaluate([bad(YT)], { [YT]: base }, now);
        check(`the ${cap}rd alert of the day is blocked`, capped.broke.length === 0, JSON.stringify(capped.broke));

        const nextDay = dlHealth.evaluate([bad(YT)], { [YT]: { ...base, day: 'Mon Jan 01 2001' } }, now);
        check('the budget resets on a new day', nextDay.broke.length === 1, JSON.stringify(nextDay.broke));
    }

    // --------------------------------------------------------- batching/shape ---
    console.log('\n=== one message per run ===');
    {
        const sent = [];
        dlHealth.setSock({ sendMessage: async (jid, content) => { sent.push(content.text); } });
        dlHealth.setAlerts(true);
        // Fresh state for both probes.
        fs.rmSync(path.join(TMP, 'dlHealthState.json'), { force: true });

        // Bring both down, then flip one back up in the same run.
        await dlHealth.checkResults([bad(YT), bad(IG)], { alert: false });
        await dlHealth.checkResults([bad(YT), bad(IG)], { alert: false });
        sent.length = 0;
        const out = await dlHealth.checkResults([bad(YT), bad(IG)], { alert: true });
        check('both sources reported DOWN together', out.broke.length === 2, `${out.broke.length}`);
        check('exactly one message for two sources', sent.length === 1, `${sent.length}`);
        check('message names both sources', sent[0].includes(YT) && sent[0].includes(IG), sent[0].slice(0, 120));
        check('message states the streak', /STREAK\s*=\s*3 CONSECUTIVE FAILURES/.test(sent[0]), sent[0].slice(0, 200));
        check('bot-check failure gets an explanation', /challenging this host/i.test(sent[0]), sent[0].slice(-200));

        // A run where one dies and one recovers is still ONE message. Crafted
        // state so both land on their threshold in the same check.
        sent.length = 0;
        const now = Date.now();
        const day = new Date(now).toDateString();
        fs.writeFileSync(path.join(TMP, 'dlHealthState.json'), JSON.stringify({
            [YT]: { ok: false, failStreak: 2, okStreak: 0, reported: 'up', lastAlertAt: 0, lastAlertKind: 'up', alertsToday: 0, day },
            [IG]: { ok: false, failStreak: 3, okStreak: 2, reported: 'down', lastAlertAt: 0, lastAlertKind: 'down', alertsToday: 1, day },
        }, null, 2));
        const mixed = await dlHealth.checkResults([bad(YT), ok(IG)], { alert: true });
        check('simultaneous down + recovered is one message', sent.length === 1, `${sent.length}`);
        check('both changes are in that message', mixed.broke.length === 1 && mixed.fixed.length === 1, JSON.stringify({ broke: mixed.broke.length, fixed: mixed.fixed.length }));
        check('combined title is used', sent[0].includes('OPTIMUS · SOURCE_SYNC.SYS'), sent[0].split('\n')[0]);
    }

    // --------------------------------------------------------------- switch ---
    console.log('\n=== .dlstatus monitor off ===');
    {
        const sent = [];
        dlHealth.setSock({ sendMessage: async (jid, content) => { sent.push(content.text); } });
        fs.rmSync(path.join(TMP, 'dlHealthState.json'), { force: true });

        const cfg = dlHealth.setAlerts(false);
        check('config records alerts off', cfg.alerts === false);
        check('alertsEnabled() reflects it', dlHealth.alertsEnabled() === false);
        check('status() reflects it', dlHealth.status().alerts === false);

        for (let i = 0; i < FAIL_N + 2; i++) await dlHealth.checkResults([bad(YT)], { alert: true });
        check('nothing is sent while alerts are off', sent.length === 0, `${sent.length} sent`);

        dlHealth.setAlerts(true);
        check('re-enabling restores alerts', dlHealth.alertsEnabled() === true);
        for (let i = 0; i < FAIL_N; i++) await dlHealth.checkResults([bad(YT)], { alert: true });
        check('a sustained failure is reported again', sent.length === 1, `${sent.length} sent`);
    }

    // -------------------------------------------------------------- migration ---
    console.log('\n=== legacy state file ===');
    {
        const stateFile = path.join(TMP, 'dlHealthState.json');
        fs.writeFileSync(stateFile, JSON.stringify({ [YT]: false, [IG]: true }, null, 2));
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

        const migrated = dlHealth.evaluate([bad(YT), ok(IG)], state, 1_000_000_000);
        check('legacy booleans are upgraded to records', typeof migrated.next[YT] === 'object' && 'failStreak' in migrated.next[YT], JSON.stringify(migrated.next[YT]));
        check('a legacy "down" is not re-announced', migrated.broke.length === 0, JSON.stringify(migrated.broke));
        check('a legacy "up" that recovers is not announced', migrated.fixed.length === 0, JSON.stringify(migrated.fixed));
        check('legacy streak starts from zero', migrated.next[YT].failStreak === 1, JSON.stringify(migrated.next[YT]));

        // ...and it still escalates from a legacy "up" once the streak builds.
        const legacyUp = dlHealth.evaluate([bad(YT)], { [YT]: true }, 1_000_000_000);
        const legacyUp2 = dlHealth.evaluate([bad(YT)], legacyUp.next, 1_000_000_000 + 20 * 60 * 1000);
        const legacyUp3 = dlHealth.evaluate([bad(YT)], legacyUp2.next, 1_000_000_000 + 40 * 60 * 1000);
        check('a legacy "up" still escalates to a real alert', legacyUp3.broke.length === 1, JSON.stringify(legacyUp3.broke));

        // A legacy "down" is treated as already announced, so it is not re-sent.
        const legacyDown = dlHealth.evaluate([bad(YT)], { [YT]: false }, 1_000_000_000);
        const legacyDown3 = dlHealth.evaluate([bad(YT)], legacyDown.next, 1_000_000_000 + 20 * 60 * 1000);
        check('a legacy "down" is not re-announced', legacyDown3.broke.length === 0, JSON.stringify(legacyDown3.broke));
    }

    // --------------------------------------------------------------- cleanup ---
    dlHealth.setAlerts(true);
    dlHealth.setSock(null);
    dlHealth._test.setDataDir(PREV_DIR);
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* windows locks */ }

    console.log(`\n${pass - fail}/${pass} dlHealth checks passed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
    console.error('❌ smoke-dlhealth crashed:', err);
    try { dlHealth._test.setDataDir(PREV_DIR); } catch { /* ignore */ }
    process.exit(1);
});
