# Changelog

All notable changes to Optimus Bot are documented here.

## [Unreleased]

### 🎬 `.gif` — attribution added, and it explains itself when unconfigured

- **Added the "Powered by GIPHY" attribution** Giphy's terms require. Results were previously sent with
  no attribution at all, which is a terms requirement rather than a cosmetic detail.
- **A missing or placeholder `GIPHY_API_KEY` now says so.** Previously the request went out with the
  committed `YOUR_GIPHY_API_KEY` placeholder, Giphy answered 401, and the user got a bare
  *"Failed to fetch GIF. Please try again later."* — which pointed at nothing they could fix. It now says
  where to get a free key and what to set.
- **401/403 and 429 are handled distinctly** instead of one generic failure: a rejected key tells you to
  check the key (beta keys are refused on some endpoints), and a rate-limit hit says beta keys are limited
  and suggests a production key.
- Also added a 20s request timeout. The MP4 rendition + `gifPlayback` behaviour is unchanged — WhatsApp
  needs MP4 or the animation arrives broken.
- **Bumped to v2.1.4.**

### 🧹 Env cleanup, WARP enabled, credits

- **`.env` cleaned up.** Dropped the leftover inline placeholder text; every entry is now a bare
  `KEY=` with a section header. Added the API keys the code actually reads that were missing
  (`OPENAI_*`, `TMDB_API_KEY`, `NASA_API_KEY`, `PIXAZO_API_KEY`, `SPORTSDB_KEY`, `TRACE_MOE_API_KEY`,
  `NEXORACLE_API_KEY`) and kept the requested ones (`TELEGRAM_BOT_TOKEN`, `GIPHY_API_KEY`). Removed
  nothing the bot reads — the list was checked against `process.env.*` usage across the source.
- **`WARP=1` is now the default in the template**, so a fresh clone gets a working YouTube path out of
  the box on an IP-blocked host. Enabling it downloads the usque binary (checksum-verified) and
  registers a free Cloudflare account, accepting Cloudflare's ToS on the user's behalf — that is now
  stated plainly in the file rather than buried in `lib/warpProxy.js`.
- **Credits section added** to `.env`: naming/layout follows comparable Baileys bots (Knightbot-MD,
  Shadow-style); usque (Diniboy1123, MIT) credited for the WARP integration.
- **No third-party keys were added.** Values are placeholders only; real credentials stay in the
  server's `.env`, which `.update` preserves. See the note below on why.
- **Dependencies audited, not removed:** 15 of 49 declared packages are unreferenced in source, but
  `libsignal`/`ws` arrive via Baileys and the rest cannot be runtime-verified from here, so
  `package.json` is unchanged rather than risking the WhatsApp transport.
- **Bumped to v2.1.3.**

### 🔐 `.update` no longer wipes your `.env` (and `.env` ships with placeholders)

- **Fixed: an update silently destroyed the panel's real `.env`.** `.update` backs up runtime state with
  `RUNTIME_BACKUP_PATHS` — but that list was `['data', 'baileys_store.json', 'settings.js']`, and **`.env`
  was not on it**. Because the repo now ships a tracked `.env`, `git reset --hard` checked that out over the
  server's copy and wiped every credential in it. This is what made a working WARP tunnel vanish between two
  boots: `WARP=1` was in `.env` one boot, gone the next.
- **`.env` is now backed up and restored across updates**, so config (and any key in it) survives. Locked in
  by a test so it cannot silently regress.
- **The committed `.env` now ships with placeholder values** — every key listed, no real secrets — so it
  works as a starter template for a fresh clone. `.env.example` remains the fully documented version.
- **Bumped to v2.1.2.**

### 🔧 WARP tunnel: fix connect timeouts (DNS) and stop proxying what isn't blocked

- **Fixed: every request through the WARP tunnel timed out.** On the panel the tunnel came up fine
  (`Connected to MASQUE server`) yet yt-dlp reported `Connection ... timed out (connect timeout=20)` for
  **both** YouTube and SoundCloud — a connect-stage failure, not a YouTube block. Cause: usque's `socks`
  mode sends DNS **through the tunnel** (9.9.9.9, default 2s), and when that can't resolve, every SOCKS
  connect hangs until the client gives up. YouTube's error was a giveaway: it went from
  `Sign in to confirm you're not a bot` (IP block) to `timeout`, i.e. it never reached YouTube at all.
  The proxy now runs with **`-l --system-dns`** so names resolve with the host's own resolver.
