// public/js/sudoku.js
// SUDOKU RACE client. The server (/sudoku namespace) owns the authoritative game;
// this file renders sdk_state, draws the player's own TEAM grid (shared with
// teammates), and turns taps into sdk_set events. Opponent grids are never sent —
// only their fill progress — so nobody can copy. Winning teams earn coins + XP.

import { sfx, confettiBurst, flagSVG } from "./effects.js";

const socket = io("/sudoku", { reconnection: true });
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
    brand: "SUDOKU RACE",
    tagline: "Team vs team. Fill the grid first to win the coins.",
    create: "Create room", join: "Join room", solo: "Play solo", back: "Back",
    solo_title: "Solo puzzle", solo_start: "Start puzzle",
    solo_done: "Solved!", solo_reward: "Puzzle complete — coins earned!",
    your_name: "Your name", pick_color: "Pick a color",
    room_code: "Room code", create_go: "Create", join_go: "Join",
    lobby: "Lobby", share_hint: "Share this code so friends can join:",
    pick_team: "Tap a team to join it", teams: "Teams", players: "Players",
    settings: "Settings", num_teams: "Number of teams", difficulty: "Difficulty",
    easy: "Easy", medium: "Medium", hard: "Hard",
    board_size: "Board", size_classic: "Classic 9×9", size_mini: "Mini 6×6",
    stuck: "Stuck?", use_hint: "Use a hint", hint_used: "Hint used", hint_taken: "Revealed a cell",
    start_game: "Start game", need_players: "Need at least 2 players.",
    need_teams: "Fill at least 2 teams.", host_only: "Only the host can do that.",
    waiting_host: "Waiting for the host to start…", you: "you", host: "host",
    time: "Time", filled: "Filled", your_team: "Your team",
    shared_hint: "Your whole team fills this one grid together.",
    erase: "Erase", progress: "Progress", solved: "Solved!",
    end_game: "End game", go_home: "Home",
    champion: "Champion", play_again: "Play again",
    final: "Final result", won_line: "finishes first!", dnf: "—",
    your_reward: "You earned", coins: "coins", xp: "XP",
    login_hint: "Log in on the home page to keep your coins & XP.",
    reconnecting: "Reconnecting…",
    err_locked: "Can't change that after the game starts.",
    err_started: "That game already started.", err_no_code: "No room with that code.",
    err_generic: "Something glitched — try again.",
    err_login: "Log in to buy a hint.", err_hint_used: "You've already used your hint this game.",
    err_coins: "Not enough coins for a hint.", err_nothing: "Nothing left to reveal.",
  },
  fr: {
    brand: "SUDOKU RACE",
    tagline: "Équipe contre équipe. Remplis la grille en premier pour rafler les pièces.",
    create: "Créer un salon", join: "Rejoindre", solo: "Jouer solo", back: "Retour",
    solo_title: "Grille solo", solo_start: "Commencer",
    solo_done: "Résolu !", solo_reward: "Grille terminée — pièces gagnées !",
    your_name: "Ton nom", pick_color: "Choisis une couleur",
    room_code: "Code du salon", create_go: "Créer", join_go: "Rejoindre",
    lobby: "Salon", share_hint: "Partage ce code pour que tes amis rejoignent :",
    pick_team: "Touche une équipe pour la rejoindre", teams: "Équipes", players: "Joueurs",
    settings: "Réglages", num_teams: "Nombre d'équipes", difficulty: "Difficulté",
    easy: "Facile", medium: "Moyen", hard: "Difficile",
    board_size: "Grille", size_classic: "Classique 9×9", size_mini: "Mini 6×6",
    stuck: "En panne d'inspiration ?", use_hint: "Utiliser un indice", hint_used: "Indice utilisé", hint_taken: "Une case révélée",
    start_game: "Démarrer", need_players: "Il faut au moins 2 joueurs.",
    need_teams: "Remplis au moins 2 équipes.", host_only: "Seul l'hôte peut faire ça.",
    waiting_host: "En attente du lancement par l'hôte…", you: "toi", host: "hôte",
    time: "Temps", filled: "Rempli", your_team: "Ton équipe",
    shared_hint: "Toute ton équipe remplit cette même grille ensemble.",
    erase: "Effacer", progress: "Progression", solved: "Résolu !",
    end_game: "Terminer", go_home: "Accueil",
    champion: "Champion", play_again: "Rejouer",
    final: "Résultat final", won_line: "termine en premier !", dnf: "—",
    your_reward: "Tu as gagné", coins: "pièces", xp: "XP",
    login_hint: "Connecte-toi sur l'accueil pour garder tes pièces et ton XP.",
    reconnecting: "Reconnexion…",
    err_locked: "Impossible de changer ça une fois lancé.",
    err_started: "La partie a déjà commencé.", err_no_code: "Aucun salon avec ce code.",
    err_generic: "Un bug — réessaie.",
    err_login: "Connecte-toi pour acheter un indice.", err_hint_used: "Tu as déjà utilisé ton indice cette partie.",
    err_coins: "Pas assez de pièces pour un indice.", err_nothing: "Plus rien à révéler.",
  },
  ar: {
    brand: "سباق سودوكو",
    tagline: "فريق ضد فريق. أكمل الشبكة أولًا لتربح العملات.",
    create: "إنشاء غرفة", join: "انضمام", solo: "العب منفردًا", back: "رجوع",
    solo_title: "لغز فردي", solo_start: "ابدأ اللغز",
    solo_done: "حُلّت!", solo_reward: "اكتمل اللغز — ربحت عملات!",
    your_name: "اسمك", pick_color: "اختر لونًا",
    room_code: "رمز الغرفة", create_go: "إنشاء", join_go: "انضمام",
    lobby: "الغرفة", share_hint: "شارك هذا الرمز لينضم أصدقاؤك:",
    pick_team: "اضغط على فريق للانضمام إليه", teams: "الفرق", players: "اللاعبون",
    settings: "الإعدادات", num_teams: "عدد الفرق", difficulty: "الصعوبة",
    easy: "سهل", medium: "متوسط", hard: "صعب",
    board_size: "الشبكة", size_classic: "كلاسيكي ٩×٩", size_mini: "ميني ٦×٦",
    stuck: "عالق؟", use_hint: "استخدم تلميحًا", hint_used: "تم استخدام التلميح", hint_taken: "تم كشف خلية",
    start_game: "ابدأ اللعبة", need_players: "تحتاج لاعبَين على الأقل.",
    need_teams: "املأ فريقين على الأقل.", host_only: "المضيف فقط يمكنه ذلك.",
    waiting_host: "بانتظار أن يبدأ المضيف…", you: "أنت", host: "المضيف",
    time: "الوقت", filled: "مملوء", your_team: "فريقك",
    shared_hint: "فريقك بأكمله يملأ هذه الشبكة الواحدة معًا.",
    erase: "مسح", progress: "التقدّم", solved: "حُلّت!",
    end_game: "إنهاء", go_home: "الرئيسية",
    champion: "البطل", play_again: "العب مجددًا",
    final: "النتيجة النهائية", won_line: "ينهي أولًا!", dnf: "—",
    your_reward: "لقد ربحت", coins: "عملة", xp: "خبرة",
    login_hint: "سجّل الدخول من الصفحة الرئيسية للاحتفاظ بعملاتك وخبرتك.",
    reconnecting: "إعادة الاتصال…",
    err_locked: "لا يمكن تغيير ذلك بعد بدء اللعبة.",
    err_started: "بدأت اللعبة بالفعل.", err_no_code: "لا توجد غرفة بهذا الرمز.",
    err_generic: "حدث خلل — حاول مجددًا.",
    err_login: "سجّل الدخول لشراء تلميح.", err_hint_used: "لقد استخدمت تلميحك في هذه الجولة.",
    err_coins: "لا تملك عملات كافية للتلميح.", err_nothing: "لا يوجد المزيد للكشف.",
  },
};
const t = (k) => (T[lang] || T.en)[k] || T.en[k] || k;

