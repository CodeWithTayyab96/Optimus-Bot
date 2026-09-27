/**
 * Optimus Bot — .dice
 * Roll one or more dice.
 *
 * Behaviour ported from Shadow MD (`drenox.js:7338`), extended to support
 * `.dice 2d6` and `.dice 20` so it is useful for tabletop rolls.
 * Purely local: no API, no network.
 */
const style = require('../../lib/messageStyle');

const MAX_COUNT = 10;
const MAX_SIDES = 1000;

/**
 * Parses "6", "20", "2d6", "3d20".
 * @returns {{count:number, sides:number}|null}
 */
function parseSpec(input) {
    const raw = String(input || '').trim().toLowerCase();
    if (!raw) return { count: 1, sides: 6 };

    const nd = raw.match(/^(\d+)\s*d\s*(\d+)$/);
    if (nd) {
        const count = parseInt(nd[1], 10);
        const sides = parseInt(nd[2], 10);
        if (count >= 1 && count <= MAX_COUNT && sides >= 2 && sides <= MAX_SIDES) {
            return { count, sides };
        }
        return null;
    }

    if (/^\d+$/.test(raw)) {
        const sides = parseInt(raw, 10);
        if (sides >= 2 && sides <= MAX_SIDES) return { count: 1, sides };
    }
    return null;
}

function roll(count, sides, rand = Math.random) {
    const rolls = [];
    for (let i = 0; i < count; i++) {
        rolls.push(1 + Math.floor(rand() * sides));
    }
    return rolls;
}

async function diceCommand(sock, chatId, message, args) {
    const spec = parseSpec(args[0]);

    if (!spec) {
        return sock.sendMessage(chatId, {
            text: style.invalidInput(
                `Give a die size between 2 and ${MAX_SIDES}, or NdM with N ≤ ${MAX_COUNT}.`,
                '.dice        (one d6)\n.dice 20     (one d20)\n.dice 3d6    (three d6)'
            )
        }, { quoted: message });
    }

    const rolls = roll(spec.count, spec.sides);
    const total = rolls.reduce((a, b) => a + b, 0);

    const lines = [
        `🎲 ${spec.count}d${spec.sides}`,
        '',
        spec.count === 1
            ? `Result: *${total}*`
            : `Rolls: ${rolls.join(', ')}\nTotal: *${total}*`
    ];

    return sock.sendMessage(chatId, {
        text: style.box('🎲 DICE', lines)
    }, { quoted: message });
}

module.exports = {
    name: 'dice',
    aliases: ['roll', 'diceroll'],
    category: 'fun',
    description: 'Roll a die (supports NdM, e.g. 3d6)',
    usage: '.dice [sides|NdM]',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await diceCommand(sock, extra.chatId, message, args);
    },
    diceCommand,
    parseSpec,
    roll,
    MAX_COUNT,
    MAX_SIDES,
};
