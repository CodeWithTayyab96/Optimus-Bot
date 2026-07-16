const settings = require('../../settings');
const { updateSetting } = require('../../lib/settingsWriter');

module.exports = {
    name: 'setnewsletter',
    aliases: ['setnl', 'setchannel'],
    category: 'owner',
    description: 'Set the newsletter JID used for message forwarding context (persists to settings.js)',
    usage: '.setnewsletter <jid> (or reply to a newsletter message)',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            let newsletterJid = '';

            // If used inside a newsletter chat, take that JID
            if (message.key.remoteJid && message.key.remoteJid.endsWith('@newsletter')) {
                newsletterJid = message.key.remoteJid;
            }
            // If replying to a forwarded newsletter message, dig the JID out of contextInfo
            else if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                const contextInfo = message.message.extendedTextMessage.contextInfo;

                const findNewsletterJid = (obj, depth = 0) => {
                    if (depth > 5 || !obj || typeof obj !== 'object') return null;
                    for (const key in obj) {
                        const value = obj[key];
                        if (typeof value === 'string' && value.endsWith('@newsletter')) {
                            return value;
                        }
                        if (typeof value === 'object' && value !== null) {
                            const found = findNewsletterJid(value, depth + 1);
                            if (found) return found;
                        }
                    }
                    return null;
                };

                newsletterJid = findNewsletterJid(contextInfo);

                if (!newsletterJid) {
                    return extra.reply('❌ The replied message is not from a newsletter!\n\nPlease reply to a newsletter message or provide a newsletter JID directly.');
                }
            } else if (args[0]) {
                newsletterJid = args[0].trim();
            } else {
                const currentJid = settings.newsletterJid || 'Not set';
                return extra.reply(
                    `📰 *Newsletter Configuration*\n\n` +
                    `Current Newsletter JID: \`${currentJid}\`\n` +
                    `Newsletter Name: ${settings.newsletterName || settings.botName}\n\n` +
                    `Usage:\n` +
                    `  ${extra.prefix}setnewsletter <newsletter JID>\n` +
                    `  Or reply to a newsletter message with ${extra.prefix}setnewsletter\n\n` +
                    `Example: ${extra.prefix}setnewsletter 120363161513685998@newsletter`
                );
            }

            if (!newsletterJid.endsWith('@newsletter')) {
                return extra.reply('❌ Invalid newsletter JID format!\n\nNewsletter JID must end with `@newsletter`\nExample: `120363161513685998@newsletter`');
            }

            updateSetting('newsletterJid', newsletterJid);

            await extra.reply(
                `✅ Newsletter JID updated successfully!\n\n` +
                `📰 Newsletter JID: \`${newsletterJid}\`\n` +
                `📛 Newsletter Name: ${settings.newsletterName || settings.botName}\n\n` +
                `Bot messages will now link back to this channel.`
            );
        } catch (error) {
            console.error('SetNewsletter command error:', error);
            await extra.reply(`❌ Failed to set newsletter JID: ${error.message}`);
        }
    }
};
