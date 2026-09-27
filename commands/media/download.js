const style = require('../../lib/messageStyle');

/**
 * .download — one command for any supported link.
 *
 * Thin router: it detects the platform from the URL and calls the SAME module
 * the platform-specific command uses, so there is no duplicated download logic
 * and every fix (PO token, proxy pool, fallbacks) applies automatically.
 */
const ROUTES = [
    { test: /(?:youtube\.com|youtu\.be)\//i, file: 'song', pretty: 'YouTube → .song (audio)' },
    { test: /tiktok\.com\//i, file: 'tiktok', pretty: 'TikTok → .tiktok' },
    { test: /(?:instagram\.com|instagr\.am)\//i, file: 'instagram', pretty: 'Instagram → .instagram' },
    { test: /(?:twitter\.com|x\.com)\//i, file: 'twitter', pretty: 'Twitter/X → .twitter' },
    { test: /(?:facebook\.com|fb\.watch)\//i, file: 'facebook', pretty: 'Facebook → .facebook' },
    { test: /mediafire\.com\//i, file: 'mediafire', pretty: 'MediaFire → .mediafire' },
    { test: /soundcloud\.com\//i, file: 'soundcloud', pretty: 'SoundCloud → .soundcloud' },
    // Known-unavailable platforms: route to them so the user gets the same
    // honest "not available" message rather than a raw error.
    { test: /threads\.(?:net|com)\//i, file: 'threads', pretty: 'Threads → .threads' },
    { test: /capcut\.com\//i, file: 'capcut', pretty: 'CapCut → .capcut' },
];

module.exports = {
    name: 'download',
    aliases: ['dl', 'auto', 'get'],
    ROUTES, // exported for tests
    category: 'media',
    description: 'Download from any supported link (auto-detects the platform)',
    usage: '.download <link>   ·   .download <youtube link> video',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const raw = args.join(' ').trim();
            if (!raw) {
                const supported = ROUTES.map(r => `• ${r.pretty}`).join('\n');
                return await extra.reply(style.box('📥 DOWNLOAD', [
                    'Send any supported link:',
                    ` \`${extra.prefix}download <link>\``,
                    '',
                    'Supported:',
                    supported,
                ]));
            }

            const m = raw.match(/https?:\/\/\S+/i);
            const url = m ? m[0] : raw;
            const rest = raw.replace(url, '');
            const wantsVideo = /\b(video|vid|mp4)\b/i.test(rest);

            // YouTube: audio by default, .download <url> video for the video
            if (/(?:youtube\.com|youtu\.be)\//i.test(url)) {
                const file = wantsVideo ? 'video' : 'song';
                const mod = require(`./${file}`);
                await extra.reply(style.info(`Detected YouTube — using .${file}`));
                return await mod.execute(sock, message, [url], extra);
            }

            for (const r of ROUTES) {
                if (r.test.test(url)) {
                    const mod = require(`./${r.file}`);
                    await extra.reply(style.info(`Detected ${r.pretty}`));
                    return await mod.execute(sock, message, [url], extra);
                }
            }

            return await extra.reply(style.error(
                'That link isn’t from a platform I can download from.\n\n' +
                'Supported: YouTube, TikTok, Instagram, Twitter/X, Facebook, MediaFire, SoundCloud, Threads, CapCut.'
            ));
        } catch (e) {
            console.error('[download] error:', e.message);
            return await extra.reply(style.error('Download failed. The link may be invalid or the source unavailable.'));
        }
    },
};
