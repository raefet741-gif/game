// server/questions.js
// The full SPILL prompt bank, assembled from the Clash Night 180-prompt bank
// plus the SPILL "first impressions + more variety" additions.
//
// Each generated prompt has: { id, type, category, intensity, write, text }
//   - type:      'truth' | 'dare'
//   - category:  stable slug (used by the host category toggles)
//   - intensity: 'light' | 'medium' | 'bold'  (used by the spice filter)
//   - write:     true  => a "write-first" truth (answered privately, then revealed).
//                Enables the Truth Serum power to peek before the reveal.
//
// Intensity is set per category by a base value, with `bold` / `light` override
// lists holding the 1-based index (within that category) of prompts that break
// from the base. Spice filter semantics:  clean = light only, medium = light+medium,
// bold = everything.

// Human-readable labels for the category toggles in the host settings screen.
export const CATEGORY_LABELS = {
  relationships: "Relationships & love",
  your_type: "Your type & attraction",
  red_flags: "Red flags & dealbreakers",
  friends: "Friends & friendship",
  love: "Things you love",
  hate: "Hates & pet peeves",
  wants: "What you really want",
  dreams: "Dreams & ambitions",
  secrets: "Secrets & confessions",
  embarrassing: "Embarrassing moments",
  deep: "Deep & hypothetical",
  first_impressions: "First impressions",
  about_you: "Random about you",
  funny: "Funny & performance",
  social: "Social & phone",
  physical: "Physical & silly",
  group: "Group & interactive",
};

import { FR } from "./i18n/prompts.fr.js";
import { AR } from "./i18n/prompts.ar.js";

// Which truth categories are answered "write-first" (typed privately, then revealed).
const WRITE_FIRST_CATEGORIES = new Set(["secrets", "embarrassing", "deep"]);

