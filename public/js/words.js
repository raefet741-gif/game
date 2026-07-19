// public/js/words.js
// WORD WONDERS client. The server (/words namespace) owns the puzzle; this file
// renders the crossword grid + letter wheel, turns swipes into words, and shows
// each mode's race. Answers never arrive until they're found, so no peeking.

import { sfx, confettiBurst, flagSVG } from "./effects.js";

const socket = io("/words", { reconnection: true });
const $app = document.getElementById("app");

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
  const dir = LANGS.find((l) => l.code === code).dir;
  document.documentElement.lang = code;
  document.documentElement.dir = dir;
  render();
}

const T = {
  en: {
    brand: "WORD WONDERS",
    tagline: "Swipe the wheel to spell words. Fill the crossword. Race to win.",
    create: "Create room", join: "Join room", back: "Back",
    your_name: "Your name", pick_color: "Pick a color",
    room_code: "Room code", create_go: "Create", join_go: "Join",
    lobby: "Lobby", share_hint: "Share this code so friends can join:",
    mode: "Mode", mode_solo: "Solo", mode_versus: "Versus", mode_teams: "Teams",
    mode_solo_d: "Play alone across the rounds.",
    mode_versus_d: "Everyone races the same puzzle — first to finish wins.",
    mode_teams_d: "Teammates share one board — first team to finish wins.",
    rounds: "Rounds", difficulty: "Difficulty",
    easy: "Easy", medium: "Medium", hard: "Hard",
    num_teams: "Number of teams", pick_team: "Tap a team to join it",
    teams: "Teams", players: "Players",
    start_game: "Start game", need_players: "Need at least 2 players.",
    need_teams: "Fill at least 2 teams.", host_only: "Only the host can do that.",
    waiting_host: "Waiting for the host to start…", you: "you", host: "host",
    round: "Round", of: "of", found: "Found", time: "Time", bonus: "Bonus",
    shuffle: "Shuffle", clear: "Clear",
    finished_you: "You finished!", waiting_others: "Waiting for others…",
    waiting_team: "Waiting for your team…",
    your_time: "Your time", scoreboard: "Progress",
    round_won: "wins the round!", you_won_round: "You won the round!",
    next_round: "Next round", see_final: "See final result",
    end_round: "End round", end_game: "End game",
    champion: "Champion", play_again: "Play again", go_home: "Home",
    final: "Final standings", wins: "wins", dnf: "—",
    already: "Already found", not_word: "Not a word", nice: "Nice!",
    bonus_word: "Bonus word!", reconnecting: "Reconnecting…",
    coins: "coins", xp: "XP", you_earned: "You earned",
    err_locked: "Can't change that after the game starts.",
    err_started: "That game already started.",
    err_no_code: "No room with that code.",
    err_generic: "Something glitched — try again.",
    solo_hint: "Solo is best played alone — invite friends only in Versus or Teams.",
    swipe_hint: "Swipe across the letters to spell a word",
    word_lang: "Words are in", lang_en: "English", lang_fr: "French", lang_ar: "Arabic",
    powerups: "Power-up cards", your_coins: "Your coins",
    pu_hint: "Reveal a letter", pu_hint_d: "Uncover one hidden letter as a clue.",
    pu_reveal: "Reveal a word", pu_reveal_d: "Solve a whole word for you.",
    pu_login: "Log in on the home page to buy power-up cards with your coins.",
    pu_revealed: "Revealed!", pu_letter_clue: "Clue letter!",
    err_coins: "Not enough coins for that card.",
    err_nothing: "Nothing left to reveal.",
    err_pu_login: "Log in to use power-up cards.",
  },
  fr: {
    brand: "WORD WONDERS",
    tagline: "Glisse sur la roue pour former des mots. Remplis la grille. Cours vers la victoire.",
    create: "Créer un salon", join: "Rejoindre", back: "Retour",
    your_name: "Ton nom", pick_color: "Choisis une couleur",
    room_code: "Code du salon", create_go: "Créer", join_go: "Rejoindre",
    lobby: "Salon", share_hint: "Partage ce code pour que tes amis rejoignent :",
    mode: "Mode", mode_solo: "Solo", mode_versus: "Versus", mode_teams: "Équipes",
    mode_solo_d: "Joue seul au fil des manches.",
    mode_versus_d: "Tout le monde joue la même grille — le premier à finir gagne.",
    mode_teams_d: "Les coéquipiers partagent une grille — la première équipe à finir gagne.",
    rounds: "Manches", difficulty: "Difficulté",
    easy: "Facile", medium: "Moyen", hard: "Difficile",
    num_teams: "Nombre d'équipes", pick_team: "Touche une équipe pour la rejoindre",
    teams: "Équipes", players: "Joueurs",
    start_game: "Démarrer", need_players: "Il faut au moins 2 joueurs.",
    need_teams: "Remplis au moins 2 équipes.", host_only: "Seul l'hôte peut faire ça.",
    waiting_host: "En attente du lancement par l'hôte…", you: "toi", host: "hôte",
    round: "Manche", of: "sur", found: "Trouvés", time: "Temps", bonus: "Bonus",
    shuffle: "Mélanger", clear: "Effacer",
    finished_you: "Terminé !", waiting_others: "En attente des autres…",
    waiting_team: "En attente de ton équipe…",
    your_time: "Ton temps", scoreboard: "Progression",
    round_won: "gagne la manche !", you_won_round: "Tu gagnes la manche !",
    next_round: "Manche suivante", see_final: "Voir le résultat",
    end_round: "Terminer la manche", end_game: "Terminer",
    champion: "Champion", play_again: "Rejouer", go_home: "Accueil",
    final: "Classement final", wins: "victoires", dnf: "—",
    already: "Déjà trouvé", not_word: "Pas un mot", nice: "Bravo !",
    bonus_word: "Mot bonus !", reconnecting: "Reconnexion…",
    coins: "pièces", xp: "XP", you_earned: "Tu as gagné",
    err_locked: "Impossible de changer ça une fois lancé.",
    err_started: "La partie a déjà commencé.",
    err_no_code: "Aucun salon avec ce code.",
    err_generic: "Un bug — réessaie.",
    solo_hint: "Le solo se joue seul — invite des amis en Versus ou Équipes.",
    swipe_hint: "Glisse sur les lettres pour former un mot",
    word_lang: "Les mots sont en", lang_en: "anglais", lang_fr: "français", lang_ar: "arabe",
    powerups: "Cartes d'aide", your_coins: "Tes pièces",
    pu_hint: "Révéler une lettre", pu_hint_d: "Dévoile une lettre cachée comme indice.",
    pu_reveal: "Révéler un mot", pu_reveal_d: "Résout un mot entier pour toi.",
    pu_login: "Connecte-toi sur l'accueil pour acheter des cartes avec tes pièces.",
    pu_revealed: "Révélé !", pu_letter_clue: "Lettre indice !",
    err_coins: "Pas assez de pièces pour cette carte.",
    err_nothing: "Plus rien à révéler.",
    err_pu_login: "Connecte-toi pour utiliser les cartes d'aide.",
  },
  ar: {
    brand: "WORD WONDERS",
    tagline: "اسحب على العجلة لتكوين الكلمات. املأ الشبكة. تسابق للفوز.",
    create: "إنشاء غرفة", join: "انضمام", back: "رجوع",
    your_name: "اسمك", pick_color: "اختر لونًا",
    room_code: "رمز الغرفة", create_go: "إنشاء", join_go: "انضمام",
    lobby: "الغرفة", share_hint: "شارك هذا الرمز لينضم أصدقاؤك:",
    mode: "الوضع", mode_solo: "فردي", mode_versus: "تنافسي", mode_teams: "فرق",
    mode_solo_d: "العب بمفردك عبر الجولات.",
    mode_versus_d: "الجميع يلعب نفس اللغز — أول من ينهي يفوز.",
    mode_teams_d: "أعضاء الفريق يتشاركون لوحة واحدة — أول فريق ينهي يفوز.",
    rounds: "الجولات", difficulty: "الصعوبة",
    easy: "سهل", medium: "متوسط", hard: "صعب",
    num_teams: "عدد الفرق", pick_team: "اضغط على فريق للانضمام إليه",
    teams: "الفرق", players: "اللاعبون",
    start_game: "ابدأ اللعبة", need_players: "تحتاج لاعبَين على الأقل.",
    need_teams: "املأ فريقين على الأقل.", host_only: "المضيف فقط يمكنه ذلك.",
    waiting_host: "بانتظار أن يبدأ المضيف…", you: "أنت", host: "المضيف",
    round: "الجولة", of: "من", found: "وُجدت", time: "الوقت", bonus: "إضافي",
    shuffle: "خلط", clear: "مسح",
    finished_you: "أنهيت!", waiting_others: "بانتظار الآخرين…",
    waiting_team: "بانتظار فريقك…",
    your_time: "وقتك", scoreboard: "التقدّم",
    round_won: "يفوز بالجولة!", you_won_round: "فزت بالجولة!",
    next_round: "الجولة التالية", see_final: "عرض النتيجة",
    end_round: "إنهاء الجولة", end_game: "إنهاء",
    champion: "البطل", play_again: "العب مجددًا", go_home: "الرئيسية",
    final: "الترتيب النهائي", wins: "انتصارات", dnf: "—",
    already: "موجودة مسبقًا", not_word: "ليست كلمة", nice: "أحسنت!",
    bonus_word: "كلمة إضافية!", reconnecting: "إعادة الاتصال…",
    coins: "عملات", xp: "خبرة", you_earned: "لقد ربحت",
    err_locked: "لا يمكن تغيير ذلك بعد بدء اللعبة.",
    err_started: "بدأت اللعبة بالفعل.",
    err_no_code: "لا توجد غرفة بهذا الرمز.",
    err_generic: "حدث خلل — حاول مجددًا.",
    solo_hint: "الوضع الفردي يُلعب بمفردك — ادعُ أصدقاءك في التنافسي أو الفرق.",
    swipe_hint: "اسحب على الحروف لتكوين كلمة",
    word_lang: "الكلمات باللغة", lang_en: "الإنجليزية", lang_fr: "الفرنسية", lang_ar: "العربية",
    powerups: "بطاقات المساعدة", your_coins: "عملاتك",
    pu_hint: "اكشف حرفًا", pu_hint_d: "يكشف حرفًا مخفيًا واحدًا كتلميح.",
    pu_reveal: "اكشف كلمة", pu_reveal_d: "يحل كلمة كاملة من أجلك.",
    pu_login: "سجّل الدخول من الصفحة الرئيسية لشراء البطاقات بعملاتك.",
    pu_revealed: "تم الكشف!", pu_letter_clue: "حرف تلميح!",
    err_coins: "عملات غير كافية لهذه البطاقة.",
    err_nothing: "لا شيء متبقٍ للكشف.",
    err_pu_login: "سجّل الدخول لاستخدام بطاقات المساعدة.",
  },
};
const t = (k) => (T[lang] || T.en)[k] || T.en[k] || k;

