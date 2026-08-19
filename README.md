<div align="center">

<img src="docs/assets/optimus-cover.png" alt="Optimus Bot" width="400" />

# 🤖 Optimus Bot

**A full-featured WhatsApp bot for group management, AI chat, media tools, and fun — built on [Baileys](https://github.com/WhiskeySockets/Baileys).**

[![Version](https://img.shields.io/badge/version-1.0.0-blue?style=flat-square)](https://github.com/CodeWithTayyab96/Optimus-Bot)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green?style=flat-square&logo=node.js)](https://nodejs.org)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-24%2F24%20passing-brightgreen?style=flat-square)](#testing)

</div>

---

## ✨ Features at a Glance

| Category | Highlights |
|----------|-----------|
| 🧠 **AI Chat** | GPT / Gemini chat with auto-fallback, text rewriting, reply drafting, document analysis, voice summary |
| 🎨 **Image Generation** | Pixazo (primary) + Gemini fallback — text-to-image and AI image editing |
| 🗣️ **Speech-to-Text** | Groq Whisper — transcribe voice notes, auto-convert Urdu/Hindi to Roman script |
| 📥 **Media & Downloads** | YouTube, Spotify, Instagram, TikTok, Twitter, Facebook, Pinterest — audio, video, and more |
| 🎮 **Games** | Tic-Tac-Toe, Hangman, Bomb, Trivia |
| 😄 **Fun** | Jokes, quotes, roasts, compliments, shayari, memes, 8-ball, dare/truth, and more |
| 🛡️ **Group Management** | Anti-link, anti-badword, anti-sticker, warnings, bans, mute, kick, promote, demote |
| 👑 **Owner Controls** | Mode switching, broadcast, sudo, auto-read/typing, anti-call, anti-delete |
| 📊 **Utilities** | Calculator, weather, news, QR codes, screenshots, URL shortener, GitHub lookup |
| 🎌 **Anime & Textmaker** | Anime image fetcher, styled text generator with 19+ font styles |
| 🖼️ **Stickers** | Image/video-to-sticker with crop, custom pack names, animated sticker support |

---

## 🏗️ Architecture

```
Optimus Bot
├── index.js              # Entry point — pairing / session bootstrap
├── main.js               # Message handler, dispatch, group protections
├── settings.js           # Bot configuration (prefix, branding, API keys)
├── lib/
│   ├── aiConfig.js       # AI model IDs — single source of truth
│   ├── ai.js             # Centralized AI client (Groq + Gemini + Pixazo)
│   ├── messageStyle.js   # Unified visual formatting system
│   ├── messageConfig.js  # Shared contextInfo / newsletter config
│   ├── commandLoader.js  # Dynamic command registration
│   ├── mode.js           # Public/Private mode with caching
│   ├── isBanned.js       # Ban system with in-memory cache
│   ├── afk.js            # AFK system with in-memory cache
│   ├── index.js          # userGroupData CRUD with shared cache
│   ├── antibadword.js    # Bad-word detection
│   ├── antilink.js       # Link detection
│   ├── groupstats.js     # Group message statistics
│   ├── messageStats.js   # Message count with caching
│   └── ...               # Additional helpers
├── commands/
│   ├── admin/            # 33 group-management commands
│   ├── ai/               # 10 AI-powered commands
│   ├── anime/            # Anime image fetcher
│   ├── fun/              # 23 fun/entertainment commands
│   ├── general/          # 26 general utility commands
│   ├── media/            # 14 media/download commands
│   ├── owner/            # 21 owner-only control commands
│   ├── textmaker/        # Styled text generator
│   └── utility/          # Calculator, QR, weather
├── scripts/              # Test suite (24 smoke tests)
├── data/                 # Runtime state (gitignored)
└── session/              # WhatsApp session (gitignored)
```

**Tech Stack:** Node.js ≥ 18 · Baileys (WhatsApp Web API) · Axios · Sharp · FFmpeg · Groq API · Google Gemini API · Pixazo API

---

## 🧠 AI Configuration

Optimus uses three AI providers with automatic fallback. Model IDs are centralized in **`lib/aiConfig.js`** — the single source of truth.

| Provider | Purpose | Default Model |
|----------|---------|---------------|
| **Groq** | Primary text chat | `openai/gpt-oss-120b` |
| **Groq** | Speech-to-text | `whisper-large-v3-turbo` |
| **Gemini** | Fallback text chat | `gemini-2.5-flash` |
| **Gemini** | Fallback image generation | `gemini-3.1-flash-image` |
| **Pixazo** | Primary image generation | `flux-1-schnell` |

**Fallback chain:**
- **Text:** Groq → Gemini
- **Images:** Pixazo → Gemini

To change a model, edit `lib/aiConfig.js` directly. Run `.aistatus` as the bot owner to view the currently configured models.

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

1. **Edit `settings.js`** — this is the bot's configuration file. Open it and fill in your own values:

```js
const settings = {
  prefix: '.',              // Command prefix
  botName: 'Optimus Bot',   // Display name
  botOwner: 'Your Name',    // Owner name
  ownerNumber: '1234567890', // Your WhatsApp number (no + or spaces)
  groqApiKey: 'YOUR_GROQ_API_KEY',      // Get from console.groq.com
  geminiApiKey: 'YOUR_GEMINI_API_KEY',  // Get from aistudio.google.com
  pixazoApiKey: 'YOUR_PIXAZO_API_KEY',  // Get from pixazo.ai
  // ... other settings
};
```

2. **Save the file.** All credentials stay in `settings.js` — no `.env` file needed.

### Running

```bash
node index.js
```

A pairing code will appear in the terminal. Enter it in **WhatsApp → Settings → Linked Devices → Link a Device**.

After the first pairing, the session is saved to `session/` and subsequent restarts connect automatically.

---

## 🧪 Testing

```bash
npm test
```

Runs **24 smoke-test suites** covering:

| Test | What it verifies |
|------|-----------------|
| `check-help` | All 144 commands appear in dynamic Help |
| `smoke-dispatch` | Command routing and prefix handling |
| `smoke-games` | Tic-Tac-Toe, Bomb game logic |
| `smoke-ai` | AI command metadata and error handling |
| `smoke-ai-config` | Centralized config structure and consumption |
| `smoke-cache` | isBanned / AFK / userGroupData caching |
| `smoke-models` | No dead/deprecated AI model IDs |
| `smoke-migration` | All legacy commands still registered |
| `smoke-*` | Category-specific UI, permissions, and behavior |

---

## 📋 Command Overview

**144 commands** across 9 categories:

<details>
<summary><b>🛡️ Admin (33 commands)</b></summary>

`antibadword` · `antigroupmention` · `antigroupstatus` · `antilink` · `antisticker` · `antitag` · `autosticker` · `ban` · `chatbot` · `clear` · `delete` · `demote` · `goodbye` · `grouplink` · `groupmanage` · `groupstatus` · `hidetag` · `kick` · `mention` · `mute` · `pending` · `promote` · `resetlink` · `resetwarn` · `tag` · `tagall` · `tagnotadmin` · `unban` · `unmute` · `warn` · `warnings` · `welcome` · `setgdesc` / `setgname` / `setgpp`

</details>

<details>
<summary><b>🧠 AI (10 commands)</b></summary>

`gpt` (`gemini`) · `gptimage` (`gptimg`, `editimage`, `aiimage`, `gi`) · `imagine` · `magicstudio` (`magic`, `magicai`, `generate`) · `reply` · `rewrite` · `stt` (`totext`) · `study` · `summarize` (`tldr`) · `voicesummary` (`vsum`)

</details>

<details>
<summary><b>🎮 Fun & Games (23 commands)</b></summary>

`advice` · `bomb` · `character` · `compliment` · `dare` · `8ball` · `fact` · `flirt` · `gayrate` · `gif` · `goodnight` · `hangman` · `insult` · `joke` · `meme` · `memesearch` · `motivate` · `pies` · `quote` · `riddle` · `roast` · `roseday` · `shayari` · `simp` · `tictactoe` (`ttt`) · `topmembers` · `trivia` · `truth` · `wasted`

</details>

<details>
<summary><b>📦 General (26 commands)</b></summary>

`alive` · `attp` · `emojimix` · `getpp` · `github` · `groupinfo` · `groupstats` · `help` · `myactivity` · `news` · `owner` · `ping` · `settings` · `simage` · `ss` · `staff` · `sticker` · `sticker-alt` · `stickercrop` · `stickertelegram` · `take` · `tts` · `translate` · `uptime` · `url`

</details>

<details>
<summary><b>📥 Media (14 commands)</b></summary>

`facebook` · `igs` · `img-blur` · `instagram` · `lyrics` · `pinterest` · `play` · `remini` · `removebg` · `song` · `spotify` · `tiktok` · `twitter` · `video`

</details>

<details>
<summary><b>👑 Owner (21 commands)</b></summary>

`aistatus` (`aistat`) · `afk` · `anticall` · `antidelete` · `areact` · `autoread` · `autostatus` · `autotyping` · `block` · `broadcast` · `clearsession` · `cleartmp` · `jid` · `mode` · `pair` · `pmblocker` · `restart` · `setbotname` · `setmenuimage` · `setnewsletter` · `setprefix` · `sudo` · `unblock` · `update`

</details>

<details>
<summary><b>🎌 Anime & Textmaker</b></summary>

`animu` (anime image fetcher) · `textmaker` (19 font styles)

</details>

<details>
<summary><b>🔧 Utility (3 commands)</b></summary>

`calc` · `qr` · `weather`

</details>

---

## 🔒 Security

- **Session credentials** (`session/`) are gitignored — never commit them
- **API keys** are configured in `settings.js` — never commit real keys to version control
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
- [Google Gemini](https://ai.google.dev) — AI fallback
- [Pixazo](https://pixazo.ai) — Image generation

---

## ⚠️ Disclaimer

This bot is provided for **educational purposes only**. It is not affiliated with, authorized, or endorsed by WhatsApp. Using automated tools with WhatsApp may result in account restrictions. Use at your own risk.
