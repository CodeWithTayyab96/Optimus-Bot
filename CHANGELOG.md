# Changelog

All notable changes to Optimus Bot are documented here.

## [Unreleased] — AI Provider Routing + Multi-Provider Image Generation

### Added
- **`lib/aiConfig.js`** — Centralized provider configuration (single source of truth for all model IDs)
- **`lib/imageGeneration.js`** — Image generation service with Gemini → Cloudflare → Pollinations fallback chain
- **`commands/owner/aistatus.js`** — Owner-only `.aistatus` command showing AI provider status
- **`__tests__/ai.test.js`** — 76 smoke tests covering config, image generation fallback chain, text providers, STT, aistatus command, malformed responses, HTTP errors, and provider isolation
- **Cloudflare Workers AI** as image fallback provider (`@cf/black-forest-labs/flux-1-schnell`)
- **Pollinations** as final image fallback provider (`flux`)
- **`settings.js`** fields: `cloudflareAccountId`, `cloudflareApiToken`

### Changed
- **`lib/ai.js`** — Updated to use `aiConfig` for all model IDs (removed hardcoded `llama-3.3-70b-versatile`, `gemini-2.0-flash`, `gemini-2.0-flash-exp`)
- **`lib/ai.js`** — Image generation delegated to `imageGeneration.js` service
- **`lib/imageGeneration.js`** — Gemini uses the new Interactions API (`/v1beta/interactions` with `x-goog-api-key` header) instead of the legacy `generateContent` endpoint
- **Groq text model** updated to `openai/gpt-oss-120b` (was `llama-3.3-70b-versatile`)
- **Gemini text model** updated to `gemini-2.5-flash` (was `gemini-2.0-flash`)
- **Gemini image model** updated to `gemini-3.1-flash-image` (was `gemini-2.0-flash-exp`)
- Image generation chain now: Gemini → Cloudflare → Pollinations (was: Pixazo → Gemini)

### Preserved
- All existing AI commands, aliases, permissions, prompts, and branding unchanged
- `generateImagePixazo()` function retained for backward compatibility (no longer in primary chain)
- All existing exports from `lib/ai.js` maintained: `chatGroq`, `chatGemini`, `chat`, `generateImage`, `generateImagePixazo`, `generateImageGemini`, `speechToText`

### Architecture
- **Provider specialization**: Each AI capability uses its optimal provider
- **Timeout safety**: Every provider has configurable timeouts (Gemini 60s, Cloudflare 60s, Pollinations 45s)
- **Graceful degradation**: Missing Cloudflare config falls through to Pollinations without breaking Gemini
- **No secret leakage**: `.aistatus` masks API keys, tests mock all providers

---

## [1.0.0] — Previous releases

See git history for earlier changes.
