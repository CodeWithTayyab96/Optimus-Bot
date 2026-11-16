/**
 * Optimus Bot - A WhatsApp Bot
 * Copyright (c) 2026 Muhammad Tayyab Imran
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const style = require('./lib/messageStyle')
const { describeSession, sessionSummary, needsPairing } = require('./lib/sessionInfo')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
// Using a lightweight persisted store instead of makeInMemoryStore (compat across versions)
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// Import lightweight store
const store = require('./lib/lightweight_store')
// Import productivity scheduler
const scheduler = require('./lib/productivity/scheduler')
// Supervise the bgutil PO token provider (required for YouTube downloads)
const potSupervisor = require('./lib/potSupervisor')
// Download-source health monitor (alerts the owner when a source dies)
const dlHealth = require('./lib/dlHealth')
// Outbound notification governor — keeps progress/completion chatter from
// turning the account into a spam signal. See lib/notify.js.
const notify = require('./lib/notify')
// Socket lifecycle + the single reconnect loop. See lib/connection.js.
const { createSupervisor } = require('./lib/connection')
const { registerStatusAck } = require('./lib/statusAck')

// Initialize store
store.readFromFile()
const settings = require('./settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// Memory optimization - Force garbage collection if available
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Garbage collection completed')
    }
}, 60_000) // every 1 minute

// Memory monitoring - Restart if RAM gets too high.
// The limit is settings.maxRssMb (env MAX_RSS_MB), not a hardcoded number: it
// has to track the host, and 400 MB was wrong for anything but a small panel.
setInterval(() => {
    const limit = settings.maxRssMb || 600
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > limit) {
        console.log(`⚠️ RAM too high (>${limit}MB, at ${used.toFixed(0)}MB), restarting bot...`)
        process.exit(1) // Panel will auto-restart
    }
}, 30_000) // check every 30 seconds

// `data/` is runtime state and is NOT committed, so on a fresh clone it may not
// exist yet. Create it and seed owner.json from settings.ownerNumber rather
// than crashing with ENOENT. Nothing else in the codebase ever writes this
// file, so it has to be created here on first run.
const DATA_DIR = './data'
const OWNER_FILE = `${DATA_DIR}/owner.json`

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
}

let owner
try {
    owner = JSON.parse(fs.readFileSync(OWNER_FILE, 'utf8'))
    if (!Array.isArray(owner)) owner = []
} catch (err) {
    // Missing or corrupt — seed it from the configured owner number.
    owner = settings.ownerNumber ? [String(settings.ownerNumber)] : []
    try {
        fs.writeFileSync(OWNER_FILE, JSON.stringify(owner, null, 2))
        console.log(`📝 Created ${OWNER_FILE} with owner ${owner.join(', ') || '(none)'}`)
    } catch (writeErr) {
        console.warn(`Could not create ${OWNER_FILE}: ${writeErr.message}`)
    }
}

global.botname = "OPTIMUS BOT"
global.themeemoji = "•"
// Default authentication flow is the pairing code (matches the README). Pass
// --qr to print a QR code instead. --pairing-code is kept for compatibility.
const pairingCode = !process.argv.includes("--qr") || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // In a non-interactive environment (a panel) there is no prompt to answer,
        // so fall back to settings. Prefer botNumber: that is the account the BOT
        // runs on, whereas ownerNumber is the person who COMMANDS it — pairing
        // with the wrong one links the wrong WhatsApp account.
        return Promise.resolve(settings.botNumber || settings.ownerNumber || null)
    }
}

// A pairing code is single-use and each new request INVALIDATES the previous
// one. startXeonBotInc() runs again on every reconnect, so without this guard a
// flapping connection re-prompts and re-issues codes forever, and the code you
// are trying to type is always the one that just got replaced.
let pairingCodeIssued = false

// Same idea for the "Bot Online" notice: reconnect flaps kept re-sending it to
// the owner's own chat. Set once the first connection opens in this process.
let connectionAnnounced = false

/**
 * Baileys version, resolved once.
 *
 * `fetchLatestBaileysVersion()` is a network call. Doing it on every reconnect
 * meant a failing handshake also had to survive a version lookup, and a slow
 * one delayed the retry — so it is fetched once and reused.
 */
