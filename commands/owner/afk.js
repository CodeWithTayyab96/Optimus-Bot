const afk = require('../../lib/afk');

module.exports = {
    name: 'afk',
    aliases: ['away'],
    category: 'owner',
    description: 'Enable/disable AFK mode (owner offline auto-reply)',
    usage: '.afk on [custom message] | .afk off',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const opt = (args[0] || '').toLowerCase();

            if (!opt) {
                const on = afk.isEnabled();
                return extra.reply(
                    `🔴 *AFK Mode*\n\n` +
                    `Status: *${on ? 'ON' : 'OFF'}*\n\n` +
                    `When ON:\n` +
                    `• *Groups* — one-time reply when someone @tags or replies to the bot\n` +
                    `• *DMs* — one-time reply to any message\n` +
                    `Repeated messages from the same person are ignored to avoid spam.\n\n` +
                    `Usage:\n` +
                    `  ${extra.prefix}afk on\n` +
                    `  ${extra.prefix}afk on busy right now\n` +
                    `  ${extra.prefix}afk off`
                );
            }

            if (opt === 'on') {
                if (afk.isEnabled()) {
                    return extra.reply('*AFK is already ON*');
                }
                const customMsg = args.slice(1).join(' ').trim();
                const afkMessage = customMsg
                    ? `🔴 *AFK Mode ON*\n\n${customMsg}`
                    : afk.DEFAULT_MESSAGE;
                afk.setEnabled(true, afkMessage);
                return extra.reply('*AFK mode enabled.* Bot will notify taggers/repliers once each.');
            }

            if (opt === 'off') {
                if (!afk.isEnabled()) {
                    return extra.reply('*AFK is already OFF*');
                }
                afk.setEnabled(false);
                return extra.reply('*AFK mode disabled.* You are back online.');
            }

            return extra.reply(`❌ Invalid option. Use: ${extra.prefix}afk on | ${extra.prefix}afk off`);
        } catch (err) {
            console.error('[afk cmd] error:', err);
            return extra.reply('❌ Error updating AFK mode.');
        }
    }
};
