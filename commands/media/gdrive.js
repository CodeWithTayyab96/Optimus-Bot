const style = require('../../lib/messageStyle');
const { downloadGDrive } = require('../../lib/gdrive');

/**
 * .gdrive — send a PUBLIC Google Drive file back to the chat.
 *
 * Entirely local: no third-party downloader API, so group members' links are
 * never forwarded to another service. All host/redirect/size checks live in
 * lib/safeDownload.js. Private files and folders fail with an explicit reason.
 */
module.exports = {
    name: 'gdrive',
    aliases: ['gdl', 'drivedl'],
    category: 'media',
    description: 'Download a public Google Drive file',
    usage: '.gdrive <drive link>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const url = args.join(' ').trim();
        if (!url) {
            return await extra.reply(style.invalidInput(
                'Please provide a public Google Drive link.',
                `${extra.prefix}gdrive <link>`
            ));
        }

        try {
            await sock.sendMessage(extra.chatId, { react: { text: '📥', key: message.key } }).catch(() => { });
            const file = await downloadGDrive(url);

            return await sock.sendMessage(extra.chatId, {
                document: file.buffer,
                fileName: file.filename,
                mimetype: file.mimetype,
                caption: `📁 ${file.filename} · ${(file.buffer.length / 1024 / 1024).toFixed(2)} MiB`,
            }, { quoted: message });
        } catch (error) {
            console.error('[gdrive] error:', error.message);
            return await extra.reply(style.error(`Google Drive download failed: ${error.message}`));
        }
    },
};
