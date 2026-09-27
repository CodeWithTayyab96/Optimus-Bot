/**
 * funData — bundled, zero-cost content for fun commands.
 *
 * Replaces the AI text generation previously used by the personality / game
 * fun commands (insult, compliment, roast, flirt, shayari, motivate, truth,
 * dare, 8ball, riddle). No network, no API key, no AI call — just a curated
 * local dataset that the bot can pick from at random. This keeps these
 * commands free to run forever and removes the dependency on a chat model.
 *
 * Tone notes:
 *  - English content with a light Roman-Urdu mix to preserve the bot's
 *    original flavour (the AI versions mixed both naturally).
 *  - Shayari is written in Roman Urdu (Latin script), matching the original.
 *  - Game prompts (truth/dare/riddle) are kept juicy-but-safe for group use.
 *
 * Nothing here touches WhatsApp — callers pass the strings to sock.sendMessage.
 */

/** Pick a random element from an array. Throws if the array is empty. */
function pick(arr) {
    if (!Array.isArray(arr) || !arr.length) throw new Error('empty dataset');
    return arr[Math.floor(Math.random() * arr.length)];
}

/* ------------------------------------------------------------------ */
/* Insults — playful comedy-roast style, never truly hurtful            */
/* ------------------------------------------------------------------ */
const insults = [
    "you're like a software update — whenever I see you, I think 'not now'.",
    "tumhari personality itni plain hai, even a white wall feels threatened.",
    "if brains were electricity, you'd be running on a single AA battery.",
    "you bring nothing to the table except the chair.",
    "you're the human version of a loading spinner — all wait, no result.",
    "your comebacks are weaker than my phone signal in the elevator.",
    "bhai teri baatein sun ke lagta hai WiFi disconnect ho gaya.",
    "you have the charisma of a wet sock.",
    "you're like a cloud — when you disappear, everyone's day gets brighter.",
    "if Google had a 'useless results' filter, you'd be the top hit.",
    "you argue like you're trying to win an Oscar for best fictional story.",
    "your fashion sense called — it wants a divorce.",
    "you're the reason the 'undo' button was invented.",
    "tum itne slow ho, snail ne tumse racing challenge manga hai.",
    "you have a face for radio and a voice for text messages.",
    "you're like a broken pencil — pointless.",
    "your ideas are so outdated, even a floppy disk laughed.",
    "you bring the same energy as a 'reply with one word' group chat.",
    "you're the human equivalent of a participation trophy.",
    "if laziness was a sport, you'd still find a way to come last.",
];

/* ------------------------------------------------------------------ */
/* Compliments — warm, genuine, creative                              */
/* ------------------------------------------------------------------ */
const compliments = [
    "your vibe is honestly contagious — people light up when you walk in.",
    "tumhari baatein sun ke dil ko sukoon milta hai, you're genuinely calming.",
    "you have this rare kindness that makes people feel safe around you.",
    "your smile could charge a whole room's mood in one second.",
    "you're the kind of friend people write thank-you notes about.",
    "your mind is sharp — you notice things most people walk right past.",
    "you carry yourself with a quiet confidence that's really attractive.",
    "your laugh is the best notification I've ever received.",
    "you make hard days feel a little lighter just by being there.",
    "tum mein wo baat hai jo log dhoondte reh jaate hain.",
    "your creativity is next level — you see connections nobody else does.",
    "you're proof that being genuine is still the most magnetic thing.",
    "your energy after a long day is like a warm cup of chai.",
    "you listen like you actually care — and that's a rare superpower.",
    "you turn ordinary moments into memories people keep.",
    "your heart is as big as your dreams, and that's saying something.",
    "you inspire people without even trying to.",
    "you're the plot twist nobody saw coming — in the best way.",
];

