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

const store = {
    messages: {},
    contacts: {},
    chats: {},
    _mediaCache: new Map(),
    _sock: null,

    readFromFile(filePath = STORE_FILE) {
        try {
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
                this.contacts = data.contacts || {}
                this.chats = data.chats || {}
                this.messages = data.messages || {}
                this.cleanupData()
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
