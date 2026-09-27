<div align="center">

<img src="docs/assets/optimus-cover.png" alt="Optimus Bot" width="400" />

# 🤖 Optimus Bot

**A full-featured WhatsApp bot for group management, AI chat, media tools, productivity, and fun — built on [Baileys](https://github.com/WhiskeySockets/Baileys).**

[![Version](https://img.shields.io/badge/version-2.0.0-blue?style=flat-square)](https://github.com/CodeWithTayyab96/Optimus-Bot)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green?style=flat-square&logo=node.js)](https://nodejs.org)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-363%2F363%20passing-brightgreen?style=flat-square)](#testing)

</div>

---

## ✨ Features at a Glance

| Category | Highlights |
|----------|-----------|
| 🧠 **AI Chat** | Groq (primary) + Gemini fallback — text rewriting, reply drafting, document analysis, voice summary |
| 🎨 **Image Generation** | Gemini → Cloudflare → Pollinations — text-to-image with automatic multi-provider fallback |
| 🗣️ **Speech-to-Text** | Groq Whisper — transcribe voice notes, auto-convert Urdu/Hindi to Roman script |
| 📥 **Media & Downloads** | YouTube, Spotify, Instagram, TikTok, Twitter, Facebook, Pinterest — audio, video, and more |
| 🎮 **Games** | Tic-Tac-Toe, Hangman, Bomb, Trivia |
| 😄 **Fun** | Jokes, quotes, roasts, compliments, shayari, memes, 8-ball, dare/truth, and more |
| 🛡️ **Group Management** | Anti-link, anti-badword, anti-sticker, warnings, bans, mute, kick, promote, demote |
| 👑 **Owner Controls** | Mode switching, broadcast, sudo, auto-read/typing, anti-call, anti-delete, OTA update |
| ⏰ **Productivity** | Reminders (relative, absolute, recurring), scheduled messages, snooze, polls, saved messages |
| 📊 **Utilities** | Calculator, weather (keyless), air quality, sunrise/sunset, name info, news (keyless), QR codes, screenshots, URL shortener, GitHub lookup |
| 🌐 **Free APIs** | Weather, AQI, sun times, news, and name-info all use **no API keys** — powered by Open-Meteo, Google News RSS, and agify/genderize/nationalize |
| 🎌 **Anime & Textmaker** | Anime image fetcher, styled text generator with 19+ font styles |
| 🖼️ **Stickers** | Image/video-to-sticker with crop, custom pack names, animated sticker support |

---

## 🏗️ Architecture

```
Optimus Bot
├── index.js                  # Entry point — pairing / session bootstrap
├── main.js                   # Message handler, dispatch, group protections
├── settings.js               # Bot configuration (gitignored — copy settings.example.js)
├── lib/
│   ├── aiConfig.js           # AI model IDs — single source of truth
│   ├── ai.js                 # Centralized AI client (Groq + Gemini)
│   ├── imageGeneration.js    # Image provider fallback chain (Gemini → CF → Pollinations)
│   ├── messageStyle.js       # Unified visual formatting system
│   ├── messageConfig.js      # Shared contextInfo / newsletter config
│   ├── commandLoader.js      # Dynamic command registration
│   ├── mode.js               # Public/Private mode with caching
│   ├── isBanned.js           # Ban system with in-memory cache
│   ├── afk.js                # AFK system with in-memory cache
│   ├── weatherApi.js         # Shared geocoding + weather + AQI helper (Open-Meteo, keyless)
│   ├── news.js               # Google News RSS parser (keyless — top, topic, search)
│   ├── potSupervisor.js      # PO-token provider supervisor (auto-restart, backoff)
│   ├── dlHealth.js           # Download health monitor with push alerts
│   ├── productivity/
│   │   ├── scheduler.js      # Reminder/message scheduler (recurring-aware)
│   │   ├── reminderStore.js  # Reminder persistence (recurring, kind, snooze)
│   │   ├── timeParse.js      # Time parser (relative/absolute/recurring)
│   │   └── dataStore.js      # Generic JSON data-store helper
│   └── ...                   # Additional helpers
├── commands/
│   ├── admin/                # 51 group-management commands
│   ├── ai/                   # 11 AI-powered commands
│   ├── anime/                # 5 anime image commands
│   ├── fun/                  # 39 fun/entertainment commands
│   ├── general/              # 37 general utility commands (incl. news, productivity)
│   ├── group/                # 1 group command
│   ├── media/                # 14 media/download commands
│   ├── owner/                # 29 owner-only control commands
│   ├── textmaker/            # 1 styled text generator
│   └── utility/              # 30 utility commands (weather, aqi, sun, nameinfo, calc, qr, ...)
├── scripts/                  # 25 smoke-test suites
├── data/                     # Runtime state (gitignored — auto-created on first run)
└── session/                  # WhatsApp session (gitignored)
```

**Tech Stack:** Node.js ≥ 18 · Baileys (WhatsApp Web API) · Axios · Sharp · FFmpeg · Groq API · Google Gemini API · Cloudflare Workers AI · Pollinations · Open-Meteo · Google News RSS

---

## 🧠 AI Configuration

Optimus uses multiple AI providers with automatic fallback. Model IDs are centralized in **`lib/aiConfig.js`** — the single source of truth.

| Provider | Purpose | Default Model |
|----------|---------|---------------|
| **Groq** | Primary text chat | `openai/gpt-oss-120b` |
| **Groq** | Speech-to-text | `whisper-large-v3-turbo` |
| **Gemini** | Fallback text chat | `gemini-2.5-flash` |
| **Gemini** | Primary image generation | `gemini-3.1-flash-image` |
| **Cloudflare** | Image fallback #1 | `@cf/black-forest-labs/flux-1-schnell` |
| **Pollinations** | Image fallback #2 | `flux` (no API key required) |

**Fallback chains:**
- **Text:** Groq → Gemini
- **Speech-to-Text:** Groq Whisper
- **Image:** Gemini → Cloudflare → Pollinations

To change a model, edit `lib/aiConfig.js` directly. Run `.aistatus` as the bot owner to view the currently configured providers and models.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18.0.0
- **FFmpeg** installed and available in PATH
- A WhatsApp account for pairing

### Installation

```bash
git clone https://github.com/CodeWithTayyab96/Optimus-Bot.git
cd Optimus-Bot
npm install
```

### Configuration

1. **Copy the settings template:**

```bash
cp settings.example.js settings.js
```

2. **Edit `settings.js`** — fill in your own values:

```js
const settings = {
  prefix: '.',              // Command prefix
  botName: 'Optimus Bot',   // Display name
  botOwner: 'Your Name',    // Owner name
  ownerNumber: '1234567890', // Your WhatsApp number (no + or spaces)
  groqApiKey: 'YOUR_GROQ_API_KEY',           // Get from console.groq.com
  geminiApiKey: 'YOUR_GEMINI_API_KEY',       // Get from aistudio.google.com
  cloudflareAccountId: 'YOUR_CLOUDFLARE_ACCOUNT_ID', // From dash.cloudflare.com
  cloudflareApiToken: 'YOUR_CLOUDFLARE_API_TOKEN',   // Workers AI REST API token
  // ... other settings
};
```

> **⚠️ Important:** `settings.js` is gitignored and will **never** be committed. Real API keys stay on your machine only. You can also supply keys via `.env` or environment variables.

3. **Save the file.**

### Running

```bash
node index.js
```

A pairing code will appear in the terminal. Enter it in **WhatsApp → Settings → Linked Devices → Link a Device**.

After the first pairing, the session is saved to `session/` and subsequent restarts connect automatically.

---

## 🌐 Free APIs (No Key Required)

Several features use completely free, no-API-key-required services:

| Feature | Command | Service |
|---------|---------|---------|
| Weather + forecast | `.weather <city>` | Open-Meteo |
| Air quality (AQI) | `.aqi <city>` | Open-Meteo Air Quality |
| Sunrise / sunset | `.sun <city>` | Open-Meteo |
| Name insights | `.nameinfo <name>` | agify + genderize + nationalize |
| News (top, topic, search) | `.news [topic\|keyword]` | Google News RSS |

These work out of the box — no signup, no key, no configuration.

---

## ⏰ Productivity Commands

| Command | What it does |
|---------|-------------|
| `.remind 10m Submit assignment` | Reminder in 10 minutes |
| `.remind 5pm Call mom` | Reminder at an absolute clock time |
| `.remind tomorrow 9am Meeting` | Reminder for tomorrow |
| `.remind daily 9am Standup` | **Recurring** daily reminder (auto-reschedules) |
| `.remind weekly mon 9am Sync` | **Recurring** weekly reminder |
| `.schedule 30m Standup in 5` | Bot posts the message itself at the set time |
| `.schedule daily 7am Good morning` | Recurring scheduled message |
| `.snooze R001 10m` | Push a reminder back by 10 minutes |
| `.reminders` | List all pending reminders + scheduled messages |
| `.cancelreminder R001` | Cancel a reminder or scheduled message |

---

## 🔄 OTA Update

| Command | What it does |
|---------|-------------|
| `.update` | Pull latest from GitHub, backup/restore runtime state, restart |
| `.update check` | **Dry run** — show available commits/files without applying |
| `.update <zip-url>` | Update from a ZIP archive (for non-git deployments) |

The update system backs up `data/`, `settings.js`, and `baileys_store.json` before applying changes, then restores them — so mode, warnings, AFK, stats, and configuration survive updates.

Repo URL and branch are configurable via `settings.updateRepoUrl` / `settings.updateBranch` or `UPDATE_REPO_URL` / `UPDATE_BRANCH` environment variables.

---

## 🧪 Testing

```bash
npm test
```

Runs **25 smoke-test suites** + **363 Jest tests** covering:

| Test | What it verifies |
|------|-----------------|
| `check-help` | All commands appear in dynamic Help |
| `smoke-dispatch` | Command routing and prefix handling |
| `smoke-games` | Tic-Tac-Toe, Bomb game logic |
| `smoke-ai` | AI command metadata and error handling |
| `smoke-ai-config` | Centralized config structure and consumption |
| `smoke-cache` | isBanned / AFK / userGroupData caching |
| `smoke-models` | No dead/deprecated AI model IDs |
| `smoke-migration` | All legacy commands still registered |
| `smoke-update` | Runtime-state backup/restore across updates |
| `smoke-general` | General/utility commands, news, productivity |
| `smoke-media` | Media download command metadata |
| `smoke-menu` | Help menu rendering and categories |
| `smoke-*` | Category-specific UI, permissions, and behavior |

---

## 📋 Command Overview

**230 commands** across 10 categories:

<details>
<summary><b>🛡️ Admin (51 commands)</b></summary>

`antibadword` · `antigroupmention` · `antigroupstatus` · `antilink` · `antisticker` · `antitag` · `autosticker` · `ban` · `chatbot` · `clear` · `delete` · `demote` · `goodbye` · `grouplink` · `groupmanage` · `groupstatus` · `hidetag` · `kick` · `mention` · `mute` · `pending` · `promote` · `resetlink` · `resetwarn` · `tag` · `tagall` · `tagnotadmin` · `unban` · `unmute` · `warn` · `warnings` · `welcome` · `setgdesc` / `setgname` / `setgpp` · and more

</details>

<details>
<summary><b>🧠 AI (11 commands)</b></summary>

`gpt` (`gemini`) · `gptimage` (`gptimg`, `editimage`, `aiimage`, `gi`) · `imagine` · `magicstudio` (`magic`, `magicai`, `generate`) · `reply` · `rewrite` · `stt` (`totext`) · `study` · `summarize` (`tldr`) · `voicesummary` (`vsum`)

</details>

<details>
<summary><b>🎮 Fun & Games (39 commands)</b></summary>

`advice` · `bomb` · `character` · `compliment` · `dare` · `8ball` · `fact` · `flirt` · `gayrate` · `gif` · `goodnight` · `hangman` · `insult` · `joke` · `meme` · `memesearch` · `motivate` · `pies` · `quote` · `riddle` · `roast` · `roseday` · `shayari` · `simp` · `tictactoe` (`ttt`) · `topmembers` · `trivia` · `truth` · `wasted` · and more

</details>

<details>
<summary><b>📦 General (37 commands)</b></summary>

`alive` · `attp` · `emojimix` · `getpp` · `github` · `groupinfo` · `groupstats` · `help` · `myactivity` · `news` (`headlines`) · `owner` · `ping` · `settings` · `simage` · `ss` · `staff` · `sticker` · `sticker-alt` · `stickercrop` · `stickertelegram` · `take` · `tts` · `translate` · `uptime` · `url` · `remind` · `reminders` · `cancelreminder` · `schedule` (`sched`, `schedulemsg`) · `snooze` (`snoozeremind`) · `poll` · `pollresult` · `save` · `saved` · `unsave`

</details>

<details>
<summary><b>📥 Media (26 commands)</b></summary>

`facebook` · `igs` · `img-blur` · `instagram` · `lyrics` · `pinterest` · `play` · `remini` · `removebg` · `song` · `spotify` · `tiktok` · `twitter` · `video` · and more

</details>

<details>
<summary><b>👑 Owner (29 commands)</b></summary>

`aistatus` (`aistat`) · `afk` · `anticall` · `antidelete` · `areact` · `autoread` · `autostatus` · `autotyping` · `block` · `broadcast` · `clearsession` · `cleartmp` · `jid` · `mode` · `pair` · `pmblocker` · `restart` · `setbotname` · `setmenuimage` · `setnewsletter` · `setprefix` · `sudo` · `unblock` · `update` (`.update check` for dry-run) · and more

</details>

<details>
<summary><b>🔧 Utility (30 commands)</b></summary>

`calc` · `qr` · `weather` · `aqi` (`air`, `airquality`) · `sun` (`sunrise`, `sunset`, `suntimes`) · `nameinfo` (`nameage`, `guessname`, `namelook`) · and more

</details>

<details>
<summary><b>🎌 Anime & Textmaker</b></summary>

`animu` (anime image fetcher) · `textmaker` (19 font styles)

</details>

---

## 🔒 Security

- **Session credentials** (`session/`) are gitignored — never commit them
- **API keys** in `settings.js` are gitignored — copy `settings.example.js` instead
- Environment variables (`.env`) supported for all credential fields
- The `.aistatus` command shows only model IDs, never API keys or tokens
- Owner-only commands are enforced at the loader level
- See [SECURITY.md](SECURITY.md) for responsible-disclosure guidelines

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project conventions, and how to add new commands.

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).

---

## 🙏 Credits

- [Tayyab](https://github.com/CodeWithTayyab96) — Creator & maintainer
- [Baileys](https://github.com/WhiskeySockets/Baileys) — WhatsApp Web API library
- [Groq](https://groq.com) — Fast AI inference
- [Google Gemini](https://ai.google.dev) — AI chat and image generation
- [Cloudflare Workers AI](https://workers.cloudflare.com) — Image generation fallback
- [Pollinations](https://pollinations.ai) — Free image generation fallback
- [Open-Meteo](https://open-meteo.com) — Free weather and air-quality data
- [Google News RSS](https://news.google.com) — Free news headlines

---

## ⚠️ Disclaimer

This bot is provided for **educational purposes only**. It is not affiliated with, authorized, or endorsed by WhatsApp. Using automated tools with WhatsApp may result in account restrictions. Use at your own risk.