const ERR_MAP = {
  sdk_err_locked: "err_locked",
  sdk_err_host_only: "host_only",
  sdk_err_need_players: "need_players",
  sdk_err_need_teams: "need_teams",
  sdk_err_started: "err_started",
  sdk_err_no_code: "err_no_code",
  sdk_err_login: "err_login",
  sdk_err_hint_used: "err_hint_used",
  sdk_err_coins: "err_coins",
  sdk_err_nothing: "err_nothing",
};
function tErr(key) {
  return t(ERR_MAP[key] || "err_generic");
}

/* ---------------- session + account ---------------- */
function loadSession() {
  try { return JSON.parse(localStorage.getItem("sudoku.session") || "null"); }
  catch { return null; }
}
function saveSession(s) { session = s; localStorage.setItem("sudoku.session", JSON.stringify(s)); }
function clearSession() { session = null; localStorage.removeItem("sudoku.session"); }
function accountToken() { return localStorage.getItem("kyuubi.token") || null; }

// Pull the logged-in profile so we can show the live coin balance on the hint
// power-up. Guests (no token) stay null and just get a "log in" prompt.
let account = null; // logged-in profile ({coins,...}) or null for guests
let buyingHint = false; // guards against double-buying the hint mid-flight
function refreshAccount() {
  const token = accountToken();
  // Login is required to play — bounce guests back to the home page where the
  // sign-in / sign-up lives.
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
let pre = "landing"; // landing | create | join | solo
let drafts = { name: "", color: "", joinCode: "", difficulty: "medium", size: "mini" };
let hadFirstConnect = false;

let grid = new Array(81).fill(0); // MY team's working grid (0 = empty)
let selected = -1;
let startLocal = 0;
let tickHandle = null;

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
function myTeam() { return myPlayer()?.team ?? null; }
// Board geometry for the active game (falls back to classic 9×9 before a game).
function dims() { return state?.dims || { N: 9, boxH: 3, boxW: 3, cells: 81 }; }
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
function toast(message, kind = "ok") {
  const wrap = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 250); }, 2800);
}