let resolvedVersion = null
async function resolveVersion() {
    if (resolvedVersion) return resolvedVersion
    try {
        const { version } = await fetchLatestBaileysVersion()
        resolvedVersion = version
    } catch (error) {
        console.error(chalk.yellow(`[conn] could not fetch the Baileys version (${error.message}) — using the bundled default`))
        resolvedVersion = undefined
    }
    return resolvedVersion
}

/**
 * Say plainly what the session on disk actually is.
 *
 * "It has creds.json but still asks for a number" is the single most confusing
 * thing about linking: a creds.json FILE is not a LINKED session. Baileys writes
 * one with freshly generated keys as soon as the socket connects, so the file
 * can exist — and be rewritten — while `registered` is still false.
 */
function reportSessionState(creds) {
    const info = describeSession(creds, './session/creds.json')
    console.log(chalk.cyan(`[session] ${sessionSummary(info)}`))
    if (needsPairing(info)) {
        console.log(chalk.yellow('[session] Not linked — the bot will ask for a phone number to pair.'))
        console.log(
            chalk.gray(
                '[session] A creds.json that EXISTS is not necessarily a linked one; it is rewritten on every connect.'
            )
        )
    }
}

/**
 * Write the pairing code to data/pairing-code.txt as well as the console.
 *
 * On a panel the console scrolls and can be hard to read back; missing the code
 * means restarting, which issues a NEW code and invalidates the one you had.
 * A file can be opened any time from the panel's Files tab.
 * (`data/*` is gitignored, and the code is short-lived anyway.)
 */
function writePairingCodeFile(number, code) {
    const file = './data/pairing-code.txt'
    try {
        fs.mkdirSync('./data', { recursive: true })
        fs.writeFileSync(
            file,
            [
                `Number : ${number}`,
                `Code   : ${code}`,
                `Issued : ${new Date().toISOString()}`,
                '',
                'WhatsApp → Settings → Linked Devices → Link a Device',
                '→ "Link with phone number instead" → enter the code.',
                '',
                'This file is deleted automatically once the bot is linked.',
            ].join('\n')
        )
        console.log(chalk.cyan(`[pair] code also written to ${file}`))
    } catch (err) {
        // Never let a convenience write break pairing.
        console.log(chalk.gray(`[pair] could not write ${file}: ${err.message}`))
    }
}

/** The link succeeded — the code is spent. */
function clearPairingCodeFile() {
    try {
        fs.rmSync('./data/pairing-code.txt', { force: true })
    } catch {
        /* nothing to remove */
    }
}


/**
 * Everything that happens when a connection actually OPENS.
 *
 * Kept out of the event handler so the supervisor owns the lifecycle: this
 * function is called once per successful connection, by the supervisor, and
 * never on a failed attempt.
 */