/* ------------------------------------------------------------------ */
/* Roasts — savage but funny, 1-2 sentences                           */
/* ------------------------------------------------------------------ */
const roasts = [
    "You're so average, even your WiFi signal has more personality.",
    "You're like a cloud — when you disappear, everyone's day gets brighter.",
    "If confidence was a currency, you'd be in debt with no overdraft.",
    "You bring the same energy as a 'reply with one word' group chat.",
    "You're the human equivalent of a participation trophy.",
    "Your roasts are so weak, even a teddy bear would win the argument.",
    "You argue like you're trying to win an Oscar for best fictional story.",
    "You're the reason the 'undo' button was invented.",
    "If Google had a 'useless results' filter, you'd be the top hit.",
    "You have the charisma of a wet sock at a pool party.",
    "You're like a broken pencil — pointless, but at least you tried.",
    "Your fashion sense called — it wants a divorce and full custody of the style.",
    "You move so slow, a snail sent you a friend request for motivation.",
    "You're the human version of a loading spinner — all wait, no result.",
    "If brains were electricity, you'd be running on a single AA battery.",
    "You're like a white wall — present, but nobody notices.",
    "Your comebacks are weaker than my phone signal in the elevator.",
    "You're the plot twist nobody asked for and everybody skipped.",
];

/* ------------------------------------------------------------------ */
/* Flirt lines — cheesy / cute, not creepy                           */
/* ------------------------------------------------------------------ */
const flirts = [
    "Are you a magician? Because whenever I look at you, everyone else disappears.",
    "tumhari aankhon mein wo baat hai jo shabdon se keh na sakein.",
    "If you were a song, you'd be the one I never skip.",
    "Do you believe in love at first ping, or should I message you again?",
    "You must be tired, because you've been running through my notifications all day.",
    "Are you Wi-Fi? Because I'm feeling a strong connection.",
    "tum paas ho toh dil ki dhadkan aur tez ho jaati hai.",
    "If beauty was a crime, you'd be serving a life sentence.",
    "You're the reason my phone battery dies — I can't stop looking at your chats.",
    "Are you a star? Because your shine just lit up my whole screen.",
    "I must be a snowflake, because I've fallen for you.",
    "You're sweeter than the last bite of dessert.",
    "tumhare bina yeh chat adhoora sa lagta hai.",
    "If I had a rupee for every time you crossed my mind, I'd be a millionaire.",
    "You're the 'favorite' in my contacts, and I'm not even hiding it.",
    "Are you a camera? Because every time I look at you, I smile.",
    "You're the kind of person poems are written about.",
    "I'm not a photographer, but I can definitely picture us together.",
];

/* ------------------------------------------------------------------ */
/* Shayari — Roman Urdu (Latin script), 2-4 lines, emotional         */
/* ------------------------------------------------------------------ */
const shayari = [
    "Dil ke raasto par tu hi toh hai,\nDooriyon mein bhi tu hi paas hai.\nKya kahoon main is ehsaas ka,\nTujh bin zindagi adhoori sa lagti hai.",
    "Teri yaadon ka ek shahar basa hai dil mein,\nHar gali teri hi guftagu karti hai.\nAgar bhool bhi jaaoon main duniya ko,\nTeri ek muskaan yaad reh jaati hai.",
    "Mohabbat mein sabse mushkil kaam yeh hai,\nApni khushi ko teri khushi mein guma dena.\nPar yakeen maan, isse behtar ibadat koi nahi,\nTere liye apna sab kuch luta dena.",
    "Raat Bhar socha tumhari baat karoon,\nSubah hui toh phir se tumse baat karoon.\nYeh dil hai ke manta hi nahi,\nHar saans mein bas tera hi naam le.",
    "Kabhi tumhein dhoop ki tarah mehsoos karta hoon,\nKabhi chhaon ki tarah paas paata hoon.\nMeri zindagi ka sabse haseen hissa tum ho,\nJise paakar main khud ko poora paata hoon.",
    "Aankhon mein teri jo chaand sa noor hai,\nDil mein mere wo sukoon bharpur hai.\nNa jaane kyun par tu door hoke bhi,\nMeri har dhadkan ka qareeb hai.",
    "Ishq mein humne apna sab kuch haar diya,\nTujhko paakar khud ko hi talaash liya.\nAb na ranj na gham ka koi ehsaas hai,\nBas teri yaadon ka ek silsila chhut gaya.",
    "Waqt ki raftaar mein sab kuch badal jaata hai,\nPar teri yaadon ka asar reh jaata hai.\nJitni bhi dooriyan ho humare beech mein,\nMera pyaar tera hi reh jaata hai.",
    "Teri baaton ka wo jaadu hai,\nJo udaas dil ko bhi hila deta hai.\nEk tera naam hi kaafi hai,\nMeri zindagi ki har kami mita deta hai.",
    "Hum toh wahin the jahan tumne chhod diya tha,\nTum chale gaye par ehsaas reh gaya tha.\nAaj bhi wo raaste wahin tak jaate hain,\nJahan se humne tumhein jaate dekha tha.",
    "Dard bhari shayari likhne ka shauk hai mujhe,\nPar dard tune hi diya hai yaar.\nAb har lafz mein bas tera hi zikr hai,\nChahe chahoon bhi toh bhool na paaoon tujhe.",
    "Zindagi ne sikhaaya hai sabse keematii sabak,\nKi khushiyan choti choti hoti hain par yaad reh jaati hain.\nTeri ek muskaan meri poori duniya hai,\nJise paakar main ameer ho jaata hoon.",
];