// Cells that clash with another same-valued cell in their row/col/box.
function conflictSet() {
  const { N, boxH, boxW } = dims();
  const bad = new Set();
  const mark = (a, b) => { bad.add(a); bad.add(b); };
  for (let r = 0; r < N; r++) {
    for (let c1 = 0; c1 < N; c1++) {
      const i = r * N + c1;
      if (!grid[i]) continue;
      for (let c2 = c1 + 1; c2 < N; c2++) {
        const j = r * N + c2;
        if (grid[j] === grid[i]) mark(i, j);
      }
    }
  }
  for (let c = 0; c < N; c++) {
    for (let r1 = 0; r1 < N; r1++) {
      const i = r1 * N + c;
      if (!grid[i]) continue;
      for (let r2 = r1 + 1; r2 < N; r2++) {
        const j = r2 * N + c;
        if (grid[j] === grid[i]) mark(i, j);
      }
    }
  }
  for (let br = 0; br < N; br += boxH)
    for (let bc = 0; bc < N; bc += boxW) {
      const cells = [];
      for (let dr = 0; dr < boxH; dr++)
        for (let dc = 0; dc < boxW; dc++)
          cells.push((br + dr) * N + (bc + dc));
      for (let a = 0; a < cells.length; a++)
        for (let b = a + 1; b < cells.length; b++)
          if (grid[cells[a]] && grid[cells[a]] === grid[cells[b]]) mark(cells[a], cells[b]);
    }
  return bad;
}

/* ---------------- socket ---------------- */
socket.on("connect", () => {
  const firstLoad = !hadFirstConnect;
  hadFirstConnect = true;
  if (session?.code && session?.playerId) {
    socket.emit("sdk_join", { code: session.code, playerId: session.playerId, token: accountToken() }, (res) => {
      if (!res?.ok) { clearSession(); state = null; render(); return; }
      if (firstLoad && res.state?.status !== "playing") {
        socket.emit("sdk_leave");
        clearSession(); state = null; render();
        return;
      }
      if (res.grid) grid = res.grid.slice();
      applyState(res.state);
    });
  } else if (firstLoad) render();
});

socket.on("sdk_config", (c) => {
  config = c;
  if (!drafts.color) drafts.color = config.colors[0] || "";
  render();
});
socket.on("sdk_state", (next) => applyState(next));
socket.on("sdk_grid", ({ team, grid: g }) => {
  if (team === myTeam()) { grid = g.slice(); render(); }
});
socket.on("sdk_gameover", ({ winnerTeam }) => {
  confettiBurst();
  sfx.win();
  if (winnerTeam != null && myTeam() === winnerTeam) confettiBurst();
});
socket.on("sdk_reward", ({ coins, xp, won, profile }) => {
  if (profile) {
    account = profile; // keep the local coin balance in sync
    toast(`${won ? "🏆 " : ""}${t("your_reward")} +${coins} 🪙 · +${xp} ${t("xp")}`, "ok");
  }
});
socket.on("sdk_notice", ({ type, message }) =>
  toast(tErr(message), type === "error" ? "error" : "ok")
);
socket.on("disconnect", () => toast(t("reconnecting"), "error"));

