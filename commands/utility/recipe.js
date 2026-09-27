/**
 * Optimus Bot — .recipe
 * Look up a recipe by name.
 *
 * Provider: TheMealDB (free tier, no API key required).
 * Behaviour ported from Shadow MD (`drenox.js:12381`), re-implemented with
 * Optimus message styling. `.recipe` with no query returns a random recipe.
 */
const axios = require('axios');
const style = require('../../lib/messageStyle');

const TIMEOUT = 12000;
const SEARCH = 'https://www.themealdb.com/api/json/v1/1/search.php?s=';
const RANDOM = 'https://www.themealdb.com/api/json/v1/1/random.php';

const MAX_INGREDIENTS = 20;
const INSTRUCTION_LIMIT = 600;

/**
 * Extracts the ingredient/measure pairs TheMealDB stores as
 * strIngredient1..20 / strMeasure1..20.
 */
function collectIngredients(meal) {
    const items = [];
    for (let i = 1; i <= MAX_INGREDIENTS; i++) {
        const name = (meal[`strIngredient${i}`] || '').trim();
        const measure = (meal[`strMeasure${i}`] || '').trim();
        if (name) items.push(measure ? `${measure} ${name}` : name);
    }
    return items;
}

/** Exported for unit testing without network access. */
function formatMeal(meal) {
    if (!meal) return null;

    const lines = [];
    lines.push(`🍽️ *${meal.strMeal}*`);
    const meta = [meal.strCategory, meal.strArea].filter(Boolean).join(' • ');
    if (meta) lines.push(meta);
    lines.push('');

    const ingredients = collectIngredients(meal);
    if (ingredients.length) {
        lines.push('*Ingredients*');
        ingredients.slice(0, 20).forEach(i => lines.push(` • ${i}`));
        lines.push('');
    }

    const steps = (meal.strInstructions || '').replace(/\r\n/g, '\n').trim();
    if (steps) {
        lines.push('*Instructions*');
        lines.push(steps.length > INSTRUCTION_LIMIT
            ? steps.slice(0, INSTRUCTION_LIMIT) + '...'
            : steps);
        lines.push('');
    }

    if (meal.strYoutube) lines.push(`▶️ ${meal.strYoutube}`);
    if (meal.strSource) lines.push(`🔗 ${meal.strSource}`);

    return lines;
}

async function recipeCommand(sock, chatId, message, query) {
    try {
        const term = String(query || '').trim();

        await sock.sendMessage(chatId, {
            text: style.processing(term ? `Searching recipes for "${term}"` : 'Fetching a random recipe')
        }, { quoted: message });

        const url = term ? SEARCH + encodeURIComponent(term) : RANDOM;
        const res = await axios.get(url, { timeout: TIMEOUT });

        const meals = res.data?.meals;
        // TheMealDB returns null (search miss) or the string "no data found".
        if (!meals || !Array.isArray(meals) || meals.length === 0) {
            return sock.sendMessage(chatId, {
                text: style.notFound(`No recipe found for "${term}"`)
            }, { quoted: message });
        }

        const lines = formatMeal(meals[0]);
        if (!lines) {
            return sock.sendMessage(chatId, {
                text: style.notFound(`No recipe found for "${term}"`)
            }, { quoted: message });
        }

        if (meals[0].strMealThumb) {
            await sock.sendMessage(chatId, {
                image: { url: meals[0].strMealThumb },
                caption: style.box('👨‍🍳 RECIPE', lines)
            }, { quoted: message });
            return undefined;
        }

        return sock.sendMessage(chatId, {
            text: style.box('👨‍🍳 RECIPE', lines)
        }, { quoted: message });
    } catch (error) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            return sock.sendMessage(chatId, {
                text: style.error('The recipe service timed out. Please try again.')
            }, { quoted: message });
        }
        console.error('[recipe] Error:', error.message);
        return sock.sendMessage(chatId, {
            text: style.error('Could not reach the recipe service. Please try again.')
        }, { quoted: message });
    }
}

module.exports = {
    name: 'recipe',
    aliases: ['meal', 'cook'],
    category: 'utility',
    description: 'Look up a recipe (or get a random one)',
    usage: '.recipe <dish>   |   .recipe   (random)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await recipeCommand(sock, extra.chatId, message, args.join(' '));
    },
    recipeCommand,
    formatMeal,
    collectIngredients,
};
