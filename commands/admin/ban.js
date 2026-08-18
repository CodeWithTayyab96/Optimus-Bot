const { channelInfo } = require('../../lib/messageConfig');
const isAdmin = require('../../lib/isAdmin');
const { isSudo } = require('../../lib/index');
const { isBanned, banUser } = require('../../lib/isBanned');
const style = require('../../lib/messageStyle');

async function banCommand(sock, chatId, message) {
    // Restrict in groups to admins; in private to owner/sudo
    const isGroup = chatId.endsWith('@g.us');
    if (isGroup) {
        const senderId = message.key.participant || message.key.remoteJid;
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: 'Please make the bot an admin to use .ban', ...channelInfo }, { quoted: message });
            return;
        }
        if (!isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(chatId, { text: 'Only group admins can use .ban', ...channelInfo }, { quoted: message });
            return;
        }
    } else {
        const senderId = message.key.participant || message.key.remoteJid;
        const senderIsSudo = await isSudo(senderId);
        if (!message.key.fromMe && !senderIsSudo) {
            await sock.sendMessage(chatId, { text: 'Only owner/sudo can use .ban in private chat', ...channelInfo }, { quoted: message });
            return;
        }
    }
    let userToBan;
    
    // Check for mentioned users
    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        userToBan = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    // Check for replied message
    else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
        userToBan = message.message.extendedTextMessage.contextInfo.participant;
    }
    
    if (!userToBan) {
        await sock.sendMessage(chatId, { 
            text: style.invalidInput('Please mention the user or reply to their message.', '.ban @user'), 
            ...channelInfo 
        });
        return;
    }

    // Prevent banning the bot itself
    try {
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        if (userToBan === botId || userToBan === botId.replace('@s.whatsapp.net', '@lid')) {
            await sock.sendMessage(chatId, { text: style.warning('You cannot ban the bot account.'), ...channelInfo }, { quoted: message });
            return;
        }
    } catch {}

    try {
        if (!isBanned(userToBan)) {
            banUser(userToBan);
            
            await sock.sendMessage(chatId, { 
                text: style.success(`Successfully banned @${userToBan.split('@')[0]}!`),
                mentions: [userToBan],
                ...channelInfo 
            });
        } else {
            await sock.sendMessage(chatId, { 
                text: style.info(`@${userToBan.split('@')[0]} is already banned.`),
                mentions: [userToBan],
                ...channelInfo 
            });
        }
    } catch (error) {
        console.error('Error in ban command:', error);
        await sock.sendMessage(chatId, { text: style.error('Failed to ban user.'), ...channelInfo });
    }
}

module.exports = {
    name: 'ban',
    aliases: [],
    category: 'admin',
    description: 'Ban a user from using the bot',
    usage: '.ban @user',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        if (!extra.isGroup && !message.key.fromMe && !extra.senderIsSudo) {
            await sock.sendMessage(extra.chatId, { text: 'Only owner/sudo can use ' + extra.prefix + 'ban in private chat.' }, { quoted: message });
            return;
        }
        await banCommand(sock, extra.chatId, message);
    },

};
