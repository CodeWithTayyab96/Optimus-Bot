# KnightBot API (`knightbotapi.stream`) — assessment vs Optimus Bot

**Date:** 2026-11-08 · **Scope:** read-only assessment. The optional fallback described in §6
was implemented afterwards in a separate change (`lib/knightbotApi.js`, `lib/ytAudio.js`,
`lib/dlHealth.js`, `settings.js`, `.env.example`, `scripts/smoke-knightbot-api.js`); this report is
the rationale for the guard rails in that implementation and has not been rewritten to describe it.
**Method:** live HTTP probes, site bundle (`/js/console.js`) parsed for the exact route catalog,
`/privacy` and `/terms` read, and the local command registry (237 `.js` files in `commands/`)
mapped by filename, `require()` lines and selected source reads.
**Legend:** `[F]` verified by execution or direct source read; `[I]` inference / estimate.

---

## 1. Verdict

**Do not adopt as a primary dependency.** If adopted at all, it belongs at the very bottom of an
existing fallback chain, behind an env-configured key, a kill switch and a health probe.

Three reasons, all grounded in this repo:

1. `[F]` **Capability overlap is ~80%.** Of 108 catalogued routes, roughly 20–25 have no direct
   Optimus equivalent; the rest duplicate commands that already exist locally.
2. `[F]` **It re-introduces an architectural pattern this project deliberately removed.**
   `lib/ytAudio.js:1-20` states: *"There are no third-party HTTP downloader APIs any more — the
   ones that used to be here all went dead"*, and records removal of EliteProTech / Yupra /
   Okatsu on 2026-09-27 (404 / DNS gone / 402). The chain is `yt-dlp` primary → direct stream URL
   → RapidAPI as last resort.
3. `[F]` **It does not fix the current test blocker.** Only 2 of the 10 undeclared npm packages
   are cleanly replaceable by this API, 2 partially, and 6 not at all (§4).

`[I]` The service's Terms explicitly disclaim any uptime guarantee and reserve the right to change
endpoints, limits or keys at any time, so it can only ever be a best-effort fallback.

---

## 2. What the service actually is `[F]`

| Item | Verified value |
| --- | --- |
| Base URL | `https://knightbotapi.stream` |
| Methods / format | GET only; JSON for most routes, PNG by default for cards and image FX (`json=1` switches to JSON) |
| Auth | `?apikey=…` or `X-API-Key` header. Missing → `401`, disabled/expired → `403` |
| Response | `{status:200, success:true, creator:"KnightBot", result:…}`; docs contract is `result.download` |
| Status codes | `200 / 400 / 401 / 403 / 404 / 429 / 500 / 502` |
| Files | hosted under `/files/`, expire after ~5 minutes |
| Limits | per-key minute/hour/day caps. Demo key: 30/min, 200/hour, 3000/day |
| Free YouTube | max 10 min, 100 MB, up to 720p; 1080p needs premium |
| AI prompt | `q` limited to 800 chars |

Live probes (all `200`, demo key `knight`):

```
/api/fun/joke      → {"status":200,"success":true,"result":{"type":"joke",...}}
/api/tools/calc    → {"result":{"expression":"(5+5)*2","result":20}}
/api/tools/translate?to=hindi&text=hello → {"result":{"translated":"नमस्ते","from":"en","to":"hi"}}
/api/ai/chat?q=hello → {"result":"Hey! How can I help?"}
/api/usage?apikey=knight → {"name":"Default","active":true,
    "usage":{"minute":3,"hour":148,"day":1633,"total":23822},
    "todayFail":169,"limits":{"minute":30,"hour":200,"day":3000}}
no apikey → 401 {"error":"Missing apikey. Pass ?apikey=... or X-API-Key header."}
```

