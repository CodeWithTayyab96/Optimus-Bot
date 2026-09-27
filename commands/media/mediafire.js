const style = require('../../lib/messageStyle');
const proxyPool = require('../../lib/proxyPool');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Extract the direct CDN link from a MediaFire file page's HTML.
 *
 * Current pages put the signed CDN URL straight on the download button
 * (`<a href="https://downloadNNNN.mediafire.com/..." id="downloadButton">`).
 * Older pages used a base64 `data-scrambled-url` attribute. We try all forms.
 */
function extractDirectLink(html) {
    if (!html) return null;

    // 1) The download button anchor — href may appear before or after the id.
    const tag = html.match(/<a[^>]*id="downloadButton"[^>]*>/i);
    if (tag) {
        const h = tag[0].match(/href="([^"]+)"/i);
        if (h && /^https?:\/\//i.test(h[1]) && /mediafire\.com/i.test(h[1])) return h[1];
    }

    // 2) Any direct download CDN href.
    const direct = html.match(/href="(https:\/\/download[^"]*mediafire\.com[^"]*)"/i);
    if (direct) return direct[1];

    // 3) Legacy base64-scrambled link.
    const scr = html.match(/data-scrambled-url="([^"]+)"/i);
    if (scr) {
        try {
            const decoded = Buffer.from(scr[1], 'base64').toString('utf8');
            if (/^https?:\/\//i.test(decoded)) return decoded;
        } catch { /* ignore */ }
    }

    return null;
}

function filenameFromUrl(url) {
    try {
        const name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
        return name || 'file';
    } catch {
        return 'file';
    }
}

module.exports = {
    name: 'mediafire',
    aliases: ['mfdl'],
    category: 'media',
    description: 'Download a file from a MediaFire link',
    usage: '.mediafire <mediafire link>',
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
                return await extra.reply(style.invalidInput('Please provide a MediaFire link.', `${extra.prefix}mediafire <mediafire link>`));
            }
            if (!/mediafire\.com/i.test(url)) {
                return await extra.reply(style.invalidInput('That is not a MediaFire link.', `${extra.prefix}mediafire <mediafire link>`));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '📥', key: message.key } });

            // Scrape the file page directly — no third-party API.
            const res = await proxyPool.get(url, {
                timeout: 30000,
                maxRedirects: 5,
                headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' },
            });
            const html = typeof res.data === 'string' ? res.data : String(res.data);

            const direct = extractDirectLink(html);
            if (!direct) {
                return await extra.reply(style.error('Could not find a download link. The file may be private, removed, or the page layout changed.'));
            }

            const name = filenameFromUrl(direct);

            await extra.reply(style.box('📁 MEDIAFIRE', [
                `📌 ${name}`,
                '',
                'Sending file...'
            ]));

            await sock.sendMessage(extra.chatId, {
                document: { url: direct },
                fileName: name,
                mimetype: 'application/octet-stream'
            }, { quoted: message });
        } catch (error) {
            console.error('[mediafire] error:', error.message);
            return await extra.reply(style.error('Failed to download the MediaFire file. Please try again.'));
        }
    },
};