const ERR_MAP = {
  wow_err_locked: "err_locked",
  wow_err_host_only: "host_only",
  wow_err_need_players: "need_players",
  wow_err_need_teams: "need_teams",
  wow_err_started: "err_started",
  wow_err_no_code: "err_no_code",
  wow_err_coins: "err_coins",
  wow_err_nothing: "err_nothing",
  wow_err_login: "err_pu_login",
};
const tErr = (key) => t(ERR_MAP[key] || "err_generic");
// Localized name of a word-language code (e.g. "en" -> "English"/"anglais").
const langName = (code) => t("lang_" + (code || "en")) || (code || "en");

/* ---------------- session ---------------- */
function loadSession() {
  try { return JSON.parse(localStorage.getItem("words.session") || "null"); }
  catch { return null; }
}
function saveSession(s) { session = s; localStorage.setItem("words.session", JSON.stringify(s)); }
function clearSession() { session = null; localStorage.removeItem("words.session"); }
function getToken() { return localStorage.getItem("kyuubi.token"); }
// Pull the logged-in profile so we can show the coin balance and enable the solo
// power-up cards. Guests (no token) stay null and just see a "log in" prompt.
function refreshAccount() {
  const token = getToken();
  // Login is required to play — bounce guests back to the home page.
  if (!token) { location.replace("/"); return Promise.resolve(); }
  return fetch("/api/me", { headers: { Authorization: "Bearer " + token } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      account = (d && d.profile) || null;
      if (!account) { location.replace("/"); return; } // expired / invalid token
      // The name always comes from the signed-in profile — players never retype it.
      drafts.name = account.name;
      if (!drafts.color && account.color) drafts.color = account.color;
      render();
    })
    .catch(() => {});
}
function myCoins() { return account ? account.coins || 0 : 0; }
// Display name for the pre-game forms: always the signed-in profile name.
function myName() { return (account && account.name) || drafts.name || ""; }

