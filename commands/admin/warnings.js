const fs = require('fs');
const path = require('path');
const style = require('../../lib/messageStyle');

const warningsFilePath = path.join(__dirname, '../../data/warnings.json');

// NOTE: There are two independent warning stores in this project:
//  1. data/warnings.json — the manual admin system (.warn / .resetwarn / .warnings),
//     stored as { [chatId]: { [userJid]: count } } (group-scoped).
//  2. userGroupData.json.warnings — the automatic warn action used by antilink /
//     antibadword (lib/index.js incrementWarningCount / resetWarningCount).
// They are intentionally separate: manual admin warnings and automated moderation
// warnings. Do not merge them without a deliberate decision to unify behavior.

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
        await sock.sendMessage(chatId, { text: style.invalidInput('Please mention a user to check warnings.', '.warnings @user', { box: false }) });
        return;
    }

    const userToCheck = mentionedJidList[0];
    // .warn stores counts as warnings.json[chatId][userJid] — read the same shape.
    const warningCount = warnings[chatId]?.[userToCheck] || 0;

    await sock.sendMessage(chatId, {
        text: `@${userToCheck.split('@')[0]} has ${warningCount} warning(s).`,
        mentions: [userToCheck]
    });
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