- **`--always-reconnect`** added: usque dropped the tunnel when idle and only reconnected on the next
  outbound request, so the first request after a quiet period paid for a fresh handshake — and often
  timed out waiting for it.
- **The tunnel is now used for YouTube only.** With `PROXIES` set, *every* yt-dlp call was proxied, which
  broke SoundCloud (it worked direct, then started timing out) and wasted tunnel bandwidth on traffic that
  was never blocked. Non-YouTube hosts stay direct; only the actually-blocked host uses the tunnel.
- **Bumped to v2.1.1.**

### 🏷️ Versioning — the bot now reports what it is running

- **The version is bumped on every push**, and `settings.js` + `package.json` are kept **in sync**
  (they had drifted apart: `1.0.0` vs `2.0.0`). Policy: patch = fix, minor = feature, major = breaking.
- **`.dlstatus` now leads with the version** (`🤖 Optimus Bot v2.1.0 · commit 9cf6b12`) so the operator
  can confirm the panel is running the pushed code before trusting any of the probes below.
- **It also prints the short git commit** (`settings.gitCommit`, read once at load, falls back to
  `unknown` when there is no `.git`, so it can never break startup). A version number alone cannot prove
  `.update` actually landed — the commit hash can.
- The version was already shown in `.alive`, `.ping`, `.uptime` and the startup banner; the banner now
  includes the commit too.
- **Bumped to v2.1.0.**

### 🌐 Free WARP tunnel for IP-blocked hosts (opt-in, `WARP=1`)

