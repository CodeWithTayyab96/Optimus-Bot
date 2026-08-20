# Contributing to Optimus Bot

Thanks for your interest in contributing! This guide explains the project conventions and how to add new features safely.

## Development Setup

```bash
git clone https://github.com/CodeWithTayyab96/Optimus-Bot.git
cd Optimus-Bot
npm install
node index.js        # First run — enter pairing code
npm test             # Run all smoke tests
```

**Requirements:** Node.js ≥ 18, FFmpeg in PATH.

**Configuration:** Copy `settings.example.js` to `settings.js` (if it exists) or edit `settings.js` directly with your own API keys and owner number. **Never commit real credentials.**

## Project Structure

```
commands/<category>/<name>.js   — One file per command
lib/<module>.js                 — Shared libraries and helpers
scripts/smoke-*.js              — Test suites
settings.js                     — Bot configuration
main.js                         — Message handler and dispatch
index.js                        — Entry point / session bootstrap
```

## Adding a New Command

Create a file in `commands/<category>/` following this template:

```js
const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');

module.exports = {
    name: 'mycommand',
    aliases: ['mc', 'mycmd'],
    category: 'general',          // admin | ai | fun | general | media | owner | utility
    description: 'Short description',
    usage: '.mycommand <args>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        // extra.chatId   — target chat JID
        // extra.commandName — resolved command name or alias
        // extra.prefix   — current prefix (e.g. '.')
        // extra.reply(text) — convenience wrapper

        await sock.sendMessage(extra.chatId, {
            text: style.box('LABEL', ['Line 1', 'Line 2']),
            ...channelInfo,
        }, { quoted: message });
    },
};
```

### Key rules

- **One command per file.** The loader auto-discovers all `.js` files in `commands/*/`.
- **No duplicate names or aliases.** The loader warns and skips duplicates.
- **Use `lib/messageStyle.js`** for all user-facing text formatting.
- **Use `channelInfo`** from `lib/messageConfig.js` for consistent contextInfo.
- **Never hardcode bot names.** Use `settings.botName`.
- **Never commit API keys or credentials.** `settings.js` contains your personal keys — do not push it with real values.
- **Mark permissions accurately.** `ownerOnly`, `adminOnly`, etc. are enforced at dispatch.

## Conventions

### Visual formatting

Use the shared style helpers instead of raw text:

```js
style.box('HEADER', ['content lines'])     // Boxed section
style.success('Done!')                     // Success message
style.error('Something went wrong')        // Error message
style.processing('Working...')             // Processing state
style.invalidInput('Bad input', 'Usage: .cmd <arg>')  // Invalid input
style.permissionDenied('owner')            // Permission denied
```

### AI commands

Place in `commands/ai/`. Use the centralized AI client:

```js
const { chat, chatGemini, generateImage, speechToText } = require('../../lib/ai');
```

Model IDs are in `lib/aiConfig.js` — do not hardcode them.

### Testing

After adding a command:

1. Run `npm test` — all 24 suites must pass
2. The command should appear in `help` output automatically
3. Add a smoke test in `scripts/` if the command has complex behavior

## Credentials and configuration

All API keys and user-configurable credentials live in **`settings.js`**. Edit that file directly:

- `groqApiKey` — Groq API key
- `geminiApiKey` — Google Gemini API key
- `pixazoApiKey` — Pixazo API key
- `ownerNumber` — Your WhatsApp number
- `giphyApiKey` — Giphy API key

AI model IDs are in **`lib/aiConfig.js`** (not secrets — safe to commit).

**Do not create `.env` files or use environment variables for credentials.** The project architecture uses `settings.js` as the single configuration file.

## Safe modification rules

**Do NOT change:**

- Command names or aliases (users may have workflows)
- Permission flags on existing commands
- AI prompts or system prompts
- Provider endpoints or authentication
- Game logic or state management
- Media payload formats

**Safe to change:**

- UI/formatting within `lib/messageStyle.js` patterns
- Error messages shown to users
- Bot branding (via `settings.botName`)
- Model IDs in `lib/aiConfig.js`
- Documentation
- Test coverage

## Running tests

```bash
npm test                # Full suite (24 tests)
node scripts/smoke-cache.js       # Cache-specific tests
node scripts/smoke-models.js      # AI model availability
node scripts/smoke-ai-config.js   # AI config structure
```

## Questions?

Open an issue on [GitHub](https://github.com/CodeWithTayyab96/Optimus-Bot/issues).
