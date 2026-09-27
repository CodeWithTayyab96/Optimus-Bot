/**
 * .saved — List or retrieve saved/bookmarked messages.
 *
 * Usage:
 *   .saved          — list all saved messages
 *   .saved S001     — retrieve a specific saved message
 */

const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');
const bookmarkStore = require('../../lib/productivity/bookmarkStore');

function formatTime(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        month: 'short',
        day: 'numeric'
    });
}

async function savedCommand(sock, chatId, message, args, extra) {
    try {
        const userJid = extra.senderId;

        // .saved S001 — retrieve specific
        if (args[0]) {
            const bookmarkId = args[0].toUpperCase();
            const bookmark = bookmarkStore.getBookmark(userJid, bookmarkId);

            if (!bookmark) {
                const text = style.notFound(`Bookmark "${bookmarkId}"`);
                return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
            }

            // Try to retrieve the original message via store
            try {
                const store = require('../../lib/lightweight_store');
                const msg = await store.loadMessage(bookmark.chatJid, bookmark.messageKey);

                if (msg && msg.message) {
                    // Re-send the original message
                    await sock.sendMessage(chatId, {
                        ...msg.message,
                        ...channelInfo
                    }, { quoted: message });

                    await sock.sendMessage(chatId, {
                        text: `📌 Retrieved: ${bookmark.label} (${bookmark.id})`,
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
            } catch (e) {
                // Store lookup failed — fall through to info message
            }

            // Message no longer available in store
            const info = style.warning(
                `This saved message is no longer available in the store.\n` +
                `📌 ID: ${bookmark.id}\n` +
                `📝 Label: ${bookmark.label}\n` +
                `⏰ Saved: ${formatTime(bookmark.timestamp)}\n` +
                `💬 Chat: ${bookmark.chatJid}`
            );
            return sock.sendMessage(chatId, { text: info, ...channelInfo }, { quoted: message });
        }

        // .saved — list all
        const bookmarks = bookmarkStore.getBookmarks(userJid);

        if (bookmarks.length === 0) {
            const text = '📋 You have no saved messages.';
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        const lines = bookmarks.map(bm =>
            `📌 ${bm.id} — ${bm.label} (${formatTime(bm.timestamp)})`
        );

        const response = style.box('📋 SAVED MESSAGES', lines);

        await sock.sendMessage(chatId, { text: response, ...channelInfo }, { quoted: message });
    } catch (e) {
        console.error('[Saved] Error:', e.message);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to list saved messages.'),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = {
    name: 'saved',
    aliases: ['bookmarks', 'listsaved'],
    category: 'general',
    description: 'List or retrieve your saved messages',
    usage: '.saved [S001]',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await savedCommand(sock, extra.chatId, message, args, extra);
    }
};
