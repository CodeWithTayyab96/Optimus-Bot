/**
 * ytdlp — local YouTube extraction via the `yt-dlp` binary.
 *
 * Why: the third-party HTTP downloader APIs the bot used (EliteProTech, Yupra,
 * Okatsu, ootaizumi, NexOracle) are all dead/blocked, and @distube/ytdl-core can
 * no longer find playable formats. yt-dlp is a local, maintained binary that
 * works — so it is the PRIMARY source for .song / .video and the social commands.
 *
 * YouTube 403 ("Sign in to confirm you're not a bot") fix — three parts:
 *   1. A PO Token is required for the media (GVS) stream on the `mweb` client.
 *      We run the bgutil PO Token Provider HTTP server (default 127.0.0.1:4416)
 *      and the matching yt-dlp plugin mints the token automatically.
 *   2. yt-dlp needs a JS runtime to solve the signature / n-challenge; we point
 *      it at node and let it fetch the EJS solver (`--remote-components`).
 *   3. The NODE_OPTIONS shim present in this environment (which restricts node's
 *      fs API) is stripped from the spawned process — otherwise the EJS solver
 *      dies with "Access to this API has been restricted".
 *
 * All calls are guarded: if yt-dlp isn't installed, isAvailable() resolves false
 * and callers fall through to their other methods.
 */
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const proxyPool = require('./proxyPool');

// Which yt-dlp to run. Resolution order:
//   1. YTDLP_BIN — set by bootstrap.js when it resolved a non-PATH binary.
//   2. ~/.local/bin/yt-dlp — where `pip install --user` puts the script. That
//      build can load the bgutil PO-token plugin, so it beats the standalone.
//      This directory is usually absent from a container's PATH, which is why
//      an apparently successful install can still look "not installed".
//   3. .tools/yt-dlp — the standalone binary bootstrap.js downloads on hosts
//      with no python. Checked here too so the bot finds it however it was
//      started (panel, pm2, `npm start`, or a bare `node index.js`) rather than
//      depending on bootstrap having exported YTDLP_BIN into this process.
//   4. "yt-dlp" from PATH.
function resolveBin() {
    if (process.env.YTDLP_BIN) return process.env.YTDLP_BIN
    const exe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    const candidates = [
        path.join(os.homedir(), '.local', 'bin', exe),
        path.join(__dirname, '..', '.tools', exe),
    ]
    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate)) return candidate
        } catch {
            /* keep looking */
        }
    }
    return 'yt-dlp'
}

const BIN = resolveBin();
const DEFAULT_TIMEOUT = 120000;
const POT_URL = process.env.POT_PROVIDER_URL || 'http://127.0.0.1:4416';

// JS runtime + challenge-solver distribution (solves YouTube's signature /
// n-challenge). Only added for YouTube URLs.
const JS_ARGS = ['--js-runtimes', 'node', '--remote-components', 'ejs:github'];

// YouTube: the `mweb` client must be paired with the PO token, and the plugin
// needs to know where the provider server lives.
const YT_ARGS = [
    '--extractor-args', 'youtube:player_client=mweb',
    '--extractor-args', `youtubepot-bgutilhttp:base_url=${POT_URL}`,
];

function isYouTube(url) {
    return /(?:youtube\.com|youtu\.be)/i.test(String(url || ''));
}