async function handleConnected(sock) {
    clearPairingCodeFile() // linked — the code is spent

    const selfNumber = String(sock.user?.id || '').split(':')[0]
    console.log(chalk.magenta(' '))
    console.log(chalk.yellow(`🌿 Connected as ${selfNumber || 'unknown'} — connection is OPEN`))

    // Announce once per PROCESS, not once per connection.
    //
    // `connection: 'open'` fires on every successful (re)connect, so on a
    // flapping network this rebuilt the same "Bot Connected Successfully!"
    // bubble in the owner's own chat every few minutes — and it promised
    // "join below channel" while the link was only in the forwarded
    // context, so the sentence pointed at nothing.
    if (!connectionAnnounced && selfNumber) {
        connectionAnnounced = true;
        await sock.sendMessage(`${selfNumber}@s.whatsapp.net`, {
            text: style.card('BOT.SYS', [
                ...style.fields([
                    ['Status', 'ONLINE'],
                    ['Version', settings.version || '—'],
                    ['Since', new Date().toLocaleString()],
                ]),
                '',
                style.tag('info', `CHANNEL: ${global.channelLink}`),
            ]),
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: settings.newsletterJid || '120363424568988623@newsletter',
                    newsletterName: settings.newsletterName || 'Optimus Bot',
                    serverMessageId: -1
                }
            }
        }).catch(() => { });
    }

    // Initialize reminder scheduler
    scheduler.init(sock)

    // Keep the PO token provider alive + start download health monitoring
    potSupervisor.startSupervisor()
    dlHealth.init(sock)

    // Re-arm pending group open/close reverts so they survive a restart
    try {
        require('./lib/groupTimers').init(sock)
    } catch (error) {
        console.error('Error re-arming group timers:', error.message)
    }

    // Resume auto-bio if it was left switched on (commands/owner/autobio.js)
    try {
        const autobio = require('./commands/owner/autobio');
        if (typeof autobio.initAutobio === 'function') await autobio.initAutobio(sock);
    } catch (error) {
        console.error('Error initialising autobio:', error.message)
    }

    await delay(1999)
    console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'OPTIMUS BOT'} ]`)}\n\n`))
    console.log(chalk.cyan(`< ================================================== >`))
    console.log(chalk.magenta(`\n${global.themeemoji || '•'} YT CHANNEL: ${settings.youtubeChannel || 'techhub-c6s'}`))
    console.log(chalk.magenta(`${global.themeemoji || '•'} GITHUB: ${settings.githubRepo || 'CodeWithTayyab96/Optimus-Bot'}`))
    console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: ${owner}`))
    console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: ${settings.botOwner || 'Tayyab'}`))
    console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`))
    console.log(chalk.blue(`Bot Version: ${settings.version} · commit ${settings.gitCommit || 'unknown'}`))
}

/**
 * One socket, one reconnect loop, one decision.
 *
 * `connect` is this file's startXeonBotInc; the supervisor decides when to call
 * it, and never more than once at a time. See lib/connection.js.
 */
const supervisor = createSupervisor({
    connect: () => startXeonBotInc(),
    log: (line) => console.log(chalk.gray(line)),
    onOpen: (sock) => handleConnected(sock),
    onClose: async (info, decision) => {
        if (decision.action === 'reauth') {
            // 401: the device was unlinked from the phone. The credentials are
            // worthless now and keeping them would only produce the same 401 on
            // the next boot — this is the ONE case where deleting is correct.
            try {
                rmSync('./session', { recursive: true, force: true })
                console.log(chalk.yellow('[session] credentials removed — re-pair the bot'))
            } catch (error) {
                console.error('[session] could not remove the session folder:', error.message)
            }
        }
        // Any other code keeps its credentials: a bad session (500) is usually a
        // transient handshake failure, and re-pairing to fix a flaky socket is
        // the wrong trade.
    },
})

async function startXeonBotInc() {
    try {
        const version = await resolveVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        reportSessionState(state.creds)
        const msgRetryCounterCache = new NodeCache()

        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        })

        // Save credentials when they update
        XeonBotInc.ev.on('creds.update', saveCreds)

        // Register this socket as THE socket. If a previous one is still alive
        // it is ended here, before any handler below can attach — two live
        // sockets on one credential pair is what produces a 440 conflict loop
        // and double message handling.
        supervisor.adopt(XeonBotInc)

        // Ack incoming top-level <status> stanzas (Baileys #2858). Without this
        // the server closes the stream ~50 min later with "Stream Errored (ack)".
        registerStatusAck(XeonBotInc)

        // Governor ON before any handler can send: it classifies every outbound
        // payload, coalesces progress lines, drops redundant completion notices
        // and batches overflow into one digest. Media, errors and menus always
        // pass through untouched.
        notify.wrap(XeonBotInc)

    store.bind(XeonBotInc.ev, XeonBotInc)

    // Message handling
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }
            // In private mode, only block non-group messages (allow groups for moderation)
            // Note: XeonBotInc.public is not synced, so we check mode in main.js instead
            // This check is kept for backward compatibility but mainly blocks DMs
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                if (!isGroup) return // Block DMs in private mode, but allow group messages
            }
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

            // Clear message retry cache to prevent memory bloat
            if (XeonBotInc?.msgRetryCounterCache) {
                XeonBotInc.msgRetryCounterCache.clear()
            }

            try {
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) {
                console.error("Error in handleMessages:", err)
                // Only try to send error message if we have a valid chatId
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, {
                        text: '❌ An error occurred while processing your message.',
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: settings.newsletterJid || '120363424568988623@newsletter',
                                newsletterName: settings.newsletterName || 'Optimus Bot',
                                serverMessageId: -1
                            }
                        }
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("Error in messages.upsert:", err)
        }
    })

    // Add these event handlers for better functionality
    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    XeonBotInc.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = XeonBotInc.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    XeonBotInc.getName = (jid, withoutContact = false) => {
        id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
            XeonBotInc.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    XeonBotInc.public = true

    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

    // Handle pairing code
    if (pairingCode && !XeonBotInc.authState.creds.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile api')

        if (pairingCodeIssued) {
            // A reconnect must NOT request another code. Each request invalidates
            // the previous one, so re-asking on every reconnect guarantees the
            // code the user is typing is already dead — pairing can never finish
            // on a connection that flaps.
            console.log(chalk.yellow('⚠️  A pairing code was already issued this run — not requesting a new one.'))
            console.log(chalk.gray('   Enter the code printed above. If it has expired, restart the bot.'))
        } else {
            pairingCodeIssued = true

            // On a panel there is NO interactive terminal, so question() resolves
            // immediately from settings — printing a prompt there only makes it
            // look like the bot is waiting for input it will never receive.
            let phoneNumber
            if (rl) {
                phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type the WhatsApp number for the BOT account 😍\n(not necessarily your personal number)\nFormat: 6281376552730 (without + or spaces) : `)))
            } else {
                phoneNumber = settings.botNumber || settings.ownerNumber || null
                if (phoneNumber) {
                    console.log(chalk.cyan(`[pair] Using ${phoneNumber} from settings — non-interactive console, nothing to type.`))
                }
            }
            if (!phoneNumber) {
                console.log(chalk.red('No phone number available. Set ownerNumber in settings.js (or type it when prompted).'));
                process.exit(1);
            }

            // Clean the phone number - remove any non-digit characters
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

            // Validate the phone number using awesome-phonenumber — but only warn.
            //
            // Its metadata lags reality: +923701609799 is a working Pakistani number
            // whose 370 prefix the library does not recognise, so isValid() is false
            // and a hard exit here would block linking entirely. WhatsApp is the
            // real authority — if the number is wrong the pairing request fails with
            // a clear error, so do not gate on a third-party table.
            const pn = require('awesome-phonenumber');
            const parsedNumber = pn('+' + phoneNumber);
            if (!parsedNumber.isValid()) {
                console.log(chalk.yellow(`⚠️  ${phoneNumber} is not recognised as a valid number (region: ${parsedNumber.getRegionCode() || 'unknown'}).`));
                console.log(chalk.gray('   Continuing — WhatsApp will reject it if it is wrong.'));
            }

            setTimeout(async () => {
                try {
                    let code = await XeonBotInc.requestPairingCode(phoneNumber)
                    code = code?.match(/.{1,4}/g)?.join("-") || code
                    console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
                    console.log(chalk.yellow(`\nPlease enter this code in your WhatsApp app:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices\n3. Tap "Link a Device"\n4. Enter the code shown above`))
                    writePairingCodeFile(phoneNumber, code)
                } catch (error) {
                    console.error('Error requesting pairing code:', error)
                    console.log(chalk.red('Failed to get pairing code. Please check your phone number and try again.'))
                    // The request failed, so no code is outstanding — let a later
                    // reconnect try again rather than locking the bot out.
                    pairingCodeIssued = false
                }
            }, 3000)
        }
    }

    // Connection handling
    // Connection handling.
    //
    // The socket itself does nothing here beyond rendering the QR and saying
    // "connecting": every open/close decision belongs to the supervisor, which
    // guarantees one socket at a time and one retry at a time. See
    // lib/connection.js for why the old inline handler looped.
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, qr } = s

        if (qr) {
            // Baileys v7 deprecated `printQRInTerminal` and no longer prints the
            // QR for us — it only warns and emits nothing. The QR string arrives
            // here and must be rendered, or `--qr` shows an unscannable message.
            console.log(chalk.yellow('📱 Scan this QR code with WhatsApp (Settings > Linked Devices):'))
            try {
                require('qrcode-terminal').generate(qr, { small: true })
            } catch (qrErr) {
                console.log(chalk.red('Could not render the QR code:'), qrErr.message)
                console.log(chalk.gray('Run without --qr to use a pairing code instead.'))
            }
        }

        if (connection === 'connecting') {
            console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
        }

        await supervisor.handle(XeonBotInc, s)
    })

    // Track recently-notified callers to avoid spamming messages
    const antiCallNotified = new Set();

    // Anticall handler: block callers when enabled
    XeonBotInc.ev.on('call', async (calls) => {
        try {
            const { readState: readAnticallState } = require('./commands/owner/anticall');
            const state = readAnticallState();
            if (!state.enabled) return;
            for (const call of calls) {
                const callerJid = call.from || call.peerJid || call.chatId;
                if (!callerJid) continue;
                try {
                    // First: attempt to reject the call if supported
                    try {
                        if (typeof XeonBotInc.rejectCall === 'function' && call.id) {
                            await XeonBotInc.rejectCall(call.id, callerJid);
                        } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) {
                            await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject');
                        }
                    } catch {}

                    // Notify the caller only once within a short window
                    if (!antiCallNotified.has(callerJid)) {
                        antiCallNotified.add(callerJid);
                        setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                        await XeonBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' });
                    }
                } catch {}
                // Then: block after a short delay to ensure rejection and message are processed
                setTimeout(async () => {
                    try { await XeonBotInc.updateBlockStatus(callerJid, 'block'); } catch {}
                }, 800);
            }
        } catch (e) {
            // ignore
        }
    });

    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update);
    });

    // Status handling is done ONCE in the main 'messages.upsert' handler above
    // (status@broadcast is routed to handleStatus and returns early). These
    // additional listeners are intentionally NOT registered:
    //  - Baileys v7 has no 'status.update' event (it was removed upstream), and
    //  - 'messages.reaction' emits an array of { key, reaction } objects, which
    //    does not match handleStatus's expected shape, so it could never fire
    //    and would only risk double-processing statuses.

    return XeonBotInc
    } catch (error) {
        // A failure here (auth state unreadable, socket constructor throwing) is
        // a failed connection attempt, not a crash. It goes through the same
        // single scheduler as a close, so it cannot start a second loop.
        console.error('Error in startXeonBotInc:', error.message)
        supervisor.reportConnectError(error)
        return null
    }
}


