/**
 * .pair — generate a WhatsApp pairing code from inside the bot.
 *
 * HISTORY: this command previously called an external "pairing service"
 * (settings.pairCodeService, modelled on Knightbot-MD's
 * knight-bot-paircode.onrender.com). That approach hands the phone number to a
 * third party, and the code is minted by THEIR Baileys instance — so the session
 * it creates belongs to them, not to you. The external path has been removed;
 * pairing now happens entirely on this machine.
 *
 * WHY THIS NEEDS ITS OWN SOCKET
 *   requestPairingCode() only works on a socket that is NOT yet registered. The
 *   running bot is already registered, so it cannot mint a code for itself. A
 *   separate, unregistered socket is required — which is the entire reason the
 *   external service existed.
 *
 * WHERE THE RESULT GOES
 *   A pairing writes a session for whichever number you pair, which is usually
 *   NOT the account this bot is running as. So it is saved to ./session-pair and
 *   never activated automatically. Copy it into ./session and restart when you
 *   actually want to switch accounts.
 *
 * Usage
 *   .pair 923417360554     request a code for that number
 *   .pair status           is a pairing in progress?
 *   .pair cancel           abandon it and close the socket
 */
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const NodeCache = require('node-cache');
const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');
const isOwnerOrSudo = require('../../lib/isOwner');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

const PAIR_DIR = path.join(__dirname, '..', '..', 'session-pair');
const CODE_TTL_MS = 5 * 60 * 1000; // pairing codes are short-lived

/** The single in-flight pairing, if any. One at a time — each needs its own socket. */
let active = null;

function digitsOnly(v) {
    return String(v || '').replace(/[^0-9]/g, '');
}

/** Close the pairing socket and forget it. Safe to call when nothing is active. */
function cancelPairing() {
    if (!active) return false;
    if (active.timer) clearTimeout(active.timer);
    try {
        // socket.end() is async; we are not waiting on it here.
        active.sock.end(undefined).catch(() => {});
    } catch {
        /* already gone */
    }
    active = null;
    return true;
}

function statusText() {
    if (!active) return 'No pairing in progress.';
    const mins = Math.round((Date.now() - active.startedAt) / 60000);
    return active.linkedAs
        ? `Paired as ${active.linkedAs}. Session is in session-pair/ — copy it to session/ and restart.`
        : `Pairing ${active.number} — code issued ${mins} min ago (codes expire after 5).`;
}

/**
 * Open an unregistered socket against ./session-pair and request a code.
 * The socket is deliberately left running so the pairing can complete.
 */
async function startPairing(number) {
    cancelPairing();

    // Start clean: a stale unregistered session may hold an old ephemeral key pair.
    fs.rmSync(PAIR_DIR, { recursive: true, force: true });
    fs.mkdirSync(PAIR_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(PAIR_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
        },
        markOnlineOnConnect: false,
        syncFullHistory: false,
        msgRetryCounterCache: new NodeCache(),
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
    });

    sock.ev.on('creds.update', saveCreds);

    const entry = { number, sock, startedAt: Date.now(), linkedAs: '', timer: null };
    active = entry;

    // Never let a pairing socket hold the process open.
    entry.timer = setTimeout(() => {
        if (active === entry) {
            console.log('[pair] code expired — closing the pairing socket');
            cancelPairing();
        }
    }, CODE_TTL_MS);
    if (typeof entry.timer.unref === 'function') entry.timer.unref();

    sock.ev.on('connection.update', (u) => {
        if (u.connection === 'open') {
            entry.linkedAs = String(sock.user?.id || '').split(':')[0];
            console.log(`[pair] paired as ${entry.linkedAs} — session written to ${PAIR_DIR}`);
        }
    });

    // Give the socket a moment to reach the server before asking, as index.js does.
    await new Promise((r) => setTimeout(r, 3000));
    const raw = await sock.requestPairingCode(number);
    return raw?.match(/.{1,4}/g)?.join('-') || raw;
}

module.exports = {
    name: 'pair',
    aliases: ['paircode', 'linkdevice'],
    category: 'owner',
    description: 'Generate a WhatsApp pairing code locally (no third-party service)',
    usage: '.pair <number> · .pair status · .pair cancel',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const senderId = message.key.participant || message.key.remoteJid;
        if (!message.key.fromMe && !(await isOwnerOrSudo(senderId, sock, extra.chatId))) {
            return sock.sendMessage(
                extra.chatId,
                { text: style.permissionDenied('ownerOrSudo', { box: false }), ...channelInfo },
                { quoted: message }
            );
        }

        const sub = (args[0] || '').toLowerCase();

        if (sub === 'status') {
            return sock.sendMessage(
                extra.chatId,
                { text: style.box('🔗 PAIRING', [statusText()]), ...channelInfo },
                { quoted: message }
            );
        }

        if (sub === 'cancel') {
            const had = cancelPairing();
            return sock.sendMessage(
                extra.chatId,
                { text: style.success(had ? 'Pairing cancelled.' : 'Nothing to cancel.'), ...channelInfo },
                { quoted: message }
            );
        }

        // Accept "923417360554" or "923417360554,923001234567" — but only pair the
        // first, because each pairing needs its own unregistered socket.
        const number = digitsOnly(String(sub).split(',')[0]);
        if (number.length < 6 || number.length > 19) {
            return sock.sendMessage(
                extra.chatId,
                {
                    text: style.invalidInput('Give me a number to pair.', `${extra.prefix}pair 923417360554`, { box: false }),
                    ...channelInfo,
                },
                { quoted: message }
            );
        }

        // Confirm the number exists before asking WhatsApp to pair it.
        try {
            const check = await sock.onWhatsApp(`${number}@s.whatsapp.net`);
            if (!check?.[0]?.exists) {
                return sock.sendMessage(
                    extra.chatId,
                    { text: style.error('That number is not registered on WhatsApp.'), ...channelInfo },
                    { quoted: message }
                );
            }
        } catch {
            /* onWhatsApp is best-effort — carry on and let the request decide */
        }

        await sock.sendMessage(extra.chatId, {
            text: style.processing('Requesting a pairing code'),
            ...channelInfo,
        });

        try {
            const code = await startPairing(number);
            return sock.sendMessage(
                extra.chatId,
                {
                    text: style.box('🔗 PAIRING CODE', [
                        `Number: ${number}`,
                        `Code:   ${code}`,
                        '',
                        'On that phone:',
                        ' 1. WhatsApp → Settings → Linked Devices',
                        ' 2. Link a Device → "Link with phone number instead"',
                        ' 3. Enter the code',
                        '',
                        'Then send .pair status to confirm.',
                    ]),
                    ...channelInfo,
                },
                { quoted: message }
            );
        } catch (err) {
            cancelPairing();
            console.error('[pair] request failed:', err.message);
            return sock.sendMessage(
                extra.chatId,
                { text: style.error(`Could not get a pairing code: ${err.message}`), ...channelInfo },
                { quoted: message }
            );
        }
    },
    // Exported for tests.
    _test: { digitsOnly, statusText, cancelPairing, PAIR_DIR, CODE_TTL_MS },
};
