/**
 * dlHealth — download-source health probes + scheduled owner alerting.
 *
 * The probes are shared by the `.dlstatus` command (on demand) and by the
 * background monitor started at boot. The monitor alerts the owner ONLY when a
 * source flips state (healthy → dead, or back again), so a persistently broken
 * source does not spam.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const settings = require('../settings');
const ytdlp = require('./ytdlp');
const proxyPool = require('./proxyPool');
const style = require('./messageStyle');
const { nexoracle } = require('./mediaApi');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Known-good public test targets.
const TEST_YT = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // short + stable
const TEST_MF = 'https://www.mediafire.com/file/blj91w6ah0pxa7i/Tomodachi.zip/file';
const TEST_IG = 'https://www.instagram.com/p/C_ntulJK_V2/';

const STATE_FILE = path.join(__dirname, '..', 'data', 'dlHealthState.json');
const INTERVAL_MS = Number(process.env.DL_HEALTH_INTERVAL_MS) || 20 * 60 * 1000; // 20 min

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

async function notify(title, items) {
    const jid = ownerJid();
    if (!jid || !sockRef) return;
    const body = items.map(r => `${r.ok ? '✅' : '❌'} ${r.name} — ${r.detail}`);
    const text = style.box(title, [...body, '', `🕒 ${new Date().toLocaleString()}`]);
    try {
        await sockRef.sendMessage(jid, { text });
        console.log('[dlHealth] alerted owner:', title);
    } catch (e) {
        console.error('[dlHealth] alert failed:', e.message);
    }
}

/**
 * Run the probes, persist state, and alert the owner on any state change.
 * @param {{alert?: boolean}} [opts]
 */
async function check({ alert = true } = {}) {
    const results = await runProbes();
    lastRun = new Date();
    lastResults = results;

    const prev = loadState();
    const next = {};
    const broke = [];
    const fixed = [];

    for (const r of results) {
        next[r.name] = r.ok;
        const was = prev[r.name];
        if (was === true && r.ok === false) broke.push(r);   // healthy -> dead
        if (was === false && r.ok === true) fixed.push(r);   // dead -> healthy
    }
    saveState(next);

    if (alert && sockRef) {
        if (broke.length) await notify('🔴 DOWNLOAD SOURCE DOWN', broke);
        if (fixed.length) await notify('🟢 DOWNLOAD SOURCE RECOVERED', fixed);
    }

    return { results, broke, fixed };
}

/** Start the background monitor. Call once after the bot connects. */
function init(sock) {
    sockRef = sock;
    if (timer) return;

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
    return { running: Boolean(timer), intervalMs: INTERVAL_MS, lastRun, lastResults };
}

module.exports = { runProbes, check, init, stop, setSock, status, notify, ownerJid, PROBES, INTERVAL_MS };
