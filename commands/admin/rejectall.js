/**
 * Optimus Bot — .rejectall
 * Reject all pending join requests for the current WhatsApp group.
 *
 * Uses Baileys groupRequestParticipantsList + groupRequestParticipantsUpdate.
 */
const style = require('../../lib/messageStyle');

async function rejectallCommand(sock, chatId, message) {
    let list;
    try {
        list = await sock.groupRequestParticipantsList(chatId);
    } catch (error) {
        if (error.message && (error.message.includes('403') || error.message.includes('forbidden'))) {
            return sock.sendMessage(chatId, {
                text: style.error('I do not have permission to manage join requests. Ensure join approval is enabled.')
            }, { quoted: message });
        }
        return sock.sendMessage(chatId, {
            text: style.error('Failed to fetch pending requests. Please try again.')
        }, { quoted: message });
    }

    if (!list || list.length === 0) {
        return sock.sendMessage(chatId, {
            text: style.success('No pending join requests to reject.')
        }, { quoted: message });
    }

    // Extract JIDs from the request list
    const participantJids = list.map(p => {
        const jid = p.jid || p.pn || p.phone_number;
        if (!jid) return null;
        const num = jid.split('@')[0];
        return num + '@s.whatsapp.net';
    }).filter(Boolean);

    if (participantJids.length === 0) {
        return sock.sendMessage(chatId, {
            text: style.warning('Found requests but could not extract valid participant IDs.')
        }, { quoted: message });
    }

    try {
        const result = await sock.groupRequestParticipantsUpdate(chatId, participantJids, 'reject');
        const count = result?.length || participantJids.length;
        await sock.sendMessage(chatId, {
            text: style.success(`Rejected ${count} pending join request(s).`)
        }, { quoted: message });
    } catch (error) {
        console.error('[rejectall] Error:', error);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to reject requests. Some may not have been processed.')
        }, { quoted: message });
    }
}

module.exports = {
    name: 'rejectall',
    aliases: ['declineall', 'rejectpending'],
    category: 'admin',
    description: 'Reject all pending join requests in the group',
    usage: '.rejectall',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        await rejectallCommand(sock, extra.chatId, message);
    },
};
