/**
 * warpProxy — run Cloudflare WARP as a local SOCKS5 proxy, without root.
 *
 * WHY THIS EXISTS
 *   A datacenter host is usually blocked by YouTube: every player client is
 *   refused with "Sign in to confirm you're not a bot" (see `.ytdiag`). The
 *   standard fix is a proxy, but:
 *     • free proxy lists are themselves datacenter IPs — blocked for the same reason
 *     • residential proxies cost money
 *     • the official Cloudflare WARP client needs ROOT, which a Pterodactyl
 *       container does not have
 *
 *   Cloudflare's WARP egress IPs are NOT blocked by YouTube (verified: yt-dlp
 *   downloads through WARP), and `usque` reimplements WARP's MASQUE protocol in
 *   userspace — so its `socks` mode needs no root and no TUN device. That makes a
 *   free, unlimited WARP tunnel available to an unprivileged container.
 *
 * HOW IT WORKS
 *   ensureUsque()  download the right build (checksum verified) + register once
 *   start()        run `usque socks -b 127.0.0.1 -p <port>`, wait until it answers,
 *                  and respawn it if it dies
 *   stop()         kill it
 *
 * OPT IN with WARP=1 in .env. It downloads a third-party binary and registers a
 * free Cloudflare account, so it is never started implicitly.
 *
 * ⚠️  Registering accepts Cloudflare's Terms of Service on your behalf:
 *     https://www.cloudflare.com/application/terms/
 * ⚠️  usque is a third-party project (github.com/Diniboy1123/usque), actively
 *     maintained but described by its author as early-stage. WARP's free tier is
 *     best-effort, so speed varies.
 * ⚠️  The proxy is bound to 127.0.0.1 only — never expose it on a shared host.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');

const USQUE_VERSION = 'v4.2.1';
const WARP_DIR = path.join(__dirname, '..', '.warp');
const CONFIG_FILE = path.join(WARP_DIR, 'config.json');
const PORT = Number(process.env.WARP_PORT) || 1080;
const REGISTER_TIMEOUT_MS = 90000;

let child = null;
// Module-level so stop() can suppress the auto-restart below. A local flag
// inside start() would reset on every call and let a killed proxy resurrect.
let stopping = false;

/** The release asset for this host, or null when there is no build. */
function assetName() {
    const arch = { x64: 'amd64', arm64: 'arm64', arm: 'armv7', ia32: '386' }[process.arch];
    if (!arch) return null;
    if (process.platform === 'linux') return `usque_${USQUE_VERSION.replace(/^v/, '')}_linux_${arch}.zip`;
    if (process.platform === 'win32') return `usque_${USQUE_VERSION.replace(/^v/, '')}_windows_${arch}.zip`;
    if (process.platform === 'darwin') return `usque_${USQUE_VERSION.replace(/^v/, '')}_darwin_${arch}.zip`;
    return null;
}

function binaryPath() {
    // WARP_TEST_BIN lets the test suite swap in a stub without touching the
    // production path — nothing in normal operation sets it.
    if (process.env.WARP_TEST_BIN) return process.env.WARP_TEST_BIN;
    return path.join(WARP_DIR, process.platform === 'win32' ? 'usque.exe' : 'usque');
}

function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Minimal ZIP reader — no system `unzip`, no npm dependency.
 *
 * A Pterodactyl container may have no unzip/7z/busybox at all, and this project
 * already avoids adding dependencies. Node has no zip API, but it does have
 * zlib.inflateRaw, which is all a deflated entry needs.
 */
function extractZipEntry(zipBuffer, wantedSuffix) {
    // Walk the central directory rather than local headers: entries written with
    // a data descriptor have unreliable sizes in the local header.
    const eocd = zipBuffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) throw new Error('not a zip (no end-of-central-directory)');

    const count = zipBuffer.readUInt16LE(eocd + 10);
    let offset = zipBuffer.readUInt32LE(eocd + 16);

    for (let i = 0; i < count; i++) {
        if (zipBuffer.readUInt32LE(offset) !== 0x02014b50) break;
        const method = zipBuffer.readUInt16LE(offset + 10);
        const compressedSize = zipBuffer.readUInt32LE(offset + 20);
        const nameLen = zipBuffer.readUInt16LE(offset + 28);
        const extraLen = zipBuffer.readUInt16LE(offset + 30);
        const commentLen = zipBuffer.readUInt16LE(offset + 32);
        const localOffset = zipBuffer.readUInt32LE(offset + 42);
        const name = zipBuffer.slice(offset + 46, offset + 46 + nameLen).toString('utf8');

        if (name.endsWith(wantedSuffix)) {
            // Local header: 30 bytes + its own name/extra lengths.
            const lNameLen = zipBuffer.readUInt16LE(localOffset + 26);
            const lExtraLen = zipBuffer.readUInt16LE(localOffset + 28);
            const dataStart = localOffset + 30 + lNameLen + lExtraLen;
            const data = zipBuffer.slice(dataStart, dataStart + compressedSize);
            return method === 0 ? data : zlib.inflateRawSync(data);
        }
        offset += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error(`no entry ending in ${wantedSuffix} inside the archive`);
}

