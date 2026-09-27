/**
 * .dlstatus — download-source health check (owner-only).
 *
 * Runs the shared probes from lib/dlHealth (the same ones the background
 * monitor uses) and reports ALIVE / DEAD, the PO token provider supervisor,
 * and the proxy pool. Owner-only because it makes live calls.
 */
const style = require('../../lib/messageStyle');
const dlHealth = require('../../lib/dlHealth');
const proxyPool = require('../../lib/proxyPool');
const potSupervisor = require('../../lib/potSupervisor');

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

        lines.push('ℹ️ Dead sources fail fast; the affected command shows an honest error.');

        await extra.reply(style.box('🩺 DOWNLOAD STATUS', lines));
    },
};
