/**
 * dlHealth — download-source health probes + scheduled owner alerting.
 *
 * The probes are shared by the `.dlstatus` command (on demand) and by the
 * background monitor started at boot.
 *
 * WHY THIS IS DEBOUNCED (and not a simple "state changed" watcher)
 *   The first version alerted on every single flip. That is fine for a source
 *   that dies and stays dead, and catastrophic for one that flickers — and
 *   YouTube's "Sign in to confirm you're not a bot" is exactly that: it depends
 *   on whether YouTube trusts this host's IP *at that moment*, so the same probe
 *   alternates pass/fail on a datacenter box. The owner got a DOWN, a RECOVERED
 *   an hour later, and another DOWN the next hour, forever.
 *
 *   So a state change has to be BOTH sustained and worth saying:
 *     - FAIL_THRESHOLD consecutive failures (default 3 ≈ 1h) before DOWN.
 *     - RECOVER_THRESHOLD consecutive successes before RECOVERED, so one lucky
 *       check between failures cannot fake a recovery.
 *     - A RECOVERED is only sent for a DOWN the owner was actually told about;
 *       announcing a recovery for an outage that was never announced is noise.
 *     - Repeats are muted for ALERT_COOLDOWN_MS (6h) and capped per day, so a
 *       source that flaps slowly cannot still fill the chat.
 *   All changes found in one run are combined into ONE message.
 *
 *   The whole thing can be switched off with `.dlstatus monitor off`.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const settings = require('../settings');
const ytdlp = require('./ytdlp');
const proxyPool = require('./proxyPool');
const style = require('./messageStyle');
const knightbotApi = require('./knightbotApi');
const { nexoracle } = require('./mediaApi');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Known-good public test targets.
const TEST_YT = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // short + stable
const TEST_MF = 'https://www.mediafire.com/file/blj91w6ah0pxa7i/Tomodachi.zip/file';
const TEST_IG = 'https://www.instagram.com/p/C_ntulJK_V2/';

let DATA_DIR = path.join(__dirname, '..', 'data');
let STATE_FILE = path.join(DATA_DIR, 'dlHealthState.json');
let CONFIG_FILE = path.join(DATA_DIR, 'dlHealth.json');

/** Point the state/config at another directory (tests). Returns the previous one. */
function setDataDir(dir) {
    const prev = DATA_DIR;
    DATA_DIR = dir;
    STATE_FILE = path.join(dir, 'dlHealthState.json');
    CONFIG_FILE = path.join(dir, 'dlHealth.json');
    return prev;
}

const INTERVAL_MS = Number(process.env.DL_HEALTH_INTERVAL_MS) || 20 * 60 * 1000; // 20 min

/** Consecutive results required before a change is believed. */
const FAIL_THRESHOLD = Number(process.env.DL_HEALTH_FAIL_THRESHOLD) || 3;
const RECOVER_THRESHOLD = Number(process.env.DL_HEALTH_RECOVER_THRESHOLD) || 3;
/** Minimum gap between two DOWN alerts for the same source. */
const ALERT_COOLDOWN_MS = Number(process.env.DL_HEALTH_ALERT_COOLDOWN_MS) || 6 * 60 * 60 * 1000;
const MAX_ALERTS_PER_DAY = Number(process.env.DL_HEALTH_MAX_ALERTS_PER_DAY) || 3;

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
}