/* ---------------- state ---------------- */
let config = { colors: [], serverUrl: "" };
let state = null;
let session = loadSession();
let pre = "landing"; // landing | create | join
let drafts = { name: "", color: "", joinCode: "" };
let hadFirstConnect = false;
let account = null; // logged-in profile ({coins,...}) or null for guests
let buying = false; // guards against double-buying a power-up card

// Local board for the current round.
let board = {
  round: -1,
  wheel: [],          // display letters (uppercase)
  layout: null,       // { rows, cols, slots:[{id,row,col,dir,len}] }
  total: 0,
  foundWords: new Map(), // slotId -> WORD
  bonus: new Set(),   // bonus WORDS this player found
  hintCells: new Map(), // "r,c" -> letter revealed by the hint power-up
};
let roundStartLocal = 0;
let tickHandle = null;

// Live swipe selection (indices into board.wheel).
let sel = [];
let selecting = false;
let pointerXY = null;
let flash = null; // {kind:'ok'|'bonus'|'dup'|'bad', text}

/* ---------------- helpers ---------------- */
function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
function loc(x) {
  if (x == null) return "";
  if (typeof x === "string") return x;
  return x[lang] || x.en || "";
}
function myId() { return session?.playerId || null; }
function myPlayer() { return state?.players.find((p) => p.id === myId()) || null; }
function isHost() { return state && myId() === state.hostId; }
function teamMeta(idx) { return state?.teams.find((tm) => tm.index === idx) || null; }
function teamName(idx) { const m = teamMeta(idx); return m ? loc(m.name) : "?"; }
function teamColor(idx) { const m = teamMeta(idx); return m ? m.color : "#888"; }
function initials(name) { return (name || "?").trim().charAt(0).toUpperCase() || "?"; }
function fmtTime(ms) {
  if (ms == null) return t("dnf");
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
function inviteBase() {
  const o = location.origin;
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(o) ? config.serverUrl || o : o;
}
function isTeams() { return state?.settings?.mode === "teams"; }
function toast(message, kind = "ok") {
  const wrap = document.getElementById("toasts");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 250); }, 2200);
}

/* ---------------- board helpers ---------------- */
function resetBoard(p) {
  board = {
    round: p?.round ?? 0,
    wheel: (p?.wheel || []).slice(),
    layout: p?.layout || null,
    total: p?.total || 0,
    foundWords: new Map(),
    bonus: new Set(),
    hintCells: new Map(),
  };
  for (const f of p?.found || []) board.foundWords.set(f.slotId, f.word);
  for (const w of p?.bonus || []) board.bonus.add(w);
  for (const h of p?.hints || []) board.hintCells.set(`${h.row},${h.col}`, h.letter);
  sel = []; selecting = false; pointerXY = null;
  roundStartLocal = Date.now();
}

// Map "r,c" -> letter for every found slot's cells.
function cellLetterMap() {
  const map = new Map();
  if (!board.layout) return map;
  for (const s of board.layout.slots) {
    const word = board.foundWords.get(s.id);
    if (!word) continue;
    const dr = s.dir === "V" ? 1 : 0;
    const dc = s.dir === "H" ? 1 : 0;
    for (let i = 0; i < word.length; i++) {
      map.set(`${s.row + dr * i},${s.col + dc * i}`, word[i]);
    }
  }
  return map;
}
// Set of active "r,c" (cells that belong to any slot).
function activeCells() {
  const set = new Set();
  if (!board.layout) return set;
  for (const s of board.layout.slots) {
    const dr = s.dir === "V" ? 1 : 0;
    const dc = s.dir === "H" ? 1 : 0;
    for (let i = 0; i < s.len; i++) set.add(`${s.row + dr * i},${s.col + dc * i}`);
  }
  return set;
}
function myFoundCount() {
  // In teams mode the board is shared, so foundWords already reflects the team.
  return board.foundWords.size;
}