const TRUTHS = {
  relationships: {
    base: "medium",
    bold: [2, 6, 10, 11, 13, 14],
    light: [7, 8, 12, 15],
    items: [
      "What's the most romantic thing you've ever done for someone?",
      "Have you ever loved someone who didn't love you back?",
      "What's the longest you've had a crush on someone without telling them?",
      "Have you ever gotten back with an ex? Would you again?",
      "What's the pettiest reason you've ended (or wanted to end) a relationship?",
      "Have you ever lied about your feelings to protect someone?",
      "What's a small thing someone did that made you fall for them?",
      "Do you believe in love at first sight, or is that a myth?",
      "What's the boldest move you've ever made on someone you liked?",
      "Have you ever been in two situationships at the same time?",
      "What's the most jealous you've ever been?",
      "Would you rather be the one who loves more, or the one who's loved more?",
      "What's a relationship habit of yours that you're not proud of?",
      "Have you ever stayed in something way too long? Why?",
      "What's the nicest compliment you've ever received from a partner or crush?",
    ],
  },
  your_type: {
    base: "light",
    bold: [],
    light: [],
    items: [
      "Describe your type in exactly three words.",
      "Looks, humor, or intelligence — rank them and be honest.",
      "What's an unusual thing you find attractive that others might not?",
      "Who's a celebrity that's 100% your type?",
      "What's the first thing you notice about someone?",
      "Have you ever changed your \"type\" completely? What caused it?",
      "Voice, smile, or eyes — what wins you over fastest?",
      "What's a \"green flag\" that instantly makes you more interested?",
      "Confident and loud, or quiet and mysterious?",
      "What's the most superficial thing you care about that you wish you didn't?",
      "Would you date someone with the exact same personality as you?",
      "What trait do you find attractive now that you didn't care about at 16?",
    ],
  },
  red_flags: {
    base: "medium",
    bold: [],
    light: [33, 35, 39],
    items: [
      "What's your absolute number-one dealbreaker?",
      "What's a red flag you've ignored before, and regretted?",
      "Name a red flag you think most people underrate.",
      "Is there a red flag you find weirdly attractive?",
      "What's a habit in others that instantly turns you off?",
      "Bad texter or always on their phone — which is worse?",
      "What's a red flag YOU have that you'll admit to right now?",
      "Would you rather date someone messy or someone controlling?",
      "What's the fastest a date has gone wrong for you?",
      "What excuse have you used to get out of a second date?",
      "What's a green flag that outweighs almost any red flag?",
      "Rude to waiters, or never says thank you — dealbreaker or not?",
    ],
  },
  friends: {
    base: "light",
    bold: [],
    light: [],
    items: [
      "Who in this room have you known the longest, and how did you meet?",
      "What's the nicest thing a friend has ever done for you?",
      "Have you ever kept a secret from a close friend? Do they know?",
      "Which friend would you call first in an emergency, and why?",
      "What's a friendship you regret losing?",
      "Have you ever been jealous of a friend? Be honest.",
      "What's the most trouble you've gotten into with a friend?",
      "Who here would survive the longest in a zombie apocalypse?",
      "What's a quality you look for in a best friend?",
      "Have you ever had a falling-out and later made up? What happened?",
      "Who's the funniest person in this room? No fence-sitting.",
      "What's a secret talent of yours your friends don't know about?",
    ],
  },
  love: {
    base: "light",
    bold: [],
    light: [],
    items: [
      "What's something small that instantly makes your whole day better?",
      "What's a hobby you love that you rarely make time for?",
      "What food could you eat every single day and never get tired of?",
      "What's a song that always lifts your mood, no matter what?",
      "What's a place you've been that you'd go back to in a heartbeat?",
      "What's something you love that most people find boring?",
      "What's the best gift you've ever received?",
      "What's a comfort movie or show you rewatch when you're down?",
      "Who's someone you love that you don't tell often enough?",
      "What's a smell that instantly brings back a good memory?",
    ],
  },
  hate: {
    base: "light",
    bold: [],
    light: [],
    items: [
      "What's a pet peeve that drives you completely insane?",
      "What's a food everyone loves that you secretly can't stand?",
      "What's the most annoying habit a roommate or family member has?",
      "What sound makes you want to leave the room instantly?",
      "What's a popular trend you think is overrated?",
      "What's something people do in public that you find unforgivable?",
      "What's a chore you'll do anything to avoid?",
      "What's an opinion you have that always starts arguments?",
      "What's the pettiest grudge you're still holding?",
      "What's a word or phrase you can't stand hearing?",
    ],
  },
  wants: {
    base: "medium",
    bold: [3, 10],
    light: [5, 8],
    items: [
      "What do you want more than anything right now?",
      "If money weren't a factor, what would you be doing with your life?",
      "What's something you want but feel embarrassed to admit?",
      "What's a want you had as a kid that you still secretly have?",
      "Would you rather have more time or more money? Why?",
      "What's one thing you wish people understood about you?",
      "What do you want your life to look like in five years?",
      "What's a small luxury you'd buy if you won some money tomorrow?",
      "What do you want to be remembered for?",
      "What's something you want to say to someone but never have?",
      "Recognition or peace — which do you want more?",
      "What experience do you want to have before you turn 40?",
    ],
  },
  dreams: {
    base: "medium",
    bold: [],
    light: [2, 3, 8, 12],
    items: [
      "What's a dream you've never told anyone?",
      "If you could master one skill overnight, what would it be?",
      "Where in the world do you dream of living someday?",
      "What's the most ambitious goal you've ever set for yourself?",
      "What did you want to be when you grew up, and how close are you?",
      "If you could switch lives with anyone for a week, who and why?",
      "What's a dream you gave up on that you sometimes still think about?",
      "What's something on your bucket list that would surprise us?",
      "If you had unlimited resources, what would you build or create?",
      "What's the boldest risk you'd take if you knew you couldn't fail?",
      "What legacy do you want to leave behind?",
      "Describe your dream day from morning to night.",
    ],
  },
  secrets: {
    base: "bold",
    bold: [],
    light: [],
    items: [
      "What's the biggest secret you're comfortable sharing right now?",
      "What's a lie you told that you never got caught for?",
      "What's the most rebellious thing you did as a teenager?",
      "Have you ever pretended to like something just to fit in?",
      "What's something you've never told your parents?",
      "What's the pettiest thing you've ever done to get revenge?",
      "Have you ever ghosted someone? Do you regret it?",
      "What's a small crime you've committed? (Nothing that gets us arrested.)",
      "What's the worst excuse you've ever made up to skip something?",
      "Have you ever read a message you weren't supposed to?",
      "What's something you did that you got away with completely?",
      "What's a habit you hide from everyone?",
    ],
  },
  embarrassing: {
    base: "bold",
    bold: [],
    light: [],
    items: [
      "What's the most embarrassing thing in your search history right now?",
      "What's the worst outfit you ever thought looked amazing?",
      "Have you ever called someone the wrong name at the worst time?",
      "What's the most embarrassing thing that's happened to you in public?",
      "What's a text you sent that you instantly wanted to delete?",
      "Have you ever tripped, fallen, or wiped out in front of a crush?",
      "What's a nickname you had that you hoped no one would remember?",
      "What's the cringiest phase you ever went through?",
      "Have you ever been caught talking about someone who was right there?",
      "What's the most embarrassing song on your playlist?",
    ],
  },
  deep: {
    base: "medium",
    bold: [5, 8, 11, 12, 13],
    light: [],
    items: [
      "Would you rather know how you die or when you die?",
      "If you could relive one day of your life, which would it be?",
      "What's a belief you held strongly that you've completely changed?",
      "Would you rather be famous or be forgotten but truly happy?",
      "What's the hardest lesson life has taught you so far?",
      "If you could send one message to your younger self, what would it say?",
      "Would you rather never feel physical pain or never feel sadness?",
      "What's something you're afraid of that you rarely admit?",
      "If today were your last day, what would you do first?",
      "Would you rather be able to read minds or be invisible?",
      "What's a moment that completely changed the direction of your life?",
      "What do you think happens after we die?",
      "If you could undo one decision, would you? Which one?",
    ],
  },
  first_impressions: {
    base: "medium",
    bold: [],
    light: [2, 6, 7],
    items: [
      "Give your honest first impression of the person on your right.",
      "Say one word that describes each person in the room right now.",
      "Who here did you completely misjudge when you first met them?",
      "If you'd met everyone here today for the first time, who would you befriend first?",
      "Whose vibe surprised you most once you got to know them?",
      "Rank the room by \"who I'd trust with a secret\" — fastest, no overthinking.",
      "Point to who you think is the most competitive person here and say why.",
      "Guess which player is most likely to become famous, and for what.",
    ],
  },
  about_you: {
    base: "light",
    bold: [],
    light: [],
    items: [
      "What's a talent you have that would genuinely surprise everyone here?",
      "If your life had a theme song, what would it be?",
      "What's the pettiest hill you will die on?",
      "What's a compliment you'd give yourself right now?",
      "If you could banish one word from existence, which one?",
      "What's the most \"you\" thing you own?",
      "What's a small win you had this week?",
      "Which app do you open first every morning — be honest?",
    ],
  },
};

