const afk = require('../../lib/afk');
const style = require('../../lib/messageStyle');

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
                    style.box('👑 AFK MODE', [
                        `Status: *${on ? 'ON' : 'OFF'}*`,
                        '',
                        'When ON:',
                        ' • Groups — one-time reply when someone @tags or replies to the bot',
                        ' • DMs — one-time reply to any message',
                        'Repeated messages from the same person are ignored to avoid spam.',
                        '',
                        'Usage:',
                        ` ${extra.prefix}afk on`,
                        ` ${extra.prefix}afk on busy right now`,
                        ` ${extra.prefix}afk off`
                    ])
                );
            }

            if (opt === 'on') {
                if (afk.isEnabled()) {
                    return extra.reply(style.info('AFK is already ON.'));
                }
                const customMsg = args.slice(1).join(' ').trim();
                const afkMessage = customMsg
                    ? `🔴 *AFK Mode ON*\n\n${customMsg}`
                    : afk.DEFAULT_MESSAGE;
                afk.setEnabled(true, afkMessage);
                return extra.reply(style.success('AFK mode enabled. The bot will notify taggers/repliers once each.'));
            }

            if (opt === 'off') {
                if (!afk.isEnabled()) {
                    return extra.reply(style.info('AFK is already OFF.'));
                }
                afk.setEnabled(false);
                return extra.reply(style.success('AFK mode disabled. You are back online.'));
            }

            return extra.reply(style.invalidInput('Invalid option.', `${extra.prefix}afk on | ${extra.prefix}afk off`, { box: false }));
        } catch (err) {
            console.error('[afk cmd] error:', err);
            return extra.reply(style.error('Failed to update AFK mode.'));
        }
    }
};
