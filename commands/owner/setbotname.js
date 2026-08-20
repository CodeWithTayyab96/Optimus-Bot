const settings = require('../../settings');
const { updateSetting } = require('../../lib/settingsWriter');
const style = require('../../lib/messageStyle');

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
                    style.box('👑 BOT NAME', [
                        `Current bot name: *${settings.botName}*`,
                        '',
                        'Usage:',
                        ` ${extra.prefix}setbotname <new name>`,
                        ` Or reply to a message with ${extra.prefix}setbotname`
                    ])
                );
            }

            if (newBotName.length > 50) {
                return extra.reply(style.invalidInput('The bot name must be 50 characters or less.', `${extra.prefix}setbotname <name>`, { box: false }));
            }

            updateSetting('botName', newBotName);

            await extra.reply(style.box('👑 BOT NAME', [
                `✅ Bot name changed to: *${newBotName}*`,
                '',
                'The new name will be used in menus and other places.'
            ]));
        } catch (error) {
            console.error('Setbotname command error:', error);
            await extra.reply(style.error('Failed to change the bot name.'));
        }
    }
};