- **New `lib/warpProxy.js`** — a **free, unlimited** way to get YouTube working on a host whose IP is
  blocked, with **no residential proxy and no root**. It runs [usque](https://github.com/Diniboy1123/usque)
  (a userspace Cloudflare WARP / MASQUE client) as a local SOCKS5 proxy. Cloudflare's egress IPs are **not**
  blocked by YouTube (verified: yt-dlp downloads through WARP), and because usque needs no TUN device or
  root, it works inside an unprivileged Pterodactyl container where the official `warp-cli` cannot.
- **Opt in with `WARP=1` in `.env`.** On first start it (1) downloads the right usque build for the host,
  (2) **checksum-verifies** it against the published `checksums.txt`, (3) extracts it with a dependency-free
  ZIP reader (no system `unzip`), (4) registers a free Cloudflare account — accepting Cloudflare's Terms of
  Service on your behalf — and (5) starts the SOCKS5 proxy and points the bot at it via `PROXIES`.
- **The proxy is bound to `127.0.0.1` only** (usque's default is `0.0.0.0`); it is never exposed on a
  shared host. It auto-restarts if it dies, so the bot does not silently lose YouTube again.
- **Registration is now robust.** `register` answers the Terms-of-Service prompt by watching the output
  stream (instead of the earlier `spawnSync` that swallowed the error), and **retries up to 4× on transient
  network failures** (`unexpected EOF`, timeouts, resets) with a clear manual-fallback message — a single
  flaky attempt no longer kills bot startup. Verified: the prompt is answered and output is captured (the
  `unexpected EOF` seen in some egress environments is a network quirk, not a code defect).
- **Escape hatches:** `WARP_PORT` (default `1080`) for a different local port, and `WARP_HTTP2=1` to force
  HTTP/2-over-TCP when a host blocks the default UDP/QUIC tunnel.
- **WARP is owned by `index.js`, not `bootstrap.js`.** The panel launches the bot via `npm start`
  (`node index.js`), where bootstrap's WARP startup was never reached — so `WARP=1` was silently ignored.
  WARP now starts inside the bot process itself, so it works no matter how the bot is launched
  (`npm start`, the panel's start command, or `node bootstrap.js`, which only spawns the bot). bootstrap's
  duplicate block was removed to avoid two processes racing for port 1080.
- **`settings.proxies` is now a live getter** that reads `process.env.PROXIES` at call time. Previously it
  was cached at module load, so a proxy assigned *after* `settings.js` was required (which is exactly when
  the WARP tunnel sets `PROXIES`) was never seen by yt-dlp. Now yt-dlp picks up the tunnel on its next call.
- The failure is non-fatal — the bot starts without the tunnel and YouTube stays blocked, rather than crashing.
- `/.warp/` is gitignored (the binary + the free account config it registers).
- **Tests:** `__tests__/warp-proxy.test.js` — asset selection per platform/arch, the ZIP reader (stored +
  deflated + missing-entry + non-zip), proxy-URL format, the register-retry decision, and `waitForPort`
  against a real local TCP socket.

### 🩺 RapidAPI fallback for IP-blocked hosts

- **New `lib/rapidApi.js`** — a **last-resort** YouTube fallback for hosts whose IP is blocked. yt-dlp
  fetches from *this* host's IP; on a flagged datacenter IP every client is refused, and no client, cookie
  or plugin choice fixes that. This service fetches from **its own** IPs, so it works where yt-dlp cannot —
  it even returned a video yt-dlp reported as *"unavailable"* (region-restricted).
- Wired in **only after yt-dlp fails**, in both `lib/ytAudio.js` (`.song`, `.music`) and
  `commands/media/video.js` (`.video`). Verified against a live response: 21 video tracks and 12 audio
  tracks for a real video.
- **Video is capped at the best *muxed* mp4** (often 360p) because that path has no ffmpeg merge step, and
  WhatsApp cannot play a video-only stream. Audio prefers an m4a track for a clean mp3 transcode.
- **Configured via `RAPIDAPI_KEY`** (in `.env`, never the repo). `RAPIDAPI_HOST` is optional.
- **The caveats are documented rather than hidden:** the free tier is **100 requests/month** (about three a
  day), so this is a safety net and not a primary source; it is a third-party dependency and will
  eventually rot, as the three before it did; and it only exists because a proxy costs money.
- **Tests:** `__tests__/rapidapi.test.js`, 15 assertions against a captured-response fixture.

### 🎵 TikTok

- **Expired short links now say so.** A TikTok short link (`vt.`/`vm.`) that has expired 302-redirects to
  **`https://www.tiktok.com/?_r=1`** — the homepage. yt-dlp then fails with
  `Unexpected response from webpage request`, which tells the user nothing. `.tiktok` now resolves the
  redirect itself first: an expired link gets a plain *"that link is invalid or has expired"*, and a valid
  one is handed to yt-dlp as the canonical URL so it skips a redirect hop. Non-short URLs are passed
  through untouched with no extra request.
- **Tests:** `__tests__/tiktok-link.test.js`.

### 🔬 `.ytdiag` — find out which YouTube client works from this host

- **New owner command.** "Sign in to confirm you're not a bot" is an IP problem, but that does not mean
  nothing can be done — YouTube tolerates different player clients differently depending on the IP. Rather
  than guessing, `.ytdiag` probes each client (`default`, `mweb`, `tv`, `web_safari`, `ios`, `android_vr`)
  against a video and reports which actually work **here**, plus the yt-dlp version, its path, and whether
  a PO-token plugin is available.
- **The answer is decisive:** if some client works, pin it and the bot works with no proxy; if nothing
  works — not even the default — the IP is blocked and a proxy is the only remaining fix.
- **`.ytdiag` now compares IPv4 and IPv6, and `YTDLP_EXTRA_ARGS` exists to act on it.** A host blocked on
  one address family is often fine on the other — they are different addresses — and that is a **free**
  fix, so it is tested before anyone buys a proxy. If IPv6 works while IPv4 does not, the command says so
  and tells you to set `YTDLP_EXTRA_ARGS=-6`.
- **New `YTDLP_EXTRA_ARGS` env var** — whitespace-separated arguments applied to every yt-dlp call, so a
  host can apply a fix without waiting for a code change. Documented in `.env.example`.
- **`.ytdiag` also tests a configured proxy.** When the direct sweep fails, the question becomes "would
  a proxy fix this?" — so if `PROXIES` is set, one probe is run through it and reported (credentials
  masked). The conclusion now distinguishes three cases: a client works directly / the proxy works / neither
  works, in which case it says plainly that a **datacenter** proxy won't help either and a residential one
  is needed.
- **`PROXIES` is now properly documented in `.env.example`**, including the part that costs people money:
  free and cheap proxy lists are datacenter IPs, already abused and already blocked — residential or mobile
  is what works.
- `.ytdiag <url>` probes a specific video instead of the built-in stable one.
- **Measured while building it:** the default client took **6.9s** and `mweb` **33.7s** on the same video
  (mweb round-trips to the PO-token provider). Worth knowing on a slow panel, and why the per-client
  timeout is 45s rather than something tighter.
- **Tests:** `__tests__/ytdiag.test.js`.

### 🎬 YouTube downloads on hosts without Python

- **The bot-check error is now explained instead of misdiagnosed.** `Sign in to confirm you're not a bot`
  was reported to users as *"it may be private, age-restricted, or region-locked"* — three things it is
  not. It means **YouTube distrusts this server's IP**, which is normal on a datacenter host and has a
  known fix. Other yt-dlp failures — no formats, unavailable, private, age-restricted, not installed —
  get their own messages too, and the raw yt-dlp reason is captured rather than discarded.
- **The bot-check error now carries the setup steps, for people who are not technical.** "Run .dlstatus" is
  useless advice to someone who does not know what RapidAPI or an `.env` file is. The message now names
  `rapidapi.com`, the free plan, the exact line to add (`RAPIDAPI_KEY=…`) and where to put it — and when a
  fallback *is* configured it says the failure is unexpected instead, so nobody is sent on a pointless
  signup. 17 assertions cover it.

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

### 🔗 Linking WhatsApp without the panel

- **`.pair` now mints codes locally — the third-party service is gone.** The command already existed but
  called `settings.pairCodeService` (an external endpoint modelled on Knightbot-MD's
  `knight-bot-paircode.onrender.com/code?number=...`). That hands the phone number to a third party, and
  the code is generated by **their** Baileys instance — so the session it creates belongs to them, not to
  you. `.pair <number>` now opens its own **unregistered** socket, requests the code itself, and writes the
  result to `./session-pair`.
- **Why a separate socket is required:** `requestPairingCode()` only works on a socket that is *not yet
  registered*. The running bot is already registered, so it cannot mint a code for itself — which is the
  whole reason the external service existed in the first place.
- **The result is never activated automatically.** A pairing writes a session for whichever number you
  pair, which is usually not the account the bot is running as. Copy `./session-pair` into `./session` and
  restart when you actually want to switch. `.pair status` and `.pair cancel` are available, and the
  socket closes itself after 5 minutes (codes expire).
- **Security:** `/session-pair/` is gitignored — it holds real credentials, exactly like `./session`.
- `settings.pairCodeService` is now **unused** and marked deprecated rather than deleted, so existing
  configs keep loading. Do not point it at anyone's service.
- **Tests:** `__tests__/pair-command.test.js`.

- **The bot now says what its session actually is, at startup:**
  `[session] creds.json: 1889 bytes · registered: true · linked as 923417360554`. This answers the most
  confusing question about linking — *"it has creds.json, why is it still asking for a number?"* — because
  **a creds.json FILE is not a LINKED session.** Baileys writes one with freshly generated keys as soon as
  the socket connects, so the file can exist (and be rewritten) while `registered` is still false. The
  file's presence proves nothing; only `registered` matters. Logic lives in `lib/sessionInfo.js` so it is
  testable without starting the bot.
- **Fixed: a reconnect re-issued the pairing code, invalidating the one being typed.** The pairing block
  sits inside `startXeonBotInc()`, and the reconnect path calls that again — so a flapping connection
  re-prompted and requested a *new* code each time, and pairing could never complete. A code is now issued
  once per run; a reconnect logs that the existing code still stands. If the request itself fails, the
  guard resets so a later reconnect can retry.
- **New `botNumber` setting.** `settings.js` had `botOwner` (a name) and `ownerNumber` (who *commands* the
  bot) but nothing for the account the bot *is*. The pairing prompt therefore offered `ownerNumber`, so
  pairing with it would link your personal WhatsApp as the bot. Pairing now prefers `settings.botNumber`
  and falls back to `ownerNumber`, and the prompt says so.
- **Fixed: pip bootstrap on Debian/Ubuntu panels (PEP 668).** `get-pip.py` aborted with
  `error: externally-managed-environment`, so no pip was ever obtained and the host fell back to the
  plugin-less standalone binary. It now retries with `--break-system-packages` (the override the error
  message itself suggests, and safe in a container whose python exists only for this bot), and a **venv
  install** (`./.venv`, gitignored) was added as a further fallback — a venv sidesteps PEP 668 entirely
  and still gives yt-dlp its PO-token plugin, because both live in the same environment. Both the venv
  binary and the standalone are now searched for, with the venv preferred since only it has the plugin.
- **Fixed: the pairing prompt looked like it was waiting for input on a panel.** In a non-interactive
  console `question()` resolves immediately from settings, so the "Please type your WhatsApp number"
  line was printed but never waited on — confusing when the number was already configured. It now says
  `[pair] Using 923417360554 from settings — non-interactive console, nothing to type.`
- **The pairing code is now also written to `data/pairing-code.txt`** (and removed once linked). On a panel
  the console scrolls and is awkward to read back — and missing the code means restarting, which issues a
  *new* code and invalidates the one you had. The file can be opened any time from the panel's Files tab.
  `data/*` is gitignored.
- **New `scripts/test-pairing.js`** (`npm run pair:test`) — an end-to-end pairing test that runs the real
  sequence in three phases: **pair** (code or `--qr`) → **persist** (the session is written and reports
  `registered: true`) → **reconnect** (a *fresh* socket opens from the on-disk session with no pairing at
  all, which is what actually proves persistence). It uses its own `./.pairtest` directory and **never
  touches your real `./session`**; `npm run pair:clean` removes it.
- **Security: `.pairtest/` is now gitignored**, and a bare `creds.json` pattern was added so a stray
  credentials file is ignored **at any depth**. A test pairing writes real credentials, and they were
  committable before this.
- **Clarification worth recording:** WhatsApp pairing is **not** a local-network protocol. There is no
  device discovery, no mDNS and no LAN handshake — the phone and the bot never talk to each other; both
  connect outbound to WhatsApp's servers and the link is brokered there. No local permissions are needed
  and the two devices do not have to share a network. The only requirement is outbound internet.
- **New `scripts/pair.js`** (`npm run pair`) — links WhatsApp on your own machine and writes
  `./session/creds.json`, the exact directory the bot reads at startup. Copy that folder to the host and
  the bot connects **with no phone number in `settings.js` and nothing typed into a panel console**.
  Pairing code by default, or `npm run pair:qr` for a QR. If the session is already linked it says so and
  exits without touching anything.
- **Fixed: `--qr` never actually showed a QR.** Baileys v7 deprecated `printQRInTerminal` — it only logs a
  warning and emits nothing — so `index.js` received the `qr` string, printed *"QR Code generated"*, and
  rendered nothing scannable. It now renders the QR with `qrcode-terminal` (already a dependency, unused).
- **Fixed: pairing rejected valid numbers.** `awesome-phonenumber`'s `isValid()` was a hard gate with
  `process.exit(1)`, but its metadata lags reality: `+923701609799` is a working Pakistani number whose
  `370` prefix it does not recognise, so linking with it failed immediately. Validation is now a warning —
  WhatsApp is the authority and rejects a genuinely wrong number with a clear error.
- **Security:** generate `creds.json` on your own machine. Pairing is cryptographically bound to the
  instance that calls `requestPairingCode`, so a `creds.json` produced by a third-party "pair code"
  service is a copy of *their* session — they keep working access to the account. There is no safe way to
  have someone else mint one for you. Details in the header comment of `scripts/pair.js`.

### 🍪 Optional cookie support (off by default)

- yt-dlp is now passed `--cookies <file>` when a cookie jar exists at `.tools/cookies.txt` (or at the
  path in `YTDLP_COOKIES`). `.tools/` is gitignored, so a jar can never be committed.
- **A single cookie value is not enough** — yt-dlp needs a whole Netscape-format cookie file.
- Only useful for age-restricted or "confirm you're not a bot" content, and it carries real risk: driving
  a logged-in account from a datacenter IP is exactly what gets accounts flagged. Prefer a throwaway
  account, and expect the jar to expire within days. **Try the client fallback first** — most of the time
  it makes cookies unnecessary.
- `.dlstatus` reports whether cookies are configured (never the contents).

### 🔄 `.update` — ZIP mode works without hand-configuration

- **ZIP mode no longer needs hand-configuration.** `.update` falls back to a ZIP archive URL derived
  from the same repo/branch git mode uses (`<repo>/archive/refs/heads/<branch>.zip`), so a panel that is
  not a git checkout works without setting `UPDATE_ZIP_URL`. `settings.updateZipUrl` and the env var
  still take precedence, and `UPDATE_BRANCH` is honoured.
- Reminder of how it deploys: **git mode** when a `.git` directory and `git` are present
  (`git reset --hard` → `git clean -fd` → `npm install` → restart); **ZIP mode** otherwise (download,
  extract, copy over, preserving `node_modules`, `session`, `data`, `settings.js`).
- `data/`, `baileys_store.json` and `settings.js` are backed up and restored around a git update, so
  runtime state survives. `.update check` previews without touching the working tree (git mode only).

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
