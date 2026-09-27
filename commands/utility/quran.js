const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'quran',
    aliases: ['ayat', 'surah'],
    category: 'utility',
    description: 'Read a Quran surah or a specific ayah (with translation)',
    usage: '.quran <1-114>  |  .ayat <surah:ayah>  (e.g. .ayat 2:255)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const ref = (args[0] || '').trim();

            if (!ref) {
                return await extra.reply(style.invalidInput(
                    'Please provide a surah number or an ayah reference.',
                    `${extra.prefix}quran <1-114> | ${extra.prefix}ayat <surah:ayah>`
                ));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '📖', key: message.key } });

            // Ayah mode: e.g. .ayat 2:255
            if (/^\d+:\d+$/.test(ref)) {
                const data = await getJson(`https://api.alquran.cloud/v1/ayah/${ref}/editions/quran-uthmani,en.asad`);
                const editions = data && data.data;
                if (!Array.isArray(editions) || editions.length < 2) {
                    return await extra.reply(style.error('Could not find that ayah. Use the form surah:ayah, e.g. 2:255.'));
                }
                const arabic = editions[0];
                const english = editions[1];
                await extra.reply(style.box('📖 QURAN', [
                    `${arabic.surah?.englishName || ''} — ${arabic.surah?.name || ''}`,
                    `Ayah ${arabic.numberInSurah} (${ref})`,
                    '',
                    arabic.text,
                    '',
                    english.text
                ]));
                return;
            }

            // Surah mode: e.g. .quran 36
            const surahNo = parseInt(ref, 10);
            if (!Number.isInteger(surahNo) || surahNo < 1 || surahNo > 114) {
                return await extra.reply(style.invalidInput(
                    'Invalid surah number (1-114).',
                    `${extra.prefix}quran <1-114>`
                ));
            }

            const data = await getJson(`https://api.alquran.cloud/v1/surah/${surahNo}`);
            const surah = data && data.data;
            if (!surah || !Array.isArray(surah.ayahs)) {
                return await extra.reply(style.error('Could not fetch that surah. Please try again.'));
            }

            const firstAyahs = surah.ayahs.slice(0, 3).map(a => `${a.numberInSurah}. ${a.text}`);

            await extra.reply(style.box('📖 QURAN', [
                `${surah.number}. ${surah.englishName || ''}`,
                `${surah.name || ''} · ${surah.numberOfAyahs} ayahs · ${surah.revelationType || ''}`,
                '',
                ...firstAyahs,
                '',
                `Use ${extra.prefix}ayat ${surahNo}:1 for a verse with translation.`
            ]));
        } catch (error) {
            console.error('[quran] error:', error.message);
            return await extra.reply(style.error('Could not fetch the Quran text. Please try again.'));
        }
    },
};
