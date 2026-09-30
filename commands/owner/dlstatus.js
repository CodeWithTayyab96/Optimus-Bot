/**
 * .dlstatus — download-source health check (owner-only).
 *
 * Runs the shared probes from lib/dlHealth (the same ones the background
 * monitor uses) and reports ALIVE / DEAD, the PO token provider supervisor,
 * and the proxy pool. Owner-only because it makes live calls.
 */
const style = require('../../lib/messageStyle');
const settings = require('../../settings');
const dlHealth = require('../../lib/dlHealth');
const proxyPool = require('../../lib/proxyPool');
const potSupervisor = require('../../lib/potSupervisor');
const ytdlp = require('../../lib/ytdlp');

/** Hide proxy credentials when displaying them. */
function maskProxy(u) {
    if (!u) return null;
    try {
        const url = new URL(u);
        if (url.username) url.username = url.username.slice(0, 2) + '••';
        if (url.password) url.password = '••••';
        return url.toString();
    } catch {
        return u;
    }
}

module.exports = {
    name: 'dlstatus',
    aliases: ['downloadstatus', 'dlhealth'],
    category: 'owner',
    description: 'Check which download sources are alive',
    usage: '.dlstatus',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await sock.sendMessage(extra.chatId, { react: { text: '🩺', key: message.key } });

        const results = await dlHealth.runProbes();
        const alive = results.filter(r => r.ok).length;
        const lines = results.map(r => `${r.ok ? '✅' : '❌'} ${r.name} — ${r.detail}`);
        lines.push('', `Sources alive: ${alive}/${results.length}`);
        // Shown FIRST: the operator needs to confirm the panel is running the
        // pushed code before trusting any of the probes below.
        lines.unshift(`🤖 Optimus Bot v${settings.version} · commit ${settings.gitCommit || 'unknown'}`);

        // PO token provider supervisor
        const sup = potSupervisor.status();
        if (!sup.installed) {
            lines.push(`🛡️ PO provider: ⚠️ NOT INSTALLED (expected at ${sup.dir}/build/main.js) — YouTube uses slow fallback`);
        } else if (sup.running) {
            lines.push(`🛡️ PO provider supervisor: ✅ running (pid ${sup.pid}, port ${sup.port})${sup.restarts ? ` · ${sup.restarts} restart(s)` : ''}`);
        } else {
            lines.push(`🛡️ PO provider supervisor: ❌ stopped (installed but not running)${sup.restarts ? ` · ${sup.restarts} restart(s)` : ''}`);
        }

        // Proxy pool
        const pool = proxyPool.status();
        if (!pool.length) {
            lines.push('🌐 Proxy: none configured — direct connection');
        } else {
            const healthy = pool.filter(p => p.healthy).length;
            lines.push(`🌐 Proxy pool: ${healthy}/${pool.length} healthy · last used: ${maskProxy(proxyPool.getLastUsed()) || 'direct'}`);
            for (const p of pool.slice(0, 5)) lines.push(`   ${p.healthy ? '✅' : '⚠️'} ${maskProxy(p.url)}`);
        }

        // yt-dlp runtime diagnosis. Owner-only, so paths are safe to show here;
        // this is what distinguishes "missing" from "present but won't run".
        try {
            const d = await ytdlp.diagnose();
            lines.push('', '🔧 yt-dlp runtime');
            lines.push(`   binary: ${d.bin}`);
            lines.push(
                d.exists
                    ? `   ✅ file exists (${(d.sizeBytes / 1048576).toFixed(1)} MB)`
                    : '   ❌ file MISSING'
            );
            if (d.exists) lines.push(`   ${d.executable ? '✅ execute bit set' : '❌ execute bit NOT set'}`);
            lines.push(`   host: ${d.platform}${d.libc !== 'n/a' ? ` · ${d.libc}` : ''}`);
            lines.push(`   TMPDIR: ${d.tmpdir}${d.tmpdirOverridden ? ' (project-local)' : ' (system default)'}`);
            lines.push(`   cookies: ${d.cookies ? '✅ configured' : '— not configured'}`);
            lines.push(d.ok ? `   ✅ runs: v${d.version}` : `   ❌ will not run: ${d.error}`);
            if (!d.ok && d.stderr) {
                const last = d.stderr.split('\n').filter(Boolean).pop() || '';
                if (last) lines.push(`   stderr: ${last.slice(0, 140)}`);
            }
        } catch (e) {
            lines.push('', `🔧 yt-dlp diagnosis unavailable: ${e.message}`);
        }

        lines.push('ℹ️ Dead sources fail fast; the affected command shows an honest error.');

        await extra.reply(style.box('🩺 DOWNLOAD STATUS', lines));
    },
};
