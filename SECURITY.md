# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Optimus Bot, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, contact the maintainer directly via:
- GitHub: [@CodeWithTayyab96](https://github.com/CodeWithTayyab96)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive a response within 72 hours.

## Sensitive Data — Never Commit

The following must **never** appear in version control:

| Data | Location | Why |
|------|----------|-----|
| WhatsApp session credentials | `session/creds.json` | Full account access |
| API keys (Groq, Gemini, Pixazo, etc.) | `settings.js` | Provider account abuse |
| Bot owner phone number | `settings.js` | Personal information |
| Giphy API key | `settings.js` | Third-party account |
| Newsletter JID | `settings.js` | Channel identification |
| Telegram bot tokens | Source code | Full bot control |

**The `.gitignore` is configured to exclude `session/` and runtime state files. Verify this before pushing.**

## What the bot does NOT store

- Message content (no persistent chat logs)
- User phone numbers (beyond WhatsApp's own handling)
- Media files (temporary only, auto-cleaned)
- Database credentials (no external database)

## For Developers

If you are modifying the bot:

1. Never hardcode credentials in source files
2. Use `settings.js` for all secrets — do not use environment variables or `.env` files
3. The `.aistatus` command shows only model IDs — it never displays API keys
4. Test commands with placeholder API keys, not real ones
5. Review `git diff` before committing to ensure no secrets are staged

## Dependency Security

Run `npm audit` periodically. The project depends on:
- `@whiskeysockets/baileys` — WhatsApp Web API client
- Various media processing libraries (sharp, ffmpeg, etc.)

Keep dependencies updated, but test thoroughly before upgrading.
