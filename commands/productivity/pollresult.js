/**
 * .pollresult — Show results of a poll by replying to it.
 *
 * Usage:
 *   [reply to a poll message]
 *   .pollresult
 *
 * Attempts to retrieve vote data from the message store.
 * Poll votes in Baileys are encrypted, so aggregation depends
 * on the store having the poll message with decrypted vote data.
 */

const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');

async function pollResultCommand(sock, chatId, message, args, extra) {
    try {
        // Get the quoted message
        const contextInfo = message.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = contextInfo?.quotedMessage;

        if (!quotedMsg) {
            const text = style.invalidInput(
                'Please reply to a poll message.',
                '[reply to poll]\n.pollresult'
            );
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        // Check for poll creation message (V2, V3, or base)
        const pollCreation =
            quotedMsg.pollCreationMessage ||
            quotedMsg.pollCreationMessageV2 ||
            quotedMsg.pollCreationMessageV3 ||
            quotedMsg.pollCreationMessageV4 ||
            quotedMsg.pollCreationMessageV5;

        if (!pollCreation) {
            const text = style.error('The replied message is not a poll.');
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        const question = pollCreation.name || 'Unknown poll';
        const options = pollCreation.options || [];

        // Try to find vote data from the poll message
        // Baileys encrypts individual votes, but the poll message may contain
        // aggregated voterCount data if the store captured it
        let totalVotes = 0;
        const optionVotes = options.map(opt => {
            const votes = opt.voterCount || 0;
            totalVotes += votes;
            return { name: opt.optionName, votes };
        });

        // Build result display
        const maxVotes = Math.max(...optionVotes.map(o => o.votes), 1);
        const barMaxLen = 12;

        const lines = [question, ''];
        for (const opt of optionVotes) {
            const barLen = opt.votes > 0 ? Math.max(1, Math.round((opt.votes / maxVotes) * barMaxLen)) : 0;
            const bar = '█'.repeat(barLen) + '░'.repeat(barMaxLen - barLen);
            lines.push(`${bar} ${opt.votes} — ${opt.name}`);
        }

        lines.push('');
        lines.push(`👥 Total votes: ${totalVotes}`);

        if (totalVotes === 0) {
            lines.push('');
            lines.push('ℹ️ No votes recorded yet. Vote data may take time to sync.');
        }

        const response = style.box('📊 POLL RESULTS', lines);

        await sock.sendMessage(chatId, { text: response, ...channelInfo }, { quoted: message });

    } catch (e) {
        console.error('[PollResult] Error:', e.message);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to get poll results.'),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = {
    name: 'pollresult',
    aliases: ['pollresults', 'pollvote'],
    category: 'general',
    description: 'Show results of a poll (reply to poll)',
    usage: '[reply to poll]\n.pollresult',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await pollResultCommand(sock, extra.chatId, message, args, extra);
    }
};
