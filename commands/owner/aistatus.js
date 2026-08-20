const aiConfig = require('../../lib/aiConfig');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'aistatus',
    aliases: ['aistat'],
    category: 'owner',
    description: 'Show configured AI model IDs',
    usage: '.aistatus',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const lines = [];

        // Groq
        lines.push('`GROQ`');
        lines.push(`  ├─ Chat : \`${aiConfig.groq.chatModel}\``);
        lines.push(`  └─ STT  : \`${aiConfig.groq.sttModel}\``);
        lines.push('');

        // Gemini
        lines.push('`GEMINI`');
        lines.push(`  ├─ Chat : \`${aiConfig.gemini.chatModel}\``);
        lines.push(`  └─ Image: \`${aiConfig.gemini.imageModel}\``);
        lines.push('');

        // Pixazo
        lines.push('`PIXAZO`');
        lines.push(`  └─ Image: \`${aiConfig.pixazo.imageModel}\``);

        const body = lines.join('\n');

        await sock.sendMessage(extra.chatId, {
            text: style.box('🤖 AI STATUS', body.split('\n')),
            ...require('../../lib/messageConfig').channelInfo,
        }, { quoted: message });
    },
};
