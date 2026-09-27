const style = require('../../lib/messageStyle');
const { nexoracle } = require('../../lib/mediaApi');

module.exports = {
    name: 'apk',
    aliases: ['apkdl'],
    category: 'media',
    description: 'Download an Android APK by package name',
    usage: '.apk <package name> (e.g. com.whatsapp)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const q = args.join(' ').trim();

            if (!q) {
                return await extra.reply(style.invalidInput('Please provide an app package name.', `${extra.prefix}apk <package name>`));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '📦', key: message.key } });

            const data = await nexoracle('downloader/apk', { q });

            if (!data || !data.status || !data.result || !data.result.download) {
                return await extra.reply(style.error('APK not found. Try a different package name.'));
            }

            const { name, icon, download } = data.result;

            if (icon) {
                try {
                    await sock.sendMessage(extra.chatId, {
                        image: { url: icon },
                        caption: `📦 *${name || q}*\n📁 Package: ${q}\n\nSending file...`
                    }, { quoted: message });
                } catch {
                    // icon is cosmetic — ignore failures and still send the file
                }
            }

            await sock.sendMessage(extra.chatId, {
                document: { url: download },
                fileName: `${name || q}.apk`,
                mimetype: 'application/vnd.android.package-archive'
            }, { quoted: message });
        } catch (error) {
            console.error('[apk] error:', error.message);
            return await extra.reply(style.error('Failed to fetch the APK. Please try again.'));
        }
    },
};