/** Download a URL to a Buffer. */
function fetchBuffer(url, timeoutMs = 300000) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? require('https') : require('http');
        const req = client.get(url, { headers: { 'User-Agent': 'OptimusBot-WARP/1.0' } }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                res.resume();
                return fetchBuffer(new URL(res.headers.location, url).toString(), timeoutMs).then(resolve, reject);
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => req.destroy(new Error('download timed out')));
    });
}

/**
 * Run `usque register` and answer the Terms-of-Service prompt.
 *
 * usque prints "Do you agree? (y/n):" and blocks on stdin. We watch the output
 * stream and write "y\n" the moment the prompt appears (with a 2s fallback in
 * case the prompt text is missed). Returns { code, signal, out }.
 *
 * `spawn` rather than `spawnSync`: registration can hang on a flaky network, and
 * a kill timer is far easier to manage with an event-based child than with
 * spawnSync's single timeout (which also swallowed the error text earlier).
 */
function register(log = console.log) {
    return new Promise((resolve, reject) => {
        const bin = binaryPath();
        let proc;
        try {
            proc = spawn(bin, ['register'], { cwd: WARP_DIR, stdio: ['pipe', 'pipe', 'pipe'] });
        } catch (err) {
            return reject(err);
        }

        let out = '';
        let answered = false;
        const answer = () => {
            if (answered || proc.stdin.destroyed) return;
            answered = true;
            try {
                proc.stdin.write('y\n');
            } catch {
                /* ignore */
            }
        };
        const onData = (buf) => {
            const s = String(buf);
            out += s;
            if (!answered && /\(y\/n\)|do you agree/i.test(s)) answer();
        };
        proc.stdout.on('data', onData);
        proc.stderr.on('data', onData);

        const killTimer = setTimeout(() => {
            log('[warp] register is taking too long — aborting');
            try {
                proc.kill('SIGKILL');
            } catch {
                /* ignore */
            }
        }, REGISTER_TIMEOUT_MS);

        proc.on('error', (err) => {
            clearTimeout(killTimer);
            reject(err);
        });
        proc.on('close', (code, signal) => {
            clearTimeout(killTimer);
            try {
                proc.stdin.end();
            } catch {
                /* ignore */
            }
            resolve({ code, signal, out: out.trim() });
        });

        // Fallback: if the prompt text was not captured for any reason, answer.
        setTimeout(answer, 2000);
    });
}

/**
 * Network-level failures worth retrying (a flaky first attempt must not kill
 * bot startup) versus hard configuration errors that will never succeed.
 */
function isTransientRegisterError(msg) {
    return /unexpected EOF|failed to send request|i\/o timeout|context deadline|connection reset|connection refused|EOF|timed out|dial tcp|no such host|network is unreachable|TLS handshake|socket hang up/i.test(
        msg
    );
}