/* ---------------- socket ---------------- */
socket.on("connect", () => {
  const firstLoad = !hadFirstConnect;
  hadFirstConnect = true;
  refreshAccount();
  if (session?.code && session?.playerId) {
    socket.emit("wow_join", { code: session.code, playerId: session.playerId, token: getToken() }, (res) => {
      if (!res?.ok) { clearSession(); state = null; render(); return; }
      if (firstLoad && res.state?.status === "lobby") {
        // Fresh page load into a lobby we already left mentally — rejoin is fine.
      }
      applyState(res.state);
    });
  } else if (firstLoad) render();
});

socket.on("wow_config", (c) => {
  config = c;
  if (!drafts.color) drafts.color = config.colors[0] || "";
  render();
});
socket.on("wow_state", (next) => applyState(next));

socket.on("wow_puzzle", (p) => {
  resetBoard(p);
  render();
});

socket.on("wow_found", ({ slotId, word, by }) => {
  if (!board.foundWords.has(slotId)) {
    board.foundWords.set(slotId, word);
    if (by !== myId()) sfx.click();
    render();
  }
});

socket.on("wow_hint", ({ row, col, letter }) => {
  board.hintCells.set(`${row},${col}`, letter);
  sfx.click();
  render();
});

socket.on("wow_roundover", ({ answers }) => {
  // Reveal the full solution on the board.
  if (answers) for (const a of answers) board.foundWords.set(a.id, a.word);
  sfx.win();
  render();
});

socket.on("wow_gameover", () => {
  confettiBurst();
  sfx.win();
});

socket.on("wow_reward", ({ coins, xp, won }) => {
  if (won) confettiBurst();
  toast(`${t("you_earned")} +${coins} ${t("coins")} · +${xp} ${t("xp")}`, won ? "ok" : "ok");
});

socket.on("wow_notice", ({ type, message }) =>
  toast(tErr(message), type === "error" ? "error" : "ok")
);
socket.on("disconnect", () => toast(t("reconnecting"), "error"));

function applyState(next) {
  const prevStatus = state?.status;
  state = next;
  if (next.status === "playing") {
    // Board itself arrives via wow_puzzle; here we just keep the clock ticking.
    if (board.round !== next.round && next.wheel && (!board.layout || board.round < 0)) {
      // Safety net if wow_puzzle was missed (e.g. reconnect ordering).
      resetBoard({ round: next.round, wheel: next.wheel, layout: next.layout, total: next.total, found: [], bonus: [] });
    }
    if (next.roundStartMs) roundStartLocal = next.roundStartMs - 0; // absolute ref
    if (!tickHandle) startTick();
  } else {
    stopTick();
  }
  render();
  if (next.status === "roundover" && prevStatus === "playing") sfx.win();
}

/* ---------------- local round clock ---------------- */
function startTick() {
  stopTick();
  tickHandle = setInterval(() => {
    const el = document.getElementById("wow-timer");
    if (el) el.textContent = liveTime();
  }, 250);
}
function stopTick() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}
function liveTime() {
  const me = myPlayer();
  if (me?.finished && me.finishMs != null) return fmtTime(me.finishMs);
  const base = state?.roundStartMs || roundStartLocal;
  return fmtTime(Date.now() - base);
}

/* ---------------- actions ---------------- */
function createRoom() {
  const name = (myName() || "").trim();
  if (!name) return toast(t("your_name"), "error");
  socket.emit("wow_create", { name, color: drafts.color, token: getToken() }, (res) => {
    if (!res?.ok) return toast(tErr(res?.error), "error");
    saveSession({ code: res.code, playerId: res.playerId });
    applyState(res.state);
  });
}
function joinRoom() {
  const name = (drafts.name || "").trim();
  const code = (drafts.joinCode || "").trim().toUpperCase();
  if (!name) return toast(t("your_name"), "error");
  if (!code) return toast(t("room_code"), "error");
  socket.emit("wow_join", { code, name, color: drafts.color, token: getToken() }, (res) => {
    if (!res?.ok) return toast(tErr(res?.error), "error");
    saveSession({ code: res.code, playerId: res.playerId });
    applyState(res.state);
  });
}

function submitSelection() {
  const word = sel.map((i) => board.wheel[i]).join("");
  sel = []; selecting = false; pointerXY = null;
  if (word.length < 3) { render(); return; }
  socket.emit("wow_submit", { word }, (res) => {
    handleSubmitResult(res, word);
  });
  render();
}
function handleSubmitResult(res, word) {
  if (!res) return;
  switch (res.status) {
    case "target":
      board.foundWords.set(res.slotId, res.word);
      sfx.point();
      flashMsg("ok", t("nice"));
      if (res.finished) { confettiBurst(); sfx.win(); }
      break;
    case "bonus":
      board.bonus.add(res.word);
      sfx.point();
      flashMsg("bonus", `+ ${res.word} · ${t("bonus_word")}`);
      break;
    case "dup":
      flashMsg("dup", t("already"));
      break;
    case "short":
    case "none":
    default:
      sfx.buzz();
      flashMsg("bad", t("not_word"));
      break;
  }
  render();
}
function flashMsg(kind, text) {
  flash = { kind, text };
  render();
  setTimeout(() => { flash = null; render(); }, 900);
}

/* ---------------- solo power-up cards ---------------- */
function powerupCost(kind) {
  const p = state && state.powerups && state.powerups[kind];
  return p ? p.cost : kind === "reveal" ? 20 : 8;
}
function buyPowerup(kind) {
  if (buying) return;
  if (!account) return toast(t("err_pu_login"), "error");
  if (myCoins() < powerupCost(kind)) return toast(t("err_coins"), "error");
  buying = true;
  render(); // disable the buttons while the purchase is in flight
  socket.emit("wow_powerup", { kind }, (res) => {
    buying = false;
    if (!res || res.error) {
      if (res && res.error) toast(tErr(res.error), "error");
      return render();
    }
    if (res.coins != null && account) account.coins = res.coins;
    if (res.kind === "reveal") {
      if (res.reveal) board.foundWords.set(res.reveal.slotId, res.reveal.word);
      sfx.point();
      flashMsg("ok", t("pu_revealed"));
      if (res.finished) { confettiBurst(); sfx.win(); }
    } else {
      if (res.hint) board.hintCells.set(`${res.hint.row},${res.hint.col}`, res.hint.letter);
      sfx.point();
      flashMsg("bonus", t("pu_letter_clue"));
    }
    render();
  });
}

