const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const style = require('../../lib/messageStyle');

const API = 'https://api.trace.moe/search';
const KEY = process.env.TRACE_MOE_API_KEY || '';

module.exports = {
    name: 'trace',
    aliases: ['whatanime'],
    category: 'anime',
    description: 'Find the anime, episode and timestamp from a screenshot',
    usage: '.trace (reply to an anime image)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const ctxInfo = message.message?.extendedTextMessage?.contextInfo;

            if (!ctxInfo?.quotedMessage) {
                return await extra.reply(style.invalidInput('Reply to an anime image with this command.', `${extra.prefix}trace (reply to an image)`));
            }

            const quoted = ctxInfo.quotedMessage;
            if (!quoted.imageMessage && !quoted.stickerMessage) {
                return await extra.reply(style.error('Please reply to an image or sticker.'));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '🔎', key: message.key } });

            const target = {
                key: { remoteJid: extra.chatId, id: ctxInfo.stanzaId, participant: ctxInfo.participant },
                message: quoted,
            };
            const buffer = await downloadMediaMessage(target, 'buffer', {}, {
                logger: undefined,
                reuploadRequest: sock.updateMediaMessage,
            });

            if (!buffer) {
                return await extra.reply(style.error('Failed to download the image. Please try again.'));
            }

            const form = new FormData();
            form.append('image', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

            const url = `${API}?anilistInfo${KEY ? '&key=' + KEY : ''}`;
            const res = await axios.post(url, form, {
                headers: form.getHeaders(),
                timeout: 30000,
                maxBodyLength: Infinity,
            });

            const results = res.data?.result;
            if (!Array.isArray(results) || results.length === 0) {
                return await extra.reply(style.error("I couldn't identify that scene. Try a clearer anime screenshot."));
            }

            const r = results[0];
            const title = r.anilist?.title?.english || r.anilist?.title?.romaji || r.filename || 'Unknown';
            const similarity = typeof r.similarity === 'number' ? (r.similarity * 100).toFixed(1) + '%' : '—';
            const toTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

            const caption = style.box('🔎 ANIME SCENE', [
                `🎌 ${title}`,
                `📺 Episode: ${r.episode ?? '—'}`,
                `⏱ Timestamp: ${toTime(r.from || 0)}${r.to ? '–' + toTime(r.to) : ''}`,
                `🎯 Similarity: ${similarity}`
            ]);

            if (r.image) {
                await sock.sendMessage(extra.chatId, { image: { url: r.image }, caption }, { quoted: message });
            } else {
                await sock.sendMessage(extra.chatId, { text: caption }, { quoted: message });
            }
        } catch (error) {
            console.error('[trace] error:', error.message);
            return await extra.reply(style.error('Anime scene search failed. Please try again.'));
        }
    },
};
