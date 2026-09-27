// ────────────────────────────────────────────────────────────
//  settings.example.js — copy this file to settings.js and fill
//  in your own values.  NEVER commit your real settings.js.
//
//  cp settings.example.js settings.js   (or: copy /Y)
// ────────────────────────────────────────────────────────────
//
// Environment variables (.env) take priority over the values
// below.  You can supply API keys either way — through the
// environment or by editing the placeholders in settings.js.

require('dotenv').config();

const settings = {
  prefix: '.', // Command prefix — change this and every command responds to the new prefix
  packname: 'Optimus Bot',
  author: 'Your Name',
  botName: 'Optimus Bot',
  botOwner: 'Your Name',
  ownerNumber: '1234567890', // Your WhatsApp number (country code + number, no + or spaces)

  // ── API keys ──────────────────────────────────────────────
  giphyApiKey: 'YOUR_GIPHY_API_KEY',
  groqApiKey: process.env.GROQ_API_KEY || 'YOUR_GROQ_API_KEY',
  geminiApiKey: process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY',
  pixazoApiKey: 'YOUR_PIXAZO_API_KEY',
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || 'YOUR_CLOUDFLARE_ACCOUNT_ID',
  cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN || 'YOUR_CLOUDFLARE_API_TOKEN',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  openaiApiKey:  process.env.OPENAI_API_KEY  || 'YOUR_OPENAI_API_KEY',
  openaiModel:   process.env.OPENAI_MODEL    || 'gpt-4o-mini',
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
  tmdbApiKey: process.env.TMDB_API_KEY || 'YOUR_TMDB_API_KEY',
  omdbApiKey: 'YOUR_OMDB_API_KEY',

  // ── Proxy pool (optional) ─────────────────────────────────
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

  // ── Channel & social links ────────────────────────────────
  channelLink: 'https://whatsapp.com/channel/YOUR_CHANNEL',
  youtubeChannel: 'https://youtube.com/@your-channel',
  githubRepo: 'https://github.com/CodeWithTayyab96/Optimus-Bot',
  newsletterJid: '120363XXXXXXXXX@newsletter',
  newsletterName: 'Optimus Bot',
  updateZipUrl: 'https://github.com/CodeWithTayyab96/Optimus-Bot/archive/refs/heads/main.zip',

  // ── Optional external pairing-code service ────────────────
  pairCodeService: null,
};

module.exports = settings;
