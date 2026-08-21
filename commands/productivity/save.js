/**
 * .save — Save/bookmark a message.
 *
 * Usage:
 *   [reply to a message]
 *   .save
 *   .save Assignment
 *
 * Saves a reference to the replied message for later retrieval.
 */

const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');
const bookmarkStore = require('../../lib/productivity/bookmarkStore');

async function saveCommand(sock, chatId, message, args, extra) {
    try {
        // Get the quoted message
        const contextInfo = message.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = contextInfo?.quotedMessage;
        const quotedKey = contextInfo?.stanzaId;
        const quotedParticipant = contextInfo?.participant;
        const quotedSender = contextInfo?.participant || contextInfo?.remoteJid;

        if (!quotedMsg || !quotedKey) {
            const text = style.invalidInput(
                'Please reply to a message to save it.',
                '[reply to message]\n.save [label]'
            );
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        const userJid = extra.senderId;
        const label = args.join(' ').trim() || 'Saved message';
        const chatJid = extra.chatId;

        const bookmark = bookmarkStore.saveBookmark(
            userJid,
            chatJid,
            quotedKey,
            quotedSender,
            label
        );

        const response = style.box('📌 MESSAGE SAVED', [
            `🆔 ID: ${bookmark.id}`,
            `📝 ${label}`,
            `💬 Chat: ${chatJid.endsWith('@g.us') ? 'Group' : 'Private'}`
        ]);

        await sock.sendMessage(chatId, { text: response, ...channelInfo }, { quoted: message });
    } catch (e) {
        console.error('[Save] Error:', e.message);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to save message.'),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = {
    name: 'save',
    aliases: ['bookmark', 'savemsg'],
    category: 'general',
    description: 'Save/bookmark a message for later',
    usage: '[reply to message]\n.save [label]',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await saveCommand(sock, extra.chatId, message, args, extra);
    }
};
