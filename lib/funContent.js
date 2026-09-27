/**
 * funContent — free, no-API-key sources for fun commands.
 *
 * Replaces the AI calls previously used by .fact / .quote / .joke with fast,
 * free, public endpoints. Each getter tries a primary source then a fallback so
 * a single dead host doesn't break the command. All sources are verified live
 * (see the integration notes); none require an API key.
 *
 * Languages: these public APIs return English content. If a Roman-Urdu/Urdu
 * flavour is later wanted, add a free translation step (e.g. a translate API)
 * — but that reintroduces a dependency, so it's left out by default.
 */
const axios = require('axios');

async function fetchJson(url, extraHeaders = {}, timeout = 10000) {
    const res = await axios.get(url, {
        timeout,
        headers: {
            'User-Agent': 'OptimusBot/1.0',
            'Accept': 'application/json',
            ...extraHeaders,
        },
    });
    return res.data;
}

/** Random general/animal fact (English). Throws if all sources fail. */
async function getFact() {
    try {
        const d = await fetchJson('https://uselessfacts.jsph.pl/random.json');
        if (d && d.text) return String(d.text).trim();
    } catch { /* try next */ }
    try {
        const d = await fetchJson('https://catfact.ninja/fact');
        if (d && d.fact) return String(d.fact).trim();
    } catch { /* give up */ }
    throw new Error('fact sources unavailable');
}

/** Random quote with author (English). Throws if all sources fail. */
async function getQuote() {
    try {
        const d = await fetchJson('https://dummyjson.com/quotes/random');
        if (d && d.quote) {
            return { text: String(d.quote).trim(), author: String(d.author || 'Unknown').trim() };
        }
    } catch { /* try next */ }
    try {
        const arr = await fetchJson('https://type.fit/api/quotes');
        if (Array.isArray(arr) && arr.length) {
            const q = arr[Math.floor(Math.random() * arr.length)];
            if (q && q.text) {
                return { text: String(q.text).trim(), author: String(q.author || 'Unknown').trim() };
            }
        }
    } catch { /* give up */ }
    throw new Error('quote sources unavailable');
}

/**
 * Random joke (English). JokeAPI is primary (categorised, safe-mode, single
 * joke, generous rate limit); Official Joke API is the fallback.
 */
async function getJoke() {
    try {
        const d = await fetchJson('https://v2.jokeapi.dev/joke/Any?safe-mode&type=single', { 'Accept': 'application/json' });
        if (d && !d.error && d.joke) {
            return { text: String(d.joke).trim(), category: d.category || 'general' };
        }
    } catch { /* try next */ }
    try {
        const d = await fetchJson('https://official-joke-api.appspot.com/random_joke');
        if (d && d.setup && d.punchline) {
            return { text: `${d.setup} ${d.punchline}`.trim(), category: d.type || 'general' };
        }
    } catch { /* give up */ }
    throw new Error('joke sources unavailable');
}

/**
 * Random life advice (English). AdviceSlip is a free, no-key API with a simple
 * `{ slip: { advice } }` payload and a generous rate limit. Throws if it fails.
 */
async function getAdvice() {
    const d = await fetchJson('https://api.adviceslip.com/advice');
    if (d && d.slip && d.slip.advice) return String(d.slip.advice).trim();
    throw new Error('advice source unavailable');
}

module.exports = { getFact, getQuote, getJoke, getAdvice, fetchJson };
