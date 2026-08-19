# Changelog

All notable changes to Optimus Bot are documented here.

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
