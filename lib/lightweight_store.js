const fs = require('fs')
const STORE_FILE = './baileys_store.json'

let MAX_MESSAGES = 20

try {
    const settings = require('../settings.js')
    if (settings.maxStoreMessages && typeof settings.maxStoreMessages === 'number') {
        MAX_MESSAGES = settings.maxStoreMessages
    }
} catch (e) {
    // Use default if settings not available
}

// View-once media cache — download bytes are kept in memory so .vv / .vv2
// can serve them even when the quoted node has been stripped of credentials.
const MEDIA_CACHE_TTL = 30 * 60 * 1000 // 30 minutes
const MAX_MEDIA_CACHE = 50

const ENVELOPE_KEYS = [
    'viewOnceMessageV2Extension',
    'viewOnceMessageV2',
    'viewOnceMessage',
    'ephemeralMessage',
]

function findViewOnceMedia(content, depth) {
    if (!content || (depth || 0) > 6) return null
    if (content.imageMessage) return { type: 'image', node: content.imageMessage }
    if (content.videoMessage) return { type: 'video', node: content.videoMessage }
    if (content.audioMessage) return { type: 'audio', node: content.audioMessage }
    for (const key of ENVELOPE_KEYS) {
        if (content[key]?.message) {
            const r = findViewOnceMedia(content[key].message, (depth || 0) + 1)
            if (r) return r
        }
    }
    if (content.message && typeof content.message === 'object') {
        return findViewOnceMedia(content.message, (depth || 0) + 1)
    }
    return null
}

function isViewOnce(msgContent) {
    if (!msgContent) return false
    return !!(
        msgContent.viewOnceMessageV2 ||
        msgContent.viewOnceMessageV2Extension ||
        msgContent.viewOnceMessage ||
        msgContent.ephemeralMessage?.message?.viewOnceMessageV2 ||
        msgContent.ephemeralMessage?.message?.viewOnceMessageV2Extension ||
        msgContent.ephemeralMessage?.message?.viewOnceMessage ||
        msgContent.imageMessage?.viewOnce ||
        msgContent.videoMessage?.viewOnce
    )
}

const BUFFER_FIELDS = ['mediaKey', 'fileSha256', 'fileEncSha256', 'thumbnailSha256', 'thumbnailEncSha256']
const BOOT_TIME = Date.now()

function hasBytes(v) {
    return !!v && (typeof v === 'string' ? v.length > 0 : (v.length || v.byteLength || 0) > 0)
}

// JSON.stringify turns protobuf Buffers into base64 strings; JSON.parse leaves
// them as strings, which downloadContentFromMessage cannot decrypt with.
// Walk a restored message and turn the known binary fields back into Buffers.
// NOTE (verified 2026-11-17 with Baileys' own proto decode): a real mediaKey
// is a Buffer, and plain JSON.stringify of it yields {"type":"Buffer","data":[...]},
// NOT a base64 string, so the string case alone never fires on real saved data.
// Handle that form, plus the Uint8Array form (numeric-key object), as well.
function reviveBuffers(node, depth) {
    if (!node || typeof node !== 'object' || (depth || 0) > 12) return node
    for (const k of Object.keys(node)) {
        const v = node[k]
        if (BUFFER_FIELDS.includes(k) && typeof v === 'string') {
            node[k] = Buffer.from(v, 'base64')
        } else if (BUFFER_FIELDS.includes(k) && v && typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data)) {
            node[k] = Buffer.from(v.data)
        } else if (BUFFER_FIELDS.includes(k) && v && typeof v === 'object' && !Buffer.isBuffer(v) && Object.keys(v).length > 0 && Object.keys(v).every(key => /^\d+$/.test(key) && Number.isInteger(v[key]) && v[key] >= 0 && v[key] <= 255)) {
            node[k] = Buffer.from(Object.values(v))
        } else if (v && typeof v === 'object') {
            reviveBuffers(v, (depth || 0) + 1)
        }
    }
    return node
}

