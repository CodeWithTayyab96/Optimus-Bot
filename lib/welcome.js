const { addWelcome, delWelcome, isWelcomeOn, addGoodbye, delGoodBye, isGoodByeOn } = require('../lib/index');
const style = require('./messageStyle');
const { delay } = require('@whiskeysockets/baileys');

async function handleWelcome(sock, chatId, message, match) {
    if (!match) {
        return sock.sendMessage(chatId, {
            text: style.box('👋 WELCOME', [
                'Setup:',
                ' .welcome on — enable welcome messages',
                ' .welcome set <message> — set a custom welcome message',
                ' .welcome off — disable welcome messages',
                '',
                'Available variables:',
                ' • {user} — mentions the new member',
                ' • {group} — shows the group name',
                ' • {description} — shows the group description'
            ]),
            quoted: message
        });
    }

    const [command, ...args] = match.split(' ');
    const lowerCommand = command.toLowerCase();
    const customMessage = args.join(' ');

    if (lowerCommand === 'on') {
        if (await isWelcomeOn(chatId)) {
            return sock.sendMessage(chatId, { text: style.info('Welcome messages are already enabled.'), quoted: message });
        }
        await addWelcome(chatId, true, 'Welcome {user} to {group}! 🎉');
        return sock.sendMessage(chatId, { text: style.success('Welcome messages enabled. Use .welcome set <message> to customize.'), quoted: message });
    }

    if (lowerCommand === 'off') {
        if (!(await isWelcomeOn(chatId))) {
            return sock.sendMessage(chatId, { text: style.info('Welcome messages are already disabled.'), quoted: message });
        }
        await delWelcome(chatId);
        return sock.sendMessage(chatId, { text: style.success('Welcome messages disabled for this group.'), quoted: message });
    }

    if (lowerCommand === 'set') {
        if (!customMessage) {
            return sock.sendMessage(chatId, { text: style.invalidInput('Please provide a custom welcome message.', '.welcome set Welcome to the group!', { box: false }), quoted: message });
        }
        await addWelcome(chatId, true, customMessage);
        return sock.sendMessage(chatId, { text: style.success('Custom welcome message set successfully.'), quoted: message });
    }

    // If no valid command is provided
    return sock.sendMessage(chatId, {
        text: style.invalidInput('Invalid command.', '.welcome on | .welcome set <message> | .welcome off'),
        quoted: message
    });
}

async function handleGoodbye(sock, chatId, message, match) {
    const lower = match?.toLowerCase();

    if (!match) {
        return sock.sendMessage(chatId, {
            text: style.box('👋 GOODBYE', [
                'Setup:',
                ' .goodbye on — enable goodbye messages',
                ' .goodbye set <message> — set a custom goodbye message',
                ' .goodbye off — disable goodbye messages',
                '',
                'Available variables:',
                ' • {user} — mentions the leaving member',
                ' • {group} — shows the group name'
            ]),
            quoted: message
        });
    }

    if (lower === 'on') {
        if (await isGoodByeOn(chatId)) {
            return sock.sendMessage(chatId, { text: style.info('Goodbye messages are already enabled.'), quoted: message });
        }
        await addGoodbye(chatId, true, 'Goodbye {user} 👋');
        return sock.sendMessage(chatId, { text: style.success('Goodbye messages enabled. Use .goodbye set <message> to customize.'), quoted: message });
    }

    if (lower === 'off') {
        if (!(await isGoodByeOn(chatId))) {
            return sock.sendMessage(chatId, { text: style.info('Goodbye messages are already disabled.'), quoted: message });
        }
        await delGoodBye(chatId);
        return sock.sendMessage(chatId, { text: style.success('Goodbye messages disabled for this group.'), quoted: message });
    }

    if (lower.startsWith('set ')) {
        const customMessage = match.substring(4);
        if (!customMessage) {
            return sock.sendMessage(chatId, { text: style.invalidInput('Please provide a custom goodbye message.', '.goodbye set Goodbye!', { box: false }), quoted: message });
        }
        await addGoodbye(chatId, true, customMessage);
        return sock.sendMessage(chatId, { text: style.success('Custom goodbye message set successfully.'), quoted: message });
    }

    // If no valid command is provided
    return sock.sendMessage(chatId, {
        text: style.invalidInput('Invalid command.', '.goodbye on | .goodbye set <message> | .goodbye off'),
        quoted: message
    });
}

module.exports = { handleWelcome, handleGoodbye };
// This code handles welcome and goodbye messages in a WhatsApp group using the Baileys library.