const DARES = {
  funny: {
    base: "light",
    bold: [],
    light: [],
    items: [
      "Speak in a fake accent until it's your turn again.",
      "Do your best impression of someone in this room — let us guess who.",
      "Sing the chorus of the last song you listened to, out loud.",
      "Do a dramatic runway walk across the room.",
      "Talk in rhymes for the next two rounds.",
      "Do your best slow-motion action-movie scene.",
      "Act out your morning routine in complete silence.",
      "Give a passionate 30-second speech about something boring (e.g. socks).",
      "Do an over-the-top fashion commentary on everyone's outfit.",
      "Perform a made-up dance and name it.",
      "Narrate everything you do like a nature documentary for one minute.",
      "Do your best evil-villain laugh — commit fully.",
      "Pretend to be a news anchor reporting on this party.",
      "Sing your next three sentences like an opera singer.",
      "Do an impression of a baby learning to walk.",
    ],
  },
  social: {
    base: "medium",
    bold: [1, 2, 4, 8, 11],
    light: [5, 12],
    items: [
      "Show the last photo in your camera roll.",
      "Post the most recent selfie in your phone as your story — no edits.",
      "Let the person on your left write your next text (to someone safe).",
      "Read your last five sent messages out loud.",
      "Show your most-used emoji and explain it.",
      "Text a friend \"I need to tell you something\" and don't explain for 10 minutes.",
      "Call a random contact and sing them \"Happy Birthday.\"",
      "Show the last thing you searched online.",
      "Let the group pick a new (temporary) profile picture for you.",
      "Read out your most recent notification, whatever it is.",
      "Show your screen time for today and take the roast.",
      "Voice-note a compliment to the last person you texted.",
    ],
  },
  physical: {
    base: "light",
    bold: [],
    light: [],
    items: [
      "Do 15 pushups (or 15 squats) while telling a joke.",
      "Balance a spoon on your nose for 20 seconds.",
      "Hold a plank while everyone counts down from 30.",
      "Try to lick your elbow — prove it's impossible.",
      "Do your best cartwheel or the safest version you can manage.",
      "Spin around 10 times, then walk a straight line.",
      "Do the worm, or your best attempt at it.",
      "Keep a straight face while the group tries to make you laugh for 30 seconds.",
      "Do an impression of a robot running out of battery.",
      "Wear your jacket or shirt inside out for the next three rounds.",
      "Do 10 jumping jacks while singing the alphabet.",
      "Freeze like a statue whenever someone claps, for two rounds.",
    ],
  },
  group: {
    base: "medium",
    bold: [],
    light: [3],
    items: [
      "Let the group ask you three rapid-fire questions — answer instantly.",
      "Swap one item of clothing with the person on your right (a hat, jacket, etc.).",
      "Give a genuine compliment to every person in the room.",
      "Let the opposing player choose your next dare.",
      "Do a two-person mirror challenge with someone the group picks.",
      "Whisper a secret to one person — they decide whether to reveal it.",
      "Team up with someone and act out a famous movie scene.",
      "Let someone feed you a snack while you're blindfolded and guess what it is.",
      "Have a 20-second staring contest with the person across from you.",
      "Do a duet lip-sync with a partner the group chooses.",
      "Recreate a group photo pose the room designs for you.",
      // SPILL additions:
      "Let the room give you a nickname you must respond to for two rounds.",
      "Do your best impression of the host.",
      "Text the 4th person in your chat list a single mysterious emoji.",
      "Describe the last thing you ate as if it were fine art.",
      "Swap seats with someone and defend their honor for one round.",
      "Give a 20-second TED talk on why your favorite snack is the best.",
    ],
  },
};

