/**
 * AI Model Configuration — single source of truth.
 *
 * Every model ID referenced by lib/ai.js and related consumers is defined here.
 * Environment variables may optionally override any value.
 * Missing / empty env vars fall back to the defaults below.
 */

const config = {
  groq: {
    chatModel:  process.env.GROQ_CHAT_MODEL  || 'openai/gpt-oss-120b',
    sttModel:   process.env.GROQ_SPEECH_MODEL || 'whisper-large-v3-turbo',
  },
  gemini: {
    chatModel:  process.env.GEMINI_CHAT_MODEL  || 'gemini-2.5-flash',
    imageModel: process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
  },
  pixazo: {
    imageModel: process.env.PIXAZO_IMAGE_MODEL || 'flux-1-schnell',
  },
};

module.exports = config;
