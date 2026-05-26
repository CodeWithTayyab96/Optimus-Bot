// Centralized "forwarded from channel" context shown on bot messages.
// Update settings.newsletterJid to your own channel's JID
// (format: 120363XXXXXXXXX@newsletter) if you want the label to link
// to your real WhatsApp channel.
const settings = require('../settings');

const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: settings.newsletterJid || '120363000000000000@newsletter',
            newsletterName: settings.newsletterName || settings.botName || 'Optimus Bot',
            serverMessageId: -1
        }
    }
};

module.exports = {
    channelInfo: channelInfo
};