**The "112 endpoints" number, decoded `[F]`:** the site bundle's catalog `D` has **50 tiles /
108 concrete routes** (`Downloaders 11`, `Stalk 3`, `AI & Tools 21`, `Cards 7`, `Fun 50`,
`Utilities 10`, `Religion 2`, `Games 4`). Four legacy aliases in the "All routes" list —
`/api/download/tiktokdl`, `/api/download/instagramdl`, `/api/download/spotify`,
`/api/download/ytsearch` — bring that to **112**. Service endpoints `/api/usage`, `/api/traffic`
and `/api/progress/{id}` are not counted.

`[F]` **Undocumented behaviour:** the playground adds `progressId=…` to downloader calls and polls
`/api/progress/{id}` every 350 ms (`console.js:872-890`); the docs page never mentions
asynchronous jobs. An integration must tolerate both synchronous and job-style responses.

### Legal / privacy posture `[F]` (both pages dated 8 November 2026)

- **Privacy:** stores the API key, timestamp and endpoint path for every request; *"Server logs may
  contain the link you asked us to process"*; fetched media deleted after ~5 min; GA4 + Cloudflare;
  contact form goes through Web3Forms; deletion requests only via `t.me/knighttbot`.
- **Terms:** *"provided 'as is', without any warranty or uptime guarantee. Endpoints can change or
  stop working when the source platforms change"*; limits may change and keys may be disabled at
  any time; the caller is responsible for copyright/platform-ToS compliance; a takedown process
  exists.
- `[F]` No published pricing, quota tiers, API versioning, changelog, DPA, or self-service key
  registration in the docs. The docs example uses the shared `knight` key, which is already at
  148/200 for the current hour with 169 failures today.

---

## 3. Endpoint inventory vs Optimus command registry

Optimus has 237 command files: admin 51, fun 40, owner 32, utility 31, general 27, media 26,
ai 11, productivity 10, anime 6, group/islamic/textmaker 1 each.

| API category (routes) | Existing Optimus equivalent | Assessment |
| --- | --- | --- |
| **Downloaders (11 + 4 aliases)** | `.play .song .video .ytsearch .download .toaudio .tovideo` via `lib/ytdlp.js` + `lib/ytAudio.js`; `.facebook .instagram .igs .tiktok .twitter .pinterest .spotify .soundcloud .mediafire .threads .capcut .apk` | Full overlap. Local implementation is deliberate (§1.2). `/api/download/ytsearch?query=` is the only route that maps cleanly onto a missing npm package. |
| **Stalk (3)** | `.github` / `.githubstalk` | 1 covered. `/api/stalk/tiktok`, `/api/stalk/instagram` = **gaps**. |
| **AI & Tools (21)** | `.ai .openai .reply .rewrite .summarize .gptimage .imagine .magicstudio` (`lib/aiConfig.js` already has Groq/Gemini/OpenAI/Cloudflare/Pollinations); `.lyrics` (lrclib + lyrics.ovh); `.ss` (`api.siputzx.my.id`); `.tts`; `.qr` (`qrcode`); `.img-blur .remini .removebg` | AI chat/image is **redundant**. Gaps: `/api/tools/nsfw` (+`/status`), `/api/tools/upload`, `/api/img/{pixelate,grayscale,circle,upscale,ascii,colors}`. |
| **Cards (7)** | `.welcome` / `.goodbye` (some-random-api), `.quote`, `.wasted`, `.topmembers`, `.groupstats` | Welcome/goodbye covered. Rank/quote/wanted/jail/YT-card are PNG cards with no equivalent — **partial gaps**. |
| **Fun (50)** | 1:1 for all 6 fun kinds (`.joke .meme .roast .insult .compliment .flirt`); `.waifu .anime .animesearch` for anime pics; `.gif` (GIPHY) for reactions; `.character` | 29 GIF kinds and anime char/show quotes are broader than existing commands; `/api/fake/tweet`, `/api/fake/ytcomment` = **gaps**. |
| **Utilities (10)** | `.translate .weather .define .dictionary .wiki .currency .shorturl .calc` | 7/10 covered. Gaps: `/api/tools/npm`, `/api/tools/country`, `/api/tools/time`. |
| **Religion (2)** | `.quran` (exists twice: `commands/islamic/quran.js`, `commands/utility/quran.js`), `.gita` | `/api/religion/bible` = **gap**. |
| **Games (4)** | `.trivia .truth .dare .riddle` | Full overlap. |

