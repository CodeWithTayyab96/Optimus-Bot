const style = require('./messageStyle');
const { getAutoReaction, setAutoReaction } = require('./index');

// List of emojis for command reactions
const commandEmojis = ['⏳'];

// Store auto-reaction state
let isAutoReactionEnabled = getAutoReaction();

function getRandomEmoji() {
    return commandEmojis[0];
}

// Function to add reaction to a command message
async function addCommandReaction(sock, message) {
    try {
        if (!isAutoReactionEnabled || !message?.key?.id) return;
        
        const emoji = getRandomEmoji();
        await sock.sendMessage(message.key.remoteJid, {
            react: {
                text: emoji,
                key: message.key
            }
        });
    } catch (error) {
        console.error('Error adding command reaction:', error);
    }
}

// Emojis used when auto-reacting to new posts in the configured channel (newsletter)
const channelEmojis = ['❤️', '🔥', '👍', '🎉', '💯'];

function getRandomChannelEmoji() {
    return channelEmojis[Math.floor(Math.random() * channelEmojis.length)];
}

// Dedupe recently-reacted newsletter post IDs (in-memory for the process lifetime)
// so a re-delivered upsert doesn't stack multiple reactions on the same post.
const reactedChannelIds = new Set();
const CHANNEL_REACT_LIMIT = 300;
// Only react to posts newer than this — avoids reacting to backlog on reconnect.
const CHANNEL_REACT_MAX_AGE_MS = 2 * 60 * 1000;

/**
 * Auto-react to a new post in the configured channel.
 * @param {object} sock
 * @param {object} message the upserted message
 * @param {string} targetChannel the newsletter JID to react in (e.g. settings.newsletterJid)
 */
async function addChannelReaction(sock, message, targetChannel) {
    try {
        if (!isAutoReactionEnabled || !message?.key?.id) return;
        const remoteJid = message.key.remoteJid;
        if (!remoteJid || !remoteJid.endsWith('@newsletter')) return;
        if (!targetChannel || remoteJid !== targetChannel) return;

        // Don't react to the bot's own posts (avoid self-reaction noise).
        if (message.key.fromMe) return;

        // Skip old posts (e.g. backlog delivered on reconnect).
        const ts = message.messageTimestamp;
        if (ts != null) {
            const secs = (typeof ts === 'object' && typeof ts.toNumber === 'function') ? ts.toNumber() : Number(ts);
            const ageMs = Date.now() - secs * 1000;
            if (ageMs > CHANNEL_REACT_MAX_AGE_MS) return;
        }

        const id = message.key.id;
        if (reactedChannelIds.has(id)) return;
        reactedChannelIds.add(id);
        if (reactedChannelIds.size > CHANNEL_REACT_LIMIT) {
            reactedChannelIds.delete(reactedChannelIds.values().next().value);
        }

        const emoji = getRandomChannelEmoji();
        await sock.sendMessage(remoteJid, {
            react: { text: emoji, key: message.key }
        });
    } catch (error) {
        console.error('Error adding channel reaction:', error);
    }
}

// Function to handle areact command
async function handleAreactCommand(sock, chatId, message, isOwner) {
    try {
        if (!isOwner) {
            await sock.sendMessage(chatId, { 
                text: style.permissionDenied('owner', { box: false }),
                quoted: message
            });
            return;
        }

        const args = message.message?.conversation?.split(' ') || [];
        const action = args[1]?.toLowerCase();

        if (action === 'on') {
            isAutoReactionEnabled = true;
            setAutoReaction(true);
            await sock.sendMessage(chatId, { 
                text: style.success('Auto-reactions have been enabled globally.'),
                quoted: message
            });
        } else if (action === 'off') {
            isAutoReactionEnabled = false;
            setAutoReaction(false);
            await sock.sendMessage(chatId, { 
                text: style.success('Auto-reactions have been disabled globally.'),
                quoted: message
            });
        } else {
            const currentState = isAutoReactionEnabled ? 'enabled' : 'disabled';
            await sock.sendMessage(chatId, { 
                text: style.box('👑 AUTO-REACT', [
                    `Auto-reactions are currently ${currentState} globally.`,
                    '',
                    'Usage:',
                    ' .areact on — enable auto-reactions',
                    ' .areact off — disable auto-reactions'
                ]),
                quoted: message
            });
        }
    } catch (error) {
        console.error('Error handling areact command:', error);
        await sock.sendMessage(chatId, { 
            text: style.error('Failed to control auto-reactions.'),
            quoted: message
        });
    }
}

module.exports = {
    addCommandReaction,
    addChannelReaction,
    handleAreactCommand
}; 