// 🧹 Fix for ENOSPC / temp overflow in hosted panels
const fs = require('fs');
const path = require('path');

// Redirect temp storage away from system /tmp
const customTemp = path.join(process.cwd(), 'temp');
if (!fs.existsSync(customTemp)) fs.mkdirSync(customTemp, { recursive: true });
process.env.TMPDIR = customTemp;
process.env.TEMP = customTemp;
process.env.TMP = customTemp;

// Auto-cleaner every 3 hours
setInterval(() => {
    fs.readdir(customTemp, (err, files) => {
        if (err) return;
        for (const file of files) {
            const filePath = path.join(customTemp, file);
            fs.stat(filePath, (err, stats) => {
                if (!err && Date.now() - stats.mtimeMs > 3 * 60 * 60 * 1000) {
                    fs.unlink(filePath, () => { });
                }
            });
        }
    });
    console.log('🧹 Temp folder auto-cleaned');
}, 3 * 60 * 60 * 1000);

const settings = require('./settings');
require('./config.js');
const { isBanned } = require('./lib/isBanned');
const { isSudo } = require('./lib/index');
const isOwnerOrSudo = require('./lib/isOwner');
const isAdmin = require('./lib/isAdmin');
const { handleBadwordDetection } = require('./lib/antibadword');
const { Antilink } = require('./lib/antilink');
const { addCommandReaction, addChannelReaction } = require('./lib/reactions');
const { loadCommands } = require('./lib/commandLoader');
const { runGroupProtections } = require('./lib/groupProtection');
const { addMessage: addGroupStatsMessage } = require('./lib/groupstats');
const { readMode } = require('./lib/mode');
const { handleViewOnceReply } = require('./lib/viewOnceToDm');
const style = require('./lib/messageStyle');
// Automatic moderation ported from Shadow MD. Both are opt-in per group, so
// they are inert unless an admin has switched them on.
const { handleSpamDetection } = safeRequire('./lib/antispam');
const { handleBotCommandDetection } = safeRequire('./lib/antibot');
const { handleAntiHijack } = safeRequire('./lib/antiHijack');

// Load all commands via the loader (fault-isolated: a broken file is skipped, not fatal)
const commands = loadCommands();

// Safe require for command modules whose secondary exports are needed by
// non-command flows below (events, moderation, games). A broken module
// degrades that feature instead of crashing the bot.
function safeRequire(modulePath) {
    try {
        return require(modulePath);
    } catch (error) {
        console.error(`❌ Failed to load module ${modulePath}:`, error.message);
        return {};
    }
}

// Secondary (non-dispatch) handlers that live inside command modules
const { handleAutotypingForMessage, showTypingAfterCommand } = safeRequire('./commands/owner/autotyping');
const { handleAutoread, isBotMentionedInMessage } = safeRequire('./commands/owner/autoread');
const afk = require('./lib/afk');
const { handleMessageRevocation, storeMessage } = safeRequire('./commands/owner/antidelete');
const { handleStatusUpdate } = safeRequire('./commands/owner/autostatus');
const { readState: readPmBlockerState } = safeRequire('./commands/owner/pmblocker');
const { handleTicTacToeMove } = safeRequire('./commands/fun/tictactoe');
const bombModule = safeRequire('./commands/fun/bomb');
const { incrementMessageCount } = safeRequire('./commands/fun/topmembers');
const { handleTagDetection } = safeRequire('./commands/admin/antitag');
const { handleMentionDetection } = safeRequire('./commands/admin/mention');
const { handleChatbotResponse } = safeRequire('./commands/admin/chatbot');
const { handleJoinEvent } = safeRequire('./commands/admin/welcome');
const { handleLeaveEvent } = safeRequire('./commands/admin/goodbye');
const { handlePromotionEvent } = safeRequire('./commands/admin/promote');
const { handleDemotionEvent } = safeRequire('./commands/admin/demote');

// Global settings
global.packname = settings.packname;
global.author = settings.author;
global.channelLink = settings.channelLink || "https://whatsapp.com/channel/0029VbCzsfGKmCPSiZlGKC3S";
global.ytch = settings.botOwner || "Tayyab";

