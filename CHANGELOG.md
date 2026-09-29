# Changelog

All notable changes to Optimus Bot are documented here.

## [Unreleased]

### 🎬 YouTube downloads on hosts without Python

- **Fixed: `.video` / `.song` failing with "Sign in to confirm you're not a bot" on a host with no Python.**
  The bot pinned `youtube:player_client=mweb`, which *requires* a PO token. That token is produced by a
  **Python** plugin, so on a Python-less host the client was pinned with no way to satisfy it, and YouTube
  returned no usable formats at all. Measured with the standalone yt-dlp against a real video: `mweb` →
  `Requested format is not available`; yt-dlp's own default clients → a working `googlevideo` URL. mweb is
  now only pinned when a PO-token plugin can actually serve it (`ytdlp.potPluginPossible()`), with
  `YTDLP_FORCE_MWEB=1` / `YTDLP_NO_POT_PLUGIN=1` overrides.
- **New `ytdlp.diagnose()`** — reports the resolved binary path (PATH entries resolved to a real file),
  existence, size, execute bit, platform/arch, libc, TMPDIR, exit code and full stderr. This is what turns
  a bare "yt-dlp is not installed" into an actual reason.
- **TMPDIR is now set for every yt-dlp spawn.** PyInstaller onefile builds — which the standalone yt-dlp
  is — unpack into the temp dir on *every* run, so a noexec / read-only / tiny `/tmp` breaks the binary
  while the rest of the bot keeps working. `TMPDIR`/`TEMP`/`TMP` point at `<repo>/.tools/tmp`
  (override with `OPTIMUS_TMP_DIR`).
- **`bootstrap.js`** prints a full diagnosis block whenever a yt-dlp binary will not run, and verifies an
  existing binary before trusting it.
- **`.dlstatus`** renders the yt-dlp diagnosis (owner-only). **`lib/dlHealth.js`**'s yt-dlp probe now runs
  the full diagnosis — its old 20s ceiling could report a working binary as dead.
- **Tests:** `__tests__/ytdlp-helpers.test.js`.

### 🛡️ Antidelete media recovery

- **Fixed: `Cannot derive from empty media key` for lottie stickers.** `lottieStickerMessage` is a
  `FutureProofMessage` — `{ message: { stickerMessage } }` — so the mediaKey sits one level deeper than
  the code unwrapped. It handed `downloadContentFromMessage()` a wrapper, which destructures `mediaKey`
  from the **top level**, so the key came back empty. It now unwraps both levels.
- **Failures now explain themselves.** Instead of a bare `mediaKey=MISSING` mystery, a failed fetch logs
  one line saying whether the key and URL were present and which fields the node actually carried —
  enough to tell a *wrong node* from a *genuinely keyless message*. Repeats are deduplicated per minute,
  so a burst of the same failure no longer floods the console.
- **A keyless node is no longer treated as an error.** Such a message is not retryable (WhatsApp sent a
  stub), so it now degrades quietly and the rest of the message — caption, text, sender — is still
  stored, which is what the recovery path already promised.
- **Fixed: importing `commands/owner/antidelete.js` held the process open.** A module-level
  `setInterval` had no `unref()`, so any process that required it — tests, CLI helpers, one-shot scripts
  — never exited. Now unref'd.
- **Tests:** `__tests__/antidelete-media.test.js`.

### 🍪 Optional cookie support (off by default)

- yt-dlp is now passed `--cookies <file>` when a cookie jar exists at `.tools/cookies.txt` (or at the
  path in `YTDLP_COOKIES`). `.tools/` is gitignored, so a jar can never be committed.
- **A single cookie value is not enough** — yt-dlp needs a whole Netscape-format cookie file.
- Only useful for age-restricted or "confirm you're not a bot" content, and it carries real risk: driving
  a logged-in account from a datacenter IP is exactly what gets accounts flagged. Prefer a throwaway
  account, and expect the jar to expire within days. **Try the client fallback first** — most of the time
  it makes cookies unnecessary.
- `.dlstatus` reports whether cookies are configured (never the contents).

### 🚀 Deploy / bootstrap

- `bootstrap.js` installs yt-dlp automatically: pip variants → `ensurepip` → the official `get-pip.py`
  → a **verified** standalone binary chosen by CPU architecture *and* libc (glibc vs musl).
