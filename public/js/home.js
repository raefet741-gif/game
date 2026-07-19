// public/js/home.js
// KYUUBI arcade home — game cards, background video, language switch, and accounts
// (register / login / profile / achievements). No socket here; auth is plain REST.

const $home = document.getElementById("home");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canHover = window.matchMedia("(hover: hover)").matches;

/* ---------------- language ---------------- */
const LANGS = [
  { code: "en", dir: "ltr" },
  { code: "fr", dir: "ltr" },
  { code: "ar", dir: "rtl" },
];
let lang = detectLang();
function detectLang() {
  const s = localStorage.getItem("spill.lang");
  if (s === "en" || s === "fr" || s === "ar") return s;
  const n = (navigator.language || "en").slice(0, 2);
  return n === "fr" ? "fr" : n === "ar" ? "ar" : "en";
}
function setLang(code) {
  if (!LANGS.some((l) => l.code === code)) return;
  lang = code;
  localStorage.setItem("spill.lang", code);
  document.documentElement.lang = code;
  document.documentElement.dir = LANGS.find((l) => l.code === code).dir;
  render();
}

const T = {
  en: {
    tagline: "Party games for every phone in the room.",
    sub: "Pick a game · 2–16 players",
    games: "Games",
    play: "Play",
    soon: "Soon",
    spill_tag: "Truth or dare with XP, superpowers & a two-lies-and-a-truth bluff mode.",
    memory_name: "MEMORY MATCH",
    memory_tag: "Flip cards to find pairs. Race in teams across growing grids — the team that wins the most rounds takes the crown.",
    sudoku_name: "SUDOKU RACE",
    sudoku_tag: "Team vs team on the same puzzle — 1v1, 2v2, 3v3 or more. First team to fill the grid wins the coins & XP.",
    puzzle_name: "PICTURE PUZZLE",
    puzzle_tag: "Drag the pieces to rebuild the picture. Solo or race friends — or turn a selfie into an AI puzzle.",
    words_name: "WORD WONDERS",
    words_tag: "Swipe the letter wheel to spell words and fill the crossword. Play solo, versus, or in teams — first to finish wins.",
    draw_name: "DOODLE DUEL",
    draw_tag: "Sketch the word and let the AI or the room judge it — or pass drawings around the circle and guess your way to points.",
    zip_name: "ZIP RACE",
    zip_tag: "Draw one line that hits every number in order and fills the whole grid. Solo, 1v1 or team vs team — first to finish wins.",
    queens_name: "KYUUBI QUEENS",
    queens_tag: "One crown per row, column & color patch — and none may touch. Solo, 1v1 or team vs team, racing best-of-N by fastest time.",
    headsup_name: "HEADS UP",
    headsup_tag: "Guess what's on your card while the room gives you clues. Your own photo packs, coming next.",
    more: "More games coming",
    foot: "Made for game nights 🌙",
    // accounts
    account: "Account", login: "Log in", sign_up: "Sign up", log_in: "Log in", logout: "Log out",
    username: "Username", password: "Password",
    login_cta: "Log in", signup_cta: "Create account",
    profile: "Profile", lvl: "LVL", level: "Level {n}", coins: "Coins",
    games_played: "Games", wins: "Wins", crowd: "Biggest room",
    achievements: "Achievements",
    guest_hint: "Log in to save your XP & achievements",
    login_to_play: "Log in to play",
    leaderboard: "Leaderboard",
    lb_empty: "No players yet — be the first!",
    lb_versus: "Versus",
    lb_solo: "Solo",
    lb_versus_sub: "Ranked by XP won against other players",
    lb_solo_sub: "Ranked by XP from playing alone",
    lb_points_sub: "Win a match +18 · lose −18 — each game has its own board",
    lb_pts: "pts",
    lb_wins: "wins",
    lb_solved: "solved",
    history: "Match history",
    hist_empty: "No matches yet — play a versus game!",
    hist_vs: "vs",
    won: "Won",
    lost: "Lost",
    close: "Close",
    err_fill: "Enter a username and password.",
    err_name_taken: "That username is taken.",
    err_bad_username: "Username: 2–20 letters or numbers.",
    err_bad_password: "Password must be at least 4 characters.",
    err_bad_login: "Wrong username or password.",
    err_generic: "Something went wrong — try again.",
  },
  fr: {
    tagline: "Des jeux de soirée sur le téléphone de chacun.",
    sub: "Choisis un jeu · 2 à 16 joueurs",
    games: "Jeux", play: "Jouer", soon: "Bientôt",
    spill_tag: "Action ou vérité avec XP, super-pouvoirs et un mode bluff « deux mensonges et une vérité ».",
    memory_name: "MEMORY MATCH",
    memory_tag: "Retourne les cartes pour trouver les paires. Course en équipes sur des grilles de plus en plus grandes — l'équipe qui gagne le plus de manches est sacrée.",
    sudoku_name: "SUDOKU RACE",
    sudoku_tag: "Équipe contre équipe sur la même grille — 1c1, 2c2, 3c3 ou plus. La première équipe à remplir la grille rafle les pièces et l'XP.",
    puzzle_name: "PUZZLE PHOTO",
    puzzle_tag: "Glisse les pièces pour reconstruire l'image. Solo ou contre tes amis — ou transforme un selfie en puzzle IA.",
    words_name: "WORD WONDERS",
    words_tag: "Glisse sur la roue de lettres pour former des mots et remplir la grille. Solo, versus ou en équipes — le premier à finir gagne.",
    draw_name: "DOODLE DUEL",
    draw_tag: "Dessine le mot et laisse l'IA ou la salle juger — ou fais tourner les dessins dans le cercle et devine pour marquer des points.",
    zip_name: "ZIP RACE",
    zip_tag: "Trace une seule ligne qui passe chaque numéro dans l'ordre et remplit toute la grille. Solo, 1c1 ou équipe contre équipe — le premier à finir gagne.",
    queens_name: "KYUUBI QUEENS",
    queens_tag: "Une couronne par ligne, colonne et patch de couleur — sans jamais se toucher. Solo, 1c1 ou équipe contre équipe, au meilleur de N au temps le plus rapide.",
    headsup_name: "DEVINE",
    headsup_tag: "Devine ce que tu as pendant que la salle te donne des indices. Tes propres packs photos, bientôt.",
    more: "D'autres jeux arrivent",
    foot: "Fait pour les soirées 🌙",
    account: "Compte", login: "Se connecter", sign_up: "S'inscrire", log_in: "Connexion", logout: "Déconnexion",
    username: "Nom d'utilisateur", password: "Mot de passe",
    login_cta: "Se connecter", signup_cta: "Créer le compte",
    profile: "Profil", lvl: "NIV", level: "Niveau {n}", coins: "Pièces",
    games_played: "Parties", wins: "Victoires", crowd: "Plus grande salle",
    achievements: "Succès",
    guest_hint: "Connecte-toi pour sauvegarder ton XP et tes succès",
    login_to_play: "Connecte-toi pour jouer",
    leaderboard: "Classement",
    lb_empty: "Aucun joueur pour l'instant — sois le premier !",
    lb_versus: "Versus",
    lb_solo: "Solo",
    lb_versus_sub: "Classé par XP gagné contre d'autres joueurs",
    lb_solo_sub: "Classé par XP en jouant seul",
    lb_points_sub: "Match gagné +18 · perdu −18 — un classement par jeu",
    lb_pts: "pts",
    lb_wins: "victoires",
    lb_solved: "résolus",
    close: "Fermer",
    err_fill: "Entre un nom et un mot de passe.",
    err_name_taken: "Ce nom est déjà pris.",
    err_bad_username: "Nom : 2 à 20 lettres ou chiffres.",
    err_bad_password: "Mot de passe : au moins 4 caractères.",
    err_bad_login: "Nom ou mot de passe incorrect.",
    err_generic: "Une erreur est survenue — réessaie.",
  },
  ar: {
    tagline: "ألعاب سهرة على هاتف كل شخص في الغرفة.",
    sub: "اختر لعبة · من 2 إلى 16 لاعبًا",
    games: "الألعاب", play: "العب", soon: "قريبًا",
    spill_tag: "صراحة أو تحدٍّ مع نقاط خبرة وقوى خارقة ووضع خداع «كذبتان وحقيقة».",
    memory_name: "لعبة الذاكرة",
    memory_tag: "اقلب البطاقات لإيجاد الأزواج. تسابقوا في فرق عبر شبكات تكبر تدريجيًا — الفريق الأكثر فوزًا بالجولات يتوّج بطلًا.",
    sudoku_name: "سباق سودوكو",
    sudoku_tag: "فريق ضد فريق على اللغز نفسه — 1ضد1 أو 2ضد2 أو 3ضد3 أو أكثر. أول فريق يُكمل الشبكة يربح العملات والخبرة.",
    puzzle_name: "أحجية الصور",
    puzzle_tag: "اسحب القطع لإعادة تركيب الصورة. منفردًا أو ضد أصدقائك — أو حوّل سيلفي إلى أحجية بالذكاء الاصطناعي.",
    words_name: "عجائب الكلمات",
    words_tag: "اسحب على عجلة الحروف لتكوين الكلمات وملء الشبكة. فردي أو تنافسي أو بالفرق — أول من ينهي يفوز.",
    draw_name: "مبارزة الرسم",
    draw_tag: "ارسم الكلمة ودع الذكاء الاصطناعي أو الغرفة يحكم — أو مرّر الرسوم في الحلقة وخمّن لتجمع النقاط.",
    zip_name: "سباق زيب",
    zip_tag: "ارسم خطًا واحدًا يمرّ بكل رقم بالترتيب ويملأ الشبكة كاملة. فردي أو 1ضد1 أو فريق ضد فريق — أول من ينهي يفوز.",
    queens_name: "ملكات كيوبي",
    queens_tag: "تاج واحد لكل صف وعمود ورقعة لون — دون أن يتلامسا. فردي أو 1ضد1 أو فريق ضد فريق، الأفضل من N بأسرع وقت.",
    headsup_name: "خمّن",
    headsup_tag: "خمّن ما على بطاقتك بينما تعطيك الغرفة تلميحات. حزم صورك الخاصة قريبًا.",
    more: "المزيد من الألعاب قريبًا",
    foot: "صُنعت لليالي الألعاب 🌙",
    account: "الحساب", login: "تسجيل الدخول", sign_up: "إنشاء حساب", log_in: "تسجيل الدخول", logout: "تسجيل الخروج",
    username: "اسم المستخدم", password: "كلمة المرور",
    login_cta: "دخول", signup_cta: "إنشاء الحساب",
    profile: "الملف الشخصي", lvl: "مستوى", level: "المستوى {n}", coins: "عملات",
    games_played: "الألعاب", wins: "الانتصارات", crowd: "أكبر غرفة",
    achievements: "الإنجازات",
    guest_hint: "سجّل الدخول لحفظ نقاط خبرتك وإنجازاتك",
    login_to_play: "سجّل الدخول للعب",
    leaderboard: "المتصدّرون",
    lb_empty: "لا لاعبين بعد — كن الأول!",
    lb_versus: "تنافسي",
    lb_solo: "منفرد",
    lb_versus_sub: "مرتّب حسب الخبرة المكتسبة ضد اللاعبين الآخرين",
    lb_solo_sub: "مرتّب حسب الخبرة من اللعب منفردًا",
    lb_points_sub: "الفوز ‎+18 · الخسارة ‎−18 — لكل لعبة تصنيفها الخاص",
    lb_pts: "نقطة",
    lb_wins: "انتصارات",
    lb_solved: "مكتملة",
    close: "إغلاق",
    err_fill: "أدخل اسم المستخدم وكلمة المرور.",
    err_name_taken: "اسم المستخدم مأخوذ.",
    err_bad_username: "الاسم: من 2 إلى 20 حرفًا أو رقمًا.",
    err_bad_password: "كلمة المرور: 4 أحرف على الأقل.",
    err_bad_login: "اسم المستخدم أو كلمة المرور خاطئة.",
    err_generic: "حدث خطأ ما — أعد المحاولة.",
  },
};
/* extra strings for the KyuubiZ ink-wash experience */
Object.assign(T.en, {
  enter_village: "Enter the village",
  choose_game: "Choose your game",
  register: "Register",
  confirm_pass: "Confirm password",
  auth_login_sub: "Log in to save your XP, coins & crowns.",
  auth_reg_sub: "Create your account to save XP, coins & crowns.",
  already_acct: "Already have an account?",
  new_here: "New here?",
  create_acct: "Create an account",
  err_pass_match: "Passwords don't match.",
  more_soon: "New drops every season.",
});
Object.assign(T.fr, {
  enter_village: "Entrer au village",
  choose_game: "Choisis ton jeu",
  register: "S'inscrire",
  confirm_pass: "Confirme le mot de passe",
  auth_login_sub: "Connecte-toi pour garder ton XP, tes pièces et tes couronnes.",
  auth_reg_sub: "Crée ton compte pour garder ton XP, tes pièces et tes couronnes.",
  already_acct: "Déjà un compte ?",
  new_here: "Nouveau ici ?",
  create_acct: "Créer un compte",
  err_pass_match: "Les mots de passe ne correspondent pas.",
  more_soon: "De nouveaux jeux chaque saison.",
});
Object.assign(T.ar, {
  enter_village: "ادخل القرية",
  choose_game: "اختر لعبتك",
  register: "إنشاء حساب",
  confirm_pass: "أكّد كلمة المرور",
  auth_login_sub: "سجّل الدخول لحفظ خبرتك وعملاتك وتيجانك.",
  auth_reg_sub: "أنشئ حسابك لحفظ خبرتك وعملاتك وتيجانك.",
  already_acct: "لديك حساب بالفعل؟",
  new_here: "جديد هنا؟",
  create_acct: "إنشاء حساب",
  err_pass_match: "كلمتا المرور غير متطابقتين.",
  more_soon: "ألعاب جديدة كل موسم.",
});
function t(k, params) {
  let s = (T[lang] || T.en)[k] ?? T.en[k] ?? k;
  if (params) s = s.replace(/\{(\w+)\}/g, (_, x) => (params[x] != null ? params[x] : ""));
  return s;
}

