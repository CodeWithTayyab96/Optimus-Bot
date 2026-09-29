// ────────────────────────────────────────────────────────────
//  settings.js — COMMITTED to the repository.
//
//  ⚠️  DO NOT put real API keys in this file. Anything here is
//      published to GitHub, permanently, in the git history.
//
//  Real credentials belong in .env (which is gitignored) or in the
//  host's environment variables. Every key below resolves in this
//  order:  environment variable  →  the placeholder shown here.
//
//  So a fresh clone runs out of the box, and the real keys stay
//  private. See .env.example for the list of variables.
// ────────────────────────────────────────────────────────────

// Load environment variables (.env) so credentials can be supplied via the
// environment rather than being hard-coded. Safe no-op when no .env is present
// and when the relevant vars are already set in the shell.
require('dotenv').config();

const settings = {
  prefix: '.', // Command prefix — change this and every command responds to the new prefix
  packname: 'Optimus Bot',
  author: 'Muhammad Tayyab Imran',
  botName: 'Optimus Bot',
  botOwner: 'Muhammad Tayyab Imran', // Your name
  ownerNumber: '923701609799', // Set your number here without + symbol (country code + number, no spaces)
  // The number the BOT itself runs on — used when linking/pairing.
  // Leave blank to fall back to ownerNumber, but note they are often DIFFERENT
  // accounts: ownerNumber is who COMMANDS the bot, botNumber is who the bot IS.
  // Pairing with the wrong one links the wrong WhatsApp account.
  botNumber: '', // e.g. '923417360554' — no + or spaces

  // ── API keys (placeholders — real values come from .env) ──
  giphyApiKey: process.env.GIPHY_API_KEY || 'YOUR_GIPHY_API_KEY',
  groqApiKey: process.env.GROQ_API_KEY || 'YOUR_GROQ_API_KEY',
  geminiApiKey: process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY',
  pixazoApiKey: process.env.PIXAZO_API_KEY || 'YOUR_PIXAZO_API_KEY',
  // Cloudflare Workers AI (image fallback #1)
  // Get credentials from: https://dash.cloudflare.com → Workers AI → Use REST API
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || 'YOUR_CLOUDFLARE_ACCOUNT_ID',
  cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN || 'YOUR_CLOUDFLARE_API_TOKEN',
  // OpenAI-Compatible chat provider (OpenAI, OpenRouter, Together, Groq-compatible,
  // or any local LLM that exposes /chat/completions).
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  openaiApiKey:  process.env.OPENAI_API_KEY  || 'YOUR_OPENAI_API_KEY',
  openaiModel:   process.env.OPENAI_MODEL    || 'gpt-4o-mini',
  // Model used for OpenAI-compatible image editing (.gptimage fallback).
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
  // TMDB (The Movie Database) key for .tmdb — free at
  // https://www.themoviedb.org/settings/api
  tmdbApiKey: process.env.TMDB_API_KEY || 'YOUR_TMDB_API_KEY',
  // OMDb API key for .imdb command
  // Get your free key from: https://www.omdbapi.com/apikey.aspx
  omdbApiKey: process.env.OMDB_API_KEY || 'YOUR_OMDB_API_KEY',
  // Tenor (Google) API key for .emojimix
  tenorApiKey: process.env.TENOR_API_KEY || 'YOUR_TENOR_API_KEY',
  // Telegram bot token for .stickertelegram (read-only use: getStickerSet /
  // getFile on public packs). Create your own with @BotFather.
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN',

  // ── Outbound proxy pool for the media/download commands ───
  // Comma-separated proxy URLs (http://user:pass@host:port or socks5://host:port).
  // Leave empty/unset for a direct connection (no proxy) — the default.
  proxies: (process.env.PROXIES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // ── Bot behaviour ─────────────────────────────────────────
  commandMode: 'public',
  maxStoreMessages: 20,
  storeWriteInterval: 10000,
  description: 'Optimus Bot — a WhatsApp bot for group management and automation.',
  version: '1.0.0',

  // ── Channel & social links shown in help / alive / startup banner ──
  channelLink: 'https://whatsapp.com/channel/0029VbCzsfGKmCPSiZlGKC3S',
  youtubeChannel: 'https://youtube.com/@techhub-c6s',
  githubRepo: 'https://github.com/CodeWithTayyab96/Optimus-Bot',
  // Newsletter context shown when the bot quotes/forwards messages.
  // Replace newsletterJid with your own channel's JID (format: 120363XXXXXXXXX@newsletter)
  // if you want messages to link back to your channel.
  newsletterJid: '120363424568988623@newsletter',
  newsletterName: 'Optimus Bot',
  updateZipUrl: 'https://github.com/CodeWithTayyab96/Optimus-Bot/archive/refs/heads/main.zip',

  // ── Optional external pairing-code service ────────────────
  // Leave as null to disable the command (recommended unless you host your own service).
  pairCodeService: null,
};

module.exports = settings;
