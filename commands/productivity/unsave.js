/**
 * .unsave — Remove a saved/bookmarked message.
 *
 * Usage:
 *   .unsave S001
 *
 * Verifies ownership before deleting.
 */

const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');
const bookmarkStore = require('../../lib/productivity/bookmarkStore');

async function unsaveCommand(sock, chatId, message, args, extra) {
    try {
        if (!args[0]) {
            const text = style.invalidInput(
                'Please provide a bookmark ID.',
                '.unsave S001'
            );
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        const bookmarkId = args[0].toUpperCase();
        const userJid = extra.senderId;

        const bookmark = bookmarkStore.getBookmark(userJid, bookmarkId);

        if (!bookmark) {
            const text = style.notFound(`Bookmark "${bookmarkId}"`);
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        bookmarkStore.deleteBookmark(userJid, bookmarkId);

        const response = style.box('🗑️ BOOKMARK REMOVED', [
            `🆔 ID: ${bookmarkId}`,
            `🗑️ "${bookmark.label}" has been removed.`
        ]);

        await sock.sendMessage(chatId, { text: response, ...channelInfo }, { quoted: message });
    } catch (e) {
        console.error('[Unsave] Error:', e.message);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to remove bookmark.'),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = {
    name: 'unsave',
    aliases: ['removebookmark', 'delsaved'],
    category: 'general',
    description: 'Remove a saved/bookmarked message',
    usage: '.unsave S001',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await unsaveCommand(sock, extra.chatId, message, args, extra);
    }
};