const store = {
    messages: {},
    contacts: {},
    chats: {},
    _mediaCache: new Map(),
    _voSeen: new Map(), // id -> what the bot actually received for each view-once message
    _sock: null,

    readFromFile(filePath = STORE_FILE) {
        try {
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
                this.contacts = data.contacts || {}
                this.chats = data.chats || {}
                this.messages = data.messages || {}
                this.cleanupData()
                reviveBuffers(this.messages)
            }
        } catch (e) {
            console.warn('Failed to read store file:', e.message)
        }
    },

    writeToFile(filePath = STORE_FILE) {
        try {
            const data = JSON.stringify({
                contacts: this.contacts,
                chats: this.chats,
                messages: this.messages
            })
            fs.writeFileSync(filePath, data)
        } catch (e) {
            console.warn('Failed to write store file:', e.message)
        }
    },

    cleanupData() {
        if (this.messages) {
            Object.keys(this.messages).forEach(jid => {
                if (typeof this.messages[jid] === 'object' && !Array.isArray(this.messages[jid])) {
                    const messages = Object.values(this.messages[jid])
                    this.messages[jid] = messages.slice(-MAX_MESSAGES)
                }
            })
        }
    },

    bind(ev, sock) {
        if (sock) this._sock = sock

        ev.on('messages.upsert', ({ messages }) => {
            messages.forEach(msg => {
                if (!msg.key?.remoteJid) return
                const jid = msg.key.remoteJid
                this.messages[jid] = this.messages[jid] || []
                this.messages[jid].push(msg)
                if (this.messages[jid].length > MAX_MESSAGES) {
                    this.messages[jid] = this.messages[jid].slice(-MAX_MESSAGES)
                }
            })

            // Proactive view-once media caching (async, fire-and-forget).
            // Download the media NOW while the url is still fresh, so .vv
            // can serve the cached bytes later even if credentials are
            // stripped from the quotedMessage.
            for (const msg of messages) {
                if (!msg.message || !msg.key?.id) continue
                if (!isViewOnce(msg.message)) continue
                this._recordViewOnceArrival(msg)
                this._cacheViewOnceMedia(msg).catch(() => {})
            }
        })

        ev.on('contacts.update', (contacts) => {
            contacts.forEach(contact => {
                if (contact.id) {
                    this.contacts[contact.id] = {
                        id: contact.id,
                        name: contact.notify || contact.name || ''
                    }
                }
            })
        })

        ev.on('chats.set', (chats) => {
            this.chats = {}
            chats.forEach(chat => {
                this.chats[chat.id] = { id: chat.id, subject: chat.subject || '' }
            })
        })
    },

    _recordViewOnceArrival(msg) {
        try {
            const found = findViewOnceMedia(msg.message)
            const wrapper = ENVELOPE_KEYS.find(k => msg.message?.[k]) || (found ? 'direct viewOnce flag' : 'unknown')
            const rec = {
                at: Date.now(),
                wrapper,
                type: found?.type || 'unknown',
                hasKey: hasBytes(found?.node?.mediaKey),
                hasUrl: !!(found?.node?.url || found?.node?.directPath),
            }
            this._voSeen.set(msg.key.id, rec)
            if (this._voSeen.size > 100) this._voSeen.delete(this._voSeen.keys().next().value)
            console.log(`[store] view-once ARRIVED id=${msg.key.id} wrapper=${rec.wrapper} type=${rec.type} ` +
                `mediaKey=${rec.hasKey ? 'present' : 'MISSING'} url=${rec.hasUrl ? 'present' : 'MISSING'}` +
                (rec.hasKey && rec.hasUrl ? '' : '  <-- WhatsApp delivered a stub, nothing can be recovered'))
        } catch (e) { /* diagnostics must never break message handling */ }
    },

    // One line saying which stage lost the media. Used in .vv / .vv2 failure replies.
    diagnose(jid, id) {
        const up = Math.round((Date.now() - BOOT_TIME) / 60000)
        if (!id) return 'reply did not carry a message id'
        const seen = this._voSeen.get(id)
        let arrival
        if (!seen) arrival = `bot never saw this message arrive (bot has been up ${up} min — sent before start, or WhatsApp did not deliver it)`
        else arrival = `arrived ${Math.round((Date.now() - seen.at) / 1000)}s ago as ${seen.wrapper}, mediaKey ${seen.hasKey ? 'present' : 'MISSING'}, url ${seen.hasUrl ? 'present' : 'MISSING'}` +
            (seen.hasKey && seen.hasUrl ? '' : ' (WhatsApp sent a stub)')
        const cached = this.loadCachedMedia(id)
        const cache = cached ? 'hit' : (seen && seen.hasKey && seen.hasUrl ? 'miss (download at arrival failed or expired)' : 'miss')
        const stored = (this.messages[jid] || []).find(m => m.key?.id === id)
        const sNode = stored?.message ? findViewOnceMedia(stored.message) : null
        const st = stored ? `found, mediaKey ${hasBytes(sNode?.node?.mediaKey) ? 'present' : 'MISSING'}` : 'not found (evicted or never stored)'
        return `arrival: ${arrival} | media cache: ${cache} | message store: ${st}`
    },

    async _cacheViewOnceMedia(msg) {
        const id = msg.key.id
        if (this._mediaCache.has(id)) return

        const found = findViewOnceMedia(msg.message)
        if (!found || !found.node) return
        if (!found.node.url && !found.node.directPath) return

        // Try downloadMediaMessage (with reuploadRequest) first — it
        // handles decryption even when mediaKey is absent by re-requesting
        // credentials from WhatsApp. Fall back to downloadContentFromMessage.
        let buffer
        try {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys')
            buffer = await downloadMediaMessage(msg, 'buffer', {}, {
                reuploadRequest: this._sock?.updateMediaMessage,
            })
        } catch (e1) {
            try {
                const { downloadContentFromMessage } = require('@whiskeysockets/baileys')
                const stream = await downloadContentFromMessage(found.node, found.type)
                const chunks = []
                for await (const chunk of stream) chunks.push(chunk)
                buffer = Buffer.concat(chunks)
            } catch (e2) {
                console.log(`[store] view-once cache: download failed for ${id}: ${e2.message}`)
                return
            }
        }

        if (!buffer || buffer.length === 0) return

        this._mediaCache.set(id, {
            type: found.type,
            buffer,
            caption: found.node.caption || '',
            timestamp: Date.now(),
        })
        console.log(`[store] view-once cached: ${id} (${found.type}, ${buffer.length} bytes)`)

        // Evict oldest if over limit
        if (this._mediaCache.size > MAX_MEDIA_CACHE) {
            const oldest = this._mediaCache.keys().next().value
            if (oldest !== undefined) this._mediaCache.delete(oldest)
        }
    },

    loadCachedMedia(id) {
        const entry = this._mediaCache.get(id)
        if (!entry) return null
        if (Date.now() - entry.timestamp > MEDIA_CACHE_TTL) {
            this._mediaCache.delete(id)
            return null
        }
        return entry
    },

    async loadMessage(jid, id) {
        return this.messages[jid]?.find(m => m.key.id === id) || null
    },

    getStats() {
        let totalMessages = 0
        let totalContacts = Object.keys(this.contacts).length
        let totalChats = Object.keys(this.chats).length

        Object.values(this.messages).forEach(chatMessages => {
            if (Array.isArray(chatMessages)) {
                totalMessages += chatMessages.length
            }
        })

        return {
            messages: totalMessages,
            contacts: totalContacts,
            chats: totalChats,
            maxMessagesPerChat: MAX_MESSAGES,
            cachedMedia: this._mediaCache.size,
        }
    }
}

module.exports = store
module.exports._reviveBuffers = reviveBuffers
