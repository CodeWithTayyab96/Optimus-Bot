const axios = require('axios');
const settings = require('../../settings');
const style = require('../../lib/messageStyle');
const ytdlp = require('../../lib/ytdlp');
const proxyPool = require('../../lib/proxyPool');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

module.exports = {
    name: 'facebook',
    aliases: ['fb'],
    category: 'media',
    description: 'Download a Facebook video',
    usage: '.facebook <url>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const url = args.join(' ').trim();

            if (!url) {
                return await extra.reply(style.invalidInput('Please provide a Facebook video URL.', `${extra.prefix}facebook <url>`));
            }
            if (!/(facebook\.com|fb\.watch|fb\.me)/i.test(url)) {
                return await extra.reply(style.invalidInput('That is not a Facebook link.', `${extra.prefix}facebook <url>`));
            }

            // yt-dlp's Facebook extractor — no third-party API.
            if (!(await ytdlp.isAvailable())) {
                return await extra.reply(style.error('Facebook download is unavailable: yt-dlp is not installed on this host.'));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '🔄', key: message.key } });

            const direct = await ytdlp.getBestUrl(url);
            const res = await proxyPool.get(direct, {
                responseType: 'arraybuffer',
                timeout: 120000,
                maxContentLength: 200 * 1024 * 1024,
                headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Encoding': 'identity' }
            });
            const videoBuffer = Buffer.from(res.data);
            if (!videoBuffer.length) throw new Error('empty buffer');

            await sock.sendMessage(extra.chatId, {
                video: videoBuffer,
                mimetype: 'video/mp4',
                caption: `𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗗 𝗕𝗬 ${(settings.botName || 'OPTIMUS BOT').toUpperCase()}`
            }, { quoted: message });
        } catch (error) {
            console.error('[facebook] error:', error.message);
            return await extra.reply(style.error('Failed to download the Facebook video. Please try again.'));
        }
    },
};
