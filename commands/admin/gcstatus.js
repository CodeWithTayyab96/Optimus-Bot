const style = require('../../lib/messageStyle');

/**
 * .gcstatus — show the group's subject and description (about text).
 * Read via groupMetadata(); the description lives on the `desc` field.
 */
module.exports = {
    name: 'gcstatus',
    aliases: ['checkstatus', 'groupinfo2', 'gcdesc'],
    category: 'admin',
    description: 'Show the group’s name and description/about text',
    usage: '.gcstatus',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const jid = extra.chatId;
            if (!jid.endsWith('@g.us')) {
                return await extra.reply(style.error('This command only works in groups.'));
            }

            const metadata = await sock.groupMetadata(jid);
            const desc = (metadata.desc || '').trim();

            const lines = [
                `📛 *Name:* ${metadata.subject || '(none)'}`,
                '',
                desc ? `📝 *Description:*\n${desc}` : '📝 *Description:* _(empty)_',
                '',
                `👥 Members: ${(metadata.participants || []).length}`,
            ];
            if (metadata.descOwner) lines.push(`✍️ Set by: @${String(metadata.descOwner).split('@')[0]}`);

            return await extra.reply(style.box('📋 GROUP STATUS', lines));
        } catch (e) {
            console.error('[gcstatus] error:', e.message);
            return await extra.reply(style.error('Failed to read the group description.'));
        }
    },
};
