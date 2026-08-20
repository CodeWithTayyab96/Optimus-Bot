/**
 * .aistatus — Display AI provider configuration status (owner-only)
 *
 * Shows which providers are configured and ready, without making
 * network requests or exposing API keys / tokens.
 */
const { channelInfo } = require('../../lib/messageConfig');
const aiConfig = require('../../lib/aiConfig');

function maskKey(val) {
    if (!val || val.startsWith('YOUR_')) return null;
    return val.slice(0, 4) + '••••' + val.slice(-4);
}

function readyDot(ready) {
    return ready ? '🟢' : '⚪';
}

module.exports = {
    name: 'aistatus',
    aliases: ['aistat', 'ais'],
    category: 'owner',
    description: 'Show AI provider configuration status',
    usage: '.aistatus',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const settings = require('../../settings');

        const groqReady = aiConfig.isProviderReady('groq');
        const geminiReady = aiConfig.isProviderReady('gemini');
        const cloudflareReady = aiConfig.isProviderReady('cloudflare');
        const pollinationsReady = aiConfig.isProviderReady('pollinations');

        const text = [
            '╭━━〔 🤖 *AI STATUS* 〕━━╮',
            '┃',
            '┃ 💬 *Text*',
            `┃ ${readyDot(groqReady)} Groq`,
            `┃    └─ ${aiConfig.text.model}`,
            '┃',
            '┃ 🎙️ *Speech*',
            `┃ ${readyDot(groqReady)} Groq`,
            `┃    └─ ${aiConfig.speech.model}`,
            '┃',
            '┃ 🎨 *Image Generation*',
            `┃ ${readyDot(geminiReady)} 1. Gemini — ${aiConfig.image.primary.model}`,
            `┃ ${readyDot(cloudflareReady)} 2. Cloudflare — ${cloudflareReady ? aiConfig.image.fallbacks[0].model : 'not configured'}`,
            `┃ ${readyDot(pollinationsReady)} 3. Pollinations — ${aiConfig.image.fallbacks[1].model}`,
            '┃',
            '╰━━━━━━━━━━━━━━━━━━━━━━╯',
            '',
            '🔑 *Credentials:*',
            `  Groq: ${maskKey(settings.groqApiKey) || '❌ not set'}`,
            `  Gemini: ${maskKey(settings.geminiApiKey) || '❌ not set'}`,
            `  Cloudflare: ${cloudflareReady ? '✅ configured' : '❌ not set'}`,
            `  Pollinations: ${pollinationsReady ? '✅ no key required' : '❌ unavailable'}`,
        ].join('\n');

        await sock.sendMessage(extra.chatId, {
            text,
            ...channelInfo
        }, { quoted: message });
    },
};
