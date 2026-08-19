/**
 * AI Model Configuration — single source of truth.
 *
 * Every model ID referenced by lib/ai.js and related consumers is defined here.
 * Edit this file directly to change models.
 */

const config = {
  groq: {
    chatModel: 'openai/gpt-oss-120b',
    sttModel: 'whisper-large-v3-turbo',
  },
  gemini: {
    chatModel: 'gemini-2.5-flash',
    imageModel: 'gemini-3.1-flash-image',
  },
  pixazo: {
    imageModel: 'flux-1-schnell',
  },
};

module.exports = config;
