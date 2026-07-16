module.exports = {
    name: 'broadcast',
    aliases: ['bc'],
    category: 'owner',
    description: 'Broadcast a message to all groups',
    usage: '.broadcast <message>',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            if (args.length === 0) {
                return extra.reply(`❌ Usage: ${extra.prefix}broadcast <message>\n\nExample: ${extra.prefix}broadcast Hello everyone!`);
            }

            const broadcastText = args.join(' ');

            const chats = await sock.groupFetchAllParticipating();
            const groups = Object.values(chats);

            let success = 0;
            let failed = 0;

            for (const group of groups) {
                try {
                    await sock.sendMessage(group.id, {
                        text: `📢 *BROADCAST MESSAGE*\n\n${broadcastText}\n\n_This is a broadcast message from the bot owner_`
                    });
                    success++;
                } catch (e) {
                    failed++;
                }
            }

            await extra.reply(`✅ Broadcast complete!\n\n✅ Success: ${success}\n❌ Failed: ${failed}`);
        } catch (error) {
            await extra.reply(`❌ Error: ${error.message}`);
        }
    }
};