/* ---------------- swipe wheel ---------------- */
function letterUnderPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const btn = el && el.closest ? el.closest("[data-idx]") : null;
  if (!btn) return -1;
  const idx = Number(btn.dataset.idx);
  return Number.isInteger(idx) ? idx : -1;
}
function onWheelDown(e) {
  const idx = letterUnderPoint(e.clientX, e.clientY);
  if (idx < 0) return;
  const me = myPlayer();
  if (me?.finished) return;
  e.preventDefault();
  selecting = true;
  sel = [idx];
  pointerXY = { x: e.clientX, y: e.clientY };
  try { e.target.setPointerCapture?.(e.pointerId); } catch {}
  sfx.tick();
  drawWheelLive();
}
function onWheelMove(e) {
  if (!selecting) return;
  e.preventDefault();
  pointerXY = { x: e.clientX, y: e.clientY };
  const idx = letterUnderPoint(e.clientX, e.clientY);
  if (idx >= 0 && !sel.includes(idx)) {
    sel.push(idx);
    sfx.tick();
  }
  drawWheelLive();
}
function onWheelUp(e) {
  if (!selecting) return;
  e.preventDefault();
  submitSelection();
}

// Update just the live SVG line + current-word pill without a full re-render
// (keeps swiping smooth). Falls back to render() when structure changes.
function drawWheelLive() {
  const wheel = document.getElementById("wow-wheel");
  if (!wheel) return;
  const rect = wheel.getBoundingClientRect();
  const poly = document.getElementById("wow-line");
  const pts = sel.map((i) => {
    const b = wheel.querySelector(`[data-idx="${i}"]`);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return `${r.left + r.width / 2 - rect.left},${r.top + r.height / 2 - rect.top}`;
  }).filter(Boolean);
  if (selecting && pointerXY) pts.push(`${pointerXY.x - rect.left},${pointerXY.y - rect.top}`);
  if (poly) poly.setAttribute("points", pts.join(" "));
  // highlight selected letters
  wheel.querySelectorAll("[data-idx]").forEach((b) => {
    b.classList.toggle("on", sel.includes(Number(b.dataset.idx)));
  });
  const cur = document.getElementById("wow-current");
  if (cur) {
    const word = sel.map((i) => board.wheel[i]).join("");
    cur.textContent = word || "";
    cur.classList.toggle("show", !!word);
  }
}

/* ---------------- render ---------------- */
function langBar() {
  return `<div class="langbar">${LANGS.map(
    (l) => `<button class="langpill flagpill ${lang === l.code ? "on" : ""}" data-lang="${l.code}" aria-label="${l.code}">${flagSVG(l.code)}</button>`
  ).join("")}</div>`;
}
function colorDots(selected) {
  return `<div class="ww-colors">${config.colors
    .map((c) => `<button class="ww-dot ${c === selected ? "on" : ""}" data-color="${c}" style="background:${c}"></button>`)
    .join("")}</div>`;
}
function shell(inner) {
  return `
    <div class="ww-top">
      <span class="ww-logo">🔤 ${t("brand")}</span>
      ${langBar()}
    </div>
    <div class="ww-wrap">${inner}</div>
  `;
}

function render() {
  if (!state) return renderPre();
  if (state.status === "lobby") return renderLobby();
  if (state.status === "playing") return renderPlaying();
  if (state.status === "roundover") return renderRoundOver();
  if (state.status === "finished") return renderFinished();
  renderPre();
}

function renderPre() {
  if (pre === "create" || pre === "join") {
    const isCreate = pre === "create";
    $app.innerHTML = shell(`
      <div class="ww-card ww-form">
        <button class="ww-link" data-act="landing">‹ ${t("back")}</button>
        <h2 class="ww-h2">${isCreate ? t("create") : t("join")}</h2>
        <label class="ww-label">${t("your_name")}</label>
        <div class="ww-input ww-name-chip">${esc(myName())}</div>
        ${isCreate ? "" : `
          <label class="ww-label">${t("room_code")}</label>
          <input class="ww-input" id="ww-code" maxlength="12" value="${esc(drafts.joinCode)}" placeholder="WOW-ABCD" style="text-transform:uppercase" />`}
        <label class="ww-label">${t("pick_color")}</label>
        ${colorDots(drafts.color)}
        <button class="ww-btn primary" data-act="${isCreate ? "create" : "join"}">${isCreate ? t("create_go") : t("join_go")}</button>
      </div>
    `);
    return;
  }
  // Full-screen word.png wallpaper. The Create/Join buttons and flags are painted
  // into the image; transparent %-positioned hit-areas (shared .hit classes,
  // words positions under .ww-fs) sit over them.
  $app.innerHTML = `<div class="ww-fs">
    <div class="ww-stage">
      <img class="ww-photo-img" src="/media/words-full.png" alt="Word Wonders — swipe to spell" width="1400" height="778" />
      <button class="hit hit-create" data-act="go-create" aria-label="${esc(t("create"))}"></button>
      <button class="hit hit-join" data-act="go-join" aria-label="${esc(t("join"))}"></button>
      <button class="hit hit-flag hit-en ${lang === "en" ? "on" : ""}" data-lang="en" aria-label="English"></button>
      <button class="hit hit-flag hit-fr ${lang === "fr" ? "on" : ""}" data-lang="fr" aria-label="Français"></button>
      <button class="hit hit-flag hit-ar ${lang === "ar" ? "on" : ""}" data-lang="ar" aria-label="العربية"></button>
    </div>
  </div>`;
}

