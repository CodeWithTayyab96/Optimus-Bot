const settings = require('../../settings');
const { updateSetting } = require('../../lib/settingsWriter');

module.exports = {
    name: 'setbotname',
    aliases: ['setname', 'botname'],
    category: 'owner',
    description: 'Change the bot name (persists to settings.js)',
    usage: '.setbotname <new name> (or reply to a message)',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            let newBotName = '';

            // Check if message is a reply
            const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMsg) {
                const quotedText = quotedMsg.conversation ||
                    quotedMsg.extendedTextMessage?.text ||
                    quotedMsg.imageMessage?.caption ||
                    quotedMsg.videoMessage?.caption ||
                    '';
                newBotName = quotedText.trim();
            } else {
                newBotName = args.join(' ').trim();
            }

            if (!newBotName) {
                return extra.reply(
                    `📝 *Set Bot Name*\n\n` +
                    `Current bot name: *${settings.botName}*\n\n` +
                    `Usage:\n` +
                    `  ${extra.prefix}setbotname <new name>\n` +
                    `  Or reply to a message with ${extra.prefix}setbotname`
                );
            }

            if (newBotName.length > 50) {
                return extra.reply('❌ Bot name must be 50 characters or less!');
            }

            updateSetting('botName', newBotName);

            await extra.reply(`✅ Bot name changed to: *${newBotName}*\n\nThe new name will be used in menus and other places.`);
        } catch (error) {
            console.error('Setbotname command error:', error);
            await extra.reply(`❌ Error: ${error.message}`);
        }
    }
};