/**
 * Start the bot, optionally bringing up the free WARP tunnel first (WARP=1).
 *
 * WARP is owned HERE — not in bootstrap.js — so it works no matter how the bot
 * is launched: `npm start` (node index.js), the panel's start command, or
 * bootstrap.js (which only spawns this process). The tunnel is a local SOCKS5
 * proxy; if it fails the bot still starts and YouTube may just stay blocked.
 */
async function startWithWarp() {
    if (process.env.WARP === '1') {
        try {
            const warp = require('./lib/warpProxy');
            const url = await warp.start((m) => console.log(m));
            if (!process.env.PROXIES) {
                process.env.PROXIES = url;
                console.log(`[warp] WARP tunnel ready — PROXIES=${url}`);
            } else {
                console.log('[warp] PROXIES is already set, so WARP will not be used.');
            }
        } catch (err) {
            console.warn(`[warp] could not start the WARP tunnel: ${err.message}`);
            console.warn('[warp] the bot will start without it — YouTube may stay blocked.');
        }
    }
    // First attempt. Every later one is scheduled by the supervisor.
    startXeonBotInc().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

startWithWarp().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
})

// Clean shutdown: stop the reconnect loop FIRST, so a pending retry cannot
// open a socket while the process is tearing down.
function shutdown() {
    try { supervisor.stop() } catch { /* ignore */ }
    try { scheduler.shutdown() } catch { /* ignore */ }
    try { dlHealth.stop() } catch { /* ignore */ }
    try { potSupervisor.stop() } catch { /* ignore */ }
    process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})