function renderLobby() {
  const me = myPlayer();
  const host = isHost();
  const base = inviteBase();
  const qr = `/api/qr?text=${encodeURIComponent(base + "/words")}`;
  const s = state.settings;

  const modeCards = ["solo", "versus", "teams"].map((m) => `
    <button class="ww-mode ${s.mode === m ? "on" : ""}" data-mode="${m}" ${host ? "" : "disabled"}>
      <div class="ww-mode-name">${t("mode_" + m)}</div>
      <div class="ww-mode-d">${t("mode_" + m + "_d")}</div>
    </button>`).join("");

  const teamsBlock = s.mode === "teams" ? `
    <div class="ww-card">
      <h3 class="ww-h3">${t("teams")} · <span class="ww-muted">${t("pick_team")}</span></h3>
      <div class="ww-teams">
        ${state.teams.map((tm) => {
          const members = state.players.filter((p) => p.team === tm.index);
          const mine = me?.team === tm.index;
          return `<button class="ww-team ${mine ? "mine" : ""}" data-team="${tm.index}" style="--tc:${tm.color}">
            <div class="ww-team-name">${esc(teamName(tm.index))}</div>
            <div class="ww-team-members">
              ${members.map((p) => `<span class="ww-chip" style="--pc:${p.color}">${esc(p.name)}${p.id === myId() ? " ·" + t("you") : ""}</span>`).join("") || `<span class="ww-empty">—</span>`}
            </div>
          </button>`;
        }).join("")}
      </div>
    </div>` : `
    <div class="ww-card">
      <h3 class="ww-h3">${t("players")}</h3>
      <div class="ww-players">
        ${state.players.map((p) => `<span class="ww-chip" style="--pc:${p.color}">${esc(p.name)}${p.isHost ? " ·" + t("host") : ""}</span>`).join("")}
      </div>
      ${s.mode === "solo" && state.players.length > 1 ? `<div class="ww-hint">${t("solo_hint")}</div>` : ""}
    </div>`;

  const settingsBlock = host ? `
    <div class="ww-card">
      <h3 class="ww-h3">${t("mode")}</h3>
      <div class="ww-modes">${modeCards}</div>
    </div>
    <div class="ww-card">
      <div class="ww-set-row">
        <label class="ww-label">${t("rounds")}</label>
        <select class="ww-select" data-set="rounds">
          ${[1,2,3,4,5,6,7,8,9,10].map((n) => `<option value="${n}" ${s.rounds === n ? "selected" : ""}>${n}</option>`).join("")}
        </select>
      </div>
      <div class="ww-set-row">
        <label class="ww-label">${t("difficulty")}</label>
        <select class="ww-select" data-set="difficulty">
          ${["easy","medium","hard"].map((d) => `<option value="${d}" ${s.difficulty === d ? "selected" : ""}>${t(d)}</option>`).join("")}
        </select>
      </div>
      ${s.mode === "teams" ? `
      <div class="ww-set-row">
        <label class="ww-label">${t("num_teams")}</label>
        <select class="ww-select" data-set="numTeams">
          ${[2,3,4,5,6].map((n) => `<option value="${n}" ${s.numTeams === n ? "selected" : ""}>${n}</option>`).join("")}
        </select>
      </div>` : ""}
      <button class="ww-btn primary full" data-act="start">${t("start_game")}</button>
    </div>` : `<div class="ww-card ww-center ww-muted">${t("waiting_host")}</div>`;

  $app.innerHTML = shell(`
    <div class="ww-lobby">
      <div class="ww-card">
        <div class="ww-code-row">
          <div>
            <div class="ww-label">${t("room_code")}</div>
            <div class="ww-code">${esc(state.code)}</div>
            <div class="ww-hint">${t("share_hint")}</div>
            ${langBadge()}
          </div>
          <img class="ww-qr" src="${qr}" alt="QR" onerror="this.style.display='none'" />
        </div>
      </div>
      ${teamsBlock}
      ${settingsBlock}
      <button class="ww-link danger" data-act="leave">${t("go_home")} ✕</button>
    </div>
  `);
}

function crosswordHTML() {
  if (!board.layout) return "";
  const { rows, cols } = board.layout;
  const active = activeCells();
  const letters = cellLetterMap();
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (!active.has(key)) { cells.push(`<div class="ww-cell blank"></div>`); continue; }
      const letter = letters.get(key);
      if (letter) { cells.push(`<div class="ww-cell filled">${esc(letter)}</div>`); continue; }
      // Not yet part of a found word — but a hint card may have exposed this letter.
      const hint = board.hintCells.get(key);
      cells.push(`<div class="ww-cell ${hint ? "hint" : "empty"}">${hint ? esc(hint) : ""}</div>`);
    }
  }
  return `<div class="ww-grid" style="grid-template-columns:repeat(${cols},1fr)">${cells.join("")}</div>`;
}