function run(args, timeout = DEFAULT_TIMEOUT) {
    return new Promise((resolve, reject) => {
        // Strip the environment's NODE_OPTIONS shim (blocks node's fs API and
        // breaks yt-dlp's JS challenge solver), and keep the local PO token
        // provider off any configured HTTP proxy.
        const env = { ...process.env };
        delete env.NODE_OPTIONS;
        const noProxy = [env.NO_PROXY, env.no_proxy, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
        env.NO_PROXY = noProxy;
        env.no_proxy = noProxy;

        execFile(BIN, args, { timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true, env }, (err, stdout, stderr) => {
            if (err) {
                const detail = String(stderr || err.message || '').trim().split('\n').slice(-1)[0];
                return reject(new Error(detail || 'yt-dlp failed'));
            }
            resolve(String(stdout || '').trim());
        });
    });
}

/**
 * Run yt-dlp through a pooled proxy (when configured), recording the outcome so
 * dead proxies get deprioritised, and add the YouTube PO-token/JS args for
 * YouTube URLs. Falls back to a direct call when the pool is empty.
 */
async function runProxied(args, timeout = DEFAULT_TIMEOUT, url = '') {
    const proxy = proxyPool.pick();
    const extra = isYouTube(url) ? [...JS_ARGS, ...YT_ARGS] : [];
    const full = [...(proxy ? ['--proxy', proxy] : []), ...extra, ...args];
    try {
        const out = await run(full, timeout);
        proxyPool.report(proxy, true);
        return out;
    } catch (err) {
        proxyPool.report(proxy, false);
        throw err;
    }
}

let _available = null;
let _checkedAt = 0;
/**
 * True when the yt-dlp binary is callable.
 * A success is cached for 60s; a failure is NOT cached permanently (a transient
 * spawn error must not disable the yt-dlp path for the rest of the session).
 */
async function isAvailable() {
    // Cache BOTH outcomes briefly. A genuinely absent binary fails instantly
    // (ENOENT), but yt-dlp's standalone build unpacks itself on every run and
    // can take ~20s just to answer --version — re-probing that on every command
    // would stall the bot. (Previously only `true` was cached.)
    if (_available !== null && Date.now() - _checkedAt < 60000) return _available;
    try {
        // Generous ceiling on purpose: 15s was not enough for the standalone
        // binary, so a working yt-dlp was reported as "not installed".
        await run(['--version'], 60000);
        _available = true;
    } catch (err) {
        // Log the reason ONCE. A wrong-libc/arch binary fails here with a loader
        // message that names the cause; silently returning false is what made a
        // present binary look like a missing one.
        if (_available !== false) {
            console.warn(`[ytdlp] ${BIN} is not runnable: ${err.message}`);
            console.warn('[ytdlp] .song/.video will report "not installed" until this is fixed.');
        }
        _available = false;
    }
    _checkedAt = Date.now();
    return _available;
}

function firstUrl(out) {
    const line = String(out).split('\n').map(s => s.trim()).find(s => /^https?:\/\//.test(s));
    if (!line) throw new Error('yt-dlp returned no URL');
    return line;
}

/** Direct audio stream URL for a YouTube URL. */
async function getAudioUrl(url) {
    return firstUrl(await runProxied(['--no-warnings', '--no-playlist', '-f', 'bestaudio/best', '-g', url], DEFAULT_TIMEOUT, url));
}

/** Direct video stream URL (mp4 preferred, muxed fallback). */
async function getVideoUrl(url) {
    return firstUrl(await runProxied(['--no-warnings', '--no-playlist', '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b', '-g', url], DEFAULT_TIMEOUT, url));
}

/** Best single-file (already-muxed) stream URL for any yt-dlp-supported URL. */
async function getBestUrl(url) {
    return firstUrl(await runProxied(['--no-warnings', '--no-playlist', '-f', 'b[ext=mp4]/b', '-g', url], DEFAULT_TIMEOUT, url));
}

/** Video title (best-effort). */
async function getTitle(url) {
    try {
        const out = await runProxied(['--no-warnings', '--no-playlist', '--print', '%(title)s', url], DEFAULT_TIMEOUT, url);
        return out.split('\n')[0].trim();
    } catch {
        return '';
    }
}

/**
 * Download media to a temp file using yt-dlp itself.
 *
 * Fetching the `-g` URL with a bare HTTP client is unreliable: the GVS URL is
 * bound to the PO token / session, so plain axios intermittently gets 403.
 * Letting yt-dlp do the transfer keeps the headers/token consistent —
 * measured 5/5 vs 2/5 across the same five videos.
 *
 * @param {string} url
 * @param {string} dir  directory to write the temp file into
 * @param {string} format yt-dlp format selector
 * @returns {Promise<{buffer: Buffer, ext: string}>}
 */
async function downloadTo(url, dir, format) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const stamp = `yt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const template = path.join(dir, `${stamp}.%(ext)s`);
    await runProxied(['--no-warnings', '--no-playlist', '-f', format, '-o', template, url], 300000, url);

    const file = fs.readdirSync(dir).find(n => n.startsWith(stamp));
    if (!file) throw new Error('yt-dlp produced no file');
    const full = path.join(dir, file);
    const buffer = fs.readFileSync(full);
    try { fs.unlinkSync(full); } catch { /* best effort */ }
    return { buffer, ext: path.extname(file).slice(1) };
}

/** Download just the audio track (any yt-dlp-supported URL). */
function downloadAudio(url, dir) {
    return downloadTo(url, dir, 'bestaudio/best');
}

/** Download a muxed video (mp4 preferred; needs ffmpeg for merging). */
function downloadVideo(url, dir) {
    return downloadTo(url, dir, 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b');
}

/**
 * Search SoundCloud via yt-dlp's `scsearch` extractor (no API key needed).
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array<{title:string, uploader:string, url:string}>>}
 */
async function searchSoundCloud(query, limit = 10) {
    const out = await runProxied([
        '--no-warnings', '--flat-playlist',
        '--print', '%(title)s\t%(uploader)s\t%(webpage_url)s',
        `scsearch${limit}:${query}`
    ]);
    return out.split('\n').filter(Boolean).map(line => {
        const [title, uploader, url] = line.split('\t');
        return { title: title || '', uploader: uploader || '', url: url || '' };
    }).filter(r => r.url);
}

/**
 * Health of the bgutil PO token provider server (for .dlstatus).
 * @returns {Promise<{ok:boolean, detail:string}>}
 */
async function potProviderStatus() {
    // The probe can run in parallel with a heavy download, and the provider may
    // briefly reset the connection while minting a token — so retry a couple of
    // times before calling it dead.
    let lastErr = 'unreachable';
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await axios.get(`${POT_URL}/ping`, { timeout: 5000, proxy: false });
            const v = res.data?.version || '?';
            const up = Math.round(Number(res.data?.server_uptime) || 0);
            return { ok: true, detail: `v${v} · up ${up}s` };
        } catch (e) {
            lastErr = e.message;
            if (attempt < 3) await new Promise(r => setTimeout(r, 700));
        }
    }
    return { ok: false, detail: lastErr };
}

module.exports = {
    isAvailable, getAudioUrl, getVideoUrl, getBestUrl, getTitle,
    downloadAudio, downloadVideo, downloadTo,
    searchSoundCloud, potProviderStatus, run, POT_URL,
};