- `settings.js` is committed with placeholders only; real credentials live in `.env` (gitignored).
- A fresh clone no longer crashes on a missing `data/owner.json`.
- On a panel, the startup **Main File** must be `bootstrap.js` — with `node index.js` nothing is installed.

## [v2.0.0] — 2026-09-27

### 🌐 Free Keyless APIs (no signup, no API key)

- **`.weather <city>`** — rewritten on **Open-Meteo** (was hardcoded OpenWeatherMap key). Now shows full conditions card (temp, feels-like, humidity, wind + compass, pressure, cloud, visibility, UV, rain, sunrise/sunset) **plus a 4-day forecast**.
- **`.aqi <city>`** (`air`, `airquality`) — **new**. US + European AQI, PM2.5 / PM10 / O₃ / NO₂ / SO₂ / CO with colour-banded category. Powered by Open-Meteo Air Quality.
- **`.sun <city>`** (`sunrise`, `sunset`, `suntimes`) — **new**. Sunrise, sunset, day length, max UV, rain. Powered by Open-Meteo.
- **`.nameinfo <name>`** (`nameage`, `guessname`, `namelook`) — **new**. Predicts gender, age, and likely nationality from a first name (agify + genderize + nationalize, each failure-tolerant).
- **`.news`** (`headlines`) — rewritten on **Google News RSS** (was hardcoded NewsAPI key, US-only). Now supports Pakistan-edition top headlines, topic sections (`.news world`/`business`/`tech`/`sports`/…), and keyword search (`.news cricket`).
- **`lib/weatherApi.js`** — new shared helper: geocoding, forecast, air-quality, WMO weather-code descriptions, AQI categories.
- **`lib/news.js`** — new shared helper: Google News RSS parser with `cleanTitle()` and topic/search routing.
- All live-tested with real network calls (14/14 weather/AQI/sun/nameinfo tests, 10/10 news tests).

### ⏰ Reminders upgraded + Scheduled Messages

- **`.remind`** — now accepts relative (`10m`), absolute (`5pm`, `17:30`), `tomorrow 9am`, and recurring (`daily 9am`, `weekly mon 9am`) time specs. Recurring reminders auto-reschedule after firing.
- **`.schedule <time> <message>`** (`sched`, `schedulemsg`) — **new**. Bot posts the message as-is at the set time. Supports all time formats including recurring.
- **`.snooze <id> <time>`** (`snoozeremind`) — **new**. Pushes a reminder back. Works on pending and recently-fired reminders.
- **`.reminders`** — now lists both reminders and scheduled messages with `🔔 Reminder` / `📨 Message` tags and `🔁` recurrence markers.
- **`lib/productivity/timeParse.js`** — new shared time parser (relative/absolute/recurring) + time-vs-message split helper.
- **`lib/productivity/reminderStore.js`** — gained `recurring`, `weeklyDay`, `kind` fields; `markDelivered()` and `rescheduleReminder()`.
- **`lib/productivity/scheduler.js`** — kind-aware delivery (reminder prefix vs raw message) + recurring reschedule.
- 27/27 tests pass (time parsing, store, all command flows).

### 🔄 `.update` command improved

- **`.update check`** — **new dry-run mode**. Fetches upstream and shows changelog (commits + changed files) without touching the working tree.
- **Changelog now displayed** — `summarizeChanges()` formats git log/diff into readable lines (was fetched but discarded).
- **Configurable repo URL + branch** — `settings.updateRepoUrl` / `settings.updateBranch` or `UPDATE_REPO_URL` / `UPDATE_BRANCH` env vars (was hardcoded).
- Removed duplicate restart message.
- 12/12 unit tests + smoke-update pass.

### 🔒 Security hardening for GitHub

- **`settings.js`** added to `.gitignore` — real API keys never committed.
- **`settings.example.js`** — new template file with placeholder values for all configuration fields.
- **`session/`** cleared and gitignored — WhatsApp credentials never pushed.
- **`data/`** contents gitignored (except `.gitkeep`) — all runtime state excluded.
- **`.gitignore`** updated: `data/*`, `settings.js`, `baileys_store.json`, `session/`, `.env`.

### 📊 Stats

- Commands: 144 → **230** across 10 categories
- Smoke tests: 24 → **25** suites
- Jest tests: **363 passing** (was 112)

