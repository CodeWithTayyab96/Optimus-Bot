/**
 * Optimus Bot — .coinflip
 * Flip a coin.
 *
 * Behaviour ported from Shadow MD (`drenox.js:7332`). Purely local: no API,
 * no network. Accepts an optional guess so it can settle a bet.
 */
const style = require('../../lib/messageStyle');

const SIDES = ['heads', 'tails'];
const EMOJI = { heads: '🪙', tails: '🔰' };

function normalizeGuess(input) {
    const v = String(input || '').toLowerCase().trim();
    if (['h', 'head', 'heads'].includes(v)) return 'heads';
    if (['t', 'tail', 'tails'].includes(v)) return 'tails';
    return null;
}

function flip(rand = Math.random) {
    return SIDES[Math.floor(rand() * SIDES.length)];
}

async function coinflipCommand(sock, chatId, message, args) {
    const guess = normalizeGuess(args[0]);

    if (args[0] && !guess) {
        return sock.sendMessage(chatId, {
            text: style.invalidInput('Call heads or tails (h/t also works).', '.coinflip [heads|tails]', { box: false })
        }, { quoted: message });
    }

    const result = flip();
    const lines = [`${EMOJI[result]} *${result.toUpperCase()}*`];
    if (guess) {
        lines.push('');
        lines.push(guess === result ? '✅ You called it!' : '❌ Better luck next time.');
    }

    return sock.sendMessage(chatId, {
        text: style.box('🪙 COIN FLIP', lines)
    }, { quoted: message });
}

module.exports = {
    name: 'coinflip',
    aliases: ['flip', 'coin', 'toss'],
    category: 'fun',
    description: 'Flip a coin (optionally call heads or tails)',
    usage: '.coinflip [heads|tails]',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await coinflipCommand(sock, extra.chatId, message, args);
    },
    coinflipCommand,
    normalizeGuess,
    flip,
    SIDES,
};
