const fs = require('fs');
const path = require('path');

const warningsFilePath = path.join(__dirname, '../../data/warnings.json');

function loadWarnings() {
    if (!fs.existsSync(warningsFilePath)) {
        fs.writeFileSync(warningsFilePath, JSON.stringify({}), 'utf8');
    }
    const data = fs.readFileSync(warningsFilePath, 'utf8');
    return JSON.parse(data);
}

async function warningsCommand(sock, chatId, mentionedJidList) {
    const warnings = loadWarnings();

    if (mentionedJidList.length === 0) {
        await sock.sendMessage(chatId, { text: 'Please mention a user to check warnings.' });
        return;
    }

    const userToCheck = mentionedJidList[0];
    const warningCount = warnings[userToCheck] || 0;

    await sock.sendMessage(chatId, { text: `User has ${warningCount} warning(s).` });
}

module.exports = {
    name: 'warnings',
    aliases: [],
    category: 'admin',
    description: 'Show warnings for a member',
    usage: '.warnings @user',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const mentionedJids = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        await warningsCommand(sock, extra.chatId, mentionedJids);
    },

};