// Rebuilt per message so .setnewsletter changes apply without a restart
function buildChannelInfo() {
    return {
        contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: settings.newsletterJid || '120363424568988623@newsletter',
                newsletterName: settings.newsletterName || 'Optimus Bot',
                serverMessageId: -1
            }
        }
    };
}
let channelInfo = buildChannelInfo();

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function handleMessages(sock, messageUpdate, printLog) {
    let chatId;
    try {
        const { messages, type } = messageUpdate;
        if (type !== 'notify') return;

        const message = messages[0];
        if (!message?.message) return;

        const prefix = (settings.prefix || '.');
        channelInfo = buildChannelInfo();

        // Handle autoread functionality
        if (handleAutoread) await handleAutoread(sock, message);

        // Store message for antidelete feature
        if (message.message && storeMessage) {
            storeMessage(sock, message);
        }

        // Handle message revocation
        if (message.message?.protocolMessage?.type === 0) {
            if (handleMessageRevocation) await handleMessageRevocation(sock, message);
            return;
        }

        chatId = message.key.remoteJid;
        const senderId = message.key.participant || message.key.remoteJid;

        // Auto-react to new posts in the configured channel (newsletter),
        // governed by the same `.areact on/off` toggle as command reactions.
        if (chatId.endsWith('@newsletter')) {
            await addChannelReaction(sock, message, settings.newsletterJid || '120363424568988623@newsletter');
        }
        const isGroup = chatId.endsWith('@g.us');
        const senderIsSudo = await isSudo(senderId);
        const senderIsOwnerOrSudo = await isOwnerOrSudo(senderId, sock, chatId);

        // Handle button responses
        if (message.message?.buttonsResponseMessage) {
            const buttonId = message.message.buttonsResponseMessage.selectedButtonId;

            if (buttonId === 'channel') {
                await sock.sendMessage(chatId, {
                    text: `📢 *Join our Channel:*\n${settings.channelLink || 'https://whatsapp.com/channel/0029VbCzsfGKmCPSiZlGKC3S'}`
                }, { quoted: message });
                return;
            } else if (buttonId === 'owner') {
                const ownerCmd = commands.get('owner');
                if (ownerCmd) {
                    await ownerCmd.execute(sock, message, [], { chatId, senderId, isGroup, channelInfo, prefix });
                }
                return;
            }
        }

        let userMessage = (
            message.message?.conversation?.trim() ||
            message.message?.extendedTextMessage?.text?.trim() ||
            message.message?.imageMessage?.caption?.trim() ||
            message.message?.videoMessage?.caption?.trim() ||
            message.message?.buttonsResponseMessage?.selectedButtonId?.trim() ||
            ''
        ).toLowerCase().trim();

        // Collapse "<prefix> command" → "<prefix>command" (preserves old ". help" behavior)
        userMessage = userMessage.replace(new RegExp(`^${escapeRegex(prefix)}\\s+`), prefix);

        // Preserve raw message for commands like .tag that need original casing
        const rawText = message.message?.conversation?.trim() ||
            message.message?.extendedTextMessage?.text?.trim() ||
            message.message?.imageMessage?.caption?.trim() ||
            message.message?.videoMessage?.caption?.trim() ||
            '';

        // Only log command usage
        if (userMessage.startsWith(prefix)) {
            console.log(`📝 Command used in ${isGroup ? 'group' : 'private'}: ${userMessage}`);
        }
        // Read bot mode once; don't early-return so moderation can still run in private mode
        const isPublic = readMode();
        const isOwnerOrSudoCheck = message.key.fromMe || senderIsOwnerOrSudo;
        // Check if user is banned (skip ban check for unban command)
        if (isBanned(senderId) && !userMessage.startsWith(`${prefix}unban`)) {
            // Only respond occasionally to avoid spam
            if (Math.random() < 0.1) {
                await sock.sendMessage(chatId, {
                    text: style.error('You are banned from using the bot. Contact an admin to get unbanned.'),
                    ...channelInfo
                });
            }
            return;
        }

        // First check if it's a game move
        // Bomb runs per-player-per-chat, so route its input first when that player
        // has an active game in THIS chat; otherwise digits fall through to tictactoe
        if (bombModule.hasActiveGame && bombModule.hasActiveGame(senderId, chatId) &&
            (/^[1-9]$/.test(userMessage) || ['suren', 'surrender'].includes(userMessage))) {
            await bombModule.execute(sock, message, [], {
                chatId, senderId,
                reply: (text) => sock.sendMessage(chatId, { text }, { quoted: message })
            });
            return;
        }
        if (/^[1-9]$/.test(userMessage) || userMessage.toLowerCase() === 'surrender') {
            if (handleTicTacToeMove) await handleTicTacToeMove(sock, chatId, senderId, userMessage);
            return;
        }

        if (!message.key.fromMe && incrementMessageCount) incrementMessageCount(chatId, senderId);

        // Check for bad words and antilink FIRST, before ANY other processing
        // Always run moderation in groups, regardless of mode
        if (isGroup) {
            if (userMessage) {
                await handleBadwordDetection(sock, chatId, message, userMessage, senderId);
            }
            // Antilink checks message text internally, so run it even if userMessage is empty
            await Antilink(message, sock);

            // Anti-spam (flood detection) — opt-in per group
            if (handleSpamDetection) {
                const spamConsumed = await handleSpamDetection(sock, chatId, message, senderId);
                if (spamConsumed) return;
            }

            // Daily group stats (for .groupstats / .myactivity)
            if (!message.key.fromMe) {
                try {
                    const statsCtx = message.message?.extendedTextMessage?.contextInfo;
                    addGroupStatsMessage(chatId, senderId, {
                        mentions: statsCtx?.mentionedJid || [],
                        sticker: !!message.message?.stickerMessage
                    });
                } catch (e) { }
            }

            // Group protections: antisticker, antigroupstatus, antigroupmention, autosticker
            const consumed = await runGroupProtections(sock, chatId, message, senderId, userMessage, prefix);
            if (consumed) return;
        }

        // View-Once → DM: when the owner/sudo REPLIES to a media message with a
        // trigger word/emoji (e.g. "good", "nice", 📥), forward that media to
        // their DM. Runs for any media reply (view-once included); owner-only.
        if (isOwnerOrSudoCheck) {
            const dmHandled = await handleViewOnceReply(sock, message, chatId, senderId);
            if (dmHandled) return;
        }

        // PM blocker: block non-owner DMs when enabled (do not ban)
        if (!isGroup && !message.key.fromMe && !senderIsSudo) {
            try {
                const pmState = readPmBlockerState ? readPmBlockerState() : { enabled: false };
                if (pmState.enabled) {
                    // Inform user, delay, then block without banning globally
                    await sock.sendMessage(chatId, { text: pmState.message || 'Private messages are blocked. Please contact the owner in groups only.' });
                    await new Promise(r => setTimeout(r, 1500));
                    try { await sock.updateBlockStatus(chatId, 'block'); } catch (e) { }
                    return;
                }
            } catch (e) { }
        }

        // AFK — one-time auto-reply while the owner is away
        if (!message.key.fromMe && !senderIsOwnerOrSudo && afk.isEnabled()) {
            let shouldHandleAfk = false;

            if (!isGroup) {
                // DM: any message from a non-owner triggers AFK once
                shouldHandleAfk = true;
            } else if (isBotMentionedInMessage) {
                const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const ctx = message.message?.extendedTextMessage?.contextInfo;
                const isMentioned = isBotMentionedInMessage(message, botNumber);
                const isReplyToBot = !!ctx?.participant &&
                    ctx.participant.split('@')[0].split(':')[0] === sock.user.id.split(':')[0].split('@')[0];
                shouldHandleAfk = (isMentioned || isReplyToBot) && !userMessage.startsWith(prefix);
            }

            if (shouldHandleAfk) {
                if (afk.shouldNotify(chatId, senderId)) {
                    afk.markNotified(chatId, senderId);
                    await sock.sendMessage(chatId, { text: afk.getMessage() }, { quoted: message });
                }
                return;
            }
        }

        // Then check for command prefix
        if (!userMessage.startsWith(prefix)) {
            // Show typing indicator if autotyping is enabled
            if (handleAutotypingForMessage) await handleAutotypingForMessage(sock, chatId, userMessage);

            if (isGroup) {
                // Always run moderation features (antitag) regardless of mode
                if (handleTagDetection) await handleTagDetection(sock, chatId, message, senderId);
                if (handleMentionDetection) await handleMentionDetection(sock, chatId, message);

                // Only run chatbot in public mode or for owner/sudo
                if ((isPublic || isOwnerOrSudoCheck) && handleChatbotResponse) {
                    await handleChatbotResponse(sock, chatId, message, userMessage, senderId);
                }
            }
            return;
        }
        // In private mode, only owner/sudo can run commands
        if (!isPublic && !isOwnerOrSudoCheck) {
            return;
        }

        // ---- Command dispatch ----
        // Parse "<prefix><command> <args...>" — command name from the lowercased
        // message, args from the raw text so original casing is preserved.
        const commandName = userMessage.slice(prefix.length).trim().split(/\s+/)[0] || '';

        let rawAfterPrefix = rawText.trim();
        rawAfterPrefix = rawAfterPrefix.replace(new RegExp(`^${escapeRegex(prefix)}\\s*`), '');
        const args = rawAfterPrefix.split(/\s+/).slice(1).filter(a => a.length > 0);

        const command = commands.get(commandName);

        if (!command) {
            // Unknown command — same behavior as the old default case
            if (isGroup) {
                // Anti-bot runs here on purpose: a message only counts as a
                // foreign bot command when no Optimus command matched it.
                if (handleBotCommandDetection) {
                    const botConsumed = await handleBotCommandDetection(sock, chatId, message, senderId, userMessage);
                    if (botConsumed) return;
                }

                if (userMessage && handleChatbotResponse) {
                    await handleChatbotResponse(sock, chatId, message, userMessage, senderId);
                }
                if (handleTagDetection) await handleTagDetection(sock, chatId, message, senderId);
                if (handleMentionDetection) await handleMentionDetection(sock, chatId, message);
            }
            return;
        }

        // ---- Generic permission checks (declared by each command) ----
        if (command.ownerOnly && !isOwnerOrSudoCheck) {
            await sock.sendMessage(chatId, { text: style.permissionDenied('ownerOrSudo') }, { quoted: message });
            return;
        }

        if (command.groupOnly && !isGroup) {
            await sock.sendMessage(chatId, { text: style.permissionDenied('group') }, { quoted: message });
            return;
        }

        if (command.privateOnly && isGroup) {
            await sock.sendMessage(chatId, { text: style.permissionDenied('private') }, { quoted: message });
            return;
        }

        let isSenderAdmin = false;
        let isBotAdmin = false;

        if (isGroup && (command.adminOnly || command.botAdminNeeded)) {
            const adminStatus = await isAdmin(sock, chatId, senderId);
            isSenderAdmin = adminStatus.isSenderAdmin;
            isBotAdmin = adminStatus.isBotAdmin;

            if (command.botAdminNeeded && !isBotAdmin) {
                await sock.sendMessage(chatId, { text: style.permissionDenied('botAdmin') }, { quoted: message });
                return;
            }

            if (command.adminOnly && !isSenderAdmin && !message.key.fromMe) {
                await sock.sendMessage(chatId, {
                    text: style.permissionDenied('admin'),
                    ...channelInfo
                }, { quoted: message });
                return;
            }
        }

        const extra = {
            chatId,
            senderId,
            isGroup,
            isSenderAdmin,
            isBotAdmin,
            senderIsSudo,
            senderIsOwnerOrSudo,
            isOwnerOrSudoCheck,
            userMessage,
            rawText,
            prefix,
            commandName,
            channelInfo,
            isPublic,
            reply: (content, options = {}) => sock.sendMessage(
                chatId,
                typeof content === 'string' ? { text: content, ...channelInfo } : content,
                { quoted: message, ...options }
            )
        };

        try {
            await command.execute(sock, message, args, extra);
        } catch (error) {
            console.error(`❌ Error executing ${prefix}${commandName}:`, error.message);
            await sock.sendMessage(chatId, {
                text: style.error('Failed to process command.'),
                ...channelInfo
            });
        }

        // Show typing status after command execution (no-op unless autotyping is on)
        if (showTypingAfterCommand) await showTypingAfterCommand(sock, chatId);

        // React to processed commands
        await addCommandReaction(sock, message);
    } catch (error) {
        console.error('❌ Error in message handler:', error.message);
        // Only try to send error message if we have a valid chatId
        if (chatId) {
            await sock.sendMessage(chatId, {
                text: style.error('Failed to process command.'),
                ...channelInfo
            });
        }
    }
}

