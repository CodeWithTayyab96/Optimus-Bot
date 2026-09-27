module.exports = {
    name: 'calc',
    aliases: ['calculate', 'math'],
    category: 'utility',
    description: 'Calculate a math expression',
    usage: '.calc <expression>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            if (args.length === 0) {
                return extra.reply(`❌ Usage: ${extra.prefix}calc <expression>\n\nExample: ${extra.prefix}calc 5 + 3 * 2`);
            }

            const expression = args.join(' ');

            // Whitelist: digits, arithmetic operators, parentheses, decimal points
            if (!/^[0-9+\-*/(). ]+$/.test(expression)) {
                return extra.reply('❌ Invalid expression! Only numbers and operators (+, -, *, /, parentheses) allowed.');
            }

            try {
                const result = new Function(`"use strict"; return (${expression});`)();

                if (typeof result !== 'number' || !isFinite(result)) {
                    return extra.reply('❌ Invalid mathematical expression!');
                }

                let text = `🧮 *Calculator*\n\n`;
                text += `📝 Expression: ${expression}\n`;
                text += `✅ Result: ${result}`;

                await extra.reply(text);
            } catch (evalError) {
                await extra.reply('❌ Invalid mathematical expression!');
            }
        } catch (error) {
            await extra.reply('❌ Something went wrong. Please try again.');
        }
    }
};