function wheelHTML() {
  const n = board.wheel.length;
  const R = 39; // % radius
  const btns = board.wheel.map((ch, i) => {
    const ang = (-90 + (i * 360) / n) * (Math.PI / 180);
    const x = 50 + R * Math.cos(ang);
    const y = 50 + R * Math.sin(ang);
    return `<button class="ww-letter ${sel.includes(i) ? "on" : ""}" data-idx="${i}" style="left:${x}%;top:${y}%">${esc(ch)}</button>`;
  }).join("");
  const word = sel.map((i) => board.wheel[i]).join("");
  return `
    <div class="ww-currentwrap">
      <div class="ww-current ${word ? "show" : ""} ${flash ? "flash-" + flash.kind : ""}" id="wow-current">${flash ? esc(flash.text) : esc(word)}</div>
    </div>
    <div class="ww-wheel" id="wow-wheel" style="touch-action:none">
      <svg class="ww-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline id="wow-line" points="" />
      </svg>
      ${btns}
      <button class="ww-shuffle" data-act="shuffle" title="${t("shuffle")}">🔀</button>
    </div>`;
}

function progressList() {
  if (isTeams()) {
    return state.teams.filter((tm) => tm.members.length).map((tm) => {
      const pct = state.total ? Math.round((tm.foundCount / state.total) * 100) : 0;
      const mine = myPlayer()?.team === tm.index;
      return `<div class="ww-prow ${mine ? "me" : ""}" style="--tc:${tm.color}">
        <span class="ww-ptag">${esc(teamName(tm.index))} · ${tm.wins}🏆</span>
        <div class="ww-pbar"><span style="width:${pct}%;background:${tm.color}"></span></div>
        <span class="ww-pcount">${tm.finished ? "✓ " + fmtTime(tm.finishMs) : `${tm.foundCount}/${state.total}`}</span>
      </div>`;
    }).join("");
  }
  return state.players.map((p) => {
    const pct = state.total ? Math.round((p.foundCount / state.total) * 100) : 0;
    return `<div class="ww-prow ${p.id === myId() ? "me" : ""}" style="--tc:${p.color}">
      <span class="ww-pav" style="background:${p.color}">${esc(initials(p.name))}</span>
      <div class="ww-pbar"><span style="width:${pct}%;background:${p.color}"></span></div>
      <span class="ww-pcount">${p.finished ? "✓ " + fmtTime(p.finishMs) : `${p.foundCount}/${state.total} · ${p.roundWins}🏆`}</span>
    </div>`;
  }).join("");
}

// A small badge telling players which language the puzzle words are in.
function langBadge() {
  const code = state?.wordLang || "en";
  return `<div class="ww-langbadge">🌐 ${t("word_lang")} <b>${esc(langName(code))}</b></div>`;
}

// Solo-only shop: buy a letter clue or a full-word reveal with coins.
function powerupsHTML() {
  if (state?.settings?.mode !== "solo") return "";
  if (myPlayer()?.finished) return "";
  if (!account) {
    return `<div class="ww-powerups locked">
      <div class="ww-pu-title">🃏 ${t("powerups")}</div>
      <div class="ww-hint">${t("pu_login")}</div>
    </div>`;
  }
  const card = (kind, emoji, nameKey, descKey) => {
    const c = powerupCost(kind);
    const enabled = myCoins() >= c && !buying;
    return `<button class="ww-pu ${myCoins() >= c ? "" : "poor"}" data-pu="${kind}" ${enabled ? "" : "disabled"}>
      <span class="ww-pu-emoji">${emoji}</span>
      <span class="ww-pu-name">${t(nameKey)}</span>
      <span class="ww-pu-d">${t(descKey)}</span>
      <span class="ww-pu-cost">🪙 ${c}</span>
    </button>`;
  };
  return `<div class="ww-powerups">
    <div class="ww-pu-head">
      <span class="ww-pu-title">🃏 ${t("powerups")}</span>
      <span class="ww-pu-coins">${t("your_coins")}: <b>🪙 ${myCoins()}</b></span>
    </div>
    <div class="ww-pu-row">
      ${card("hint", "🔍", "pu_hint", "pu_hint_d")}
      ${card("reveal", "💡", "pu_reveal", "pu_reveal_d")}
    </div>
  </div>`;
}

function renderPlaying() {
  const me = myPlayer();
  const finishedMe = isTeams()
    ? (teamMeta(me?.team)?.finished)
    : me?.finished;

  const bonusList = [...board.bonus].slice(-8).map((w) => `<span class="ww-bpill">${esc(w)}</span>`).join("");

  const playArea = finishedMe ? `
    <div class="ww-done">
      <div class="ww-done-emoji">🎉</div>
      <div class="ww-done-title">${t("finished_you")}</div>
      <div class="ww-done-time">${t("your_time")}: <b>${fmtTime(me?.finishMs)}</b></div>
      <div class="ww-muted">${isTeams() ? t("waiting_others") : t("waiting_others")}</div>
    </div>` : `
    ${wheelHTML()}
    <div class="ww-hint center">${t("swipe_hint")}</div>`;

  $app.innerHTML = shell(`
    <div class="ww-play">
      <div class="ww-hud">
        <div class="ww-hud-item"><span class="ww-hud-k">${t("round")}</span><span class="ww-hud-v">${state.round + 1}/${state.totalRounds}</span></div>
        <div class="ww-hud-item"><span class="ww-hud-k">${t("found")}</span><span class="ww-hud-v">${myFoundCount()}/${state.total}</span></div>
        <div class="ww-hud-item"><span class="ww-hud-k">${t("time")}</span><span class="ww-hud-v" id="wow-timer">${liveTime()}</span></div>
        <div class="ww-hud-item"><span class="ww-hud-k">${t("bonus")}</span><span class="ww-hud-v">${board.bonus.size}</span></div>
      </div>
      ${langBadge()}
      ${crosswordHTML()}
      ${bonusList ? `<div class="ww-bonus">${bonusList}</div>` : ""}
      ${playArea}
      ${powerupsHTML()}
      <div class="ww-progress">${progressList()}</div>
      ${isHost() ? `<div class="ww-host-row">
        <button class="ww-link" data-act="end-round">${t("end_round")}</button>
        <button class="ww-link danger" data-act="end">${t("end_game")}</button>
      </div>` : ""}
    </div>
  `);
  if (selecting) drawWheelLive();
}