/** Download + verify + extract usque, then register once (with retries). */
async function ensureUsque(log = console.log) {
    fs.mkdirSync(WARP_DIR, { recursive: true });
    const bin = binaryPath();

    if (!fs.existsSync(bin)) {
        const asset = assetName();
        if (!asset) throw new Error(`no usque build for ${process.platform}/${process.arch}`);

        const base = `https://github.com/Diniboy1123/usque/releases/download/${USQUE_VERSION}`;
        log(`[warp] downloading ${asset}…`);
        const zip = await fetchBuffer(`${base}/${asset}`);

        // Verify against the published checksums — this is a binary we then run.
        try {
            const sums = (await fetchBuffer(`${base}/checksums.txt`, 60000)).toString('utf8');
            const line = sums.split('\n').find((l) => l.includes(asset));
            if (line) {
                const expected = line.trim().split(/\s+/)[0];
                const actual = crypto.createHash('sha256').update(zip).digest('hex');
                if (expected !== actual) throw new Error(`checksum mismatch for ${asset}`);
                log('[warp] checksum verified ✅');
            }
        } catch (err) {
            if (/checksum mismatch/.test(err.message)) throw err;
            log(`[warp] could not verify checksum (${err.message}) — continuing`);
        }

        fs.writeFileSync(bin, extractZipEntry(zip, process.platform === 'win32' ? '.exe' : 'usque'));
        if (process.platform !== 'win32') fs.chmodSync(bin, 0o755);
        log(`[warp] usque installed → ${bin}`);
    }

    if (!fs.existsSync(CONFIG_FILE)) {
        log('[warp] registering a free Cloudflare WARP account…');
        log("[warp] NOTE: this accepts Cloudflare's Terms of Service on your behalf.");
        log('[warp] (terms: https://www.cloudflare.com/application/terms/)');

        let last = { code: -1, out: '' };
        for (let attempt = 1; attempt <= 4; attempt++) {
            last = await register(log);
            if (fs.existsSync(CONFIG_FILE)) {
                log('[warp] registered ✅');
                return bin;
            }
            const lines = (last.out || '').split('\n').filter(Boolean);
            const msg = lines[lines.length - 1] || `exit code ${last.code}`;

            if (attempt < 4 && isTransientRegisterError(msg)) {
                log(`[warp] register attempt ${attempt} failed (${msg}) — retrying in 4s…`);
                await delay(4000);
                continue;
            }
            // Genuine config error, or we ran out of retries.
            if (isTransientRegisterError(msg)) {
                throw new Error(
                    `usque register failed after ${attempt} attempts: ${msg}\n` +
                        `        If this keeps happening, register manually:\n` +
                        `          cd .warp && ./usque register   (answer "y" to the Terms of Service)`
                );
            }
            throw new Error(`usque register failed: ${msg}`);
        }
    }

    return bin;
}

/** Resolve once the SOCKS5 port accepts a connection. */
function waitForPort(port, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;
        const attempt = () => {
            const socket = require('net').connect({ host: '127.0.0.1', port });
            socket.on('connect', () => {
                socket.destroy();
                resolve();
            });
            socket.on('error', () => {
                socket.destroy();
                if (Date.now() > deadline) reject(new Error(`WARP proxy did not open port ${port}`));
                else setTimeout(attempt, 700);
            });
        };
        attempt();
    });
}

/**
 * Start (or restart) the WARP SOCKS5 proxy. Resolves with the proxy URL to put
 * in PROXIES, e.g. socks5://127.0.0.1:1080.
 */
async function start(log = console.log) {
    const bin = await ensureUsque(log);

    if (child) return proxyUrl();

    const spawnOne = () => {
        // By default usque's MASQUE tunnel rides HTTP/3 (QUIC = UDP). Some hosts
        // block outbound UDP, in which case the tunnel never comes up — WARP_HTTP2
        // forces HTTP/2-over-TCP instead. Harmless to leave off when UDP works.
        const args = ['socks', '-b', '127.0.0.1', '-p', String(PORT)];
        if (process.env.WARP_HTTP2 === '1') args.push('--http2');
        child = spawn(bin, args, {
            cwd: WARP_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const relay = (buf) => {
            const line = String(buf).trim();
            if (line) log(`[warp] ${line.split('\n').pop()}`);
        };
        child.stdout.on('data', relay);
        child.stderr.on('data', relay);

        child.on('exit', (code) => {
            child = null;
            // Keep the tunnel up: without it the bot silently loses YouTube again.
            if (!stopping) {
                log(`[warp] usque exited (${code}) — restarting in 5s`);
                setTimeout(() => start(log).catch((e) => log(`[warp] restart failed: ${e.message}`)), 5000);
            }
        });
    };

    stopping = false;
    spawnOne();
    try {
        await waitForPort(PORT);
    } catch (e) {
        // The socks process may still be starting; kill it so a retry is clean.
        stop();
        throw new Error(`WARP proxy did not start: ${e.message}`);
    }
    log(`[warp] SOCKS5 proxy ready on 127.0.0.1:${PORT}`);
    return proxyUrl();
}

function proxyUrl() {
    return `socks5://127.0.0.1:${PORT}`;
}

/** Stop the proxy. Safe to call when it is not running. */
function stop() {
    stopping = true;
    if (!child) return false;
    try {
        child.kill();
    } catch {
        /* already gone */
    }
    child = null;
    return true;
}

module.exports = {
    start,
    stop,
    proxyUrl,
    ensureUsque,
    register,
    waitForPort,
    isTransientRegisterError,
    assetName,
    extractZipEntry,
    binaryPath,
    USQUE_VERSION,
    PORT,
};