/* achievements: catalog (matches server) + localized name/desc */
const ACH = [
  { id: "welcome", icon: "🦊" },
  { id: "first_spill", icon: "🍸" },
  { id: "champion", icon: "👑" },
  { id: "hat_trick", icon: "🎩" },
  { id: "unstoppable", icon: "🔥" },
  { id: "socialite", icon: "🎉" },
  { id: "veteran", icon: "🎖️" },
  { id: "rising_star", icon: "⭐" },
];
const ACH_T = {
  en: {
    welcome: ["Welcome!", "Created your KYUUBI account"],
    first_spill: ["First Spill", "Finished your first game"],
    champion: ["Champion", "Won a game"],
    hat_trick: ["Hat-trick", "Won 3 games"],
    unstoppable: ["Unstoppable", "Won 10 games"],
    socialite: ["Socialite", "Played with 4+ people"],
    veteran: ["Veteran", "Played 10 games"],
    rising_star: ["Rising Star", "Reached level 5"],
  },
  fr: {
    welcome: ["Bienvenue !", "Compte KYUUBI créé"],
    first_spill: ["Première partie", "Terminé ta première partie"],
    champion: ["Champion", "Gagné une partie"],
    hat_trick: ["Coup du chapeau", "Gagné 3 parties"],
    unstoppable: ["Inarrêtable", "Gagné 10 parties"],
    socialite: ["Boute-en-train", "Joué à 4+ personnes"],
    veteran: ["Vétéran", "Joué 10 parties"],
    rising_star: ["Étoile montante", "Atteint le niveau 5"],
  },
  ar: {
    welcome: ["أهلًا بك!", "أنشأت حساب KYUUBI"],
    first_spill: ["أول لعبة", "أنهيت أول لعبة لك"],
    champion: ["بطل", "فزت بلعبة"],
    hat_trick: ["هاتريك", "فزت بـ3 ألعاب"],
    unstoppable: ["لا يُوقَف", "فزت بـ10 ألعاب"],
    socialite: ["اجتماعي", "لعبت مع 4 أشخاص أو أكثر"],
    veteran: ["محترف", "لعبت 10 ألعاب"],
    rising_star: ["نجم صاعد", "وصلت للمستوى 5"],
  },
};
function achMeta(id) {
  const a = (ACH_T[lang] && ACH_T[lang][id]) || ACH_T.en[id] || [id, ""];
  return { name: a[0], desc: a[1] };
}

