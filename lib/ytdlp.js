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
        // A venv install (bootstrap's tryVenvInstall) has the PO-token plugin, so
        // it must be preferred over the plugin-less standalone in .tools/.
        path.join(__dirname, '..', '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', exe),
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

const BIN = resolveBin()

/**
 * PyInstaller onefile builds — which is what yt-dlp's standalone binaries are —
 * unpack themselves into the system temp dir on EVERY run. A container whose
 * /tmp is noexec, read-only or very small therefore breaks yt-dlp while every
 * other part of the bot keeps working: the process starts, fails to unpack, and
 * reports nothing useful. Point TMPDIR at a writable directory inside the
 * project instead, falling back to the system default when even that fails.
 *
 * Override with OPTIMUS_TMP_DIR if you need a specific location.
 */
const TMP_DIR = process.env.OPTIMUS_TMP_DIR || path.join(__dirname, '..', '.tools', 'tmp')

let _tmpDir
/** The writable temp dir to use for yt-dlp, or null to keep the system default. */
function tempDirOverride() {
    if (_tmpDir !== undefined) return _tmpDir
    try {
        fs.mkdirSync(TMP_DIR, { recursive: true })
        fs.accessSync(TMP_DIR, fs.constants.W_OK)
        _tmpDir = TMP_DIR
    } catch {
        _tmpDir = null
    }
    return _tmpDir
}

/** musl (Alpine) vs glibc matters when picking a standalone yt-dlp build. */
function libcName() {
    if (process.platform !== 'linux') return 'n/a'
    try {
        if (fs.existsSync('/etc/alpine-release')) return 'musl'
        return fs.readdirSync('/lib').some((f) => f.startsWith('ld-musl-')) ? 'musl' : 'glibc'
    } catch {
        return 'unknown'
    }
}

/**
 * Find a bare command name on PATH. Needed for diagnostics: when BIN is just
 * "yt-dlp" (resolved by the OS at spawn time) there is no file to stat, so a
 * naive check reports "not found" for a binary that runs perfectly.
 */
function resolveOnPath(cmd) {
    const exts = process.platform === 'win32'
        ? String(process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean)
        : ['']
    for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
        if (!dir) continue
        for (const ext of exts) {
            const candidate = path.join(dir, cmd + ext)
            try {
                if (fs.statSync(candidate).isFile()) return candidate
            } catch {
                /* keep looking */
            }
        }
    }
    return null
};
const DEFAULT_TIMEOUT = 120000;
const POT_URL = process.env.POT_PROVIDER_URL || 'http://127.0.0.1:4416';

// JS runtime + challenge-solver distribution (solves YouTube's signature /
// n-challenge). Only added for YouTube URLs.
const JS_ARGS = ['--js-runtimes', 'node', '--remote-components', 'ejs:github'];

// YouTube: the `mweb` client must be paired with a PO token, and the plugin
// needs to know where the provider server lives.
//
// BUT the bgutil PO-token plugin is a *python* plugin, and the standalone yt-dlp
// binary has no python — so on such a host mweb is pinned with no way to obtain
// a token, and YouTube then returns no usable formats at all. Measured against a
// real video with the standalone build:
//
//   player_client=mweb   -> ERROR: Requested format is not available
//   (yt-dlp's defaults)  -> returns a working googlevideo URL
//
// So mweb is only pinned when a plugin can actually supply the token.
const YT_ARGS_MWEB = [
    '--extractor-args', 'youtube:player_client=mweb',
    '--extractor-args', `youtubepot-bgutilhttp:base_url=${POT_URL}`,
];

const STANDALONE_MARKER = '/.tools/';

/**
 * Can a PO-token plugin serve the `mweb` client here?
 *
 * The standalone build we download into .tools/ ships no python, so it cannot
 * load the plugin. Anything else (pip install, ~/.local/bin) may have it.
 * Override with YTDLP_FORCE_MWEB=1 or YTDLP_NO_POT_PLUGIN=1 if the guess is wrong.
 */
function potPluginPossible() {
    if (process.env.YTDLP_FORCE_MWEB === '1') return true;
    if (process.env.YTDLP_NO_POT_PLUGIN === '1') return false;
    // Normalise separators first: a Windows path can arrive with either style,
    // and comparing against path.sep alone silently missed the marker.
    const normalised = String(BIN).replace(/\\/g, '/');
    return !normalised.includes(STANDALONE_MARKER);
}

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

        // PyInstaller unpacks into the temp dir; give it one we know is writable.
        const tmp = tempDirOverride();
        if (tmp) {
            env.TMPDIR = tmp;
            env.TEMP = tmp;
            env.TMP = tmp;
        }

        execFile(BIN, args, { timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true, env }, (err, stdout, stderr) => {
            if (err) {
                // Keep the full stderr and the exit code on the error: the reason
                // a binary will not run (loader error, wrong libc) is in there,
                // and callers only showing `message` is what made this invisible.
                const lines = String(stderr || '').trim().split('\n').filter(Boolean);
                const detail = lines[lines.length - 1] || err.message || 'yt-dlp failed';
                const wrapped = new Error(detail);
                wrapped.exitCode = typeof err.code === 'number' ? err.code : null;
                wrapped.stderr = String(stderr || '').trim();
                wrapped.timedOut = err.killed === true;
                wrapped.signal = err.signal || null;
                return reject(wrapped);
            }
            resolve(String(stdout || '').trim());
        });
    });
}

/**
 * Optional cookie jar, passed to every yt-dlp call.
 *
 * A single cookie VALUE is not enough — yt-dlp needs a whole Netscape-format
 * cookie file. Point YTDLP_COOKIES at one, or drop it at .tools/cookies.txt
 * (which is gitignored, so it can never be committed).
 *
 * Only useful for age-restricted / "confirm you're not a bot" content, and it
 * carries real risk: yt-dlp driving a logged-in account from a datacenter IP is
 * precisely the pattern that gets accounts flagged. Prefer a throwaway account,
 * and expect the file to expire within days.
 */
