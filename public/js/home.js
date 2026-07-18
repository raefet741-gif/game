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
    lb_wins: "wins",
    lb_solved: "solved",
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
let lbMode = "versus"; // 'versus' (against others) | 'solo' (alone)
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
      <span class="acct-lvl">${t("lvl")} ${account.level}</span>
    </button>`;
  }
  return `<button class="btn btn-cyan sm" data-act="open-auth">👤 ${t("login")}</button>`;
}
function lbButton() {
  return `<button class="btn btn-ghost sm" data-act="open-leaderboard" title="${t("leaderboard")}">🏆</button>`;
}
async function fetchLeaderboard() {
  const forMode = lbMode;
  try {
    const r = await fetch("/api/leaderboard?mode=" + encodeURIComponent(forMode));
    const players = (await r.json()).players || [];
    if (lbMode === forMode) lbData = players; // ignore a stale response after a tab switch
  } catch {
    if (lbMode === forMode) lbData = [];
  }
  if (modalKind === "leaderboard") render();
}
function leaderboardModal() {
  const isSolo = lbMode === "solo";
  const tabs = `<div class="tabs" style="justify-content:center;margin-bottom:6px">
    <button class="${!isSolo ? "on" : ""}" data-act="lb-tab" data-mode="versus">⚔️ ${t("lb_versus")}</button>
    <button class="${isSolo ? "on" : ""}" data-act="lb-tab" data-mode="solo">🧍 ${t("lb_solo")}</button>
  </div>
  <div class="count-hint" style="text-align:center;margin-bottom:10px">${isSolo ? t("lb_solo_sub") : t("lb_versus_sub")}</div>`;

  let list;
  if (!lbData) list = `<p class="muted" style="text-align:center;padding:16px">…</p>`;
  else if (!lbData.length) list = `<div class="empty-note">${t("lb_empty")}</div>`;
  else
    list = `<div class="gl-list">${lbData
      .map((p, i) => {
        const medal = ["🥇", "🥈", "🥉"][i] || `#${p.rank}`;
        const mine = account && account.name === p.name;
        const sub = isSolo
          ? `${p.gamesPlayed} ${t("lb_solved")}`
          : `${p.wins} ${t("lb_wins")}`;
        return `<div class="gl-row ${mine ? "me" : ""}">
        <span class="gl-rank">${medal}</span>
        <span class="avatar sm" style="background:${esc(p.color)}">${esc(initial(p.name))}</span>
        <span class="gl-name">${esc(p.name)}</span>
        <span class="gl-lvl">${sub}</span>
        <span class="gl-xp">${p.xp} XP</span>
      </div>`;
      })
      .join("")}</div>`;
  return modal(tabs + list, "🏆 " + t("leaderboard"));
}

const GAMES = [
  { id: "spill", href: "/spill", emoji: "🍸", accent: "var(--pink)", name: () => "SPILL", tag: () => t("spill_tag"), pill: { en: "Truth or Dare", fr: "Action/Vérité", ar: "صراحة/تحدٍّ" }, ready: true },
  { id: "memory", href: "/memory", emoji: "🎴", accent: "var(--cyan)", name: () => t("memory_name"), tag: () => t("memory_tag"), pill: { en: "Team memory", fr: "Mémoire en équipe", ar: "ذاكرة جماعية" }, ready: true },
  { id: "sudoku", href: "/sudoku", emoji: "🔢", accent: "var(--green)", name: () => t("sudoku_name"), tag: () => t("sudoku_tag"), pill: { en: "Team vs team", fr: "Équipe vs équipe", ar: "فريق ضد فريق" }, ready: true },
  { id: "puzzle", href: "/puzzle", emoji: "🧩", accent: "var(--gold)", name: () => t("puzzle_name"), tag: () => t("puzzle_tag"), pill: { en: "Jigsaw · AI", fr: "Puzzle · IA", ar: "أحجية · ذكاء" }, ready: true },
  { id: "words", href: "/words", emoji: "🔤", accent: "var(--pink)", name: () => t("words_name"), tag: () => t("words_tag"), pill: { en: "Word race", fr: "Course de mots", ar: "سباق الكلمات" }, ready: true },
  { id: "draw", href: "/draw", emoji: "🎨", accent: "var(--violet)", name: () => t("draw_name"), tag: () => t("draw_tag"), pill: { en: "Draw · AI · Guess", fr: "Dessin · IA · Devine", ar: "رسم · ذكاء · تخمين" }, ready: true },
  { id: "headsup", href: "#", emoji: "🧠", accent: "var(--violet)", name: () => t("headsup_name"), tag: () => t("headsup_tag"), pill: { en: "Guessing", fr: "Devinettes", ar: "تخمين" }, ready: false },
];
function cardHTML(g, i) {
  const pill = g.pill[lang] || g.pill.en;
  const cta = g.ready
    ? account
      ? `<span class="gc-cta">${t("play")} <span aria-hidden="true">→</span></span>`
      : `<span class="gc-cta">🔒 ${t("login_to_play")}</span>`
    : `<span class="gc-badge">🔒 ${t("soon")}</span>`;
  const inner = `
    <span class="gc-tag-pill">${pill}</span>
    <div class="gc-emoji">${g.emoji}</div>
    <div class="gc-name">${g.name()}</div>
    <div class="gc-tag">${g.tag()}</div>
    ${cta}`;
  const style = `--accent:${g.accent};animation-delay:${(i * 0.12).toFixed(2)}s`;
  // Games require an account — logged out, the card opens the login modal instead.
  if (g.ready && account) return `<a class="game-card ready" href="${g.href}" style="${style}">${inner}</a>`;
  if (g.ready) return `<div class="game-card ready" data-act="require-login" style="${style}">${inner}</div>`;
  return `<div class="game-card soon" style="${style}">${inner}</div>`;
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
function authModal() {
  const isLogin = authTab === "login";
  return modal(
    `<div class="tabs" style="justify-content:center;margin-bottom:12px">
      <button class="${isLogin ? "on" : ""}" data-act="auth-tab" data-tab="login">${t("log_in")}</button>
      <button class="${!isLogin ? "on" : ""}" data-act="auth-tab" data-tab="register">${t("sign_up")}</button>
    </div>
    <label class="field">${t("username")}
      <input class="input" id="acc-user" data-draft="user" maxlength="20" autocomplete="username" value="${esc(authDraft.user)}" />
    </label>
    <label class="field" style="margin-top:10px">${t("password")}
      <input class="input" id="acc-pass" data-draft="pass" type="password" maxlength="64" autocomplete="${isLogin ? "current-password" : "new-password"}" value="${esc(authDraft.pass)}" />
    </label>
    ${authError ? `<div class="form-err">${esc(authError)}</div>` : ""}
    <button class="btn ${isLogin ? "btn-cyan" : "btn-pink"} block lg" style="margin-top:14px" data-act="${isLogin ? "do-login" : "do-register"}" ${authBusy ? "disabled" : ""}>
      ${authBusy ? "…" : isLogin ? t("login_cta") : t("signup_cta")}</button>`,
    t("account")
  );
}
function profileModal() {
  const a = account;
  if (!a) return "";
  const pct = Math.round((a.intoLevel / a.levelSpan) * 100);
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
  const cards = GAMES.map(cardHTML).join("");
  const placeholder = `<div class="game-card placeholder" style="--accent:var(--violet);animation-delay:${(GAMES.length * 0.12).toFixed(2)}s">
      <div class="gc-emoji">✨</div><div class="gc-tag">${t("more")}</div></div>`;
  const overlay = modalKind === "auth" ? authModal() : modalKind === "profile" ? profileModal() : modalKind === "leaderboard" ? leaderboardModal() : "";

  $home.innerHTML = `
    <div class="home-top">
      <span class="home-sub">🦊 KYUUBI</span>
      <div class="top-right">${langBar()}${lbButton()}${accountChip()}</div>
    </div>
    <div class="hero-wrap">
      <div class="kyuubi-mark">🦊</div>
      <h1 class="home-brand">KYUUBI</h1>
      <p class="home-tagline">${t("tagline")}</p>
      <p class="home-sub">${t("sub")}</p>
      <div class="scroll-hint" id="scrollHint">⌄</div>
    </div>
    <div class="games-title">${t("games")}</div>
    <div class="games-grid">${cards}${placeholder}</div>
    <div class="home-foot">${account ? "" : t("guest_hint") + " · "}${t("foot")}</div>
    ${overlay}`;
  attachTilt();
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
    case "open-auth":
    case "require-login": modalKind = "auth"; authTab = "login"; authError = ""; render(); focusUser(); break;
    case "open-profile": modalKind = "profile"; render(); break;
    case "open-leaderboard": modalKind = "leaderboard"; lbMode = "versus"; lbData = null; render(); fetchLeaderboard(); break;
    case "lb-tab": {
      const m = el.dataset.mode === "solo" ? "solo" : "versus";
      if (m !== lbMode) { lbMode = m; lbData = null; render(); fetchLeaderboard(); }
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
  authDraft = { user: u, pass: p };
  if (!u || !p) { authError = t("err_fill"); render(); focusUser(); return; }
  authBusy = true; authError = ""; render();
  const res = kind === "login" ? await apiPost("/api/login", { username: u, password: p }) : await apiPost("/api/register", { username: u, password: p });
  authBusy = false;
  if (res && res.ok) {
    saveToken(res.token);
    account = res.profile;
    modalKind = null;
    authDraft = { user: "", pass: "" };
    render();
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
  render();
}

/* ---------------- 3D tilt ---------------- */
function attachTilt() {
  if (!canHover || reduceMotion) return;
  document.querySelectorAll(".game-card.ready").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty("--ry", `${(px * 10).toFixed(2)}deg`);
      card.style.setProperty("--rx", `${(-py * 10).toFixed(2)}deg`);
    });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--ry", "0deg");
      card.style.setProperty("--rx", "0deg");
    });
  });
}

/* ---------------- drifting star canvas ---------------- */
(function stars() {
  if (reduceMotion) return;
  const canvas = document.getElementById("stars");
  if (!canvas) return;
  const g = canvas.getContext("2d");
  let w, h, dpr, pts;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width = window.innerWidth * dpr;
    h = canvas.height = window.innerHeight * dpr;
    const n = Math.min(90, Math.floor((window.innerWidth * window.innerHeight) / 22000));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: (Math.random() * 1.6 + 0.4) * dpr, s: (Math.random() * 0.3 + 0.05) * dpr,
      a: Math.random() * 0.5 + 0.2, tw: Math.random() * 0.02 + 0.005, p: Math.random() * Math.PI * 2,
    }));
  }
  const COLORS = ["255,61,119", "34,224,214", "255,197,61", "139,92,246"];
  function frame() {
    g.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.y -= p.s; p.p += p.tw;
      if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
      const alpha = p.a * (0.6 + 0.4 * Math.sin(p.p));
      g.beginPath();
      g.fillStyle = `rgba(${COLORS[(p.x | 0) % COLORS.length]},${alpha})`;
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }
    requestAnimationFrame(frame);
  }
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
})();

/* ---------------- background: static image + scroll hint ---------------- */
(function bgScroll() {
  window.addEventListener("scroll", () => {
    const hint = document.getElementById("scrollHint");
    if (hint) hint.classList.toggle("hide", (window.scrollY || 0) > 40);
  }, { passive: true });
})();

/* ---------------- boot ---------------- */
(async function initAccount() {
  const tok = getToken();
  if (tok) {
    const p = await apiMe(tok);
    if (p) { account = p; render(); }
    else clearToken();
  }
})();

render();