function renderRoundOver() {
  const w = state.roundWinner;
  const host = isHost();
  const last = state.round + 1 >= state.totalRounds;
  let winLine = "";
  if (w) {
    if (w.kind === "team") {
      winLine = `<b style="color:${teamColor(w.id)}">${esc(teamName(w.id))}</b> ${t("round_won")}`;
    } else {
      const p = state.players.find((x) => x.id === w.id);
      winLine = w.id === myId() ? t("you_won_round")
        : `<b style="color:${p?.color || "#fff"}">${esc(p?.name || "?")}</b> ${t("round_won")}`;
    }
  }

  $app.innerHTML = shell(`
    <div class="ww-wrap-narrow">
      <div class="ww-card ww-center">
        <div class="ww-trophy">🏆</div>
        <div class="ww-winline">${winLine}</div>
        <div class="ww-muted">${t("round")} ${state.round + 1}/${state.totalRounds}</div>
      </div>
      <div class="ww-card">
        <h3 class="ww-h3">${t("scoreboard")}</h3>
        ${progressList()}
      </div>
      <div class="ww-card ww-solved">
        ${crosswordHTML()}
      </div>
      ${host
        ? `<button class="ww-btn primary full" data-act="next">${last ? t("see_final") : t("next_round")}</button>`
        : `<div class="ww-card ww-center ww-muted">${t("waiting_host")}</div>`}
    </div>
  `);
}

function renderFinished() {
  const r = state.result;
  const champ = r?.champion;
  const host = isHost();
  const champName = !champ ? "—" : champ.kind === "team" ? teamName(champ.team) : esc(champ.name);
  const champColor = !champ ? "#fff" : champ.kind === "team" ? teamColor(champ.team) : champ.color;

  const rows = (r?.standings || []).map((sd, i) => {
    const nm = sd.kind === "team" ? teamName(sd.team) : esc(sd.name);
    const col = sd.kind === "team" ? teamColor(sd.team) : sd.color;
    return `<div class="ww-finalrow">
      <span class="ww-rank">${["🥇","🥈","🥉"][i] || "#" + (i + 1)}</span>
      <span class="ww-swatch" style="background:${col}"></span>
      <span class="ww-fname">${nm}</span>
      <span class="ww-fwins">${sd.wins} <small>${t("wins")}</small></span>
    </div>`;
  }).join("");

  $app.innerHTML = shell(`
    <div class="ww-wrap-narrow">
      <div class="ww-card ww-center ww-champ" style="--tc:${champColor}">
        <div class="ww-trophy big">🏆</div>
        <div class="ww-champ-label">${t("champion")}</div>
        <div class="ww-champ-name" style="color:${champColor}">${champName}</div>
      </div>
      <div class="ww-card">
        <h3 class="ww-h3">${t("final")}</h3>
        <div class="ww-final-list">${rows}</div>
      </div>
      ${host ? `<button class="ww-btn primary full" data-act="again">${t("play_again")}</button>` : `<div class="ww-card ww-center ww-muted">${t("waiting_host")}</div>`}
      <button class="ww-link" data-act="leave">${t("go_home")}</button>
    </div>
  `);
}

/* ---------------- events (delegated) ---------------- */
$app.addEventListener("input", (e) => {
  if (e.target.id === "ww-name") drafts.name = e.target.value;
  if (e.target.id === "ww-code") drafts.joinCode = e.target.value;
});
$app.addEventListener("change", (e) => {
  const set = e.target.dataset.set;
  if (set) {
    const val = set === "difficulty" ? e.target.value : Number(e.target.value);
    socket.emit("wow_settings", { [set]: val });
  }
});
$app.addEventListener("pointerdown", (e) => {
  if (e.target.closest("#wow-wheel") && e.target.closest("[data-idx]")) onWheelDown(e);
});
$app.addEventListener("pointermove", onWheelMove);
window.addEventListener("pointerup", onWheelUp);
window.addEventListener("pointercancel", onWheelUp);

$app.addEventListener("click", (e) => {
  const langBtn = e.target.closest("[data-lang]");
  if (langBtn) return setLang(langBtn.dataset.lang);

  const dot = e.target.closest("[data-color]");
  if (dot) { drafts.color = dot.dataset.color; return render(); }

  const modeBtn = e.target.closest("[data-mode]");
  if (modeBtn && !modeBtn.disabled) return socket.emit("wow_settings", { mode: modeBtn.dataset.mode });

  const team = e.target.closest("[data-team]");
  if (team) return socket.emit("wow_join_team", { team: Number(team.dataset.team) });

  const pu = e.target.closest("[data-pu]");
  if (pu && !pu.disabled) return buyPowerup(pu.dataset.pu);

  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  switch (act) {
    case "go-create": pre = "create"; return renderPre();
    case "go-join": pre = "join"; return renderPre();
    case "landing": pre = "landing"; return renderPre();
    case "create": return createRoom();
    case "join": return joinRoom();
    case "start": return socket.emit("wow_start");
    case "next": return socket.emit("wow_next");
    case "end-round": return socket.emit("wow_end_round");
    case "end": return socket.emit("wow_end");
    case "again": return socket.emit("wow_again");
    case "shuffle":
      board.wheel = shuffleArr(board.wheel);
      sel = [];
      return render();
    case "leave":
      socket.emit("wow_leave");
      clearSession();
      state = null;
      pre = "landing";
      stopTick();
      return render();
  }
});

function shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

render();
