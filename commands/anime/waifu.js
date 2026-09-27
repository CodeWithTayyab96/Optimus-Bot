const { postJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

// AniList — free, no key. Returns a random popular character's artwork.
const QUERY = `query ($p: Int) {
  Page(page: $p, perPage: 1) {
    characters(sort: FAVOURITES_DESC) {
      name { full }
      image { large }
    }
  }
}`;

module.exports = {
    name: 'waifu',
    aliases: ['neko'],
    category: 'anime',
    description: 'Get a random popular anime character image',
    usage: '.waifu',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            await sock.sendMessage(extra.chatId, { react: { text: '🌸', key: message.key } });

            const page = Math.floor(Math.random() * 50) + 1;
            const data = await postJson('https://graphql.anilist.co', { query: QUERY, variables: { p: page } });
            const character = data && data.data && data.data.Page && data.data.Page.characters && data.data.Page.characters[0];

            if (!character || !character.image || !character.image.large) {
                return await extra.reply(style.error('Could not fetch an image right now. Please try again.'));
            }

            await sock.sendMessage(extra.chatId, {
                image: { url: character.image.large },
                caption: `🌸 *${character.name?.full || 'Anime character'}*`
            }, { quoted: message });
        } catch (error) {
            console.error('[waifu] error:', error.message);
            return await extra.reply(style.error('Could not fetch an image right now. Please try again.'));
        }
    },
};