---

## [Unreleased] — AI Provider Routing + Multi-Provider Image Generation

### Added
- **`lib/imageGeneration.js`** — Image generation service with Gemini → Cloudflare → Pollinations fallback chain
- **Cloudflare Workers AI** as image fallback provider (`@cf/black-forest-labs/flux-1-schnell`)
- **Pollinations** as final image fallback provider (`flux`)
- **`settings.js`** fields: `cloudflareAccountId`, `cloudflareApiToken`
- **`__tests__/ai.test.js`** — 76 smoke tests covering config, image generation fallback chain, text providers, STT, aistatus command, malformed responses, HTTP errors, and provider isolation

### Changed
- **`lib/ai.js`** — Image generation delegated to `imageGeneration.js` service (Gemini → Cloudflare → Pollinations)
- **`lib/aiConfig.js`** — Restructured to capability-based layout (`text`, `speech`, `image`, `isProviderReady()`, `timeouts`)
- **`commands/owner/aistatus.js`** — Shows all 4 providers with readiness indicators and masked credentials
- Gemini image uses Interactions API (`/v1beta/interactions`) instead of legacy `generateContent`
- Image generation chain: Gemini → Cloudflare → Pollinations (was: Pixazo → Gemini)

### Preserved
- All existing AI commands, aliases, permissions, prompts, and branding unchanged
- `generateImagePixazo()` retained for backward compatibility (no longer in primary chain)

### Architecture
- **Provider specialization**: Each AI capability uses its optimal provider
- **Timeout safety**: Gemini 60s, Cloudflare 60s, Pollinations 45s
- **Graceful degradation**: Missing Cloudflare config falls through to Pollinations
- **No secret leakage**: `.aistatus` masks API keys, tests mock all providers

---

## [v1.0.0-ui-stable] — 2026-08-18

### 🎨 Unified UI / Message Styling

- Central `lib/messageStyle.js` formatting system across all 144 commands
- Consistent box, header, error, success, and processing visual patterns
- Dynamic Help/Menu system with category-based navigation
- Branding centralized through `settings.botName` — no hardcoded bot names

### 🔄 Command Category Migrations

All command categories migrated to the unified visual system:
- Admin (33 commands)
- Owner (21 commands)
- Media/Downloader (14 commands)
- AI (10 commands)
- Fun & Games (23 commands)
- General (26 commands)
- Anime (1 command)
- Textmaker (1 command, 19 font styles)

### 🛡️ Error & Security Hardening

- Raw API error output removed from user-facing messages
- Internal filesystem paths no longer leaked to users
- Stack traces suppressed in user-visible responses
- Provider-specific technical failures replaced with friendly messages

### ⚡ Hot-Path Performance

- `isBanned()` — in-memory Set cache, zero sync reads after initialization
- AFK state — in-memory cache with write-through invalidation
- `userGroupData` — shared cache across antibadword, antilink, warnings, chatbot, welcome/goodbye, sudo, and auto-reaction features
- Mode state — in-memory cache with legacy migration support
- Cross-feature cache coherence verified (chatbot → antibadword → antilink visibility)

### 🧠 AI Model Updates

- Migrated from deprecated/shut-down model IDs:
  - Groq: `llama-3.3-70b-versatile` → `openai/gpt-oss-120b`
  - Gemini text: `gemini-2.0-flash` → `gemini-2.5-flash`
  - Gemini image: `gemini-2.0-flash-exp` → `gemini-3.1-flash-image`
- Centralized model configuration in `lib/aiConfig.js`
- Owner-only `.aistatus` diagnostic command

### 🧪 Test Coverage

- 24 smoke-test suites (from 0 in original codebase)
- Command registry verification (144 commands, 322 triggers, 0 duplicates)
- Help/menu coverage enforcement
- Cache behavior regression tests
- Model availability validation
- AI configuration structure verification
- Migration safety checks
- Game routing, prefix swap, and dispatch smoke tests

### 🏗️ Infrastructure

- Dynamic command loader with duplicate detection
- Centralized message configuration (`lib/messageConfig.js`)
- Message statistics with caching (`lib/messageStats.js`)
- Group statistics with caching (`lib/groupstats.js`)
- Mode system with public/private toggle (`lib/mode.js`)
- JID resolver for WhatsApp identifiers
