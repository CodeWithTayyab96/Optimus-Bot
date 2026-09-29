#!/usr/bin/env node
/**
 * test-pairing.js — end-to-end test of the WhatsApp pairing flow.
 *
 * ⚠️  READ THIS FIRST: WHAT PAIRING IS *NOT*
 * WhatsApp pairing is NOT a local-network protocol. There is no mDNS, no device
 * discovery, no LAN handshake, and the phone and the bot never talk to each
 * other directly. Both connect OUTBOUND to WhatsApp's servers over the internet
 * (a WebSocket to web.whatsapp.com), and the link is brokered there. So:
 *   • no local network permissions are needed
 *   • the phone and the computer do NOT have to be on the same network
 *   • there is nothing to discover — the only requirement is outbound internet
 *
 * WHAT THIS ACTUALLY TESTS
 *   phase 1  pair       request a code (or show a QR) and complete the link
 *   phase 2  persist    confirm the session was written to disk and reports
 *                       registered: true — i.e. it survived the handshake
 *   phase 3  reconnect  open a FRESH socket from the on-disk session and connect
 *                       with no pairing at all — i.e. it persists across restarts
 *
 * SAFETY
 *   It uses its own directory (PAIR_TEST_DIR, default ./.pairtest) and never
 *   touches your real ./session. Delete .pairtest when you are done.
 *
 * USAGE
 *   node scripts/test-pairing.js 923417360554          pairing code
 *   node scripts/test-pairing.js 923417360554 --qr     QR in the terminal
 *   node scripts/test-pairing.js --clean               remove .pairtest and exit
 *
 * ⚠️  The number you pass gets LINKED as a WhatsApp device. Use the account you
 *     actually want the bot to run on — not your personal number by accident.
 */
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const NodeCache = require('node-cache');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const { describeSession, sessionSummary, needsPairing } = require('../lib/sessionInfo');

const TEST_DIR = process.env.PAIR_TEST_DIR || path.join(__dirname, '..', '.pairtest');
const CREDS_FILE = path.join(TEST_DIR, 'creds.json');
const OPEN_TIMEOUT_MS = Number(process.env.PAIR_OPEN_TIMEOUT_MS) || 120000;

const results = [];
function record(phase, ok, detail) {
    results.push({ phase, ok, detail });
    console.log(`${ok ? '✅' : '❌'} ${phase.padEnd(10)} ${detail}`);
}

function digitsOnly(v) {
    return String(v || '').replace(/[^0-9]/g, '');
}

function makeSocket(state, version, onQr) {
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // deprecated in v7 — we render it ourselves
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
        },
        markOnlineOnConnect: false, // stay unobtrusive during a test
        syncFullHistory: false,
        msgRetryCounterCache: new NodeCache(),
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
    });
    if (onQr) {
        sock.ev.on('connection.update', (u) => {
            if (u.qr) onQr(u.qr);
        });
    }
    return sock;
}

/** Resolve when the socket reports 'open'; reject on timeout or logout. */
function waitForOpen(sock, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`${label}: not connected within ${OPEN_TIMEOUT_MS / 1000}s`)),
            OPEN_TIMEOUT_MS
        );
        sock.ev.on('connection.update', (u) => {
            if (u.connection === 'open') {
                clearTimeout(timer);
                resolve(sock);
            }
            if (u.connection === 'close') {
                const code = u.lastDisconnect?.error?.output?.statusCode;
                if (code === DisconnectReason.loggedOut) {
                    clearTimeout(timer);
                    reject(new Error(`${label}: logged out (${code})`));
                }
            }
        });
    });
}

/** Close cleanly and give Baileys a moment to flush creds to disk. */
async function closeSocket(sock) {
    try {
        // socket.end() is async (returns a Promise) — awaiting it matters, because
        // phase 2 immediately reads creds.json from disk.
        await sock.end(undefined);
    } catch {
        /* already gone */
    }
    await new Promise((r) => setTimeout(r, 1500));
}

