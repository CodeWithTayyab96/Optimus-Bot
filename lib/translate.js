/**
 * translate — free, no-API-key translation for the .translate command.
 *
 * Primary: google-translate-api-x (unofficial, keyless Google Translate web
 * endpoint — the same translate.googleapis.com?client=gtx endpoint the bot
 * already used, but via a maintained library that also returns the detected
 * source language). Fallback: MyMemory public API (no key, anonymous tier).
 *
 * Neither requires an API key. The Google endpoint is higher quality but can be
 * rate-limited / blocked from datacenter IPs (same IP-reputation class as the
 * YouTube 403 issue) — hence the MyMemory fallback.
 */
const gtranslate = require('google-translate-api-x');
const axios = require('axios');

const DEFAULT_TO = 'ur'; // Roman-Urdu audience — paste text, get Urdu by default

async function translateGoogle(text, to, from) {
    const opts = { to, client: 'gtx' };
    if (from && from !== 'auto') opts.from = from;
    const res = await gtranslate(text, opts);
    if (!res || !res.text) throw new Error('empty google response');
    const detected = (res.from && res.from.language && res.from.language.iso) || from || 'auto';
    return { text: res.text, from: detected, to };
}

async function translateMyMemory(text, to, from) {
    const src = (from && from !== 'auto') ? from : 'en'; // MyMemory needs a concrete source
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(src + '|' + to)}&mt=1`;
    const res = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'OptimusBot/1.0', 'Accept': 'application/json' },
    });
    const data = res.data;
    const out = data && data.responseData && data.responseData.translatedText;
    if (!out || /MYMEMORY WARNING/i.test(out)) throw new Error('mymemory unavailable');
    return { text: out, from: src, to };
}

/**
 * Translate text. Returns { text, from, to }.
 * @param {string} text
 * @param {string} to   target language code (default Urdu)
 * @param {string} from optional explicit source (default auto-detect)
 */
async function translateText(text, to = DEFAULT_TO, from = 'auto') {
    try {
        return await translateGoogle(text, to, from);
    } catch (e) {
        try {
            return await translateMyMemory(text, to, from);
        } catch (e2) {
            throw new Error('translation failed (all sources)');
        }
    }
}

module.exports = { translateText, DEFAULT_TO };