/* competitive ranks: tier id → localized name + a few rank-screen strings.
   The division (1–3) is appended as a number; Radiant has no division. */
const RANK_T = {
  en: {
    iron: "Iron", bronze: "Bronze", silver: "Silver", gold: "Gold",
    platinum: "Platinum", diamond: "Diamond", ascendant: "Ascendant",
    immortal: "Immortal", radiant: "Radiant",
    rank: "Rank", next_rank: "to next rank", top_rank: "Top rank — you're Radiant! 🌟",
  },
  fr: {
    iron: "Fer", bronze: "Bronze", silver: "Argent", gold: "Or",
    platinum: "Platine", diamond: "Diamant", ascendant: "Ascendant",
    immortal: "Immortel", radiant: "Radiant",
    rank: "Rang", next_rank: "avant le rang suivant", top_rank: "Rang max — tu es Radiant ! 🌟",
  },
  ar: {
    iron: "حديد", bronze: "برونز", silver: "فضة", gold: "ذهب",
    platinum: "بلاتين", diamond: "ماس", ascendant: "صاعد",
    immortal: "خالد", radiant: "مشعّ",
    rank: "الرتبة", next_rank: "حتى الرتبة التالية", top_rank: "أعلى رتبة — أنت مشعّ! 🌟",
  },
};
function rtxt(key) {
  return (RANK_T[lang] && RANK_T[lang][key]) || RANK_T.en[key] || key;
}
function rankLabel(rank) {
  if (!rank) return "";
  const name = rtxt(rank.tier);
  return rank.division ? `${name} ${rank.division}` : name;
}
// Small colored pill showing the tier icon + name (+ division). size: "sm" | "lg".
function rankBadge(rank, size) {
  if (!rank) return "";
  const cls = "rank-badge" + (size ? " " + size : "");
  return `<span class="${cls}" style="--rank:${esc(rank.color)}" title="${esc(rankLabel(rank))}">
    <span class="rank-ic">${rank.icon}</span>
    <span class="rank-tx">${esc(rankLabel(rank))}</span>
  </span>`;
}

