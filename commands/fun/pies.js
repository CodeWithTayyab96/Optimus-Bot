const fetch = require('node-fetch');
const style = require('../../lib/messageStyle');

const BASE = 'https://api.shizo.top/pies';
const VALID_COUNTRIES = ['india','malaysia', 'thailand', 'china', 'indonesia', 'japan', 'korea', 'vietnam'];

async function fetchPiesImageBuffer(country) {
	const url = `${BASE}/${country}?apikey=shizo`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const contentType = res.headers.get('content-type') || '';
	if (!contentType.includes('image')) throw new Error('API did not return an image');
	return res.buffer();
}	async function piesCommand(sock, chatId, message, args) {
	const sub = (args && args[0] ? args[0] : '').toLowerCase();
	if (!sub) {
		await sock.sendMessage(chatId, { text: style.invalidInput('Please provide a country.', `.pies <country>\nCountries: ${VALID_COUNTRIES.join(', ')}`) }, { quoted: message });
		return;
	}
	if (!VALID_COUNTRIES.includes(sub)) {
		await sock.sendMessage(chatId, { text: style.invalidInput(`Unsupported country: ${sub}.`, `.pies <country>\nCountries: ${VALID_COUNTRIES.join(', ')}`) }, { quoted: message });
		return;
	}
	try {
		const imageBuffer = await fetchPiesImageBuffer(sub);
		await sock.sendMessage(
			chatId,
			{ image: imageBuffer, caption: `pies: ${sub}` },
			{ quoted: message }
		);
	} catch (err) {
		console.error('Error in pies command:', err);
		await sock.sendMessage(chatId, { text: '❌ Failed to fetch image. Please try again.' }, { quoted: message });
	}
}

async function piesAlias(sock, chatId, message, country) {
	try {
		const imageBuffer = await fetchPiesImageBuffer(country);
		await sock.sendMessage(
			chatId,
			{ image: imageBuffer, caption: `pies: ${country}` },
			{ quoted: message }
		);
	} catch (err) {
		console.error(`Error in pies alias (${country}) command:`, err);
		await sock.sendMessage(chatId, { text: '❌ Failed to fetch image. Please try again.' }, { quoted: message });
	}
}

module.exports = {
    name: 'pies',
    aliases: ['china', 'indonesia', 'japan', 'korea', 'india', 'malaysia', 'thailand'],
    category: 'fun',
    description: 'Random country image',
    usage: '.pies <country> | .japan, .korea ...',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        if (extra.commandName === 'pies') {
            await piesCommand(sock, extra.chatId, message, args);
        } else {
            await piesAlias(sock, extra.chatId, message, extra.commandName);
        }
    },
    piesCommand,
    piesAlias,
    VALID_COUNTRIES,
};