`[I]` Net: ~85 of 108 routes duplicate something Optimus already does. Genuinely new capabilities
are ~20–25 routes: Bible, TikTok/IG stalk, fake tweet/comment cards, 8 extra image FX, NSFW
check, upload, npm/country/time tools, 5 card types, and wider GIF/anime-quote coverage. That is
a feature-addition argument, not a dependency-fix argument.

`[F]` The repo already calls many external services: `config.js:3-24` hardcodes 7 plaintext API
keys; `commands/media/remini.js:64`, `spotify.js:21`, `pinterest.js:56`, `general/ss.js:40`,
`admin/welcome.js:98`, `admin/goodbye.js:83`, `fun/gif.js:37`, `media/lyrics.js:22,40` each hit a
different host. Adding one more host increases correlated failure unless it is strictly a fallback.

---

## 4. Does it fix the undeclared-dependency blocker?

`npm test` currently reports 26/32 because 10 packages are required but absent from
`package.json` (14 declared dependencies). Mapping each:

| Package | Required by | Replaceable by KnightBot API? |
| --- | --- | --- |
| `fluent-ffmpeg` | `lib/exif.js`, `lib/sticker.js`, `lib/ytdl2.js`, `lib/myfunc2.js`, `commands/admin/groupstatus.js` | **No** — local transcoding / WebP sticker conversion |
| `node-webpmux` | `lib/exif.js`, `lib/sticker.js`, `commands/anime/anime.js`, `general/sticker.js`, `stickercrop.js`, `stickertelegram.js`, `take.js`, `media/igs.js` | **No** — writes sticker EXIF metadata locally |
| `mumaker` | `commands/textmaker/textmaker.js`, `scripts/smoke-textmaker.js` | **No** — no textmaker route |
| `moment-timezone` | `lib/myfunc.js`, `commands/general/github.js` | **No** — date formatting; replace with `Intl` instead |
| `cheerio` | `lib/news.js`, `lib/uploader.js`, `lib/myfunc2.js` | **No** — HTML parsing; no equivalent route |
| `fs-extra` | `commands/general/simage.js` | **No** — local FS; use built-in `fs` |
| `yt-search` | `commands/media/{play,song,video,ytsearch}.js`, `lib/dlHealth.js` | **Partial** — `/api/download/ytsearch?query=` and `/api/ytmp3?query=` exist, but `dlHealth.js:24` uses it as a *health probe*, so swapping it changes health semantics |
| `gtts` | `commands/general/tts.js` | **Yes** — `/api/tts`, but 200 chars / 10 languages; `.tts` already falls back to `lib/ai.js` `textToSpeech` |
| `google-translate-api-x` | `lib/translate.js` | **Yes** — `/api/tools/translate`, 30 languages |
| `ruhend-scraper` | `commands/media/{igs,instagram,tiktok}.js`, `lib/dlHealth.js` | **Partial** — `/api/download/instagram|tiktok`; but `igs.js` also needs `node-webpmux`, and `dlHealth.js:52` uses `igdl` as a probe |

`[F]` **2 clean, 2 partial, 6 impossible.** The real fix for the 6 is declaring them in
`package.json` (or replacing `moment-timezone`/`fs-extra` with built-ins) — independent of this API.

---

## 5. Security, permission and operational trade-offs

