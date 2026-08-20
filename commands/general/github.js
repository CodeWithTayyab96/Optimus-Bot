const moment = require('moment-timezone');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const settings = require('../../settings');
const style = require('../../lib/messageStyle');


async function githubCommand(sock, chatId, message) {
  try {
    const repoUrl = settings.githubRepo || 'https://github.com/CodeWithTayyab96/Optimus-Bot';
    const apiUrl = repoUrl
      .replace('https://github.com/', 'https://api.github.com/repos/')
      .replace(/\/$/, '');
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error('Error fetching repository data');
    const json = await res.json();

    const txt = style.box('🐙 GITHUB REPO', [
        `✩ Name: ${json.name}`,
        `✩ Stars: ${json.stargazers_count}`,
        `✩ Forks: ${json.forks_count}`,
        `✩ Watchers: ${json.watchers_count}`,
        `✩ Size: ${(json.size / 1024).toFixed(2)} MB`,
        `✩ Last Updated: ${moment(json.updated_at).format('DD/MM/YY - HH:mm:ss')}`,
        '',
        `🔗 ${json.html_url}`,
        '',
        `⚡ ${settings.botName || 'Optimus Bot'}`
    ]);

    // Use the local asset image
    const imgPath = path.join(__dirname, '../../assets/bot_image.jpg');
    const imgBuffer = fs.readFileSync(imgPath);

    await sock.sendMessage(chatId, { image: imgBuffer, caption: txt }, { quoted: message });
  } catch (error) {
    await sock.sendMessage(chatId, { text: '❌ Error fetching repository information.' }, { quoted: message });
  }
}

module.exports = {
    name: 'github',
    aliases: ['git', 'sc', 'script', 'repo'],
    category: 'general',
    description: 'Get the bot repository link',
    usage: '.github',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await githubCommand(sock, extra.chatId, message);
    },

};