// Each probe throws when dead, or returns a short detail string when alive.
const PROBES = [
    {
        name: 'yt-dlp (binary)',
        covers: '.song .video .tiktok .facebook .twitter .soundcloud',
        run: async () => {
            // Run the full diagnosis rather than isAvailable() so a cached
            // result cannot mask a state change, and so the failure reason
            // (missing file / no execute bit / loader error) is reported.
            // The old 20s ceiling could call a working binary dead: the
            // standalone build self-extracts and needs ~17s even on a fast host.
            const d = await ytdlp.diagnose();
            if (!d.ok) {
                const flags = [
                    d.exists ? null : 'file missing',
                    d.exists && !d.executable ? 'not executable' : null,
                ].filter(Boolean);
                throw new Error(`${d.error}${flags.length ? ` [${flags.join(', ')}]` : ''}`);
            }
            return 'v' + d.version;
        },
    },
    {
        name: 'PO token provider (bgutil)',
        covers: 'YouTube (PO token)',
        run: async () => {
            const s = await ytdlp.potProviderStatus();
            if (!s.ok) throw new Error(s.detail);
            return s.detail;
        },
    },
    {
        name: 'YouTube download (yt-dlp)',
        covers: '.song .video',
        run: async () => {
            const os = require('os');
            const dl = await ytdlp.downloadAudio(TEST_YT, os.tmpdir());
            if (!dl.buffer || !dl.buffer.length) throw new Error('no bytes downloaded');
            return `${(dl.buffer.length / 1024 / 1024).toFixed(2)} MiB downloaded`;
        },
    },
    {
        name: 'SoundCloud (yt-dlp)',
        covers: '.soundcloud',
        run: async () => {
            const r = await ytdlp.searchSoundCloud('test', 1);
            if (!r.length) throw new Error('no results');
            return `${r.length} result`;
        },
    },
    {
        name: 'yt-search',
        covers: '.ytsearch',
        run: async () => {
            const yts = require('yt-search');
            const r = await yts('test');
            if (!r || !r.videos || !r.videos.length) throw new Error('no results');
            return 'ok';
        },
    },
    {
        name: 'MediaFire (page scrape)',
        covers: '.mediafire',
        run: async () => {
            const res = await proxyPool.get(TEST_MF, { timeout: 20000, headers: { 'User-Agent': UA } });
            if (!/id="downloadButton"|data-scrambled-url/i.test(String(res.data))) throw new Error('download button not found');
            return 'link found';
        },
    },
    {
        name: 'NexOracle (apk)',
        covers: '.apk',
        run: async () => {
            const d = await nexoracle('downloader/apk', { q: 'com.whatsapp' });
            if (!d || !d.result) throw new Error('no result');
            return 'ok';
        },
    },
    {
        name: 'Instagram (ruhend igdl)',
        covers: '.instagram',
        run: async () => {
            const { igdl } = require('ruhend-scraper');
            const d = await igdl(TEST_IG);
            if (!d || !d.status) throw new Error('failed');
            return 'ok';
        },
    },
];

// Only monitor the KnightBot API when it is actually enabled. Probing a
// deliberately-disabled fallback would report a permanent DOWN and page the
// owner for a service they never opted into.
if (knightbotApi.isConfigured()) {
    PROBES.push({
        name: 'KnightBot API (last-resort fallback)',
        covers: '.song .play (after yt-dlp + RapidAPI)',
        run: () => knightbotApi.healthProbe({ timeoutMs: 6000 }),
    });
}

/** Run every probe (each with its own timeout). Never throws. */
async function runProbes() {
    return Promise.all(PROBES.map(async (p) => {
        try {
            const detail = await withTimeout(p.run(), 60000);
            return { name: p.name, covers: p.covers, ok: true, detail };
        } catch (e) {
            return { name: p.name, covers: p.covers, ok: false, detail: e.message };
        }
    }));
}

// ---------------------------------------------------------------- monitor ---

let sockRef = null;
let timer = null;
let lastRun = null;
let lastResults = null;

function ownerJid() {
    return settings.ownerNumber ? `${settings.ownerNumber}@s.whatsapp.net` : null;
}

function loadState() {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

function saveState(state) {
    try {
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
        console.error('[dlHealth] could not persist state:', e.message);
    }
}

/** Are background alerts on? Off means the monitor is silent (and stopped). */
function readConfig() {
    try {
        const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        return { alerts: raw.alerts !== false };
    } catch {
        return { alerts: true }; // no file yet — the shipped default
    }
}

function writeConfig(cfg) {
    try {
        fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ alerts: !!cfg.alerts }, null, 2));
    } catch (e) {
        console.error('[dlHealth] could not persist config:', e.message);
    }
    return { alerts: !!cfg.alerts };
}

function alertsEnabled() { return readConfig().alerts; }

/**
 * Turn background alerts on or off. Turning them off also stops the probe timer:
 * if nothing is going to be reported there is no reason to spend the host's
 * bandwidth on eight network probes every 20 minutes.
 *
 * Turning them back on clears what we previously "told" the owner, so a source
 * that died while the alerts were off is reported again instead of staying
 * silently broken. Streaks are kept — the next sustained result is believed
 * immediately rather than after another hour.
 */
function setAlerts(on) {
    const cfg = writeConfig({ alerts: !!on });
    if (!cfg.alerts) {
        stop();
        return cfg;
    }

    const state = loadState();
    for (const name of Object.keys(state)) {
        const s = probeState(state[name]);
        s.reported = 'unknown';
        s.lastAlertKind = null;
        state[name] = s;
    }
    saveState(state);
    return cfg;
}