| Area | Finding | Mitigation |
| --- | --- | --- |
| Key hygiene `[F]` | Docs use `?apikey=…`; GET-only means keys land in URLs, access logs, browser history and error messages. The service logs "the API key used, the time and the endpoint path" for every request. `config.js:17-24` and `commands/media/remini.js:64` already hardcode keys in source — repeating that pattern would be a regression. | Use `X-API-Key` header only, read from `process.env.KNIGHTBOT_API_KEY` via `settings.js`; never commit a key; never use the shared `knight` demo key. |
| Shared demo key `[F]` | 30/min, 200/hr, 3000/day, currently 148/200 hr and 1633/3000 day with 169 failures today. A busy group bot would hit `429` immediately. No self-service key registration documented. | Obtain a private key and confirm quota before any integration; treat `429` as a circuit-breaker signal. |
| Data boundary `[F]` | Privacy policy: server logs may contain the requested URL; fetched media retained ~5 min; GA4 + Cloudflare; deletion via Telegram only. Group members' links, search terms and AI prompts would leave the host. | Decide/disclose this before wiring user-facing commands. Keep downloader calls local-first; do not send chatbot/AI prompts here. |
| Availability `[F]` | Terms: no warranty or uptime guarantee, endpoints/limits/keys can change or be disabled at any time. Service is very new (legal pages dated today). | Kill switch (`KNIGHTBOT_API_ENABLED`), local chain always primary, timeout + single bounded retry, `dlHealth` probe + owner alert on sustained failure. |
| SSRF surface `[I]` | `/api/ssweb?url=`, `/api/img/*?url=`, `/api/tools/upload?url=` and `/api/stalk/*` cause the *service* to fetch arbitrary URLs. `.ss` currently forwards user URLs without an allowlist (`commands/general/ss.js:32-40`). | Validate/allowlist scheme and host before forwarding; reject private/link-local addresses. |
| 5-minute expiry `[F]` | `result.download` URLs expire in ~5 min. `lib/notify.js` coalesces/digests outbound notices and `lib/ytAudio.js:25` uses a 90 s fetch timeout. A queued or paced send would deliver a dead link. | Download to a local `Buffer` immediately, then send from the buffer; never persist or forward the `/files/` URL. |
| Async jobs `[F]` | `progressId` + `/api/progress/{id}` polling exists in the bundle but is absent from the docs. | Handle both shapes; cap total wait; log `stage`/`percent`. |
| Legal `[F]` | Terms place copyright/platform-ToS responsibility on the caller; a takedown channel exists. Downloader commands already carry this exposure. | Keep existing command-level usage rules; no change needed beyond documenting the new processor. |
| Service hygiene `[F]` | `js/console.js:3` embeds a Web3Forms API key in client-side JS. | Informational only — a signal about the operator's key hygiene, not a blocker. |

---

## 6. If we do proceed (minimal, reversible footprint)

1. New `lib/knightbotApi.js`: `X-API-Key` header from `settings.js` (env), 8–10 s timeout with
   `AbortSignal`, one bounded retry on `429/5xx` with backoff, validate `success === true` before
   reading `result`, buffer downloads immediately, and support `progressId` polling.
2. Wire **only** as a last-resort fallback after RapidAPI in `lib/ytAudio.js`, gated by
   `KNIGHTBOT_API_ENABLED`. Do not add it to `lib/aiConfig.js` (already 5 providers).
3. Add a 7th `dlHealth.js` probe (lightweight route + `/api/usage`) so the existing debounce
   alerts on a sustained outage, and a smoke test with mocked `fetch`.
4. Do **not** use it to replace `gtts` / `google-translate-api-x` unless intentionally accepting
   the off-host data flow; declaring those two packages is simpler and keeps data local.
5. Separately fix the 10 undeclared dependencies — that is the actual release blocker.

---

## 7. Missing information / limitations

- `[F]` Downloader endpoints were **not** called (avoids heavy, side-effecting requests); only
  harmless utility/fun endpoints were probed. Response shape for a real media download is taken
  from documentation, not observation.
- `[F]` No private key, published pricing/quota tiers, API versioning, changelog, DPA, or uptime
  history. Support/deletion requests go through a personal Telegram account.
- `[I]` Command-equivalence mapping is based on filenames, `require()` lines and selected source
  reads; the 237 commands were not executed (and 20+ cannot load in this workspace).
- `[I]` No evidence about how long the service has been operating; its privacy/terms pages are
  dated the same day as this assessment.