/* ---------------- helpers ---------------- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function initial(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

/* ---------------- account state + API ---------------- */
let account = null;
let modalKind = null; // 'auth' | 'profile' | 'leaderboard' | null
let lbData = null;
let lbGame = "spill"; // which game's own leaderboard is showing
let authTab = "login";
let authBusy = false;
let authError = "";
let authDraft = { user: "", pass: "" };

function getToken() { return localStorage.getItem("kyuubi.token"); }
function saveToken(tok) { localStorage.setItem("kyuubi.token", tok); }
function clearToken() { localStorage.removeItem("kyuubi.token"); }

async function apiPost(url, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  try {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body || {}) });
    return await r.json();
  } catch {
    return { error: "generic" };
  }
}
async function apiMe(token) {
  try {
    const r = await fetch("/api/me", { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) return null;
    return (await r.json()).profile;
  } catch {
    return null;
  }
}

/* ---------------- UI pieces ---------------- */
function langBar() {
  return `<div class="langbar">${LANGS.map(
    (l) => `<button class="langpill ${lang === l.code ? "on" : ""}" data-lang="${l.code}">${l.code === "ar" ? "ع" : l.code.toUpperCase()}</button>`
  ).join("")}</div>`;
}
function accountChip() {
  if (account) {
    return `<button class="acct-chip" data-act="open-profile">
      <span class="avatar sm" style="background:${esc(account.color)}">${esc(initial(account.name))}</span>
      <span class="acct-name">${esc(account.name)}</span>
      ${account.rank ? rankBadge(account.rank, "sm") : `<span class="acct-lvl">${t("lvl")} ${account.level}</span>`}
    </button>`;
  }
  return `<button class="btn btn-cyan sm" data-act="open-auth">👤 ${t("login")}</button>`;
}
function lbButton() {
  return `<button class="btn btn-ghost sm" data-act="open-leaderboard" title="${t("leaderboard")}">🏆</button>`;
}
async function fetchLeaderboard() {
  const forGame = lbGame;
  try {
    const r = await fetch("/api/leaderboard?game=" + encodeURIComponent(forGame));
    const players = (await r.json()).players || [];
    if (lbGame === forGame) lbData = players; // ignore a stale response after a tab switch
  } catch {
    if (lbGame === forGame) lbData = [];
  }
  if (modalKind === "leaderboard") render();
}
function leaderboardModal() {
  // One tab per game — each game keeps its own ranked board.
  const games = GAMES.filter((g) => g.ready);
  const tabs = `<div class="lb-games">${games
    .map(
      (g) =>
        `<button class="lb-game ${g.id === lbGame ? "on" : ""}" data-act="lb-game" data-game="${g.id}" title="${esc(g.name())}">${g.emoji}</button>`
    )
    .join("")}</div>
  <div class="count-hint" style="text-align:center;margin:8px 0 10px">${t("lb_points_sub")}</div>`;

  let list;
  if (!lbData) list = `<p class="muted" style="text-align:center;padding:16px">…</p>`;
  else if (!lbData.length) list = `<div class="empty-note">${t("lb_empty")}</div>`;
  else
    list = `<div class="gl-list">${lbData
      .map((p, i) => {
        const medal = ["🥇", "🥈", "🥉"][i] || `#${i + 1}`;
        const mine = account && account.name === p.name;
        return `<div class="gl-row ${mine ? "me" : ""}">
        <span class="gl-rank">${medal}</span>
        <span class="avatar sm" style="background:${esc(p.color)}">${esc(initial(p.name))}</span>
        <span class="gl-name">${esc(p.name)}</span>
        ${p.tier ? rankBadge(p.tier, "sm") : ""}
        <span class="gl-lvl">${p.wins}–${p.losses}</span>
        <span class="gl-xp">${p.points} ${t("lb_pts")}</span>
      </div>`;
      })
      .join("")}</div>`;

  const cur = games.find((g) => g.id === lbGame);
  const title = `🏆 ${cur ? cur.emoji + " " + cur.name() : t("leaderboard")}`;
  return modal(tabs + list, title);
}

const GAMES = [
  { id: "spill", href: "/spill", emoji: "🍸", accent: "var(--pink)", name: () => "SPILL", tag: () => t("spill_tag"), pill: { en: "Truth or Dare", fr: "Action/Vérité", ar: "صراحة/تحدٍّ" }, ready: true },
  { id: "memory", href: "/memory", emoji: "🎴", accent: "var(--cyan)", name: () => t("memory_name"), tag: () => t("memory_tag"), pill: { en: "Team memory", fr: "Mémoire en équipe", ar: "ذاكرة جماعية" }, ready: true },
  { id: "sudoku", href: "/sudoku", emoji: "🔢", accent: "var(--green)", name: () => t("sudoku_name"), tag: () => t("sudoku_tag"), pill: { en: "Team vs team", fr: "Équipe vs équipe", ar: "فريق ضد فريق" }, ready: true },
  { id: "puzzle", href: "/puzzle", emoji: "🧩", accent: "var(--gold)", name: () => t("puzzle_name"), tag: () => t("puzzle_tag"), pill: { en: "Jigsaw · AI", fr: "Puzzle · IA", ar: "أحجية · ذكاء" }, ready: true },
  { id: "words", href: "/words", emoji: "🔤", accent: "var(--pink)", name: () => t("words_name"), tag: () => t("words_tag"), pill: { en: "Word race", fr: "Course de mots", ar: "سباق الكلمات" }, ready: true },
  { id: "draw", href: "/draw", emoji: "🎨", accent: "var(--violet)", name: () => t("draw_name"), tag: () => t("draw_tag"), pill: { en: "Draw · AI · Guess", fr: "Dessin · IA · Devine", ar: "رسم · ذكاء · تخمين" }, ready: true },
  { id: "queens", href: "/queens", emoji: "👑", accent: "var(--gold)", name: () => t("queens_name"), tag: () => t("queens_tag"), pill: { en: "Crown logic", fr: "Logique couronnes", ar: "منطق التيجان" }, ready: true },
  { id: "zip", href: "/zip", emoji: "⚡", accent: "var(--cyan)", name: () => t("zip_name"), tag: () => t("zip_tag"), pill: { en: "Team vs team", fr: "Équipe vs équipe", ar: "فريق ضد فريق" }, ready: true },
  { id: "headsup", href: "#", emoji: "🧠", accent: "var(--violet)", name: () => t("headsup_name"), tag: () => t("headsup_tag"), pill: { en: "Guessing", fr: "Devinettes", ar: "تخمين" }, ready: false },
];
/* which of the three KyuubiZ screens is showing: accueil → auth → games */
let view = "accueil";

const KANJI = "和 · 平和 · 力 · 栄誉";

// screen 1 — the hero: raefet.png behind, a call to "Enter the village"
function accueilView() {
  return `
  <div class="kz-corner-lang">${langBar()}</div>
  <section class="kz-accueil">
    <div class="kz-hero-bg"></div>
    <div class="kz-hero-veil"></div>
    <div class="kz-hero-content">
      <div class="kz-kanji">${KANJI}</div>
      <button class="kz-enter" data-act="enter-village">${t("enter_village")} →</button>
    </div>
  </section>`;
}

// screen 2 — the login / register scroll card
function authView() {
  const isReg = authTab === "register";
  const sub = isReg ? t("auth_reg_sub") : t("auth_login_sub");
  const btn = isReg ? t("signup_cta") : t("login_cta");
  const switchText = isReg ? t("already_acct") : t("new_here");
  const switchLink = isReg ? t("log_in") : t("create_acct");
  const confirmField = isReg
    ? `<input class="kz-field" id="acc-pass2" data-draft="pass2" type="password" maxlength="64" placeholder="${esc(t("confirm_pass"))}" autocomplete="new-password" value="${esc(authDraft.pass2 || "")}"/>`
    : "";
  return `
  <div class="kz-corner-lang">${langBar()}</div>
  <section class="kz-auth">
    <div class="kz-auth-bg"></div>
    <div class="kz-auth-veil"></div>
    <div class="kz-auth-wrap">
      <div class="kz-scroll-card">
        <div class="kz-card-frame"></div>
        <div class="kz-stamp">忍</div>
        <div class="kz-vert">忠誠 · 勇気 · 戦之道</div>
        <div class="kz-auth-body">
          <div class="kz-kanji sm">${KANJI}</div>
          <div class="kz-logo-wrap">
            <div class="kz-sun"></div>
            <h1 class="kz-logo">Kyuubi<span>Z</span></h1>
          </div>
          <div class="kz-brush"></div>
          <p class="kz-auth-sub">${esc(sub)}</p>
          <div class="kz-seg">
            <button class="${!isReg ? "on" : ""}" data-act="auth-tab" data-tab="login">${t("log_in")}</button>
            <button class="${isReg ? "on" : ""}" data-act="auth-tab" data-tab="register">${t("register")}</button>
          </div>
          <div class="kz-auth-form">
            <input class="kz-field" id="acc-user" data-draft="user" maxlength="20" placeholder="${esc(t("username"))}" autocomplete="username" value="${esc(authDraft.user)}"/>
            <input class="kz-field" id="acc-pass" data-draft="pass" type="password" maxlength="64" placeholder="${esc(t("password"))}" autocomplete="${isReg ? "new-password" : "current-password"}" value="${esc(authDraft.pass)}"/>
            ${confirmField}
            ${authError ? `<div class="form-err">${esc(authError)}</div>` : ""}
            <button class="kz-submit" data-act="${isReg ? "do-register" : "do-login"}" ${authBusy ? "disabled" : ""}>${authBusy ? "…" : btn} →</button>
          </div>
          <p class="kz-auth-switch">${esc(switchText)} <a href="#" data-act="toggle-auth">${esc(switchLink)}</a></p>
          <button class="kz-back" data-act="to-accueil">← ${esc(t("close"))}</button>
        </div>
      </div>
    </div>
  </section>`;
}

// screen 3 — the games menu (shown once logged in)
const CLOUD_SVG = `<svg class="kz-cloud" viewBox="0 0 100 70" fill="currentColor" aria-hidden="true"><path d="M30 55c-11 0-20-8-20-18 0-9 7-16 16-17 2-9 10-15 20-15 8 0 15 4 18 11 2-1 4-1 6-1 9 0 16 7 16 16s-7 16-16 16H30z"/></svg>`;
function gameCardHTML(g) {
  const pill = g.pill[lang] || g.pill.en;
  const cta = g.ready ? `${t("play")} →` : `🔒 ${t("soon")}`;
  const inner = `${CLOUD_SVG}
    <div class="kz-game-head">
      <span class="kz-game-ic">${g.emoji}</span>
      <span class="kz-game-tag">${esc(pill)}</span>
    </div>
    <h3 class="kz-game-name">${g.name()}</h3>
    <p class="kz-game-desc">${g.tag()}</p>
    <span class="kz-game-cta ${g.ready ? "" : "soon"}">${cta}</span>`;
  if (g.ready && account) return `<a class="kz-game" href="${g.href}">${inner}</a>`;
  if (g.ready) return `<div class="kz-game" data-act="require-login">${inner}</div>`;
  return `<div class="kz-game soon">${inner}</div>`;
}
function gamesView() {
  const cards = GAMES.map(gameCardHTML).join("");
  const more = `<div class="kz-more">
    <span class="kz-more-ic">✧</span>
    <span class="kz-more-t">${t("more")}</span>
    <span class="kz-more-s">${t("more_soon")}</span>
  </div>`;
  return `
  <div class="kz-games">
    <div class="kz-games-top"></div>
    <header class="kz-header">
      <div class="kz-logo sm">🦊 Kyuubi<span>Z</span></div>
      <div class="kz-nav">${langBar()}${lbButton()}${accountChip()}</div>
    </header>
    <main class="kz-main">
      <div class="kz-main-head">
        <div>
          <div class="kz-kanji sm">${KANJI}</div>
          <h1 class="kz-title">${t("choose_game")}</h1>
          <p class="kz-title-sub">${t("tagline")}</p>
        </div>
        <span class="kz-yokai">妖怪</span>
      </div>
      <div class="kz-grid">${cards}${more}</div>
      <p class="kz-foot">${t("foot")} · KyuubiZ</p>
    </main>
  </div>`;
}


function modal(inner, title) {
  return `<div class="modal-backdrop" data-act="close-modal">
    <div class="modal-card panel" data-act="noop">
      <div class="row spread" style="margin-bottom:10px">
        <h3 class="display" style="font-size:22px">${esc(title)}</h3>
        <button class="btn btn-ghost sm" data-act="close-modal">✕</button>
      </div>
      ${inner}
    </div>
  </div>`;
}
function profileModal() {
  const a = account;
  if (!a) return "";
  const pct = Math.round((a.intoLevel / a.levelSpan) * 100);
  const rk = a.rank;
  const rankPct = rk && rk.spanXp ? Math.round((rk.intoXp / rk.spanXp) * 100) : 100;
  const rankFoot = rk && rk.spanXp
    ? `${rk.intoXp}/${rk.spanXp} XP ${rtxt("next_rank")}`
    : rtxt("top_rank");
  const st = a.stats || {};
  const achs = ACH.map((x) => {
    const got = (a.achievements || []).includes(x.id);
    const m = achMeta(x.id);
    return `<div class="ach-item ${got ? "got" : "locked"}">
      <div class="ach-ic">${got ? x.icon : "🔒"}</div>
      <div class="ach-nm">${esc(m.name)}</div>
      <div class="ach-ds">${esc(m.desc)}</div>
    </div>`;
  }).join("");
  return modal(
    `<div class="prof-head">
      <div class="avatar xl" style="background:${esc(a.color)}">${esc(initial(a.name))}</div>
      <div>
        <div class="prof-name">${esc(a.name)}</div>
        <div class="prof-lvl">${t("level", { n: a.level })} · ${a.xp} XP · 🪙 ${a.coins || 0}</div>
      </div>
    </div>
    ${rk ? `<div class="rank-show" style="--rank:${esc(rk.color)}">
      <div class="rank-show-top">
        <span class="rank-emoji">${rk.icon}</span>
        <div class="rank-show-txt">
          <div class="rank-show-lbl">${rtxt("rank")}</div>
          <div class="rank-show-name">${esc(rankLabel(rk))}</div>
        </div>
      </div>
      <div class="rank-bar"><div class="rank-fill" style="width:${rankPct}%"></div></div>
      <div class="count-hint" style="text-align:center;margin-top:4px">${esc(rankFoot)}</div>
    </div>` : ""}
    <div class="xp-bar"><div class="xp-fill" style="width:${pct}%"></div></div>
    <div class="count-hint" style="text-align:center;margin-top:4px">${a.intoLevel}/${a.levelSpan} → ${t("level", { n: a.level + 1 })}</div>
    <div class="stat-row">
      <div class="stat-tile"><div class="stat-n">${st.gamesPlayed || 0}</div><div class="stat-l">${t("games_played")}</div></div>
      <div class="stat-tile"><div class="stat-n">${st.wins || 0}</div><div class="stat-l">${t("wins")}</div></div>
      <div class="stat-tile"><div class="stat-n">🪙 ${a.coins || 0}</div><div class="stat-l">${t("coins")}</div></div>
    </div>
    <div class="stat-row" style="margin-top:8px">
      <div class="stat-tile"><div class="stat-n">${(a.modes && a.modes.versus && a.modes.versus.xp) || 0}</div><div class="stat-l">⚔️ ${t("lb_versus")} XP</div></div>
      <div class="stat-tile"><div class="stat-n">${(a.modes && a.modes.solo && a.modes.solo.xp) || 0}</div><div class="stat-l">🧍 ${t("lb_solo")} XP</div></div>
    </div>
    <div class="games-title" style="font-size:16px;margin:16px 4px 8px">${t("achievements")} · ${(a.achievements || []).length}/${ACH.length}</div>
    <div class="ach-grid">${achs}</div>
    <button class="btn btn-ghost block" style="margin-top:14px" data-act="logout">${t("logout")}</button>`,
    t("profile")
  );
}

/* ---------------- render ---------------- */
function render() {
  let body;
  if (view === "games") body = gamesView();
  else if (view === "auth") body = authView();
  else body = accueilView();
  $home.innerHTML = body + overlayHTML();
}

function overlayHTML() {
  return modalKind === "profile"
    ? profileModal()
    : modalKind === "leaderboard"
    ? leaderboardModal()
    : "";
}


/* ---------------- events ---------------- */
$home.addEventListener("click", async (e) => {
  const langBtn = e.target.closest("[data-lang]");
  if (langBtn) { setLang(langBtn.dataset.lang); return; }
  const el = e.target.closest("[data-act]");
  if (!el) return;
  try { await onAct(el.dataset.act, el); } catch (err) { console.error(err); }
});
$home.addEventListener("input", (e) => {
  const k = e.target.dataset.draft;
  if (k) authDraft[k] = e.target.value;
});
$home.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.dataset && e.target.dataset.draft) {
    e.preventDefault();
    doAuth(authTab === "login" ? "login" : "register");
  }
});

async function onAct(act, el) {
  switch (act) {
    case "noop": break;
    case "enter-village":
      // From the hero: members go straight to the games menu, guests to sign-in.
      if (account) { view = "games"; render(); window.scrollTo(0, 0); }
      else { view = "auth"; authTab = "login"; authError = ""; render(); focusUser(); }
      break;
    case "to-accueil": view = "accueil"; authError = ""; render(); window.scrollTo(0, 0); break;
    case "open-auth":
    case "require-login":
      view = "auth"; authTab = "login"; authError = ""; render(); focusUser(); break;
    case "toggle-auth":
      authTab = authTab === "login" ? "register" : "login"; authError = ""; render(); focusUser(); break;
    case "open-profile": modalKind = "profile"; render(); break;
    case "open-leaderboard": modalKind = "leaderboard"; lbGame = "spill"; lbData = null; render(); fetchLeaderboard(); break;
    case "lb-game": {
      const g = el.dataset.game;
      if (g && g !== lbGame) { lbGame = g; lbData = null; render(); fetchLeaderboard(); }
      break;
    }
    case "close-modal": modalKind = null; authError = ""; render(); break;
    case "auth-tab": authTab = el.dataset.tab; authError = ""; render(); focusUser(); break;
    case "do-login": await doAuth("login"); break;
    case "do-register": await doAuth("register"); break;
    case "logout": await doLogout(); break;
  }
}
function focusUser() {
  requestAnimationFrame(() => document.getElementById("acc-user")?.focus());
}
function errText(code) {
  const map = { name_taken: "err_name_taken", bad_username: "err_bad_username", bad_password: "err_bad_password", bad_login: "err_bad_login" };
  return t(map[code] || "err_generic");
}
async function doAuth(kind) {
  const u = (document.getElementById("acc-user")?.value || "").trim();
  const p = document.getElementById("acc-pass")?.value || "";
  const p2 = document.getElementById("acc-pass2")?.value || "";
  authDraft = { user: u, pass: p, pass2: p2 };
  if (!u || !p) { authError = t("err_fill"); render(); focusUser(); return; }
  if (kind === "register" && p2 !== p) { authError = t("err_pass_match"); render(); focusUser(); return; }
  authBusy = true; authError = ""; render();
  const res = kind === "login" ? await apiPost("/api/login", { username: u, password: p }) : await apiPost("/api/register", { username: u, password: p });
  authBusy = false;
  if (res && res.ok) {
    saveToken(res.token);
    account = res.profile;
    modalKind = null;
    authDraft = { user: "", pass: "", pass2: "" };
    view = "games"; // step through the village gate
    render();
    window.scrollTo(0, 0);
  } else {
    authError = errText(res && res.error);
    render();
    focusUser();
  }
}
async function doLogout() {
  const tok = getToken();
  if (tok) apiPost("/api/logout", {}, tok);
  clearToken();
  account = null;
  modalKind = null;
  view = "accueil"; // back to the gate
  render();
  window.scrollTo(0, 0);
}

/* ---------------- falling cherry-blossom petals (canvas) ----------------
   JS/rAF-driven so it plays for everyone, including viewers with
   prefers-reduced-motion: reduce (which suppresses CSS animations). */
(function petals() {
  const canvas = document.getElementById("kzPetals");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const COLORS = ["#ffb7c5", "#ff8fab", "#f06a86", "#e0475f", "#c1272d"];
  let w, h, dpr, ps;
  function mk(fromTop) {
    const size = (7 + Math.random() * 12) * dpr;
    return {
      x: Math.random() * w,
      y: fromTop ? -size * 2 - Math.random() * h * 0.3 : Math.random() * h,
      size,
      vy: (0.05 + Math.random() * 0.14) * dpr,
      sway: (14 + Math.random() * 30) * dpr,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 0.005 + Math.random() * 0.012,
      rot: Math.random() * Math.PI * 2,
      vr: -0.015 + Math.random() * 0.03,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      alpha: 0.7 + Math.random() * 0.3,
    };
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width = Math.round(window.innerWidth * dpr);
    h = canvas.height = Math.round(window.innerHeight * dpr);
    const n = Math.max(20, Math.min(44, Math.floor(window.innerWidth / 32)));
    ps = Array.from({ length: n }, () => mk(false));
  }
  function petal(p) {
    const s = p.size;
    ctx.save();
    ctx.translate(p.x + Math.sin(p.swayPhase) * p.sway, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.62, -s * 0.5, s * 0.62, s * 0.55, 0, s);
    ctx.bezierCurveTo(-s * 0.62, s * 0.55, -s * 0.62, -s * 0.5, 0, -s);
    ctx.fill();
    ctx.restore();
  }
  function frame() {
    ctx.clearRect(0, 0, w, h);
    for (const p of ps) {
      p.y += p.vy;
      p.swayPhase += p.swaySpeed;
      p.rot += p.vr;
      if (p.y - p.size > h) Object.assign(p, mk(true));
      petal(p);
    }
    requestAnimationFrame(frame);
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();
  requestAnimationFrame(frame);
})();

/* ---------------- boot ---------------- */
(async function initAccount() {
  const tok = getToken();
  if (tok) {
    const p = await apiMe(tok);
    if (p) { account = p; view = "games"; render(); }
    else clearToken();
  }
})();

render();
