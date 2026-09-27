const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'stock',
    aliases: ['stocks', 'share', 'stockprice'],
    category: 'utility',
    description: 'Get a stock quote',
    usage: '.stock <symbol>  (e.g. .stock AAPL)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const symbol = (args[0] || '').trim();
            if (!symbol) {
                return await extra.reply(style.invalidInput('Please provide a stock symbol.', `${extra.prefix}stock <symbol>`));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '📈', key: message.key } });

            // Yahoo Finance chart endpoint — keyless.
            const data = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
                params: { interval: '1d', range: '1d' },
            });
            const meta = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;

            if (!meta || typeof meta.regularMarketPrice !== 'number') {
                return await extra.reply(style.error(`Could not find a quote for "${symbol}". Check the symbol and try again.`));
            }

            const price = meta.regularMarketPrice;
            const prev = (typeof meta.chartPreviousClose === 'number' && meta.chartPreviousClose)
                || (typeof meta.previousClose === 'number' && meta.previousClose)
                || price;
            const change = price - prev;
            const pct = prev ? (change / prev) * 100 : 0;

            // Chinese market convention: up = red, down = green.
            const dot = change >= 0 ? '🔴' : '🟢';
            const sign = change >= 0 ? '+' : '';

            await extra.reply(style.box('📈 STOCK QUOTE', [
                `${meta.symbol || symbol} — ${meta.shortName || meta.longName || ''}`.trim(),
                `💰 ${price} ${meta.currency || ''}`.trim(),
                `${dot} ${sign}${change.toFixed(2)} (${sign}${pct.toFixed(2)}%)`,
                `📊 Prev close: ${prev}`
            ]));
        } catch (error) {
            console.error('[stock] error:', error.message);
            return await extra.reply(style.error('Could not fetch the stock quote. Please try again.'));
        }
    },
};
