// Store game state per user
const gameState = new Map();

module.exports = {
    gameState, // Exported so main.js can route game input while a game is active
    name: 'bomb',
    aliases: ['bom'],
    category: 'fun',
    description: 'Play the bomb game — pick numbers 1-9, avoid the bomb!',
    usage: '.bomb',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const sender = extra.senderId;
            const chatId = extra.chatId;
            const timeout = 180000; // 3 minutes

            // Active game: process input (number 1-9 or surrender)
            if (gameState.has(sender)) {
                const game = gameState.get(sender);

                const text = message.message?.conversation ||
                    message.message?.extendedTextMessage?.text ||
                    '';

                if (text.toLowerCase().trim() === 'suren' || text.toLowerCase().trim() === 'surrender') {
                    const bombBox = game.array.find(v => v.emot === '💥');
                    await sock.sendMessage(chatId, { text: `*You surrendered!* 💣\n\nThe bomb was in box number ${bombBox.number}.` }, { quoted: game.msg });
                    clearTimeout(game.timeoutId);
                    gameState.delete(sender);
                    return;
                }

                const number = parseInt(text.trim());
                if (isNaN(number) || number < 1 || number > 9) {
                    return; // Ignore non-number messages during game
                }

                const selectedBox = game.array.find(v => v.position === number);
                if (!selectedBox || selectedBox.state) {
                    return; // Box already opened or invalid
                }

                selectedBox.state = true;

                if (selectedBox.emot === '💥') {
                    let teks = `💥 *B O M B  E X P L O D E D!*\n\n`;
                    teks += `You selected box number ${selectedBox.number} and...\n\n`;
                    teks += `💣 *BOOM!* 💣\n\n`;
                    teks += `Game Over!\n\n`;
                    teks += `*Final Result:*\n`;
                    for (let i = 0; i < game.array.length; i += 3) {
                        teks += game.array.slice(i, i + 3).map(v => v.emot).join('') + '\n';
                    }

                    await sock.sendMessage(chatId, { text: teks }, { quoted: game.msg });
                    clearTimeout(game.timeoutId);
                    gameState.delete(sender);
                    return;
                }

                const safeBoxes = game.array.filter(v => v.emot === '✅');
                const openedSafeBoxes = safeBoxes.filter(v => v.state);

                if (openedSafeBoxes.length === safeBoxes.length) {
                    let teks = `🎉 *YOU WIN!*\n\n`;
                    teks += `Congratulations! You successfully opened all safe boxes!\n\n`;
                    teks += `*Final Result:*\n`;
                    for (let i = 0; i < game.array.length; i += 3) {
                        teks += game.array.slice(i, i + 3).map(v => v.emot).join('') + '\n';
                    }

                    await sock.sendMessage(chatId, { text: teks }, { quoted: game.msg });
                    clearTimeout(game.timeoutId);
                    gameState.delete(sender);
                    return;
                }

                let teks = `乂  *B O M B*\n\n`;
                teks += `Box number ${selectedBox.number} opened: ${selectedBox.emot}\n\n`;
                teks += `Send number *1* - *9* to open a box:\n\n`;
                for (let i = 0; i < game.array.length; i += 3) {
                    teks += game.array.slice(i, i + 3).map(v => v.state ? v.emot : v.number).join('') + '\n';
                }
                teks += `\nTimeout : [ *${((timeout / 1000) / 60)} minutes* ]\n`;
                teks += `Type *suren* to surrender.`;

                await sock.sendMessage(chatId, { text: teks }, { quoted: game.msg });
                return;
            }

            // Start new game
            const bom = ['💥', '✅', '✅', '✅', '✅', '✅', '✅', '✅', '✅'].sort(() => Math.random() - 0.5);
            const number = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
            const array = bom.map((v, i) => ({
                emot: v,
                number: number[i],
                position: i + 1,
                state: false
            }));

            let teks = `乂  *B O M B*\n\n`;
            teks += `Send number *1* - *9* to open the *9* boxes below:\n\n`;
            for (let i = 0; i < array.length; i += 3) {
                teks += array.slice(i, i + 3).map(v => v.state ? v.emot : v.number).join('') + '\n';
            }
            teks += `\nTimeout : [ *${((timeout / 1000) / 60)} minutes* ]\n`;
            teks += `If you get the box with the bomb, you lose. Type *suren* to surrender.`;

            const gameMsg = await sock.sendMessage(chatId, { text: teks }, { quoted: message });

            const timeoutId = setTimeout(() => {
                if (gameState.has(sender)) {
                    const game = gameState.get(sender);
                    const bombBox = game.array.find(v => v.emot === '💥');
                    sock.sendMessage(chatId, {
                        text: `*Time's up!* ⏰\n\nThe bomb was in box number ${bombBox.number}.`
                    }, { quoted: game.msg });
                    gameState.delete(sender);
                }
            }, timeout);

            gameState.set(sender, {
                msg: gameMsg,
                array: array,
                timeoutId: timeoutId
            });

            // Cleanup game state after timeout + 1 minute
            setTimeout(() => {
                if (gameState.has(sender)) {
                    gameState.delete(sender);
                }
            }, timeout + 60000);
        } catch (error) {
            console.error('Error in bomb command:', error);
            return extra.reply('❌ Error: ' + (error.message || 'Unknown error occurred'));
        }
    }
};
