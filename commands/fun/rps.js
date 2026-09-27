/**
 * Optimus Bot — .rps
 * Rock–paper–scissors against the bot.
 *
 * Behaviour ported from Shadow MD (`drenox.js:8366`). Purely local: no API,
 * no network. The resolver is exported so it can be unit-tested.
 */
const style = require('../../lib/messageStyle');

const CHOICES = ['rock', 'paper', 'scissors'];
const EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

function normalize(input) {
    const v = String(input || '').toLowerCase().trim();
    if (['r', 'rock', '🪨'].includes(v)) return 'rock';
    if (['p', 'paper', '📄'].includes(v)) return 'paper';
    if (['s', 'scissors', 'scissor', '✂️'].includes(v)) return 'scissors';
    return null;
}

/** @returns {'win'|'lose'|'draw'} */
function resolve(player, bot) {
    if (player === bot) return 'draw';
    return BEATS[player] === bot ? 'win' : 'lose';
}

function pickBotChoice(rand = Math.random) {
    return CHOICES[Math.floor(rand() * CHOICES.length)];
}

async function rpsCommand(sock, chatId, message, args) {
    const player = normalize(args[0]);

    if (!player) {
        return sock.sendMessage(chatId, {
            text: style.box('✂️ ROCK PAPER SCISSORS', [
                'Usage: .rps rock | paper | scissors',
                '',
                'Short forms: .rps r  |  .rps p  |  .rps s'
            ])
        }, { quoted: message });
    }

    const bot = pickBotChoice();
    const outcome = resolve(player, bot);

    const headline = outcome === 'win' ? '🎉 You win!'
        : outcome === 'lose' ? '🤖 I win!'
            : '🤝 Draw!';

    return sock.sendMessage(chatId, {
        text: style.box('✂️ ROCK PAPER SCISSORS', [
            `You: ${EMOJI[player]} ${player}`,
            `Me:  ${EMOJI[bot]} ${bot}`,
            '',
            headline
        ])
    }, { quoted: message });
}

module.exports = {
    name: 'rps',
    aliases: ['rockpaperscissors'],
    category: 'fun',
    description: 'Play rock-paper-scissors against the bot',
    usage: '.rps rock|paper|scissors',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await rpsCommand(sock, extra.chatId, message, args);
    },
    rpsCommand,
    resolve,
    normalize,
    pickBotChoice,
    CHOICES,
};
