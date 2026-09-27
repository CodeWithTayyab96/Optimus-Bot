/**
 * potSupervisor — keeps the bgutil PO token provider alive.
 *
 * YouTube downloads (.song/.video) need the PO token provider running as a
 * separate process. Nothing else supervises it, so this module spawns it on bot
 * boot and automatically restarts it if it exits or crashes.
 *
 * Configure with:
 *   POT_PROVIDER_DIR  (default: ~/bgutil-ytdlp-pot-provider/server)
 *   POT_PROVIDER_PORT (default: 4416)
 */
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const PROVIDER_DIR = process.env.POT_PROVIDER_DIR
    || path.join(os.homedir(), 'bgutil-ytdlp-pot-provider', 'server');
const ENTRY = path.join(PROVIDER_DIR, 'build', 'main.js');
const PORT = process.env.POT_PROVIDER_PORT || '4416';
const BASE_DELAY_MS = 2000;
const HEALTHY_RUN_MS = 10000; // a run this long resets the crash backoff (the provider takes ~16s to warm up)

let child = null;
let stopped = false;
let restarts = 0;
let lastStart = null;
let backoff = BASE_DELAY_MS;

/** Is something already listening on the provider port? */
function portInUse(port, timeout = 1500) {
    return new Promise((resolve) => {
        const socket = net.connect({ host: '127.0.0.1', port: Number(port) });
        const done = (v) => { try { socket.destroy(); } catch { /* ignore */ } resolve(v); };
        socket.once('connect', () => done(true));
        socket.once('error', () => done(false));
        socket.setTimeout(timeout, () => done(false));
    });
}

async function start() {
    if (stopped) return;

    // On the FIRST start only, defer to an already-running provider (e.g. one
    // supervised externally by pm2/systemd) so we don't fight over the port.
    // Restarts always respawn — the port may linger in TIME_WAIT after a crash.
    if (restarts === 0 && await portInUse(PORT)) {
        console.log(`[pot] a PO token provider is already listening on ${PORT} — supervisor standing by`);
        return;
    }

    if (!fs.existsSync(ENTRY)) {
        console.error(`[pot] provider entry not found at ${ENTRY} — YouTube downloads will fall back to the slow path`);
        // The operator may install the provider without a full bot restart.
        // Re-check once after a minute so supervision can begin automatically.
        if (!stopped) setTimeout(() => { if (!stopped) start(); }, 60000);
        return;
    }

    const env = { ...process.env };
    delete env.NODE_OPTIONS; // the restrictive shim breaks the provider's JS runtime

    const startedAt = Date.now();
    child = spawn(process.execPath, [ENTRY, '--port', String(PORT)], {
        cwd: PROVIDER_DIR,
        env,
        stdio: 'ignore',
        windowsHide: true,
    });
    lastStart = new Date();
    console.log(`[pot] PO token provider started (pid ${child.pid}, port ${PORT})`);

    child.on('error', (e) => console.error('[pot] spawn error:', e.message));

    child.on('exit', (code, signal) => {
        child = null;
        if (stopped) return;

        const ranFor = Date.now() - startedAt;
        // Reset the backoff if it had been healthy; otherwise back off to avoid
        // a hot crash-loop (e.g. the port is already taken).
        backoff = ranFor > HEALTHY_RUN_MS ? BASE_DELAY_MS : Math.min(backoff * 2, 60000);

        restarts++;
        console.warn(`[pot] provider exited (code=${code} signal=${signal}) — restarting in ${backoff}ms`);
        setTimeout(start, backoff);
    });
}

/** Start (or restart) supervision. Safe to call once at boot. */
function startSupervisor() {
    stopped = false;
    backoff = BASE_DELAY_MS;
    start();
}

/** Stop supervising and terminate the provider. */
function stop() {
    stopped = true;
    if (child) {
        try { child.kill(); } catch { /* ignore */ }
        child = null;
    }
}

/** Diagnostics for .dlstatus / logs. */
function status() {
    return {
        running: Boolean(child),
        installed: fs.existsSync(ENTRY),
        pid: child ? child.pid : null,
        restarts,
        lastStart,
        dir: PROVIDER_DIR,
        port: PORT,
    };
}

module.exports = { startSupervisor, stop, status, PROVIDER_DIR, PORT };