/**
 * Bring one probe's record into the current shape.
 *
 * The previous version stored a bare boolean, so an existing state file has
 * `{ "YouTube download (yt-dlp)": false }`. Those are migrated rather than
 * discarded — and a legacy `false` is treated as "already reported down", which
 * stops an upgrade from re-announcing an outage the owner already knew about.
 */
function probeState(raw) {
    if (raw && typeof raw === 'object') {
        return {
            ok: !!raw.ok,
            failStreak: Number(raw.failStreak) || 0,
            okStreak: Number(raw.okStreak) || 0,
            reported: raw.reported === 'up' || raw.reported === 'down' ? raw.reported : 'unknown',
            lastAlertAt: Number(raw.lastAlertAt) || 0,
            lastAlertKind: raw.lastAlertKind === 'up' || raw.lastAlertKind === 'down' ? raw.lastAlertKind : null,
            alertsToday: Number(raw.alertsToday) || 0,
            day: typeof raw.day === 'string' ? raw.day : '',
        };
    }
    return {
        ok: !!raw,
        failStreak: 0,
        okStreak: 0,
        reported: raw === true ? 'up' : raw === false ? 'down' : 'unknown',
        lastAlertAt: 0,
        lastAlertKind: raw === false ? 'down' : null,
        alertsToday: 0,
        day: '',
    };
}

/**
 * Fold a set of probe results into the stored state and decide what (if
 * anything) the owner needs to be told.
 *
 * Pure: no I/O, no network, so the debouncing rules are testable.
 *
 * `opts.silent` still advances the streaks but never records that anything was
 * announced. That is what seeding at boot and "alerts off" use: the owner is not
 * told, so the bot must not later believe they were.
 *
 * @param {Array<{name:string, ok:boolean, detail:string}>} results
 * @param {object} prev  previous state (legacy booleans are accepted)
 * @param {number} [now]
 * @param {{silent?: boolean}} [opts]
 * @returns {{next: object, broke: Array, fixed: Array}}
 */
function evaluate(results, prev = {}, now = Date.now(), opts = {}) {
    const silent = opts.silent === true;
    const next = {};
    const broke = [];
    const fixed = [];
    const today = new Date(now).toDateString();

    for (const r of results) {
        const s = probeState(prev[r.name]);

        s.ok = !!r.ok;
        if (r.ok) { s.okStreak += 1; s.failStreak = 0; }
        else { s.failStreak += 1; s.okStreak = 0; }

        if (s.day !== today) { s.day = today; s.alertsToday = 0; }

        const want = r.ok ? 'up' : 'down';
        const qualified = r.ok ? s.okStreak >= RECOVER_THRESHOLD : s.failStreak >= FAIL_THRESHOLD;

        if (!silent && qualified && s.reported !== want) {
            // A recovery is only news if the outage was announced. Saying
            // "recovered" for something the owner was never told was down is
            // just as confusing as the outage itself.
            const neverAnnouncedDown = want === 'up' && s.lastAlertKind !== 'down';
            // Cooldown only gates DOWN: muting a recovery would leave the owner
            // believing a dead source is still dead.
            const cooling = want === 'down' && s.lastAlertAt && now - s.lastAlertAt < ALERT_COOLDOWN_MS;
            const capped = s.alertsToday >= MAX_ALERTS_PER_DAY;

            if (neverAnnouncedDown) {
                s.reported = 'up';
            } else if (!cooling && !capped) {
                s.reported = want;
                s.lastAlertAt = now;
                s.lastAlertKind = want;
                s.alertsToday += 1;
                (want === 'down' ? broke : fixed).push({
                    ...r,
                    streak: want === 'down' ? s.failStreak : s.okStreak,
                });
            }
            // Suppressed by cooldown or the daily cap: leave `reported` alone so
            // the next run can announce it once the window allows.
        }

        next[r.name] = s;
    }

    return { next, broke, fixed };
}

