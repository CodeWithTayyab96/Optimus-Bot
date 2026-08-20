const style = require('../../lib/messageStyle');

function isPnJid(jid) {
    return jid && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us'));
}
function isLidJid(jid) {
    return jid && (jid.endsWith('@lid') || jid.endsWith('@hosted.lid'));
}

module.exports = {
    name: 'pending',
    aliases: ['pendingrequests', 'joinrequests', 'listpending'],
    category: 'admin',
    description: 'List pending member join requests in the group',
    usage: '.pending',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        try {
            let list;
            try {
                list = await sock.groupRequestParticipantsList(extra.chatId);
            } catch (error) {
                console.error('Pending requests error:', error);
                if (error.message && (error.message.includes('403') || error.message.includes('forbidden'))) {
                    return extra.reply(style.error('The bot does not have permission to view join requests. Ensure join approval is enabled for the group.'));
                }
                return extra.reply(style.error('Failed to fetch pending requests. Please try again later.'));
            }

            if (!list || list.length === 0) {
                return extra.reply(style.success('No pending join requests. There are no members waiting for approval.'));
            }

            let text = style.box('📋 PENDING REQUESTS', [
                `${list.length} request(s) waiting for approval:`,
                ''
            ]);
            text += '\n';

            const mentionJids = [];

            list.forEach((p, i) => {
                const rawJid = p.jid || p.pn || p.lid;
                if (!rawJid) {
                    text += `${i + 1}. Unknown\n`;
                    return;
                }
                const name = (p.notify || p.name || '').trim();
                // Prefer a real phone-number JID when the server provides one
                const pnJid = p.phone_number || (isPnJid(p.pn) ? p.pn : null) || (isPnJid(p.jid) ? p.jid : null);

                if (pnJid && isPnJid(pnJid)) {
                    const jidForMention = pnJid.includes('@') ? pnJid : `${pnJid.split('@')[0]}@s.whatsapp.net`;
                    mentionJids.push(jidForMention);
                    text += `${i + 1}. @${name || pnJid.split('@')[0]}\n`;
                    return;
                }

                // Only a LID available — show name if present
                if (isLidJid(rawJid)) {
                    text += `${i + 1}. ${name || 'Pending user (ID only)'}\n`;
                    return;
                }

                const fallbackNum = rawJid.split('@')[0] || rawJid;
                const jidForMention = rawJid.includes('@') ? rawJid : `${fallbackNum}@s.whatsapp.net`;
                mentionJids.push(jidForMention);
                text += `${i + 1}. @${name || fallbackNum}\n`;
            });

            await sock.sendMessage(extra.chatId, { text, mentions: mentionJids }, { quoted: message });
        } catch (error) {
            console.error('Pending command error:', error);
            return extra.reply(style.error('Failed to list pending requests.'));
        }
    }
};
