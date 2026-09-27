const fs = require('fs');
const path = require('path');
const os = require('os');
const isOwnerOrSudo = require('../../lib/isOwner');
const style = require('../../lib/messageStyle');
const { channelInfo: baseChannelInfo } = require('../../lib/messageConfig');
// Keep this command's intentional forwardingScore: 999 while centralising
// the newsletter branding (jid/name) in lib/messageConfig.
const channelInfo = { ...baseChannelInfo, contextInfo: { ...baseChannelInfo.contextInfo, forwardingScore: 999 } };

async function clearSessionCommand(sock, chatId, msg) {
    try {
        const senderId = msg.key.participant || msg.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
        
        if (!msg.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, { 
                text: style.permissionDenied('owner', { box: false }),
                ...channelInfo
            });
            return;
        }

        // Define session directory
        const sessionDir = path.join(__dirname, '../../session');

        if (!fs.existsSync(sessionDir)) {
            await sock.sendMessage(chatId, { 
                text: style.notFound('Session directory', { box: false }),
                ...channelInfo
            });
            return;
        }

        let filesCleared = 0;
        let errors = 0;
        let errorDetails = [];

        // Send initial status
        await sock.sendMessage(chatId, { 
            text: style.processing('Optimizing session files'),
            ...channelInfo
        });

        const files = fs.readdirSync(sessionDir);
        
        // Count files by type for optimization
        let appStateSyncCount = 0;
        let preKeyCount = 0;

        for (const file of files) {
            if (file.startsWith('app-state-sync-')) appStateSyncCount++;
            if (file.startsWith('pre-key-')) preKeyCount++;
        }

        // Delete files
        for (const file of files) {
            if (file === 'creds.json') {
                // Skip creds.json file
                continue;
            }
            try {
                const filePath = path.join(sessionDir, file);
                fs.unlinkSync(filePath);
                filesCleared++;
            } catch (error) {
                errors++;
                errorDetails.push(`Failed to delete ${file}: ${error.message}`);
            }
        }

        // Send completion message
        const message = style.box('👑 SESSION CLEANUP', [
            '✅ Session files cleared successfully',
            '',
            'Statistics:',
            ` • Total files cleared: ${filesCleared}`,
            ` • App state sync files: ${appStateSyncCount}`,
            ` • Pre-key files: ${preKeyCount}`,
            ...(errors > 0 ? [``, `⚠️ Errors encountered: ${errors}`] : [])
        ]);

        await sock.sendMessage(chatId, { 
            text: message,
            ...channelInfo
        });

    } catch (error) {
        console.error('Error in clearsession command:', error);
        await sock.sendMessage(chatId, { 
            text: style.error('Failed to clear session files.'),
            ...channelInfo
        });
    }
}

module.exports = {
    name: 'clearsession',
    aliases: ['clearsesi'],
    category: 'owner',
    description: 'Clean up session files',
    usage: '.clearsession',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await clearSessionCommand(sock, extra.chatId, message);
    },

};