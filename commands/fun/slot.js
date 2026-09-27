/**
 * Optimus Bot — .slot
 * One-armed bandit. Three reels; matching reels win.
 *
 * Behaviour ported from Shadow MD (`drenox.js:8392`). Purely local: no API,
 * no network, and nothing of value is wagered — it is a toy, not gambling.
 * The resolver is exported so it can be unit-tested.
 */
const style = require('../../lib/messageStyle');

const REEL = ['🍒', '🍋', '🔔', '⭐', '7️⃣', '💎'];
const JACKPOT = '7️⃣';

function spin(rand = Math.random) {
    return [
        REEL[Math.floor(rand() * REEL.length)],
        REEL[Math.floor(rand() * REEL.length)],
        REEL[Math.floor(rand() * REEL.length)]
    ];
}

/** @returns {'jackpot'|'win'|'two'|'lose'} */
function evaluate(reels) {
    const [a, b, c] = reels;
    if (a === b && b === c) return a === JACKPOT ? 'jackpot' : 'win';
    if (a === b || b === c || a === c) return 'two';
    return 'lose';
}

const OUTCOME_TEXT = {
    jackpot: '🎆 JACKPOT! Triple sevens!',
    win: '🎊 Three of a kind — you win!',
    two: '🙃 Two match. So close!',
    lose: '💀 No match. Try again!'
};

async function slotCommand(sock, chatId, message) {
    const reels = spin();
    const outcome = evaluate(reels);

    return sock.sendMessage(chatId, {
        text: style.box('🎰 SLOT MACHINE', [
            `│ ${reels[0]} │ ${reels[1]} │ ${reels[2]} │`,
            '',
            OUTCOME_TEXT[outcome]
        ])
    }, { quoted: message });
}

module.exports = {
    name: 'slot',
    aliases: ['slots', 'bandit'],
    category: 'fun',
    description: 'Spin the slot machine',
    usage: '.slot',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await slotCommand(sock, extra.chatId, message);
    },
    slotCommand,
    spin,
    evaluate,
    REEL,
    JACKPOT,
};
