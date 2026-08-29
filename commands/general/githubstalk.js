/**
 * Optimus Bot — .githubstalk
 * Look up a GitHub user's public profile.
 *
 * API: https://api.github.com/users/<username>
 * No API key required.
 */
const axios = require('axios');
const style = require('../../lib/messageStyle');

const TIMEOUT = 10000;

async function handleGithubstalkCommand(sock, chatId, message, userMessage) {
    try {
        const username = userMessage.trim().split(/\s+/).slice(1).join(' ').trim();
        if (!username) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput(
                    'Please provide a GitHub username.',
                    '.githubstalk <username>\n\nExample: .githubstalk torvalds'
                )
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: style.processing(`Looking up GitHub user "${username}"`)
        }, { quoted: message });

        const response = await axios.get(
            `https://api.github.com/users/${encodeURIComponent(username)}`,
            {
                timeout: TIMEOUT,
                headers: { 'Accept': 'application/vnd.github.v3+json' }
            }
        );

        const user = response.data;

        if (!user || !user.login) {
            return sock.sendMessage(chatId, {
                text: style.warning(`GitHub user "${username}" not found.`)
            }, { quoted: message });
        }

        const lines = [];

        lines.push(`👤 *${user.login}*`);
        if (user.name) lines.push(`📛 Name: ${user.name}`);
        if (user.bio) lines.push(`📝 Bio: ${user.bio}`);
        if (user.company) lines.push(`🏢 Company: ${user.company}`);
        if (user.location) lines.push(`📍 Location: ${user.location}`);
        if (user.blog) lines.push(`🌐 Blog: ${user.blog}`);
        if (user.email) lines.push(`📧 Email: ${user.email}`);
        lines.push('');
        lines.push(`📦 Public Repos: ${user.public_repos || 0}`);
        lines.push(`👥 Followers: ${user.followers || 0}`);
        lines.push(`👆 Following: ${user.following || 0}`);
        if (user.public_gists) lines.push(`📄 Public Gists: ${user.public_gists}`);
        if (user.created_at) {
            const date = new Date(user.created_at).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric'
            });
            lines.push(`📅 Joined: ${date}`);
        }
        lines.push(`🔗 ${user.html_url}`);

        await sock.sendMessage(chatId, {
            text: style.box('🐙 GitHub Profile', lines)
        }, { quoted: message });

    } catch (error) {
        if (error.response?.status === 404) {
            return sock.sendMessage(chatId, {
                text: style.warning(`GitHub user "${userMessage.trim().split(/\s+/).slice(1).join(' ').trim()}" not found.`)
            }, { quoted: message });
        }
        if (error.response?.status === 403) {
            return sock.sendMessage(chatId, {
                text: style.error('GitHub API rate limit exceeded. Please try again later.')
            }, { quoted: message });
        }
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            await sock.sendMessage(chatId, {
                text: style.error('Request timed out. Please try again.')
            }, { quoted: message });
        } else {
            console.error('[githubstalk] Error:', error);
            await sock.sendMessage(chatId, {
                text: style.error('Failed to look up GitHub user.')
            }, { quoted: message });
        }
    }
}

module.exports = {
    name: 'githubstalk',
    aliases: ['gitstalk', 'ghprofile', 'ghuser'],
    category: 'general',
    description: 'Look up a GitHub user profile',
    usage: '.githubstalk <username>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await handleGithubstalkCommand(sock, extra.chatId, message, extra.userMessage);
    },
};