const COOKIES_FILE = process.env.YTDLP_COOKIES || path.join(__dirname, '..', '.tools', 'cookies.txt')

function cookieArgs() {
    try {
        if (fs.existsSync(COOKIES_FILE)) return ['--cookies', COOKIES_FILE]
    } catch {
        /* treat as absent */
    }
    return []
}

/**
 * Extra yt-dlp arguments from YTDLP_EXTRA_ARGS (whitespace-separated).
 *
 * An escape hatch so a host can apply a fix without waiting for a code change —
 * e.g. `YTDLP_EXTRA_ARGS=-6` to force IPv6 when YouTube blocks the IPv4 address
 * but not the IPv6 one. Validated by `.ytdiag`, which tests both families.
 */
const EXTRA_ARGS = (() => {
    const raw = String(process.env.YTDLP_EXTRA_ARGS || '').trim()
    return raw ? raw.split(/\s+/) : []
})()

/**
 * One yt-dlp invocation through the proxy pool, with the given extra args.
 *
 * `useProxy` is false for hosts that are NOT blocked: routing everything through
 * the tunnel is a regression for them (SoundCloud worked direct, then started
 * timing out once PROXIES was set) and it burns tunnel bandwidth on traffic that
 * never needed it. Only YouTube actually needs the tunnel.
 */
async function runWithExtras(args, timeout, extras, useProxy = true) {
    const proxy = useProxy ? proxyPool.pick() : null;
    const full = [...(proxy ? ['--proxy', proxy] : []), ...cookieArgs(), ...EXTRA_ARGS, ...extras, ...args];
    try {
        const out = await run(full, timeout);
        proxyPool.report(proxy, true);
        return out;
    } catch (err) {
        proxyPool.report(proxy, false);
        throw err;
    }
}

/**
 * Run yt-dlp through a pooled proxy (when configured), recording the outcome so
 * dead proxies get deprioritised, and add the YouTube PO-token/JS args for
 * YouTube URLs. Falls back to a direct call when the pool is empty.
 *
 * Whether a PO-token plugin is actually loadable cannot be detected reliably —
 * it depends on the yt-dlp install, not just the binary path — so instead of
 * trusting that guess we retry once without the pinned `mweb` client. On a
 * plugin-less host mweb returns no formats at all; yt-dlp's own client choice
 * does work. This makes the YouTube path self-correcting on any host.
 */
async function runProxied(args, timeout = DEFAULT_TIMEOUT, url = '') {
    // Only YouTube is IP-blocked; everything else stays direct (see runWithExtras).
    if (!isYouTube(url)) return runWithExtras(args, timeout, [], false);

    const pinned = potPluginPossible() ? YT_ARGS_MWEB : [];
    try {
        return await runWithExtras(args, timeout, [...JS_ARGS, ...pinned]);
    } catch (err) {
        if (pinned.length === 0) throw err;
        console.warn(
            `[ytdlp] pinned mweb client failed (${String(err.message).slice(0, 120)}) — ` +
                "retrying with yt-dlp's default clients"
        );
        return await runWithExtras(args, timeout, [...JS_ARGS]);
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

/**
 * Everything needed to explain whether yt-dlp can run here, and why not.
 *
 * This exists because a bare "yt-dlp is not installed" was indistinguishable
 * from "present but not executable" / "wrong libc" / "temp dir not writable".
 * `.dlstatus` (owner-only) renders it; nothing here is exposed to normal users.
 */
async function diagnose() {
    const tmp = tempDirOverride()

    // BIN may be an absolute path, or a bare name the OS resolves via PATH.
    const isPath = BIN.includes('/') || BIN.includes(path.sep)
    const resolved = isPath ? BIN : resolveOnPath(BIN)

    const report = {
        bin: resolved || BIN,
        fromPath: !isPath,
        platform: `${process.platform}/${process.arch}`,
        libc: libcName(),
        tmpdir: tmp || process.env.TMPDIR || process.env.TMP || os.tmpdir(),
        tmpdirOverridden: Boolean(tmp),
        // Presence only — never the contents, and never the path in user-facing text.
        cookies: cookieArgs().length > 0,
        exists: false,
        sizeBytes: 0,
        executable: false,
        ok: false,
        version: '',
        error: '',
        exitCode: null,
        stderr: '',
    }

    if (!resolved) {
        report.error = `"${BIN}" is not on PATH and no local build was found`
        return report
    }

    try {
        const st = fs.statSync(resolved)
        report.exists = true
        report.sizeBytes = st.size
        // Windows decides by extension; elsewhere the execute bit decides.
        report.executable = process.platform === 'win32' || Boolean(st.mode & 0o111)
    } catch (err) {
        report.error = `binary not found (${err.code || err.message})`
        return report
    }

    try {
        // 50s, not 60s: callers such as lib/dlHealth wrap this in their own
        // 60s race, and an inner timeout that equals the outer one loses.
        const out = await run(['--version'], 50000)
        report.ok = true
        report.version = out.split('\n')[0].trim()
    } catch (err) {
        report.error = err.message
        report.exitCode = err.exitCode ?? null
        report.stderr = err.stderr || ''
    }
    return report
}

module.exports = {
    isAvailable, getAudioUrl, getVideoUrl, getBestUrl, getTitle,
    downloadAudio, downloadVideo, downloadTo,
    searchSoundCloud, potProviderStatus, run, POT_URL,
    diagnose, tempDirOverride, libcName, potPluginPossible, resolveBin, cookieArgs,
};
