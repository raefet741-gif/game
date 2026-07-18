// server/draw-words.js
// The prompt bank for DOODLE DUEL — simple, drawable nouns/scenes players are
// asked to sketch. Each entry carries its three language labels so the same
// concept is shown in the room's chosen language (the drawing is universal, so
// AI judging always compares against the ENGLISH label under the hood).
//
// Grouped loosely by difficulty tier so the lobby can bias easy/medium/hard.

export const WORD_BANK = {
  easy: [
    { en: "cat", fr: "chat", ar: "قطة" },
    { en: "dog", fr: "chien", ar: "كلب" },
    { en: "house", fr: "maison", ar: "منزل" },
    { en: "sun", fr: "soleil", ar: "شمس" },
    { en: "tree", fr: "arbre", ar: "شجرة" },
    { en: "fish", fr: "poisson", ar: "سمكة" },
    { en: "star", fr: "étoile", ar: "نجمة" },
    { en: "car", fr: "voiture", ar: "سيارة" },
    { en: "flower", fr: "fleur", ar: "زهرة" },
    { en: "apple", fr: "pomme", ar: "تفاحة" },
    { en: "boat", fr: "bateau", ar: "قارب" },
    { en: "ball", fr: "ballon", ar: "كرة" },
    { en: "heart", fr: "cœur", ar: "قلب" },
    { en: "moon", fr: "lune", ar: "قمر" },
    { en: "cloud", fr: "nuage", ar: "سحابة" },
    { en: "key", fr: "clé", ar: "مفتاح" },
    { en: "hat", fr: "chapeau", ar: "قبعة" },
    { en: "cup", fr: "tasse", ar: "كوب" },
    { en: "book", fr: "livre", ar: "كتاب" },
    { en: "banana", fr: "banane", ar: "موزة" },
    { en: "eye", fr: "œil", ar: "عين" },
    { en: "hand", fr: "main", ar: "يد" },
    { en: "snake", fr: "serpent", ar: "ثعبان" },
    { en: "bird", fr: "oiseau", ar: "طائر" },
    { en: "egg", fr: "œuf", ar: "بيضة" },
    { en: "clock", fr: "horloge", ar: "ساعة" },
    { en: "door", fr: "porte", ar: "باب" },
    { en: "shoe", fr: "chaussure", ar: "حذاء" },
    { en: "umbrella", fr: "parapluie", ar: "مظلة" },
    { en: "ice cream", fr: "glace", ar: "آيس كريم" },
  ],
  medium: [
    { en: "rocket", fr: "fusée", ar: "صاروخ" },
    { en: "robot", fr: "robot", ar: "روبوت" },
    { en: "guitar", fr: "guitare", ar: "غيتار" },
    { en: "elephant", fr: "éléphant", ar: "فيل" },
    { en: "castle", fr: "château", ar: "قلعة" },
    { en: "bicycle", fr: "vélo", ar: "دراجة" },
    { en: "airplane", fr: "avion", ar: "طائرة" },
    { en: "pizza", fr: "pizza", ar: "بيتزا" },
    { en: "octopus", fr: "pieuvre", ar: "أخطبوط" },
    { en: "rainbow", fr: "arc-en-ciel", ar: "قوس قزح" },
    { en: "penguin", fr: "manchot", ar: "بطريق" },
    { en: "camera", fr: "appareil photo", ar: "كاميرا" },
    { en: "butterfly", fr: "papillon", ar: "فراشة" },
    { en: "lighthouse", fr: "phare", ar: "منارة" },
    { en: "dinosaur", fr: "dinosaure", ar: "ديناصور" },
    { en: "crown", fr: "couronne", ar: "تاج" },
    { en: "ghost", fr: "fantôme", ar: "شبح" },
    { en: "snowman", fr: "bonhomme de neige", ar: "رجل ثلج" },
    { en: "windmill", fr: "moulin à vent", ar: "طاحونة هواء" },
    { en: "cactus", fr: "cactus", ar: "صبار" },
    { en: "anchor", fr: "ancre", ar: "مرساة" },
    { en: "volcano", fr: "volcan", ar: "بركان" },
    { en: "spider", fr: "araignée", ar: "عنكبوت" },
    { en: "campfire", fr: "feu de camp", ar: "نار مخيم" },
    { en: "mushroom", fr: "champignon", ar: "فطر" },
    { en: "telescope", fr: "télescope", ar: "تلسكوب" },
    { en: "kite", fr: "cerf-volant", ar: "طائرة ورقية" },
    { en: "traffic light", fr: "feu de circulation", ar: "إشارة مرور" },
    { en: "sandcastle", fr: "château de sable", ar: "قلعة رملية" },
    { en: "hamburger", fr: "hamburger", ar: "همبرغر" },
  ],
  hard: [
    { en: "astronaut", fr: "astronaute", ar: "رائد فضاء" },
    { en: "waterfall", fr: "cascade", ar: "شلال" },
    { en: "skeleton", fr: "squelette", ar: "هيكل عظمي" },
    { en: "helicopter", fr: "hélicoptère", ar: "مروحية" },
    { en: "mermaid", fr: "sirène", ar: "حورية البحر" },
    { en: "treasure map", fr: "carte au trésor", ar: "خريطة الكنز" },
    { en: "roller coaster", fr: "montagnes russes", ar: "أفعوانية" },
    { en: "hot air balloon", fr: "montgolfière", ar: "منطاد" },
    { en: "chessboard", fr: "échiquier", ar: "رقعة شطرنج" },
    { en: "microscope", fr: "microscope", ar: "مجهر" },
    { en: "scarecrow", fr: "épouvantail", ar: "فزاعة" },
    { en: "fireworks", fr: "feu d'artifice", ar: "ألعاب نارية" },
    { en: "wizard", fr: "sorcier", ar: "ساحر" },
    { en: "submarine", fr: "sous-marin", ar: "غواصة" },
    { en: "tornado", fr: "tornade", ar: "إعصار" },
    { en: "pyramid", fr: "pyramide", ar: "هرم" },
    { en: "jellyfish", fr: "méduse", ar: "قنديل البحر" },
    { en: "typewriter", fr: "machine à écrire", ar: "آلة كاتبة" },
    { en: "chandelier", fr: "lustre", ar: "ثريا" },
    { en: "unicorn", fr: "licorne", ar: "وحيد القرن" },
    { en: "campervan", fr: "camping-car", ar: "عربة تخييم" },
    { en: "dragon", fr: "dragon", ar: "تنين" },
    { en: "peacock", fr: "paon", ar: "طاووس" },
    { en: "igloo", fr: "igloo", ar: "كوخ ثلجي" },
    { en: "compass", fr: "boussole", ar: "بوصلة" },
  ],
};

const TIERS = ["easy", "medium", "hard"];

// A flat pool for a difficulty (easy = easy only; medium = easy+medium; hard = all)
// so higher difficulty widens rather than narrows the pool.
function poolFor(difficulty) {
  const idx = Math.max(0, TIERS.indexOf(difficulty));
  const out = [];
  for (let i = 0; i <= idx; i++) out.push(...WORD_BANK[TIERS[i]]);
  return out;
}

// Pick `count` distinct prompts for a difficulty, avoiding any in `exclude`
// (a Set of English labels already used this game).
export function pickWords(difficulty, count, exclude = new Set()) {
  const pool = poolFor(difficulty).filter((w) => !exclude.has(w.en));
  const bag = pool.length ? pool : poolFor(difficulty);
  // Fisher–Yates on a copy, take the first `count`.
  const a = bag.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(count, a.length));
}

// Localized label for a prompt object in the room's language (falls back to en).
export function label(word, lang) {
  if (!word) return "";
  return word[lang] || word.en;
}
