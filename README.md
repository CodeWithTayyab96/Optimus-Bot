<h1 align="center">Optimus Bot</h1>

<p align="center">
  <img src="docs/assets/optimus-cover.png" alt="Optimus-Bot" width="450" />
</p>

<p align="center">
  <a href="https://whatsapp.com/channel/0029VbCzsfGKmCPSiZlGKC3S">
    <img src="https://img.shields.io/badge/WhatsApp-Channel-25D366?logo=whatsapp&logoColor=white&style=for-the-badge" alt="WhatsApp Channel" />
  </a>
  <a href="https://github.com/CodeWithTayyab96/Optimus-Bot/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-ISC-2E8B57?style=for-the-badge" alt="License: ISC" />
  </a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/node.js-22%2B-339933?logo=node.js&style=for-the-badge" alt="Node.js 22+" />
  </a>
  <a href="https://github.com/CodeWithTayyab96/Optimus-Bot">
    <img src="https://img.shields.io/badge/version-2.4.0-0078D4?style=for-the-badge" alt="Version: 2.4.0" />
  </a>
  <a href="https://github.com/GIScience/badges#active">
    <img src="https://img.shields.io/badge/status-active-2ECC71?style=for-the-badge" alt="Status: active" />
  </a>
</p>

Optimus Bot is a full-featured, self-hosted WhatsApp bot for community automation, group moderation, multi-provider AI chat and image generation, high-speed media downloads, productivity reminders and mini-games. Built on [Baileys](https://github.com/WhiskeySockets/Baileys), it streamlines group administration, keeps chats safe with automated protections, delivers rich multimedia utilities and organizes daily tasks seamlessly.

## Disclaimer

**IMPORTANT**: Optimus Bot is provided for educational and personal use purposes only.
Please ensure you:

- **Use responsibly**: Do not spam, harass or send unwanted automated messages to users
- **Respect privacy**: Handle user data with care and respect their privacy
- **No commercial use**: Optimus Bot is not intended for commercial use without proper authorization
- **Legal compliance**: Ensure your use complies with local laws, regulations and third-party terms of service

The developers are not responsible for any misuse of Optimus Bot or any consequences
arising from its use. Users are solely responsible for their actions and must
ensure they have proper consent before adding the bot to groups or sending
messages.

> [!CAUTION]
> WhatsApp may suspend or ban accounts that violate their terms of
> service. Use Optimus Bot at your own risk.

## Why Optimus Bot?

Optimus Bot combines extensive community management and automation capabilities into a single, cohesive bot experience:

- **Group & Community Moderation**: Powerful automated defenses including anti-link, anti-badword, anti-spam, anti-tag, anti-sticker, anti-hijack, warning strikes and ban systems
- **Multi-Provider AI Intelligence**: Fast conversational AI (Groq -> Gemini fallback), speech-to-text voice transcription (Whisper) and multi-engine image generation (Gemini -> Cloudflare Workers AI -> Pollinations)
- **High-Speed Media Downloads**: Download from YouTube, Spotify, TikTok, Instagram, Twitter/X, Facebook, Pinterest and MediaFire with automated PO-token supervision and optional WARP proxy tunneling
- **Full Productivity Suite**: Set relative, absolute and recurring reminders (`daily`, `weekly`), schedule automatic channel messages, snooze alerts, run polls and bookmark notes
- **Battery-Included Free APIs**: Instant weather forecasts, air quality index, sunrise/sunset times and Google News RSS headlines with **zero API keys required**
- **Modular & Extensible Architecture**: Over 230 commands organized into 12 distinct categories with dynamic loading and in-chat over-the-air (OTA) update support

## Features

### Technical Features

- **Resource Monitored & Stable**: Built-in RSS memory governor (`MAX_RSS_MB`) and garbage collection tuning to prevent leaks on constrained VPS hosts or panels
- **Resilient AI Fallback Chains**: Seamless failover for text chat (Groq -> Gemini) and text-to-image synthesis (Gemini -> Cloudflare -> Pollinations)
- **Supervised PO-Token Engine**: Integrated background supervisor (`potSupervisor`) manages `bgutil-ytdlp-pot-provider` locally on `127.0.0.1:4416` for reliable YouTube playback
- **Zero-Key Out-Of-The-Box Tools**: Instant weather, AQI and news powered by Open-Meteo and Google News RSS without external API keys or signup
- **Safe Credential Management**: Preconfigured `settings.js` ships with safe placeholders while sensitive tokens reside securely in gitignored `.env`
- **In-Chat Over-The-Air (OTA) Updates**: Update the bot directly from chat (`.update`), backing up and restoring all runtime data, configuration and warnings automatically
- **Bundled FFmpeg Support**: Uses `ffmpeg-static` out of the box with automatic fallbacks to system FFmpeg or custom `FFMPEG_PATH`

### Core Capabilities

- **Group Moderation**: `antibadword`, `antilink`, `antispam`, `antisticker`, `antitag`, `antihijack`, `warn`, `warnings`, `ban`, `unban`, `mute`, `unmute`, `kick`, `promote`, `demote`, `tagall`, `hidetag`, `groupmanage` and admin tools
- **AI & Vision Suite**: `.ai` / `.gpt` chat, `.imagine` / `.magicstudio` text-to-image generation, `.gptimage` image editing, `.stt` voice note transcription (with Roman Urdu/Hindi auto-conversion), `.summarize`, `.rewrite` and `.voicesummary`
- **Media & Downloader**: `.play` / `.song` / `.video` (YouTube), `.spotify`, `.tiktok`, `.instagram` / `.igs`, `.facebook`, `.twitter`, `.pinterest`, `.mediafire` and `.apk`
- **Productivity & Scheduling**: `.remind` (relative, absolute or recurring daily/weekly), `.schedule` (scheduled messages), `.snooze`, `.reminders`, `.poll`, `.pollresult`, `.save` and `.saved`
- **Utility & Daily Info**: `.weather`, `.aqi` (air quality), `.sun` (sunrise/sunset), `.news` (top headlines & topic search), `.calc`, `.qr` / `.readqr`, `.shorturl`, `.crypto`, `.currency`, `.imdb`, `.tmdb` and `.wiki`
- **Fun & Games**: Multiplayer Tic-Tac-Toe (`.ttt`), Hangman, Bomb game, Trivia, 8-ball, Coinflip, Dice, Jokes, Memes, Roasts, Compliments and Shayari
- **Maker & Stickers**: Image/video-to-sticker conversion (`.sticker`), crop tools (`.stickercrop`), text-to-sticker (`.attp`), sticker packs (`.take`) and styled text generator (`.textmaker` with 19+ fonts)
- **Owner & Administration**: Mode toggling (`.mode public`/`.mode private`), broadcast messaging, AFK status, anti-call, anti-delete, auto-read, auto-typing, download health monitoring (`.dlstatus`), YouTube diagnostics (`.ytdiag`) and OTA updater (`.update`)

## Prerequisites

Install the following before running Optimus Bot:

Optimus Bot includes `ffmpeg-static` as a dependency, but a system-wide FFmpeg and Python are recommended for full media and voice capabilities.

### Windows

- [Node.js & npm](https://nodejs.org/) (Version 22 LTS recommended, Node.js ≥ 20 required)
- [Python & pip](https://www.python.org/downloads/) (Python ≥ 3.8 for yt-dlp & bgutil PO-token provider)
- [Git](https://git-scm.com/download/win)
- Windows Terminal or PowerShell

### macOS

- [Node.js & npm](https://nodejs.org/) (Download installer or via Homebrew: `brew install node`)
- [Python & pip](https://www.python.org/) (`brew install python`)
- [Git](https://git-scm.com/download/mac) (`brew install git`)
- [FFmpeg](https://ffmpeg.org/) (optional system install: `brew install ffmpeg`)
- Terminal app

### Linux

- [Node.js & npm](https://nodejs.org/en/download) (Version 22 LTS recommended)
- [Python & pip](https://www.python.org/) (`sudo apt install python3 python3-pip`)
- [Git](https://git-scm.com/install/linux) (`sudo apt install git`)
- [FFmpeg](https://ffmpeg.org/) (`sudo apt install ffmpeg`)
- Terminal app

**Verify your installation:**

```bash
node --version       # should be >= 20.0.0 (22+ recommended)
npm --version
python3 --version    # should be >= 3.8
git --version
```

## Media & YouTube Download Setup

Optimus Bot includes an enterprise-grade download stack to bypass YouTube bot blocks and datacenter IP rate limits.

The bot relies on two supervised components:
1. **yt-dlp**: High-performance audio/video extraction tool
2. **bgutil PO-Token Provider**: Local HTTP server on `127.0.0.1:4416` supervised by `lib/potSupervisor.js` that mints Proof-of-Origin (PO) tokens

### One-Command Setup with Bootstrap

Instead of manually cloning and compiling the PO-token provider, run `bootstrap.js`. It checks dependencies, installs the PO token provider, pip-installs yt-dlp and launches the bot:

```bash
node bootstrap.js
```

Additional bootstrap flags:
```bash
node bootstrap.js --deps-only    # install missing components and exit
node bootstrap.js --check        # verify requirements without modifying files
node bootstrap.js --no-provider  # skip the PO token provider build
node bootstrap.js --no-python    # skip python / yt-dlp installation
```

### IP-Blocked Datacenter / VPS Hosts

If your host or VPS IP is flagged by YouTube ("Sign in to confirm you're not a bot"), run `.ytdiag` from chat. Optimus Bot supports two bypass mechanisms in `.env`:

1. **Free Cloudflare WARP Tunnel**: Enable `WARP=1` in `.env`. Optimus downloads the userspace `usque` binary and routes media requests through Cloudflare's clean egress IPs (no root required; works inside Pterodactyl containers).
2. **Proxy Pool**: Add residential or mobile proxies to `PROXIES=` in `.env` (format: `http://user:pass@host:port,socks5://host:port`).

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/CodeWithTayyab96/Optimus-Bot.git
cd Optimus-Bot
```

### 2. Install dependencies

```bash
# Recommended: automatic dependency & PO-token bootstrap
node bootstrap.js --deps-only

# Or standard npm install
npm install
```

### 3. Configure environment

Copy the example environment file:

```bash
# Linux and macOS
cp .env.example .env

# Windows PowerShell
copy .env.example .env
```

Edit `.env` with your API keys. Every key is optional — the bot boots without them and only commands requiring that specific key will be disabled:

```env
# AI Providers
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# Image Generation Fallback (Cloudflare Workers AI)
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token

# Optional Service Keys
GIPHY_API_KEY=your_giphy_api_key
OMDB_API_KEY=your_omdb_api_key
TENOR_API_KEY=your_tenor_api_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
```

Basic bot behavior (bot name, owner number, prefix) is defined in [settings.js](settings.js).

### 4. Run Optimus Bot

```bash
npm start
```

*(Or `node bootstrap.js` to ensure dependencies and the PO-token provider are always updated before boot).*

### 5. Connect WhatsApp

- On initial startup, Optimus will prompt for your phone number if not configured in `settings.js`
- Enter your phone number with the country code and without `+` or spaces (e.g., `923701609799`)
- Optimus will display an 8-character pairing code in your terminal
- On your phone, open **WhatsApp -> Linked Devices -> Link a Device -> Link with phone number instead**
- Enter the pairing code displayed in the terminal
- Once paired, authentication credentials are saved locally in `session/` and future starts reconnect automatically

## Configuration

Optimus Bot uses a dual-layer configuration: non-secret settings in [settings.js](settings.js) and secret credentials in `.env`.

### Environment Variables (`.env`)

| Variable | Description | Default |
|---|---|---|
| `GROQ_API_KEY` | Primary text chat (.ai) & Whisper STT (.stt) | *(empty)* |
| `GEMINI_API_KEY` | Fallback text chat & primary image generation (.imagine) | *(empty)* |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID for image generation fallback | *(empty)* |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for Workers AI | *(empty)* |
| `HORDE_API_KEY` | AI Horde key for crowd-sourced image generation | *(ten zeros anonymous key)* |
| `OPENAI_API_KEY` | OpenAI-compatible endpoint key | *(empty)* |
| `OPENAI_BASE_URL` | Base URL for OpenAI-compatible chat API | `https://api.openai.com/v1` |
| `GIPHY_API_KEY` | Giphy key for `.gif` searches | *(empty)* |
| `OMDB_API_KEY` | OMDb key for `.imdb` movie lookups | *(empty)* |
| `TENOR_API_KEY` | Tenor key for `.emojimix` stickers | *(empty)* |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for `.stickertelegram` imports | *(empty)* |
| `PROXIES` | Comma-separated HTTP/SOCKS5 proxy pool for media downloads | *(empty)* |
| `WARP` | Set to `1` to run local Cloudflare WARP proxy for YouTube | `0` |
| `MAX_RSS_MB` | Memory ceiling in MB before graceful process restart | `600` |
| `POT_PROVIDER_PORT` | Port for the local PO-token provider server | `4416` |

### Core Bot Settings (`settings.js`)

Edit [settings.js](settings.js) to customize bot identity and behaviors:

| Setting | Description | Default |
|---|---|---|
| `prefix` | Primary command prefix | `.` |
| `botName` | Name of the bot | `Optimus Bot` |
| `botOwner` | Owner's display name | `Muhammad Tayyab Imran` |
| `ownerNumber` | Owner's phone number without `+` | `923701609799` |
| `commandMode` | Default command mode (`public` or `private`) | `public` |
| `newsletterJid` | Newsletter / channel JID for forwarded context links | `120363424568988623@newsletter` |
| `newsletterName` | Newsletter / channel display name | `Optimus Bot` |
| `channelLink` | Official WhatsApp channel invite link | [WhatsApp Channel](https://whatsapp.com/channel/0029VbCzsfGKmCPSiZlGKC3S) |

> [!WARNING]
> [settings.js](settings.js) is tracked in git. Never paste private API keys directly into `settings.js`. Store secrets in `.env`.

## Connection & State Management

### Reconnection & Resilience

- **Socket Lifecycle**: Optimus Bot listens for Baileys connection updates and handles reconnects automatically with exponential backoff
- **Session Durability**: Multi-device credentials are stored in `session/`. Never share or commit this folder
- **Graceful Memory Restarts**: Node's Resident Set Size (RSS) is sampled every 30 seconds. If memory exceeds `MAX_RSS_MB` (default: 600 MB), Optimus restarts cleanly to prevent unhandled out-of-memory crashes
- **Runtime State Persistence**: Warning strikes, group bans, user levels, AFK statuses, scheduled reminders and saved messages are persistently recorded in JSON stores under `data/`

### In-Chat Over-The-Air (OTA) Updates

Optimus Bot includes a self-updating system accessible by the bot owner:

```text
.update check    # Dry run: check remote GitHub repository for new commits
.update          # Pull latest code, backup state, restore data and restart
```

During `.update`, Optimus preserves `data/`, `settings.js` and `baileys_store.json` across revisions so settings, warnings and schedules are never lost.

## Project Structure

```
Optimus-Bot/
├── index.js                  # Entry point — pairing, socket lifecycle and memory watcher
├── bootstrap.js              # Idempotent dependency & PO-token environment bootstrapper
├── main.js                   # Primary message router, dispatch pipeline and group guards
├── settings.js               # Bot configuration & default options
├── .env.example              # Blueprint for sensitive environment variables
├── commands/                 # Command implementations grouped by category
│   ├── admin/                # Group administration, moderation, anti-spam & anti-link (51 commands)
│   ├── ai/                   # Conversational AI, Whisper speech-to-text and image generation (11 commands)
│   ├── anime/                # Anime lookups, waifu, manga and trace searches (6 commands)
│   ├── fun/                  # Games (Tic-Tac-Toe, Hangman, Bomb), jokes, memes & trivia (39 commands)
│   ├── general/              # Core utilities, help menu, ping, staff and sticker tools (37 commands)
│   ├── group/                # Group-specific utilities (save contact, etc.)
│   ├── islamic/              # Islamic utilities & Quran recitation
│   ├── media/                # Downloaders (YouTube, Spotify, TikTok, IG, FB, X, etc.) (26 commands)
│   ├── owner/                # Administrative controls, modes, updates and diagnostics (29 commands)
│   ├── productivity/         # Reminders, scheduled messages, polls and notes (10 commands)
│   ├── textmaker/            # Styled text generator (19+ font styles)
│   └── utility/              # Weather, AQI, sun, news, calc, QR, finance & lookup tools (30 commands)
├── lib/                      # Core modular subsystems and services
│   ├── ai.js                 # Unified AI client with automatic failover (Groq ↔ Gemini)
│   ├── aiConfig.js           # Centralized AI model definitions
│   ├── imageGeneration.js    # Image provider pipeline (Gemini -> Cloudflare -> Pollinations)
│   ├── messageStyle.js       # Standardized response box and banner formatting
│   ├── messageConfig.js      # Newsletter context and channel metadata
│   ├── potSupervisor.js      # Supervisor for the local bgutil PO-token provider server
│   ├── ytdlp.js              # Wrapper for yt-dlp media extraction with proxy routing
│   ├── dlHealth.js           # Media download health monitoring and alerting
│   ├── weatherApi.js         # Keyless Open-Meteo weather and air quality client
│   ├── news.js               # Keyless Google News RSS parser
│   └── productivity/         # Scheduler engine, relative/recurring parser and data stores
├── scripts/                  # Pairing utilities, test runners and smoke tests
├── data/                     # Persistent JSON runtime databases (gitignored)
└── session/                  # WhatsApp multi-device authentication credentials (gitignored)
```

## Command Overview

Optimus Bot features **230+ commands** across 12 categories. The dynamic menu can be accessed anytime via `.menu` or `.help`.

### Admin & Group Moderation (51 commands)
- **Security & Protections**: `.antilink`, `.antibadword`, `.antispam`, `.antisticker`, `.antitag`, `.antigroupmention`, `.antigroupstatus`, `.antihijack`, `.protect`
- **Member Management**: `.kick`, `.add`, `.promote`, `.demote`, `.promoteall`, `.demoteall`, `.kickall`, `.kickadmin`, `.warn`, `.warnings`, `.resetwarn`, `.ban`, `.unban`
- **Group Settings**: `.mute`, `.unmute`, `.open`, `.close`, `.grouplink`, `.resetlink`, `.creategc`, `.groupmanage`, `.groupstatus`, `.tagall`, `.hidetag`, `.tag`, `.tagnotadmin`, `.pending`, `.approveall`, `.rejectall`, `.welcome`, `.goodbye`, `.chatbot`, `.autosticker`

### AI & Vision Suite (11 commands)
- **Chat & Reasoning**: `.ai` / `.gpt` (Groq gpt-oss-120b with Gemini fallback), `.openai`, `.study`, `.reply`
- **Voice Transcription**: `.stt` / `.totext` (Groq Whisper transcription with auto Roman Urdu/Hindi detection), `.voicesummary`
- **Image Generation & Editing**: `.imagine` / `.magicstudio` (multi-engine generation), `.gptimage` (AI image editing and manipulation)
- **Content Tools**: `.summarize` / `.tldr`, `.rewrite`

### Media & Downloaders (26 commands)
- **Audio & Video**: `.play` / `.song` (YouTube MP3 with metadata & thumbnail), `.video` (YouTube MP4 up to 1080p), `.ytsearch`
- **Social Media**: `.spotify`, `.tiktok`, `.instagram` / `.igs`, `.facebook`, `.twitter`, `.pinterest`, `.capcut`, `.threads`, `.soundcloud`, `.mediafire`, `.apk`
- **Converter Tools**: `.toaudio`, `.toptt`, `.tovideo`, `.toimg`, `.togif`, `.remini` (HD upscaling), `.removebg`, `.img-blur`, `.lyrics`

### Productivity & Scheduling (10 commands)
- **Smart Reminders**: `.remind <time> <task>` (supports relative: `10m`, absolute: `5pm`, tomorrow: `tomorrow 9am` and recurring: `daily 9am` or `weekly mon 9am`)
- **Management**: `.reminders` (list active), `.cancelreminder <id>`, `.snooze <id> <duration>`
- **Scheduled Messages**: `.schedule <time> <message>` (bot automatically broadcasts your message to the chat at the specified time)
- **Collaboration**: `.poll` (interactive multi-option poll), `.pollresult`, `.save` (save text/notes), `.saved` (view notes), `.unsave`

### Utility & Daily Tools (30 commands)
- **Free Keyless APIs**: `.weather <city>`, `.aqi <city>` (air quality index), `.sun <city>` (sunrise/sunset/solar noon), `.news [topic]` (Google News RSS), `.nameinfo <name>`
- **Calculators & Converters**: `.calc <expression>`, `.currency <amount> <from> <to>`, `.crypto <coin>`, `.color <hex>`
- **Search & Knowledge**: `.wiki <query>`, `.google <query>`, `.ddg <query>`, `.dictionary <word>`, `.define <word>`, `.imdb <movie>`, `.tmdb <show>`, `.book <title>`, `.sports`
- **QR & Code**: `.qr <text>` (generate QR code), `.readqr` (read QR from quoted image), `.shorturl <url>`, `.myip`

### Fun & Games (39 commands)
- **Games**: `.tictactoe` / `.ttt` (interactive 2-player game), `.hangman`, `.bomb`, `.trivia`, `.slot`, `.coinflip`, `.dice`, `.rps`
- **Social & Casual**: `.joke`, `.meme`, `.memesearch`, `.roast`, `.compliment`, `.flirt`, `.shayari`, `.motivate`, `.quote`, `.riddle`, `.8ball`, `.truth`, `.dare`, `.character`, `.ship`, `.gayrate`, `.simp`, `.wasted`

### General & Maker Tools (37 commands)
- **Bot Info**: `.ping` (latency & system uptime), `.alive`, `.uptime`, `.help` / `.menu`, `.owner`, `.staff`, `.settings`, `.groupinfo`, `.groupstats`, `.myactivity`, `.github`, `.githubstalk`
- **Stickers & Graphics**: `.sticker` (convert photo/video to sticker), `.stickercrop`, `.stickertelegram` (import public Telegram packs), `.take` (change pack metadata), `.emojimix`, `.attp`, `.simage`, `.ss` (webpage screenshot), `.tts`, `.translate`

### Owner Controls (29 commands)
- **Bot Administration**: `.mode <public|private>` (switch operating mode), `.setprefix <prefix>`, `.setbotname <name>`, `.setmenuimage`, `.setnewsletter`, `.setpp`, `.restart`, `.update` (OTA updater), `.status`
- **Automations**: `.autoread`, `.autotyping`, `.autostatus`, `.poststatus`, `.savestatus`, `.anticall`, `.antidelete`, `.areact`, `.pmblocker`, `.afk`
- **System Diagnostics**: `.aistatus` (inspect active AI models), `.dlstatus` (PO-token provider & yt-dlp status), `.ytdiag` (run complete YouTube network diagnostics), `.cleartmp`, `.clearsession`, `.broadcast`, `.sudo`, `.jid`

## Operating Modes

Optimus Bot supports dynamic operating modes configurable on the fly by the bot owner via `.mode`:

| Mode | Behavior |
|---|---|
| `public` | Responds to authorized commands in all group chats and private DMs (default) |
| `private` | Responds only in direct messages (DMs) with the owner; commands in groups are silently ignored |

The bot owner can switch modes at any time:
```text
.mode public     # Enable global public mode
.mode private    # Enable private mode (owner-only)
.status          # Check current mode and bot health
```

The selected mode is persisted in `data/mode.json` across bot restarts and updates.

## Development & Testing

### Running Tests

Optimus Bot includes comprehensive smoke tests and syntax verification covering all commands, routers and caching layers:

```bash
# Run complete test suite (syntax checks + 30+ smoke test suites)
npm test
```

### Adding a New Command

1. Create a new JavaScript file under the appropriate category in `commands/<category>/<name>.js`
2. Export the standard command definition:

```javascript
const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');

module.exports = {
    name: 'hello',
    aliases: ['hi', 'greet'],
    category: 'general',
    description: 'Greet the bot and check connectivity',
    usage: '.hello',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const responseText = style.box('GREETING', [
            `👋 Hello @${extra.sender.split('@')[0]}!`,
            `🤖 Optimus Bot is active and operational.`
        ]);

        await sock.sendMessage(extra.chatId, {
            text: responseText,
            mentions: [extra.sender],
            ...channelInfo
        }, { quoted: message });
    }
};
```

3. The command loader automatically detects and registers newly added files on startup.

## Deployment Options

### Process Supervision (PM2)

For production Linux and VPS environments, PM2 ensures the bot restarts automatically if the system reboots:

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Systemd (Linux Service)

Create `/etc/systemd/system/optimus.service`:

```ini
[Unit]
Description=Optimus WhatsApp Bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/Optimus-Bot
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable optimus
sudo systemctl start optimus
```

### Termux (Android)

Run Optimus Bot on an Android phone using Termux:

1. **Install Termux** from F-Droid
2. **Install core packages**:
   ```bash
   pkg update && pkg upgrade
   pkg install nodejs-lts python git ffmpeg
   ```
3. **Clone and install**:
   ```bash
   git clone https://github.com/CodeWithTayyab96/Optimus-Bot.git
   cd Optimus-Bot
   node bootstrap.js --deps-only
   ```
4. **Configure environment**:
   ```bash
   cp .env.example .env
   ```
5. **Acquire wake lock and start**:
   ```bash
   termux-wake-lock
   npm start
   ```

### Pterodactyl / Game Panels & Docker

Optimus Bot is optimized for panel hosting:
- Set startup command to: `node bootstrap.js`
- If the container lacks root or UDP access, enable `WARP=1` in `.env` to route media requests through local userspace WARP
- Built-in `ecosystem.config.js` and `Dockerfile` are included for custom container builds

## Troubleshooting

### Common Issues

**Bot doesn't respond to messages**
- Verify connection latency with `.ping`
- Confirm your prefix in `settings.js` (default: `.`)
- Check operating mode with `.status` (ensure the bot is in `public` mode)
- Ensure the bot has admin privileges in groups for moderation commands

**Pairing code does not appear or connection fails**
- Remove stale session files: `npm run reset-session` or delete the `session/` folder
- Ensure your phone number includes the international country code without `+` (e.g. `923701609799`)
- Confirm your server's outbound network can reach WhatsApp Web servers

**YouTube downloads fail ("Sign in to confirm you're not a bot")**
- Run `.ytdiag` in WhatsApp chat to inspect your host's network and player client status
- Ensure the PO-token provider is compiled and running (`.dlstatus`)
- On flagged datacenter IPs, enable `WARP=1` or configure `PROXIES=` in `.env`

**AI commands fail**
- Run `.aistatus` to inspect provider health
- Confirm `GROQ_API_KEY` or `GEMINI_API_KEY` are validly set in `.env`
- Image generation automatically falls back to Pollinations if keys are exhausted

## Security & Privacy

- **No Permanent Message Storage**: Optimus Bot processes incoming messages in real-time in memory and does not store conversation histories on disk
- **Isolated Credentials**: All API keys and tokens remain exclusively in gitignored `.env`
- **Role Enforcement**: Administrative and owner-level commands are validated at the dispatcher level before execution
- **Safe State Updates**: State files in `data/` are sanitized and preserved securely across updates

For vulnerability reporting or security inquiries, please review [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcomed! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on code style, testing requirements and submission processes:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Ensure all smoke tests pass (`npm test`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## Support & Links

- **WhatsApp Official Channel**: [Follow Channel](https://whatsapp.com/channel/0029VbCzsfGKmCPSiZlGKC3S)
- **YouTube Channel**: [@techhub-c6s](https://youtube.com/@techhub-c6s)
- **Issue Tracker**: [GitHub Issues](https://github.com/CodeWithTayyab96/Optimus-Bot/issues)

## License

This project is licensed under the [ISC License](LICENSE).
