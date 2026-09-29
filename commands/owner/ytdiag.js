/**
 * .ytdiag — work out which YouTube client, if any, works from THIS host.
 *
 * "Sign in to confirm you're not a bot" is an IP problem, but that does not mean
 * nothing can be done: YouTube treats different player clients differently, and
 * which ones are tolerated varies by IP. Rather than guessing, this runs the same
 * probe against each client and reports which actually succeed here.
 *
 * The result is decisive:
 *   • some client works      -> pin it, and the bot works without a proxy
 *   • nothing works          -> the IP is the problem; a proxy is the only fix
 *   • no PO-token plugin     -> say so, because that is what mweb needs
 *
 * Usage
 *   .ytdiag                                  probe a stable public video
 *   .ytdiag https://youtube.com/shorts/...   probe a specific video
 */
const style = require('../../lib/messageStyle');
const isOwnerOrSudo = require('../../lib/isOwner');
const ytdlp = require('../../lib/ytdlp');
const proxyPool = require('../../lib/proxyPool');

// '' = no player_client override, i.e. yt-dlp's own choice.
const CLIENTS = ['', 'mweb', 'tv', 'web_safari', 'ios', 'android_vr'];
const DEFAULT_PROBE = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // short, public, stable
const PER_CLIENT_TIMEOUT_MS = 45000;

/** JS runtime args — without them YouTube's challenge cannot be solved at all. */
const JS_ARGS = ['--js-runtimes', 'node', '--remote-components', 'ejs:github'];

/** Hide proxy credentials before putting a proxy URL in a chat message. */
function maskProxy(u) {
    if (!u) return null;
    try {
        const url = new URL(u);
        if (url.username) url.username = url.username.slice(0, 2) + '••';
        if (url.password) url.password = '••••';
        return url.toString();
    } catch {
        return '(unparseable proxy url)';
    }
}

async function probeClient(client, url, proxy, extraArgs = []) {
    const args = [
        ...JS_ARGS,
        '--no-warnings',
        '--no-playlist',
        '--simulate',
        '--print',
        '%(title)s',
        ...extraArgs,
        url,
    ];
    if (client) args.unshift('--extractor-args', `youtube:player_client=${client}`);
    if (proxy) args.unshift('--proxy', proxy);

    const started = Date.now();
    try {
        const out = await ytdlp.run(args, PER_CLIENT_TIMEOUT_MS);
        const title = String(out).split('\n')[0].trim();
        return { client: client || 'default', ok: true, ms: Date.now() - started, detail: title.slice(0, 40) };
    } catch (err) {
        const msg = String(err.message || '');
        const short = /confirm you['\u2019]?re not a bot/i.test(msg)
            ? 'bot check'
            : /Requested format is not available/i.test(msg)
              ? 'no formats'
              : msg.slice(0, 40);
        return { client: client || 'default', ok: false, ms: Date.now() - started, detail: short };
    }
}

module.exports = {
    name: 'ytdiag',
    aliases: ['youtubediag'],
    category: 'owner',
    description: 'Find which YouTube client works from this host (owner only)',
    usage: '.ytdiag [url]',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const senderId = message.key.participant || message.key.remoteJid;
        if (!message.key.fromMe && !(await isOwnerOrSudo(senderId, sock, extra.chatId))) {
            return sock.sendMessage(
                extra.chatId,
                { text: style.permissionDenied('ownerOrSudo', { box: false }) },
                { quoted: message }
            );
        }

        const url = (args[0] || '').startsWith('http') ? args[0] : DEFAULT_PROBE;

        await sock.sendMessage(extra.chatId, { text: style.processing('Probing YouTube clients — this takes a minute') }, { quoted: message });

        const lines = [];

        // Context first: these decide how the results should be read.
        try {
            const d = await ytdlp.diagnose();
            lines.push(`yt-dlp: ${d.ok ? 'v' + d.version : 'NOT RUNNABLE — ' + d.error}`);
            lines.push(`binary: ${d.bin}`);
        } catch (e) {
            lines.push(`yt-dlp: diagnosis failed — ${e.message}`);
        }
        lines.push(`PO-token plugin: ${ytdlp.potPluginPossible() ? 'expected (mweb can be used)' : 'NOT available — mweb cannot work'}`);
        lines.push('');

        const results = [];
        for (const client of CLIENTS) {
            results.push(await probeClient(client, url));
        }

        for (const r of results) {
            lines.push(`${r.ok ? '✅' : '❌'} ${r.client.padEnd(12)} ${(r.ms / 1000).toFixed(1)}s  ${r.detail}`);
        }

        // IPv4 and IPv6 are different addresses, and a host blocked on one is
        // often fine on the other. Free to test, and cheaper than a proxy.
        const ipv4 = await probeClient('', url, null, ['-4']);
        const ipv6 = await probeClient('', url, null, ['-6']);
        lines.push('');
        lines.push('Address family:');
        lines.push(`  IPv4 (-4): ${ipv4.ok ? '✅ ' + ipv4.detail : '❌ ' + ipv4.detail}`);
        lines.push(`  IPv6 (-6): ${ipv6.ok ? '✅ ' + ipv6.detail : '❌ ' + ipv6.detail}`);
        const ipv6Wins = ipv6.ok && !ipv4.ok;

        // If a proxy is configured, test it too — that is the whole question when
        // the direct sweep fails, and it is better answered here than after a
        // deploy. Only one probe: enough to say whether it unblocks YouTube.
        const pool = proxyPool.list();
        let proxyWorks = false;
        if (pool.length) {
            const proxy = pool[0];
            const r = await probeClient('', url, proxy);
            proxyWorks = r.ok;
            lines.push('');
            lines.push(`via proxy ${maskProxy(proxy)}: ${r.ok ? '✅ ' + r.detail : '❌ ' + r.detail}`);
        }

        const winners = results.filter((r) => r.ok).map((r) => r.client);
        lines.push('');
        if (ipv6Wins) {
            lines.push('IPv6 works even though IPv4 does not — you are blocked on one');
            lines.push('address, not the other. Add this to .env and restart:');
            lines.push('  YTDLP_EXTRA_ARGS=-6');
        } else if (winners.length) {
            lines.push(`Working here: ${winners.join(', ')}`);
            if (winners.includes('default')) {
                lines.push('The bot already uses the default client, so this should be working —');
                lines.push('if it is not, the failure is somewhere other than client choice.');
            } else {
                lines.push(`Pin one with: --extractor-args youtube:player_client=${winners[0]}`);
            }
        } else if (pool.length && proxyWorks) {
            lines.push('Nothing works directly, but the proxy DOES — and it is already applied');
            lines.push('to every yt-dlp call, so downloads should work now.');
        } else if (pool.length) {
            lines.push('Nothing works directly and the proxy does not either.');
            lines.push('A datacenter proxy will not help — YouTube blocks those too.');
            lines.push('You need a residential or mobile proxy.');
        } else {
            lines.push('Nothing works from this IP — not even the default client.');
            lines.push('This host is blocked by YouTube. Next options, cheapest first:');
            lines.push('  1. a residential proxy (set PROXIES in .env)');
            lines.push('  2. a different host');
        }

        await extra.reply(style.box('🔬 YOUTUBE DIAGNOSTICS', lines));
    },
    // Exported for tests.
    _test: { CLIENTS, JS_ARGS, DEFAULT_PROBE, PER_CLIENT_TIMEOUT_MS, probeClient },
};