function buildPool(groups, type, idPrefix) {
  const out = [];
  let n = 0;
  for (const [category, def] of Object.entries(groups)) {
    def.items.forEach((text, i) => {
      const idx = i + 1;
      let intensity = def.base;
      if (def.bold?.includes(idx)) intensity = "bold";
      else if (def.light?.includes(idx)) intensity = "light";
      n += 1;
      const id = `${idPrefix}${String(n).padStart(3, "0")}`;
      out.push({
        id,
        type,
        category,
        intensity,
        write: type === "truth" && WRITE_FIRST_CATEGORIES.has(category),
        // Localized text; English is the source, FR/AR fall back to English if missing.
        text: { en: text, fr: FR[id] || text, ar: AR[id] || text },
      });
    });
  }
  return out;
}

export const QUESTION_BANK = [
  ...buildPool(TRUTHS, "truth", "t"),
  ...buildPool(DARES, "dare", "d"),
];

export const TRUTH_CATEGORIES = Object.keys(TRUTHS);
export const DARE_CATEGORIES = Object.keys(DARES);
export const ALL_CATEGORIES = [...TRUTH_CATEGORIES, ...DARE_CATEGORIES];

const INTENSITY_RANK = { light: 0, medium: 1, bold: 2 };
export function intensityAllowed(intensity, spice) {
  const cap = INTENSITY_RANK[spice] ?? 2;
  return (INTENSITY_RANK[intensity] ?? 0) <= cap;
}