/** One message per run, however many sources changed. */
async function notify({ broke = [], fixed = [] } = {}) {
    const jid = ownerJid();
    if (!jid || !sockRef) return;

    const lines = [];
    for (const r of broke) {
        lines.push(`${style.tag('error', r.name)}`);
        lines.push(...style.fields([['Detail', r.detail], ['Streak', `${r.streak} CONSECUTIVE FAILURES`]]));
        lines.push('');
    }
    for (const r of fixed) {
        lines.push(`${style.tag('success', r.name)}`);
        lines.push(...style.fields([['Detail', r.detail], ['Streak', `${r.streak} CONSECUTIVE PASSES`]]));
        lines.push('');
    }

    // The bot-check is the one failure whose cause is NOT in this repo. Naming
    // it saves a support round-trip every time YouTube tightens its heuristics.
    if (broke.some((r) => /not a bot|sign in to confirm/i.test(String(r.detail)))) {
        lines.push(style.tag('warning', 'YOUTUBE IS CHALLENGING THIS HOST’S IP — NOT A CODE FAULT.'));
        lines.push(style.quote('It usually clears by itself; .dlstatus shows the current state.'));
        lines.push('');
    }

    // One module name per meaning, so the heading alone tells the owner what
    // happened before they read a line of the body.
    const title = broke.length && fixed.length
        ? 'SOURCE_SYNC.SYS'
        : broke.length ? 'SOURCE_DOWN.SYS' : 'SOURCE_RECOVERED.SYS';

    const text = style.card(title, trimTrailing(lines).concat([
        style.tag('system', new Date().toLocaleString()),
    ]));
    try {
        await sockRef.sendMessage(jid, { text });
        console.log('[dlHealth] alerted owner:', title);
    } catch (e) {
        console.error('[dlHealth] alert failed:', e.message);
    }
}

function trimTrailing(lines) {
    const out = [...lines];
    while (out.length && out[out.length - 1] === '') out.pop();
    return out;
}

/**
 * Apply one batch of probe results: persist, then alert on any SUSTAINED change.
 * Split out of check() so the alert path can be exercised without a network.
 *
 * @param {Array<{name:string, ok:boolean, detail:string}>} results
 * @param {{alert?: boolean}} [opts]
 */
async function checkResults(results, { alert = true } = {}) {
    lastRun = new Date();
    lastResults = results;

    // Silence has two meanings here: the caller asked for no alert (seeding at
    // boot), or the owner switched alerts off. Either way nothing is announced,
    // so nothing may be recorded as announced.
    const silent = !alert || !alertsEnabled();
    const { next, broke, fixed } = evaluate(results, loadState(), Date.now(), { silent });
    saveState(next);

    if (!silent && (broke.length || fixed.length) && sockRef) {
        await notify({ broke, fixed });
    }

    return { results, broke, fixed };
}

/**
 * Run the probes, persist state, and alert the owner on any SUSTAINED change.
 * @param {{alert?: boolean}} [opts]
 */
async function check(opts = {}) {
    return checkResults(await runProbes(), opts);
}

/** Start the background monitor. Call once after the bot connects. */
function init(sock) {
    sockRef = sock;
    if (timer) return;

    if (!alertsEnabled()) {
        console.log('[dlHealth] monitor disabled by .dlstatus monitor off — not starting');
        return;
    }

    // Seed the baseline WITHOUT alerting, so a pre-existing failure doesn't
    // page the owner on every restart.
    check({ alert: false }).catch(() => {});

    timer = setInterval(() => { check().catch(() => {}); }, INTERVAL_MS);
    console.log(`[dlHealth] monitor started (every ${Math.round(INTERVAL_MS / 60000)} min)`);
}

function stop() {
    if (timer) { clearInterval(timer); timer = null; }
}

/** Set the socket without starting the periodic monitor (used by tests). */
function setSock(sock) {
    sockRef = sock;
}

function status() {
    return {
        running: Boolean(timer),
        intervalMs: INTERVAL_MS,
        alerts: alertsEnabled(),
        thresholds: { fail: FAIL_THRESHOLD, recover: RECOVER_THRESHOLD, cooldownMs: ALERT_COOLDOWN_MS, maxPerDay: MAX_ALERTS_PER_DAY },
        lastRun,
        lastResults,
    };
}

module.exports = {
    runProbes, check, checkResults, evaluate, init, stop, setSock, status, notify, ownerJid,
    alertsEnabled, setAlerts, PROBES, INTERVAL_MS,
    _test: {
        probeState, setDataDir, INTERVAL_MS,
        FAIL_THRESHOLD, RECOVER_THRESHOLD, ALERT_COOLDOWN_MS, MAX_ALERTS_PER_DAY,
    },
};
