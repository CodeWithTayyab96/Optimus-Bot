const settings = require('../../settings');
const { updateSetting } = require('../../lib/settingsWriter');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'setprefix',
    aliases: ['prefix'],
    category: 'owner',
    description: 'Change the bot command prefix (persists to settings.js)',
    usage: '.setprefix <new prefix>',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            if (args.length === 0) {
                return extra.reply(style.box('👑 PREFIX', [
                    `Current prefix: *${settings.prefix || '.'}*`,
                    '',
                    'Usage:',
                    ` ${extra.prefix}setprefix <new prefix>`
                ]));
            }

            const newPrefix = args[0];

            if (newPrefix.length > 3) {
                return extra.reply(style.invalidInput('The prefix must be 1-3 characters long.', `${extra.prefix}setprefix <prefix>`, { box: false }));
            }
            if (/\s/.test(newPrefix)) {
                return extra.reply(style.invalidInput('The prefix cannot contain spaces.', `${extra.prefix}setprefix <prefix>`, { box: false }));
            }
            if (/[a-zA-Z0-9]/.test(newPrefix)) {
                return extra.reply(style.invalidInput('The prefix cannot contain letters or numbers — use symbols like . ! # / $', `${extra.prefix}setprefix <prefix>`, { box: false }));
            }

            updateSetting('prefix', newPrefix);

            await extra.reply(style.box('👑 PREFIX', [
                `✅ Prefix changed to: *${newPrefix}*`,
                '',
                `New command format: ${newPrefix}help`,
                'The change is active immediately and saved to settings.js.'
            ]));
        } catch (error) {
            console.error('Setprefix command error:', error);
            await extra.reply(style.error('Failed to change the prefix.'));
        }
    }
};