/* ------------------------------------------------------------------ */
/* Motivation — energetic, genuine, 2-4 sentences                     */
/* ------------------------------------------------------------------ */
const motivation = [
    "Stop waiting for the perfect moment — it never arrives. The only time you truly have is now, so move with it. Small steps taken today beat perfect plans left untouched.",
    "Failure isn't the opposite of success; it's the tuition you pay to learn. Every setback is data, not destiny. Get up, adjust, and go again.",
    "You are not behind in life. Everyone is running a different race on a different clock. Focus on your lane and trust your pace.",
    "Discipline beats motivation every single time. Motivation is a spark; discipline is the engine that keeps you moving when the spark is gone.",
    "The fear you feel before starting is just proof you're about to grow. Comfort never built anything worth remembering. Lean into the discomfort.",
    "Your past does not define your future unless you let it. The next chapter is unwritten, and the pen is in your hand right now.",
    "Consistency is quiet, boring, and unbeatable. Show up every day, even when nobody's watching, because that's where real change is built.",
    "You don't need to be extraordinary to begin — you become extraordinary by beginning. Start messy, start small, but start.",
    "Self-belief isn't arrogance; it's the foundation everything else stands on. Back yourself the way you'd back someone you love.",
    "Hard work is a loan to your future self, and the interest is freedom. Put in the reps today so tomorrow has more options.",
    "Comparison is the fastest way to abandon your own journey. Water your own garden instead of counting someone else's flowers.",
    "Rest is part of the work, not a break from it. Recharge so you can return sharper, not so you can quit.",
    "Every expert was once a beginner who refused to stop. Your 'not good yet' is just a timestamp, not a verdict.",
    "The cost of regret is heavier than the cost of trying. Choose the risk of action over the certainty of 'what if'.",
    "You've survived 100% of your worst days so far. That track record says you can handle what's coming too.",
    "Dreams don't work unless you do, but when you do, they move. Pair the vision with the grind and watch the gap close.",
    "It's okay to be a work in progress. Mastery is a direction, not a destination — keep walking.",
    "Your worth isn't measured by your output. You are enough on your slowest day; the effort is just the bonus.",
];

/* ------------------------------------------------------------------ */
/* Truth questions — juicy but safe for group games                   */
/* ------------------------------------------------------------------ */
const truths = [
    "What's the most embarrassing song you secretly love and sing in the shower?",
    "What's the weirdest food combination you actually enjoy?",
    "Who in this chat would you swap phones with for a day?",
    "What's the most childish thing you still do?",
    "What's a guilty pleasure you'd never admit in public?",
    "What's the biggest lie you've told to get out of plans?",
    "What's the most awkward text you've ever sent to the wrong person?",
    "If you could only keep one social app, which would it be and why?",
    "What's the silliest fear you have?",
    "What's the most embarrassing nickname you've ever had?",
    "Have you ever pretended to be asleep to avoid talking to someone?",
    "What's the worst gift you've ever given or received?",
    "What's the most trouble you got into as a kid?",
    "Who was your first crush and do they know?",
    "What's something you bought that you regret immediately?",
    "What's the most embarrassing thing on your search history?",
    "Have you ever fan-girled or fan-boyed over a celebrity?",
    "What's a habit you have that you wish you could break?",
    "What's the longest you've gone without showering?",
    "If your pets could talk, what's the first thing they'd roast you for?",
];