function applyState(next) {
  if (next.status === "playing") {
    // Anchor the local timer the first time we see "playing" this game.
    if (state?.status !== "playing" || !startLocal) { startLocal = Date.now(); selected = -1; }
    if (!tickHandle) startTick();
  } else {
    stopTick();
  }
  state = next;
  render();
}

/* ---------------- local clock ---------------- */
function startTick() {
  stopTick();
  tickHandle = setInterval(() => {
    const el = document.getElementById("sdk-timer");
    if (el) el.textContent = fmtTime(Date.now() - startLocal);
  }, 250);
}
function stopTick() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}

/* ---------------- actions ---------------- */
function createRoom() {
  const name = (myName() || "").trim();
  if (!name) return toast(t("your_name"), "error");
  socket.emit("sdk_create", { name, color: drafts.color, token: accountToken() }, (res) => {
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
  socket.emit("sdk_join", { code, name, color: drafts.color, token: accountToken() }, (res) => {
    if (!res?.ok) return toast(tErr(res?.error), "error");
    saveSession({ code: res.code, playerId: res.playerId });
    applyState(res.state);
  });
}
// Solo: create a private room, set difficulty, and start alone in one step.
function startSolo() {
  const name = (myName() || "").trim();
  if (!name) return toast(t("your_name"), "error");
  const diff = drafts.difficulty || "medium";
  const size = drafts.size || "classic";
  socket.emit("sdk_create", { name, color: drafts.color, token: accountToken() }, (res) => {
    if (!res?.ok) return toast(tErr(res?.error), "error");
    saveSession({ code: res.code, playerId: res.playerId });
    socket.emit("sdk_settings", { difficulty: diff, size });
    socket.emit("sdk_start", { solo: true });
    applyState(res.state);
  });
}
// Buy the solo hint power-up: 50 coins, once per game. The server is the source
// of truth (it charges the coins and enforces the once-per-game limit); the
// client-side checks here just give instant feedback before the round-trip.
function buyHint() {
  if (buyingHint) return;
  if (!accountToken()) return toast(tErr("sdk_err_login"), "error");
  if (myPlayer()?.hintUsed) return toast(tErr("sdk_err_hint_used"), "error");
  const cost = state?.hintCost || 50;
  if (myCoins() < cost) return toast(tErr("sdk_err_coins"), "error");
  buyingHint = true;
  render(); // disable the button while the purchase is in flight
  socket.emit("sdk_hint", {}, (res) => {
    buyingHint = false;
    if (!res || res.error) {
      if (res && res.error) toast(tErr(res.error), "error");
      return render();
    }
    if (res.profile) account = res.profile;
    else if (res.coins != null && account) account.coins = res.coins;
    sfx.point?.();
    toast(`${t("hint_taken")} · -${res.cost} 🪙`, "ok");
    render();
  });
}
function selectCell(i) {
  if (!state?.given) return;
  if (state.given[i]) return; // clue cells are locked
  selected = i;
  render();
}
function inputValue(val) {
  if (selected < 0 || !state?.given) return;
  if (state.given[selected]) return;
  if (grid[selected] === val) return;
  grid[selected] = val; // optimistic; server confirms via sdk_grid
  socket.emit("sdk_set", { idx: selected, val });
  if (val === 0) sfx.click?.(); else sfx.point?.();
  render();
}

/* ---------------- render ---------------- */
function langBar() {
  return `<div class="langbar">${LANGS.map(
    (l) => `<button class="langpill flagpill ${lang === l.code ? "on" : ""}" data-lang="${l.code}" aria-label="${l.code}">${flagSVG(l.code)}</button>`
  ).join("")}</div>`;
}
function colorDots(selectedColor) {
  return `<div class="sdk-colors">${config.colors
    .map((c) => `<button class="sdk-dot ${c === selectedColor ? "on" : ""}" data-color="${c}" style="background:${c}"></button>`)
    .join("")}</div>`;
}

function render() {
  if (!state) return renderPre();
  if (state.status === "lobby") return renderLobby();
  if (state.status === "playing") return renderPlaying();
  if (state.status === "finished") return renderFinished();
  renderPre();
}

function shell(inner) {
  return `
    <div class="sdk-top">
      <span class="sdk-logo">🔢 ${t("brand")}</span>
      ${langBar()}
    </div>
    <div class="sdk-wrap">${inner}</div>
  `;
}

function difficultySelect() {
  return `<select class="sdk-select" id="sdk-diff">
    ${["easy", "medium", "hard"].map((d) => `<option value="${d}" ${drafts.difficulty === d ? "selected" : ""}>${t(d)}</option>`).join("")}
  </select>`;
}
function sizeSelect() {
  return `<select class="sdk-select" id="sdk-size">
    ${["mini", "classic"].map((s) => `<option value="${s}" ${drafts.size === s ? "selected" : ""}>${t("size_" + s)}</option>`).join("")}
  </select>`;
}

function renderPre() {
  if (pre === "solo") {
    $app.innerHTML = shell(`
      <div class="sdk-card sdk-form">
        <button class="sdk-link" data-act="landing">‹ ${t("back")}</button>
        <h2 class="sdk-h2">${t("solo_title")}</h2>
        <label class="sdk-label">${t("your_name")}</label>
        <div class="sdk-input sdk-name-chip">${esc(myName())}</div>
        <label class="sdk-label">${t("board_size")}</label>
        ${sizeSelect()}
        <label class="sdk-label">${t("difficulty")}</label>
        ${difficultySelect()}
        <label class="sdk-label">${t("pick_color")}</label>
        ${colorDots(drafts.color)}
        <button class="sdk-btn primary" data-act="solo">${t("solo_start")}</button>
      </div>
    `);
    return;
  }
  if (pre === "create" || pre === "join") {
    const isCreate = pre === "create";
    $app.innerHTML = shell(`
      <div class="sdk-card sdk-form">
        <button class="sdk-link" data-act="landing">‹ ${t("back")}</button>
        <h2 class="sdk-h2">${isCreate ? t("create") : t("join")}</h2>
        <label class="sdk-label">${t("your_name")}</label>
        <div class="sdk-input sdk-name-chip">${esc(myName())}</div>
        ${isCreate ? "" : `
          <label class="sdk-label">${t("room_code")}</label>
          <input class="sdk-input" id="sdk-code" maxlength="12" value="${esc(drafts.joinCode)}" placeholder="SDK-ABCD" style="text-transform:uppercase" />`}
        <label class="sdk-label">${t("pick_color")}</label>
        ${colorDots(drafts.color)}
        <button class="sdk-btn primary" data-act="${isCreate ? "create" : "join"}">${isCreate ? t("create_go") : t("join_go")}</button>
      </div>
    `);
    return;
  }
  // Full-screen sudoku.png wallpaper. Create / Join / Play solo and the flags are
  // painted into the image; transparent %-positioned hit-areas (shared .hit
  // classes, sudoku-specific positions under .sdk-fs) sit over them.
  $app.innerHTML = `<div class="sdk-fs">
    <div class="sdk-stage">
      <img class="sdk-photo-img" src="/media/sudoku-full.png" alt="Sudoku Race — team vs team" width="1400" height="776" />
      <button class="hit hit-create" data-act="go-create" aria-label="${esc(t("create"))}"></button>
      <button class="hit hit-join" data-act="go-join" aria-label="${esc(t("join"))}"></button>
      <button class="hit hit-solo" data-act="go-solo" aria-label="${esc(t("solo"))}"></button>
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
  const qr = `/api/qr?text=${encodeURIComponent(base + "/sudoku")}`;

  const teamCards = state.teams
    .map((tm) => {
      const members = state.players.filter((p) => p.team === tm.index);
      const mine = me?.team === tm.index;
      return `
        <button class="sdk-team ${mine ? "mine" : ""}" data-team="${tm.index}" style="--tc:${tm.color}">
          <div class="sdk-team-name">${esc(teamName(tm.index))}</div>
          <div class="sdk-team-members">
            ${members.map((p) => `<span class="sdk-chip" style="--pc:${p.color}">${esc(p.name)}${p.id === myId() ? " ·" + t("you") : ""}</span>`).join("") || `<span class="sdk-empty">—</span>`}
          </div>
        </button>`;
    })
    .join("");

  const diffOptions = ["easy", "medium", "hard"]
    .map((d) => `<option value="${d}" ${state.settings.difficulty === d ? "selected" : ""}>${t(d)}</option>`)
    .join("");
  const sizeOptions = ["mini", "classic"]
    .map((s) => `<option value="${s}" ${state.settings.size === s ? "selected" : ""}>${t("size_" + s)}</option>`)
    .join("");

  $app.innerHTML = shell(`
    <div class="sdk-lobby">
      <div class="sdk-card">
        <div class="sdk-code-row">
          <div>
            <div class="sdk-label">${t("room_code")}</div>
            <div class="sdk-code">${esc(state.code)}</div>
            <div class="sdk-hint">${t("share_hint")}</div>
          </div>
          <img class="sdk-qr" src="${qr}" alt="QR" onerror="this.style.display='none'" />
        </div>
      </div>

      <div class="sdk-card">
        <h3 class="sdk-h3">${t("teams")} · <span class="sdk-muted">${t("pick_team")}</span></h3>
        <div class="sdk-teams">${teamCards}</div>
      </div>

      ${host ? `
      <div class="sdk-card">
        <h3 class="sdk-h3">${t("settings")}</h3>
        <div class="sdk-set-row">
          <label class="sdk-label">${t("num_teams")}</label>
          <select class="sdk-select" data-set="numTeams">
            ${[2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${state.settings.numTeams === n ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </div>
        <div class="sdk-set-row">
          <label class="sdk-label">${t("board_size")}</label>
          <select class="sdk-select" data-set="size">${sizeOptions}</select>
        </div>
        <div class="sdk-set-row">
          <label class="sdk-label">${t("difficulty")}</label>
          <select class="sdk-select" data-set="difficulty">${diffOptions}</select>
        </div>
        <button class="sdk-btn primary full" data-act="start">${t("start_game")}</button>
      </div>
      ` : `<div class="sdk-card sdk-center sdk-muted">${t("waiting_host")}</div>`}

      ${accountToken() ? "" : `<div class="sdk-card sdk-center sdk-muted">${t("login_hint")}</div>`}
      <button class="sdk-link danger" data-act="leave">${t("go_home")} ✕</button>
    </div>
  `);
}

function boardHTML() {
  const { N, boxH, boxW, cells: total } = dims();
  const bad = conflictSet();
  const cells = [];
  for (let i = 0; i < total; i++) {
    const v = grid[i];
    const given = state.given?.[i];
    const r = Math.floor(i / N);
    const c = i % N;
    const classes = ["sdk-cell"];
    if (given) classes.push("given");
    if (i === selected) classes.push("sel");
    if (v && bad.has(i)) classes.push("bad");
    if (selected >= 0 && v && v === grid[selected] && i !== selected) classes.push("same");
    if (c % boxW === boxW - 1 && c !== N - 1) classes.push("br");
    if (r % boxH === boxH - 1 && r !== N - 1) classes.push("bb");
    cells.push(`<button class="${classes.join(" ")}" data-cell="${i}" ${given ? "disabled" : ""}>${v || ""}</button>`);
  }
  return `<div class="sdk-board" style="grid-template-columns:repeat(${N},1fr)">${cells.join("")}</div>`;
}

function padHTML() {
  const { N } = dims();
  const counts = new Array(N + 1).fill(0);
  for (const v of grid) if (v) counts[v]++;
  const keys = [];
  for (let n = 1; n <= N; n++) {
    const done = counts[n] >= N;
    keys.push(`<button class="sdk-key ${done ? "done" : ""}" data-num="${n}">${n}</button>`);
  }
  keys.push(`<button class="sdk-key erase" data-num="0">⌫</button>`);
  return `<div class="sdk-pad" style="grid-template-columns:repeat(${N + 1},1fr)">${keys.join("")}</div>`;
}

function progressPanel() {
  const total = state.cellsTotal || 81;
  return state.teams
    .filter((tm) => tm.members.length)
    .sort((a, b) => b.filled - a.filled)
    .map((tm) => {
      const pct = Math.round((tm.filled / total) * 100);
      const mine = tm.index === myTeam();
      return `
        <div class="sdk-prow ${mine ? "me" : ""}" style="--tc:${tm.color}">
          <span class="sdk-pname">${esc(teamName(tm.index))}${tm.finished ? ` <b class="sdk-done">✓ ${fmtTime(tm.finishMs)}</b>` : ""}</span>
          <div class="sdk-pbar"><span style="width:${pct}%"></span></div>
          <span class="sdk-pcount">${tm.filled}/${total}</span>
        </div>`;
    })
    .join("");
}

// The solo "use a hint" power-up bar. A hint costs coins and can be bought once
// per game, so the button reflects: already used, can't afford / not logged in,
// or ready-to-buy (with its price).
function hintbarHTML() {
  const cost = state.hintCost || 50;
  const used = !!myPlayer()?.hintUsed;
  const loggedIn = !!accountToken();
  const canAfford = myCoins() >= cost;
  const disabled = used || buyingHint || !loggedIn || !canAfford;
  const label = used
    ? `✓ ${t("hint_used")}`
    : `${t("use_hint")} · ${cost} 🪙`;
  return `
    <div class="sdk-hintbar">
      <span class="sdk-hintbar-txt">✨ ${t("stuck")}</span>
      <button class="sdk-hintbar-btn" data-act="hint" ${disabled ? "disabled" : ""}>${label}</button>
    </div>`;
}

function renderPlaying() {
  const mt = myTeam();
  $app.innerHTML = shell(`
    <div class="sdk-play">
      <div class="sdk-hud">
        <div class="sdk-hud-item"><span class="sdk-hud-k">${t("your_team")}</span><span class="sdk-hud-v" style="color:${teamColor(mt)}">${esc(teamName(mt))}</span></div>
        <div class="sdk-hud-item"><span class="sdk-hud-k">${t("difficulty")}</span><span class="sdk-hud-v">${t(state.difficulty)}</span></div>
        <div class="sdk-hud-item"><span class="sdk-hud-k">${t("time")}</span><span class="sdk-hud-v" id="sdk-timer">${fmtTime(Date.now() - startLocal)}</span></div>
      </div>
      ${boardHTML()}
      ${state.solo ? hintbarHTML() : ""}
      ${padHTML()}
      ${state.solo ? "" : `<div class="sdk-hint sdk-center">${t("shared_hint")}</div>`}
      <div class="sdk-progress">
        <h3 class="sdk-h3">${t("progress")}</h3>
        ${progressPanel()}
      </div>
      ${isHost() ? `<button class="sdk-link danger" data-act="end">${t("end_game")}</button>` : ""}
    </div>
  `);
}

function renderFinished() {
  const w = state.winnerTeam;
  const standings = state.result?.standings || [];
  const host = isHost();

  // Solo: no opponents — celebrate the solve + time, skip the team standings.
  if (state.solo) {
    const mine = standings.find((s) => s.team === myTeam()) || standings[0];
    const finished = mine?.finishMs != null;
    $app.innerHTML = shell(`
      <div class="sdk-wrap-narrow">
        <div class="sdk-card sdk-center sdk-champ" style="--tc:${teamColor(myTeam())}">
          <div class="sdk-trophy big">${finished ? "🎉" : "🧩"}</div>
          <div class="sdk-champ-label">${t("solo_done")}</div>
          ${finished ? `<div class="sdk-champ-team" style="color:${teamColor(myTeam())}">${fmtTime(mine.finishMs)}</div>` : `<div class="sdk-muted">${mine?.filled ?? 0}/${state.cellsTotal || 81}</div>`}
          <div class="sdk-muted">${t(state.difficulty)}</div>
        </div>
        ${host ? `<button class="sdk-btn primary full" data-act="again">${t("play_again")}</button>` : ""}
        <button class="sdk-link" data-act="leave">${t("go_home")}</button>
      </div>
    `);
    return;
  }

  $app.innerHTML = shell(`
    <div class="sdk-wrap-narrow">
      <div class="sdk-card sdk-center sdk-champ" style="--tc:${teamColor(w)}">
        <div class="sdk-trophy big">🏆</div>
        <div class="sdk-champ-label">${t("champion")}</div>
        <div class="sdk-champ-team" style="color:${teamColor(w)}">${w != null ? esc(teamName(w)) : "—"}</div>
        ${w != null && standings.find((s) => s.team === w)?.finishMs != null
          ? `<div class="sdk-muted">${fmtTime(standings.find((s) => s.team === w).finishMs)}</div>` : ""}
      </div>
      <div class="sdk-card">
        <h3 class="sdk-h3">${t("final")}</h3>
        <div class="sdk-final-list">
          ${standings.map((s, i) => `
            <div class="sdk-finalrow" style="--tc:${s.color}">
              <span class="sdk-rank">${i + 1}</span>
              <span class="sdk-swatch"></span>
              <span class="sdk-winname">${esc(loc(s.name))}</span>
              <span class="sdk-wincount">${s.finishMs != null ? fmtTime(s.finishMs) : `${s.filled}/${state.cellsTotal || 81}`}</span>
            </div>`).join("")}
        </div>
      </div>
      ${host ? `<button class="sdk-btn primary full" data-act="again">${t("play_again")}</button>` : `<div class="sdk-card sdk-center sdk-muted">${t("waiting_host")}</div>`}
      <button class="sdk-link" data-act="leave">${t("go_home")}</button>
    </div>
  `);
}

/* ---------------- events (delegated) ---------------- */
$app.addEventListener("input", (e) => {
  if (e.target.id === "sdk-name") drafts.name = e.target.value;
  if (e.target.id === "sdk-code") drafts.joinCode = e.target.value;
});
$app.addEventListener("change", (e) => {
  if (e.target.id === "sdk-diff") { drafts.difficulty = e.target.value; return; }
  if (e.target.id === "sdk-size") { drafts.size = e.target.value; return; }
  const set = e.target.dataset.set;
  if (set) {
    const val = set === "numTeams" ? Number(e.target.value) : e.target.value;
    socket.emit("sdk_settings", { [set]: val });
  }
});
$app.addEventListener("click", (e) => {
  const langBtn = e.target.closest("[data-lang]");
  if (langBtn) return setLang(langBtn.dataset.lang);

  const dot = e.target.closest("[data-color]");
  if (dot) { drafts.color = dot.dataset.color; return render(); }

  const cell = e.target.closest("[data-cell]");
  if (cell) return selectCell(Number(cell.dataset.cell));

  const num = e.target.closest("[data-num]");
  if (num) return inputValue(Number(num.dataset.num));

  const team = e.target.closest("[data-team]");
  if (team) return socket.emit("sdk_join_team", { team: Number(team.dataset.team) });

  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  switch (act) {
    case "go-create": pre = "create"; return renderPre();
    case "go-join": pre = "join"; return renderPre();
    case "go-solo": pre = "solo"; return renderPre();
    case "landing": pre = "landing"; return renderPre();
    case "create": return createRoom();
    case "join": return joinRoom();
    case "solo": return startSolo();
    case "start": return socket.emit("sdk_start");
    case "hint": return buyHint();
    case "end": return socket.emit("sdk_end");
    case "again":
      // In solo, "play again" spins up a fresh puzzle immediately.
      if (state?.solo) { socket.emit("sdk_again"); socket.emit("sdk_start", { solo: true }); return; }
      return socket.emit("sdk_again");
    case "leave":
      socket.emit("sdk_leave");
      clearSession();
      state = null;
      pre = "landing";
      stopTick();
      return render();
  }
});

// Keyboard entry on desktop.
window.addEventListener("keydown", (e) => {
  if (!state || state.status !== "playing" || selected < 0) return;
  const { N } = dims();
  const digit = Number(e.key);
  if (Number.isInteger(digit) && digit >= 1 && digit <= N) { inputValue(digit); e.preventDefault(); }
  else if (e.key === "0" || e.key === "Backspace" || e.key === "Delete") { inputValue(0); e.preventDefault(); }
  else if (e.key.startsWith("Arrow")) {
    const r = Math.floor(selected / N), c = selected % N;
    let nr = r, nc = c;
    if (e.key === "ArrowUp") nr = Math.max(0, r - 1);
    if (e.key === "ArrowDown") nr = Math.min(N - 1, r + 1);
    if (e.key === "ArrowLeft") nc = Math.max(0, c - 1);
    if (e.key === "ArrowRight") nc = Math.min(N - 1, c + 1);
    selected = nr * N + nc;
    render();
    e.preventDefault();
  }
});

refreshAccount();
render();
