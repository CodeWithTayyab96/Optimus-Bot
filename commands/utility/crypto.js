const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

// Common ticker → CoinGecko id.
const COIN_IDS = {
    btc: 'bitcoin', eth: 'ethereum', usdt: 'tether', bnb: 'binancecoin',
    sol: 'solana', xrp: 'ripple', ada: 'cardano', doge: 'dogecoin',
    dot: 'polkadot', matic: 'matic-network', ltc: 'litecoin', trx: 'tron',
    avax: 'avalanche-2', link: 'chainlink', shib: 'shiba-inu', ton: 'the-open-network',
};

module.exports = {
    name: 'crypto',
    aliases: ['coinprice', 'cryptoprice'],
    category: 'utility',
    description: 'Get a cryptocurrency price',
    usage: '.crypto <coin>  (e.g. .crypto btc)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const raw = (args[0] || '').trim().toLowerCase();
            if (!raw) {
                return await extra.reply(style.invalidInput('Please provide a coin (e.g. btc, eth, sol).', `${extra.prefix}crypto <coin>`));
            }
            const id = COIN_IDS[raw] || raw;

            await sock.sendMessage(extra.chatId, { react: { text: '💰', key: message.key } });

            // CoinGecko — free, no key.
            const data = await getJson('https://api.coingecko.com/api/v3/simple/price', {
                params: { ids: id, vs_currencies: 'usd', include_24hr_change: 'true' },
            });
            const row = data && data[id];

            if (!row || typeof row.usd !== 'number') {
                return await extra.reply(style.error(`Could not find a price for "${raw}". Try a symbol like btc, eth or sol.`));
            }

            const change = typeof row.usd_24h_change === 'number' ? row.usd_24h_change : null;
            // Chinese market convention: up = red, down = green.
            const dot = change === null ? '⚪' : (change >= 0 ? '🔴' : '🟢');
            const sign = change !== null && change >= 0 ? '+' : '';

            const lines = [
                `🪙 ${raw.toUpperCase()} (${id})`,
                `💰 $${row.usd}`,
            ];
            if (change !== null) lines.push(`${dot} ${sign}${change.toFixed(2)}% (24h)`);

            await extra.reply(style.box('💰 CRYPTO PRICE', lines));
        } catch (error) {
            console.error('[crypto] error:', error.message);
            return await extra.reply(style.error('Could not fetch the crypto price. Please try again.'));
        }
    },
};
