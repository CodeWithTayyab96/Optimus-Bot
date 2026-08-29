/**
 * Optimus Bot — .currency
 * Convert an amount between currencies.
 *
 * API: https://api.exchangerate-api.com/v4/latest/<FROM>
 * No API key required.
 */
const axios = require('axios');
const style = require('../../lib/messageStyle');

const TIMEOUT = 10000;

async function handleCurrencyCommand(sock, chatId, message, userMessage) {
    try {
        const parts = userMessage.trim().split(/\s+/).slice(1); // remove command name
        if (parts.length < 3) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput(
                    'Please provide amount, source currency, and target currency.',
                    '.currency <amount> <from> <to>\n\nExample: .currency 100 USD PKR'
                )
            }, { quoted: message });
        }

        const amount = parseFloat(parts[0]);
        if (isNaN(amount) || amount <= 0) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput('Invalid amount.', '.currency 100 USD PKR')
            }, { quoted: message });
        }

        const from = parts[1].toUpperCase();
        const to = parts[2].toUpperCase();

        if (from.length !== 3 || to.length !== 3) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput(
                    'Currency codes must be 3 letters.',
                    '.currency 100 USD PKR'
                )
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: style.processing(`Converting ${amount} ${from} → ${to}`)
        }, { quoted: message });

        const response = await axios.get(
            `https://api.exchangerate-api.com/v4/latest/${from}`,
            { timeout: TIMEOUT }
        );

        const data = response.data;
        if (!data || !data.rates) {
            return sock.sendMessage(chatId, {
                text: style.error('Could not retrieve exchange rates.')
            }, { quoted: message });
        }

        const rate = data.rates[to];
        if (!rate) {
            return sock.sendMessage(chatId, {
                text: style.error(`Currency "${to}" not found. Please check the currency code.`)
            }, { quoted: message });
        }

        const converted = (amount * rate).toFixed(2);
        const rateStr = rate.toFixed(4);

        const lines = [
            `💱 *Currency Conversion*`,
            ``,
            `💵 Amount: *${amount} ${from}*`,
            `🔁 Rate: 1 ${from} = ${rateStr} ${to}`,
            `💰 Result: *${converted} ${to}*`,
            ``,
            `📅 Rate date: ${data.date || 'N/A'}`
        ];

        await sock.sendMessage(chatId, {
            text: style.box('💱 EXCHANGE', lines)
        }, { quoted: message });

    } catch (error) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            await sock.sendMessage(chatId, {
                text: style.error('Request timed out. Please try again.')
            }, { quoted: message });
        } else if (error.response) {
            await sock.sendMessage(chatId, {
                text: style.error('Currency service is temporarily unavailable.')
            }, { quoted: message });
        } else {
            console.error('[currency] Error:', error);
            await sock.sendMessage(chatId, {
                text: style.error('Something went wrong. Please try again.')
            }, { quoted: message });
        }
    }
}

module.exports = {
    name: 'currency',
    aliases: ['convert', 'exchangerate'],
    category: 'utility',
    description: 'Convert between currencies',
    usage: '.currency <amount> <from> <to>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await handleCurrencyCommand(sock, extra.chatId, message, extra.userMessage);
    },
};