/* ------------------------------------------------------------------ */
/* Dares — doable via chat / phone, fun and slightly embarrassing     */
/* ------------------------------------------------------------------ */
const dares = [
    "Send a voice note singing the chorus of your current favorite song.",
    "Change your WhatsApp status to 'I love Optimus Bot' for the next 10 minutes.",
    "Send a selfie making the funniest face you can.",
    "Text the person above you a cheesy pickup line right now.",
    "Record a 10-second video of you doing your best dance move.",
    "Type your next 5 messages in all caps — no exceptions.",
    "Send a voice note telling a 30-second bedtime story in a dramatic voice.",
    "Post 'good morning' to the group in three different languages.",
    "Describe the person to your left using only emojis.",
    "Send the last photo in your gallery with no explanation.",
    "Do your best celebrity impression in a voice note.",
    "Change your display name to something embarrassing for 15 minutes.",
    "Send a voice note of you saying the alphabet backwards as fast as you can.",
    "Tell us the most embarrassing story from your school days in a voice note.",
    "Send a message entirely in rhyme for the next 3 texts.",
    "Record yourself saying 'I am awesome' in the most confident voice possible.",
    "Send a picture of the most random object within arm's reach.",
    "Do 10 jumping jacks right now and prove it with a video.",
    "Text your mom (or someone close) a random compliment and screenshot it.",
    "Speak only in movie quotes for your next 5 messages.",
];

/* ------------------------------------------------------------------ */
/* 8-Ball answers — mystical, yes / no / uncertain                   */
/* ------------------------------------------------------------------ */
const eightball = [
    "The stars whisper: yes.",
    "Signs point to a confident yes.",
    "The spirits nod in agreement.",
    "Without a doubt, my friend.",
    "It is written in the cards — yes.",
    "The moon confirms it: yes.",
    "Hmm, the winds say no.",
    "Signs point to no.",
    "The spirits shake their heads.",
    "Do not count on it.",
    "My sources say absolutely not.",
    "The cards are closed on this one — no.",
    "Ask again when the moon is full.",
    "The mists are too thick to tell.",
    "Reply hazy, try concentrating and asking again.",
    "The future is undecided — your move matters.",
    "Better not to reveal that just yet.",
    "The oracle needs more coffee… ask later.",
    "Fate is playing coy. Ask tomorrow.",
    "The answer lies within you, not the ball.",
];

/* ------------------------------------------------------------------ */
/* Riddles — { question, answer } classic + clever                    */
/* ------------------------------------------------------------------ */
const riddles = [
    { question: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?", answer: "An echo." },
    { question: "The more of me you take, the more you leave behind. What am I?", answer: "Footsteps." },
    { question: "I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?", answer: "A map." },
    { question: "What has keys but can't open locks?", answer: "A piano." },
    { question: "What gets wetter the more it dries?", answer: "A towel." },
    { question: "I'm tall when I'm young, and short when I'm old. What am I?", answer: "A candle." },
    { question: "What has a heart that doesn't beat?", answer: "An artichoke." },
    { question: "What can you break, even if you never pick it up or touch it?", answer: "A promise." },
    { question: "What goes up but never comes down?", answer: "Your age." },
    { question: "I have branches, but no fruit, trunk or leaves. What am I?", answer: "A bank." },
    { question: "What can fill a room but takes up no space?", answer: "Light." },
    { question: "What has words, but never speaks?", answer: "A book." },
    { question: "What runs all around a backyard, yet never moves?", answer: "A fence." },
    { question: "What comes once in a minute, twice in a moment, but never in a thousand years?", answer: "The letter M." },
    { question: "I'm not alive, but I grow; I don't have lungs, but I need air; I don't have a mouth, but water kills me. What am I?", answer: "Fire." },
    { question: "What has one eye, but can't see?", answer: "A needle." },
    { question: "What belongs to you, but other people use it more than you?", answer: "Your name." },
    { question: "What can you catch, but not throw?", answer: "A cold." },
    { question: "What has many teeth, but can't bite?", answer: "A comb." },
    { question: "The person who makes it, sells it. The person who buys it, never uses it. The person who uses it, never knows. What is it?", answer: "A coffin." },
    { question: "What letter of the alphabet has the most water?", answer: "The C (sea)." },
    { question: "I have a tail and a head, but no body. What am I?", answer: "A coin." },
    { question: "What is always in front of you but can't be seen?", answer: "The future." },
    { question: "What is so fragile that saying its name breaks it?", answer: "Silence." },
    { question: "I am taken from a mine, and shut up in a wooden case, from which I am never released, and yet I am used by almost everybody. What am I?", answer: "Pencil lead (graphite)." },
];

module.exports = {
    pick,
    insults,
    compliments,
    roasts,
    flirts,
    shayari,
    motivation,
    truths,
    dares,
    eightball,
    riddles,
};
