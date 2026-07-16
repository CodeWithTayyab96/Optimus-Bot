const settings = require('../../settings');
const { updateSetting } = require('../../lib/settingsWriter');

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
                return extra.reply(`📌 Current prefix: *${settings.prefix || '.'}*\n\nUsage: ${extra.prefix}setprefix <new prefix>`);
            }

            const newPrefix = args[0];

            if (newPrefix.length > 3) {
                return extra.reply('❌ Prefix must be 1-3 characters long!');
            }
            if (/\s/.test(newPrefix)) {
                return extra.reply('❌ Prefix cannot contain spaces!');
            }
            if (/[a-zA-Z0-9]/.test(newPrefix)) {
                return extra.reply('❌ Prefix cannot contain letters or numbers — use symbols like . ! # / $');
            }

            updateSetting('prefix', newPrefix);

            await extra.reply(`✅ Prefix changed to: *${newPrefix}*\n\nNew command format: ${newPrefix}help\nThe change is active immediately and saved to settings.js.`);
        } catch (error) {
            console.error('Setprefix command error:', error);
            await extra.reply(`❌ Error: ${error.message}`);
        }
    }
};
