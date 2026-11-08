const style = require('../../lib/messageStyle');
const { downloadGithub } = require('../../lib/githubDownload');

/**
 * .githubdl — send a public GitHub repo archive, release asset or raw file.
 *
 * Local HTTPS only, with a host allowlist and a size cap (lib/safeDownload.js).
 * No token is used, so private repos are intentionally unsupported.
 */
module.exports = {
    name: 'githubdl',
    aliases: ['gitdl', 'ghdl'],
    category: 'media',
    description: 'Download a GitHub repo archive, release asset or file',
    usage: '.githubdl <github link>',
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
                'Please provide a GitHub repo, release asset or file link.',
                `${extra.prefix}githubdl <link>`
            ));
        }

        try {
            await sock.sendMessage(extra.chatId, { react: { text: '📥', key: message.key } }).catch(() => { });
            const file = await downloadGithub(url);

            return await sock.sendMessage(extra.chatId, {
                document: file.buffer,
                fileName: file.filename,
                mimetype: file.mimetype,
                caption: `🐙 ${file.filename} · ${(file.buffer.length / 1024 / 1024).toFixed(2)} MiB`,
            }, { quoted: message });
        } catch (error) {
            console.error('[githubdl] error:', error.message);
            return await extra.reply(style.error(`GitHub download failed: ${error.message}`));
        }
    },
};
