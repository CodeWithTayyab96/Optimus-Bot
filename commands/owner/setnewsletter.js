const settings = require('../../settings');
const { updateSetting } = require('../../lib/settingsWriter');
const style = require('../../lib/messageStyle');

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
                    return extra.reply(style.error('The replied message is not from a newsletter. Reply to a newsletter message or provide a newsletter JID directly.'));
                }
            } else if (args[0]) {
                newsletterJid = args[0].trim();
            } else {
                const currentJid = settings.newsletterJid || 'Not set';
                return extra.reply(
                    style.box('📰 NEWSLETTER', [
                        `Current Newsletter JID: \`${currentJid}\``,
                        `Newsletter Name: ${settings.newsletterName || settings.botName}`,
                        '',
                        'Usage:',
                        ` ${extra.prefix}setnewsletter <newsletter JID>`,
                        ` Or reply to a newsletter message with ${extra.prefix}setnewsletter`,
                        '',
                        `Example: ${extra.prefix}setnewsletter 120363161513685998@newsletter`
                    ])
                );
            }

            if (!newsletterJid.endsWith('@newsletter')) {
                return extra.reply(style.invalidInput('Invalid newsletter JID format. The JID must end with @newsletter.', `${extra.prefix}setnewsletter <jid>`, { box: false }));
            }

            updateSetting('newsletterJid', newsletterJid);

            await extra.reply(
                style.box('📰 NEWSLETTER', [
                    '✅ Newsletter JID updated successfully',
                    '',
                    `JID: \`${newsletterJid}\``,
                    `Name: ${settings.newsletterName || settings.botName}`,
                    '',
                    'Bot messages will now link back to this channel.'
                ])
            );
        } catch (error) {
            console.error('SetNewsletter command error:', error);
            await extra.reply(style.error('Failed to set the newsletter JID.'));
        }
    }
};
