const axios = require('axios');
const settings = require('../../settings');
const style = require('../../lib/messageStyle');
const ytdlp = require('../../lib/ytdlp');
const proxyPool = require('../../lib/proxyPool');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TWITTER_PATTERNS = [
    /https?:\/\/(?:www\.)?(?:twitter|x)\.com\//i,
    /https?:\/\/(?:mobile\.)?twitter\.com\//i,
];

module.exports = {
    name: 'twitter',
    aliases: ['x', 'xdl', 'twitterdl', 'twdl'],
    category: 'media',
    description: 'Download a Twitter / X video',
    usage: '.twitter <X URL>',
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
                return await extra.reply(style.invalidInput('Please provide a Twitter / X link.', `${extra.prefix}twitter <url>`));
            }
            if (!TWITTER_PATTERNS.some(p => p.test(url))) {
                return await extra.reply(style.invalidInput('Invalid link. Use a valid x.com or twitter.com post URL.', `${extra.prefix}twitter <url>`, { box: false }));
            }

            // yt-dlp's Twitter/X extractor — no third-party API.
            if (!(await ytdlp.isAvailable())) {
                return await extra.reply(style.error('Twitter download is unavailable: yt-dlp is not installed on this host.'));
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
                caption: `*DOWNLOADED BY ${(settings.botName || 'OPTIMUS BOT').toUpperCase()}*`
            }, { quoted: message });
        } catch (error) {
            console.error('[twitter] error:', error.message);
            return await extra.reply(style.error('Failed to download from Twitter / X. The post may have no video, or the link is invalid.'));
        }
    },
};
