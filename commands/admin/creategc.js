const style = require('../../lib/messageStyle');

module.exports = {
    name: 'creategc',
    aliases: ['creategroup'],
    category: 'admin',
    description: 'Create a new group and get its invite link',
    usage: '.creategc <group name>',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const name = args.join(' ').trim();

            if (!name) {
                return await extra.reply(style.invalidInput('Please provide a group name.', `${extra.prefix}creategc <group name>`));
            }

            const created = await sock.groupCreate(name, []);

            let link = '—';
            try {
                const code = await sock.groupInviteCode(created.id);
                link = `https://chat.whatsapp.com/${code}`;
            } catch {
                // invite code is best-effort
            }

            await extra.reply(style.box('👥 GROUP CREATED', [
                `📌 Name: ${created.subject || name}`,
                `🆔 ID: ${created.id}`,
                `👤 Owner: ${created.owner ? '@' + String(created.owner).split('@')[0] : '—'}`,
                `🔗 Invite: ${link}`
            ]));
        } catch (error) {
            console.error('[creategc] error:', error.message);
            return await extra.reply(style.error('Failed to create the group. Please try again.'));
        }
    },
};