async function phase1Pair(phoneNumber, useQr) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
    console.log(`\n[phase 1] pairing into ${TEST_DIR}\n`);

    const { state, saveCreds } = await useMultiFileAuthState(TEST_DIR);
    const { version } = await fetchLatestBaileysVersion();

    let qrCount = 0;
    const sock = makeSocket(state, version, (qr) => {
        qrCount++;
        if (qrCount === 1) {
            console.log('  Scan with WhatsApp → Settings → Linked Devices:\n');
            try {
                require('qrcode-terminal').generate(qr, { small: true });
            } catch (e) {
                console.log('  (could not render QR:', e.message, ')');
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    if (!useQr) {
        // Let the socket reach the server before asking, as the bot does.
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(`  Pairing code: ${code}`);
                console.log('  WhatsApp → Settings → Linked Devices → Link a Device');
                console.log('  → "Link with phone number instead" → enter the code\n');
            } catch (err) {
                console.error('  Could not request a pairing code:', err.message);
            }
        }, 3000);
    }

    await waitForOpen(sock, 'phase 1');
    record('pair', true, `linked as ${String(sock.user?.id || '').split(':')[0]}`);

    await closeSocket(sock);
    return true;
}

function phase2Persist() {
    const info = describeSession(
        fs.existsSync(CREDS_FILE) ? JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8')) : null,
        CREDS_FILE
    );
    const ok = info.exists && info.registered;
    record('persist', ok, sessionSummary(info));
    if (!ok) throw new Error('the session did not persist as registered');
    return info;
}

async function phase3Reconnect() {
    console.log('\n[phase 3] reconnecting from disk (fresh socket, no pairing)\n');

    // A fresh auth state reads ONLY from disk — this is what makes it a real
    // persistence test rather than a re-use of the in-memory state.
    const { state } = await useMultiFileAuthState(TEST_DIR);
    if (needsPairing(describeSession(state.creds, CREDS_FILE))) {
        record('reconnect', false, 'loaded creds are not registered');
        return false;
    }

    const { version } = await fetchLatestBaileysVersion();
    const sock = makeSocket(state, version, null);
    await waitForOpen(sock, 'phase 3');
    record('reconnect', true, `reconnected as ${String(sock.user?.id || '').split(':')[0]} with no pairing`);
    await closeSocket(sock);
    return true;
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--clean')) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
        console.log(`removed ${TEST_DIR}`);
        return;
    }

    const useQr = args.includes('--qr');
    const phoneNumber = digitsOnly(args.find((a) => /^\+?[0-9][0-9\s-]*$/.test(a)));

    console.log('─'.repeat(64));
    console.log('WhatsApp pairing — end-to-end test');
    console.log('─'.repeat(64));
    console.log('Note: this is server-brokered, NOT a local-network protocol.');
    console.log('      The phone and this computer do not talk to each other;');
    console.log('      both connect out to WhatsApp. No LAN setup is involved.');
    console.log(`Test session: ${TEST_DIR}  (your real ./session is untouched)`);

    if (!useQr && !phoneNumber) {
        console.log('\nNo number given. Usage:');
        console.log('  node scripts/test-pairing.js 923417360554');
        console.log('  node scripts/test-pairing.js 923417360554 --qr');
        process.exit(1);
    }

    if (!useQr) {
        // Warn only — number metadata lags reality and WhatsApp is the authority.
        const parsed = require('awesome-phonenumber')('+' + phoneNumber);
        if (!parsed.isValid()) {
            console.log(`\n⚠️  ${phoneNumber} is not recognised as valid (region: ${parsed.getRegionCode() || 'unknown'}).`);
            console.log('   Continuing — WhatsApp will reject it if it is wrong.');
        }
        console.log(`\n⚠️  This will LINK ${phoneNumber} as a WhatsApp device.`);
        console.log('   Make sure that is the account you want the bot on.');
    }

    try {
        await phase1Pair(phoneNumber, useQr);
        phase2Persist();
        await phase3Reconnect();
    } catch (err) {
        record('aborted', false, err.message);
    }

    const passed = results.filter((r) => r.ok).length;
    console.log('\n' + '─'.repeat(64));
    console.log(`RESULT: ${passed}/${results.length} phases passed`);
    console.log('─'.repeat(64));
    for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.phase} — ${r.detail}`);

    if (passed === results.length) {
        console.log(`\nPairing works end to end. The session is at:`);
        console.log(`  ${TEST_DIR}`);
        console.log('\nTo use it for the real bot, copy its contents into ./session,');
        console.log('then delete the test folder:  npm run pair:clean');
    }
    console.log('');

    process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
    console.error('\ntest-pairing failed:', err?.stack || err?.message || err);
    process.exit(1);
});
