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
    handleAreactCommand
}; 