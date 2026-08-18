const { channelInfo } = require('../../lib/messageConfig');
const isAdmin = require('../../lib/isAdmin');
const { isSudo } = require('../../lib/index');
const { isBanned, unbanUser } = require('../../lib/isBanned');
const style = require('../../lib/messageStyle');

async function unbanCommand(sock, chatId, message) {
    // Restrict in groups to admins; in private to owner/sudo
    const isGroup = chatId.endsWith('@g.us');
    if (isGroup) {
        const senderId = message.key.participant || message.key.remoteJid;
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: style.permissionDenied('botAdmin', { box: false }), ...channelInfo }, { quoted: message });
            return;
        }
        if (!isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(chatId, { text: style.permissionDenied('admin', { box: false }), ...channelInfo }, { quoted: message });
            return;
        }
    } else {
        const senderId = message.key.participant || message.key.remoteJid;
        const senderIsSudo = await isSudo(senderId);
        if (!message.key.fromMe && !senderIsSudo) {
            await sock.sendMessage(chatId, { text: style.permissionDenied('ownerOrSudo', { box: false }), ...channelInfo }, { quoted: message });
            return;
        }
    }
    let userToUnban;
    
    // Check for mentioned users
    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        userToUnban = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    // Check for replied message
    else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
        userToUnban = message.message.extendedTextMessage.contextInfo.participant;
    }
    
    if (!userToUnban) {
        await sock.sendMessage(chatId, { 
            text: style.invalidInput('Please mention the user or reply to their message.', '.unban @user', { box: false }), 
            ...channelInfo 
        }, { quoted: message });
        return;
    }

    try {
        if (isBanned(userToUnban)) {
            unbanUser(userToUnban);
            
            await sock.sendMessage(chatId, { 
                text: style.success(`Successfully unbanned @${userToUnban.split('@')[0]}!`),
                mentions: [userToUnban],
                ...channelInfo 
            });
        } else {
            await sock.sendMessage(chatId, { 
                text: style.info(`@${userToUnban.split('@')[0]} is not banned.`),
                mentions: [userToUnban],
                ...channelInfo 
            });
        }
    } catch (error) {
        console.error('Error in unban command:', error);
        await sock.sendMessage(chatId, { text: style.error('Failed to unban user.'), ...channelInfo }, { quoted: message });
    }
}

module.exports = {
    name: 'unban',
    aliases: [],
    category: 'admin',
    description: 'Unban a user so they can use the bot again',
    usage: '.unban @user',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        if (!extra.isGroup && !message.key.fromMe && !extra.senderIsSudo) {
            await sock.sendMessage(extra.chatId, { text: style.permissionDenied('ownerOrSudo', { box: false }) }, { quoted: message });
            return;
        }
        await unbanCommand(sock, extra.chatId, message);
    },

};