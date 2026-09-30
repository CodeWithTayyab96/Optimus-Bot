const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

// Al Quran Cloud — free, no API key. Arabic (Uthmani) + English (Muhammad Asad)
// translation, plus per-ayah recitation audio served from an open CDN.
// Docs: https://freeapihub.com/apis/quran-api  ·  https://api.alquran.cloud
const BASE = 'https://api.alquran.cloud/v1';
const ARABIC_EDITION = 'quran-uthmani';
const TRANSLATION_EDITION = 'en.asad';

/** ".quran 2" → whole surah; ".quran 2:255" → one ayah. */
function parseTarget(input) {
    const s = (input || '').trim();
    if (!s) return null;
    if (/^\d+:\d+$/.test(s)) {
        const [surah, ayah] = s.split(':').map(Number);
        return { surah, ayah };
    }
    if (/^\d+$/.test(s)) return { surah: Number(s), ayah: null };
    return null;
}

async function fetchEditions(surah, ayah) {
    const path = ayah ? `${BASE}/ayah/${surah}:${ayah}` : `${BASE}/surah/${surah}`;
    // Three single-edition calls in parallel — avoids the multi-edition URL-format
    // ambiguity and degrades gracefully if an edition is briefly unavailable.
    // `ar.alafasy` is the one that actually carries the recitation audio URL.
    const [arR, enR, auR] = await Promise.allSettled([
        getJson(`${path}/${ARABIC_EDITION}`, { timeout: 20000 }),
        getJson(`${path}/${TRANSLATION_EDITION}`, { timeout: 20000 }),
        getJson(`${path}/ar.alafasy`, { timeout: 20000 }),
    ]);
    if (arR.status !== 'fulfilled' || (arR.value && arR.value.code) !== 200) return null;
    return {
        arabic: arR.value.data,
        translation: enR.status === 'fulfilled' ? enR.value.data : null,
        audio: auR.status === 'fulfilled' ? auR.value.data : null,
    };
}

async function quranCommand(sock, chatId, message, input) {
    const target = parseTarget(input);
    if (!target) {
        await sock.sendMessage(
            chatId,
            { text: style.invalidInput('Provide a surah number, or surah:ayah.', '.quran <surah>  ·  .quran <surah>:<ayah>') },
            { quoted: message }
        );
        return;
    }

    await sock.sendMessage(chatId, { react: { text: '📖', key: message.key } });

    let editions;
    try {
        editions = await fetchEditions(target.surah, target.ayah);
    } catch (err) {
        console.error('[quran] error:', err.message);
        await sock.sendMessage(chatId, { text: style.error('Quran lookup failed. Please try again later.') }, { quoted: message });
        return;
    }

    if (!editions) {
        const what = target.ayah ? `Surah ${target.surah}:${target.ayah}` : `Surah ${target.surah}`;
        await sock.sendMessage(chatId, { text: style.notFound(what) }, { quoted: message });
        return;
    }

    if (target.ayah) {
        const a = editions.arabic; // ayah object
        const t = editions.translation; // ayah object or null
        const audioUrl = editions.audio ? editions.audio.audio : null; // alafasy carries the audio
        const lines = [];
        lines.push(`*Surah ${a.surah.number}:${a.numberInSurah}*  (${a.surah.englishName || ''})`);
        lines.push('', a.text);
        if (t && t.text) lines.push('', `_${t.text}_`);
        await sock.sendMessage(chatId, { text: style.box('📖 QURAN', lines) }, { quoted: message });

        if (audioUrl) {
            try {
                await sock.sendMessage(chatId, {
                    audio: { url: audioUrl },
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    caption: `🔊 ${a.surah.englishName || 'Recitation'} ${a.surah.number}:${a.numberInSurah}`,
                });
            } catch (err) {
                console.error('[quran] audio send failed:', err.message);
            }
        }
        return;
    }

    // Whole surah.
    const surah = editions.arabic; // surah object
    const ayahs = surah.ayahs || [];
    const transAyahs = editions.translation ? editions.translation.ayahs || [] : [];
    const fullAudio = editions.audio ? editions.audio.audio : null; // alafasy surah recitation

    const header = [];
    header.push(`*${surah.englishName} (${surah.name})*`);
    header.push(`${surah.revelationType} · ${surah.numberOfAyahs} ayahs`);
    if (fullAudio) header.push(`🔊 Full recitation: ${fullAudio}`);

    const body = [];
    // Long surahs would spam the chat; show a sane window and point at .quran n:a.
    const cap = surah.numberOfAyahs > 40 ? 40 : surah.numberOfAyahs;
    for (let i = 0; i < cap; i++) {
        body.push(`${i + 1}. ${ayahs[i].text}`);
        if (transAyahs[i] && transAyahs[i].text) body.push(`   _${transAyahs[i].text}_`);
    }
    if (surah.numberOfAyahs > cap) {
        body.push('', `… showing first ${cap} of ${surah.numberOfAyahs} ayahs — use .quran ${surah.number}:<n> for a specific ayah.`);
    }

    const text = style.box('📖 QURAN', [...header, '', ...body]);
    for (const chunk of style.splitLong(text, 3500)) {
        await sock.sendMessage(chatId, { text: chunk }, { quoted: message });
    }
}

module.exports = {
    name: 'quran',
    aliases: ['surah', 'ayah'],
    category: 'islamic',
    description: 'Look up a Quran surah or ayah (Arabic + English, with recitation audio)',
    usage: '.quran <surah>  ·  .quran <surah>:<ayah>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await quranCommand(sock, extra.chatId, message, args.join(' ').trim());
    },
};
