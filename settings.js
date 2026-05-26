const settings = {
  packname: 'Optimus Bot',
  author: 'Tayyab',
  botName: 'Optimus Bot',
  botOwner: 'Tayyab', // Your name
  ownerNumber: '923701609799', // Set your number here without + symbol (country code + number, no spaces)
  giphyApiKey: 'qnl7ssQChTdPjsKta2Ax2LMaGXz303tq',
  // AI provider API keys
  groqApiKey: '',
  geminiApiKey: '',
  pixazoApiKey: '',
  commandMode: 'public',
  maxStoreMessages: 20,
  storeWriteInterval: 10000,
  description: 'Optimus Bot — a WhatsApp bot for group management and automation.',
  version: '1.0.0',
  // Channel & social links shown in help / alive / startup banner
  channelLink: 'https://whatsapp.com/channel/0029VbCzsfGKmCPSiZlGKC3S',
  youtubeChannel: 'https://youtube.com/@techhub-c6s',
  githubRepo: 'https://github.com/CodeWithTayyab96/Optimus-Bot',
  // Newsletter context shown when the bot quotes/forwards messages.
  // Replace newsletterJid with your own channel's JID (format: 120363XXXXXXXXX@newsletter)
  // if you want messages to link back to your channel.
  newsletterJid: '120363000000000000@newsletter',
  newsletterName: 'Optimus Bot',
  updateZipUrl: 'https://github.com/CodeWithTayyab96/Optimus-Bot/archive/refs/heads/main.zip',
  // Optional external pairing-code service endpoint used by the .pair command.
  // Leave as null to disable the command (recommended unless you host your own service).
  pairCodeService: null,
};

module.exports = settings;