async function handleGroupParticipantUpdate(sock, update) {
    try {
        const { id, participants, action, author } = update;

        // Check if it's a group
        if (!id.endsWith('@g.us')) return;

        // Respect bot mode: only announce promote/demote in public mode
        const isPublic = readMode();

        // Handle promotion events
        if (action === 'promote') {
            if (!isPublic) return;
            if (handlePromotionEvent) await handlePromotionEvent(sock, id, participants, author);
            return;
        }

        // Handle demotion events
        if (action === 'demote') {
            // Anti-hijack is protection, not an announcement, so it runs even
            // in private mode. When it restores an admin it consumes the event
            // so the "demoted" notice is not posted over the top of it.
            if (handleAntiHijack) {
                const intervened = await handleAntiHijack(sock, id, participants, author);
                if (intervened) return;
            }

            if (!isPublic) return;
            if (handleDemotionEvent) await handleDemotionEvent(sock, id, participants, author);
            return;
        }

        // Handle join events
        if (action === 'add') {
            if (handleJoinEvent) await handleJoinEvent(sock, id, participants);
        }

        // Handle leave events
        if (action === 'remove') {
            if (handleLeaveEvent) await handleLeaveEvent(sock, id, participants);
        }
    } catch (error) {
        console.error('Error in handleGroupParticipantUpdate:', error);
    }
}

// Instead, export the handlers along with handleMessages
module.exports = {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus: async (sock, status) => {
        if (handleStatusUpdate) await handleStatusUpdate(sock, status);
    }
};
