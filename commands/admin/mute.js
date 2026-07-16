async function muteCommand(sock, chatId, senderId, message, durationInMinutes) {

    try {
        // Mute the group
        await sock.groupSettingUpdate(chatId, 'announcement');
        
        if (durationInMinutes !== undefined && durationInMinutes > 0) {
            const durationInMilliseconds = durationInMinutes * 60 * 1000;
            await sock.sendMessage(chatId, { text: `The group has been muted for ${durationInMinutes} minutes.` }, { quoted: message });
            
            // Set timeout to unmute after duration
            setTimeout(async () => {
                try {
                    await sock.groupSettingUpdate(chatId, 'not_announcement');
                    await sock.sendMessage(chatId, { text: 'The group has been unmuted.' });
                } catch (unmuteError) {
                    console.error('Error unmuting group:', unmuteError);
                }
            }, durationInMilliseconds);
        } else {
            await sock.sendMessage(chatId, { text: 'The group has been muted.' }, { quoted: message });
        }
    } catch (error) {
        console.error('Error muting/unmuting the group:', error);
        await sock.sendMessage(chatId, { text: 'An error occurred while muting/unmuting the group. Please try again.' }, { quoted: message });
    }
}

module.exports = {
    name: 'mute',
    aliases: [],
    category: 'admin',
    description: 'Mute the group (optionally for N minutes)',
    usage: '.mute [minutes]',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        const muteArg = args[0];
        const muteDuration = muteArg !== undefined ? parseInt(muteArg, 10) : undefined;
        if (muteArg !== undefined && (isNaN(muteDuration) || muteDuration <= 0)) {
            await sock.sendMessage(extra.chatId, { text: 'Please provide a valid number of minutes or use ' + extra.prefix + 'mute with no number to mute immediately.', ...extra.channelInfo }, { quoted: message });
            return;
        }
        await muteCommand(sock, extra.chatId, extra.senderId, message, muteDuration);
    },

};
