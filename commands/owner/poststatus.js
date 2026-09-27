const style = require('../../lib/messageStyle');

/**
 * .poststatus — post to the bot's OWN status (status@broadcast).
 * Owner-only: it publishes under the bot's account, visible to its contacts.
 */
module.exports = {
    name: 'poststatus',
    aliases: ['setstatus', 'mystatus'],
    category: 'owner',
    description: 'Post text or media as the bot’s WhatsApp status',
    usage: '.poststatus <text>  ·  .poststatus (reply to image/video)',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const text = args.join(' ').trim();
            const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const own = message.message || {};
            const media = quoted?.imageMessage || quoted?.videoMessage || own.imageMessage || own.videoMessage;

            if (media) {
                await sock.sendMessage('status@broadcast', {
                    ...(media.mimetype?.startsWith('video') ? { video: media } : { image: media }),
                    caption: text || ''
                });
                return await extra.reply(style.success('Status posted.'));
            }

            if (!text) {
                return await extra.reply(style.invalidInput('Provide text, or reply to/send an image or video.', `${extra.prefix}poststatus Hello`));
            }

            await sock.sendMessage('status@broadcast', { text });
            return await extra.reply(style.success('Text status posted.'));
        } catch (e) {
            console.error('[poststatus] error:', e.message);
            return await extra.reply(style.error('Failed to post the status.'));
        }
    },
};
