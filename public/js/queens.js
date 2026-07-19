// public/js/queens.js
// KYUUBI QUEENS client. The server (/queens namespace) owns the authoritative game;
// this file renders queens_state, draws the player's own TEAM board (the colored
// regions are shared, the crown/X marks are shared with teammates only), and turns
// taps into queens_set events. Opponents only ever see progress + times, never the
// marks — so nobody can copy. Racing is best-of-N by fastest cumulative time.

import { sfx, confettiBurst, flagSVG } from "./effects.js";

const socket = io("/queens", { reconnection: true });
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
    brand: "QUEENS",
    tagline: "One crown per row, column & color — none touching. Race best-of-N.",
    create: "Create room", join: "Join room", solo: "Play solo", back: "Back",
    solo_title: "Solo puzzle", solo_start: "Start puzzle",
    solo_done: "Solved!", your_name: "Your name", pick_color: "Pick a color",
    room_code: "Room code", create_go: "Create", join_go: "Join",
    lobby: "Lobby", share_hint: "Share this code so friends can join:",
    pick_team: "Tap a team to join it", teams: "Teams", players: "Players",
    settings: "Settings", num_teams: "Number of teams", difficulty: "Difficulty",
    easy: "Easy (6×6)", medium: "Medium (7×7)", hard: "Hard (8×8)",
    rounds: "Boards (best of)", round_of: "Board",
    start_game: "Start game", need_players: "Need at least 2 players.",
    need_teams: "Fill at least 2 teams.", host_only: "Only the host can do that.",
    waiting_host: "Waiting for the host to start…", you: "you", host: "host",
    time: "Time", your_team: "Your team", crowns: "Crowns",
    shared_hint: "Your whole team solves this one board together.",
    how_to: "Tap a cell: ✕ note → 👑 crown → clear.",
    stuck: "Stuck?", use_hint: "Reveal a crown",
    skip: "Skip board", end_game: "End match", go_home: "Home",
    champion: "Champion", play_again: "Play again",
    final: "Final standings", solved_n: "solved", dnf: "—",
    board_solved: "Board solved!", next_board: "Next board…",
    your_reward: "You earned", coins: "coins", xp: "XP",
    login_hint: "Log in on the home page to keep your coins & XP.",
    reconnecting: "Reconnecting…",
    err_locked: "Can't change that after the game starts.",
    err_started: "That game already started.", err_no_code: "No room with that code.",
    err_generic: "Something glitched — try again.", err_login: "Please log in from the home page to play.",
  },
  fr: {
    brand: "QUEENS",
    tagline: "Une couronne par ligne, colonne et couleur — sans se toucher. Au meilleur de N.",
    create: "Créer un salon", join: "Rejoindre", solo: "Jouer solo", back: "Retour",
    solo_title: "Grille solo", solo_start: "Commencer",
    solo_done: "Résolu !", your_name: "Ton nom", pick_color: "Choisis une couleur",
    room_code: "Code du salon", create_go: "Créer", join_go: "Rejoindre",
    lobby: "Salon", share_hint: "Partage ce code pour que tes amis rejoignent :",
    pick_team: "Touche une équipe pour la rejoindre", teams: "Équipes", players: "Joueurs",
    settings: "Réglages", num_teams: "Nombre d'équipes", difficulty: "Difficulté",
    easy: "Facile (6×6)", medium: "Moyen (7×7)", hard: "Difficile (8×8)",
    rounds: "Grilles (au meilleur de)", round_of: "Grille",
    start_game: "Démarrer", need_players: "Il faut au moins 2 joueurs.",
    need_teams: "Remplis au moins 2 équipes.", host_only: "Seul l'hôte peut faire ça.",
    waiting_host: "En attente du lancement par l'hôte…", you: "toi", host: "hôte",
    time: "Temps", your_team: "Ton équipe", crowns: "Couronnes",
    shared_hint: "Toute ton équipe résout cette même grille ensemble.",
    how_to: "Touche une case : ✕ note → 👑 couronne → vide.",
    stuck: "Bloqué ?", use_hint: "Révéler une couronne",
    skip: "Passer", end_game: "Terminer", go_home: "Accueil",
    champion: "Champion", play_again: "Rejouer",
    final: "Classement final", solved_n: "résolues", dnf: "—",
    board_solved: "Grille résolue !", next_board: "Grille suivante…",
    your_reward: "Tu as gagné", coins: "pièces", xp: "XP",
    login_hint: "Connecte-toi sur l'accueil pour garder tes pièces et ton XP.",
    reconnecting: "Reconnexion…",
    err_locked: "Impossible de changer ça une fois lancé.",
    err_started: "La partie a déjà commencé.", err_no_code: "Aucun salon avec ce code.",
    err_generic: "Un bug — réessaie.", err_login: "Connecte-toi depuis l'accueil pour jouer.",
  },
  ar: {
    brand: "ملكات",
    tagline: "تاج واحد لكل صف وعمود ولون — دون أن يتلامسا. الأفضل من N.",
    create: "إنشاء غرفة", join: "انضمام", solo: "العب منفردًا", back: "رجوع",
    solo_title: "لغز فردي", solo_start: "ابدأ اللغز",
    solo_done: "حُلّت!", your_name: "اسمك", pick_color: "اختر لونًا",
    room_code: "رمز الغرفة", create_go: "إنشاء", join_go: "انضمام",
    lobby: "الغرفة", share_hint: "شارك هذا الرمز لينضم أصدقاؤك:",
    pick_team: "اضغط على فريق للانضمام إليه", teams: "الفرق", players: "اللاعبون",
    settings: "الإعدادات", num_teams: "عدد الفرق", difficulty: "الصعوبة",
    easy: "سهل (٦×٦)", medium: "متوسط (٧×٧)", hard: "صعب (٨×٨)",
    rounds: "الشبكات (الأفضل من)", round_of: "شبكة",
    start_game: "ابدأ اللعبة", need_players: "تحتاج لاعبَين على الأقل.",
    need_teams: "املأ فريقين على الأقل.", host_only: "المضيف فقط يمكنه ذلك.",
    waiting_host: "بانتظار أن يبدأ المضيف…", you: "أنت", host: "المضيف",
    time: "الوقت", your_team: "فريقك", crowns: "التيجان",
    shared_hint: "فريقك بأكمله يحل هذه الشبكة معًا.",
    how_to: "اضغط على خانة: ✕ ملاحظة ← 👑 تاج ← فارغ.",
    stuck: "عالق؟", use_hint: "اكشف تاجًا",
    skip: "تخطَّ", end_game: "إنهاء", go_home: "الرئيسية",
    champion: "البطل", play_again: "العب مجددًا",
    final: "الترتيب النهائي", solved_n: "محلولة", dnf: "—",
    board_solved: "حُلّت الشبكة!", next_board: "الشبكة التالية…",
    your_reward: "لقد ربحت", coins: "عملة", xp: "خبرة",
    login_hint: "سجّل الدخول من الصفحة الرئيسية للاحتفاظ بعملاتك وخبرتك.",
    reconnecting: "إعادة الاتصال…",
    err_locked: "لا يمكن تغيير ذلك بعد بدء اللعبة.",
    err_started: "بدأت اللعبة بالفعل.", err_no_code: "لا توجد غرفة بهذا الرمز.",
    err_generic: "حدث خلل — حاول مجددًا.", err_login: "سجّل الدخول من الصفحة الرئيسية للعب.",
  },
};
const t = (k) => (T[lang] || T.en)[k] || T.en[k] || k;

const ERR_MAP = {
  q_err_locked: "err_locked",
  q_err_host_only: "host_only",
  q_err_need_players: "need_players",
  q_err_need_teams: "need_teams",
  q_err_started: "err_started",
  q_err_no_code: "err_no_code",
  q_err_login: "err_login",
};
function tErr(key) {
  return t(ERR_MAP[key] || "err_generic");
}

// Region → color palette (soft, distinct). Index = region id.
const REGION_COLORS = [
  "#F87171", "#60A5FA", "#FBBF24", "#4ADE80",
  "#C084FC", "#22D3EE", "#FB923C", "#F472B6",
  "#A3E635",
];

/* ---------------- session + account ---------------- */
function loadSession() {
  try { return JSON.parse(localStorage.getItem("queens.session") || "null"); }
  catch { return null; }
}
function saveSession(s) { session = s; localStorage.setItem("queens.session", JSON.stringify(s)); }
function clearSession() { session = null; localStorage.removeItem("queens.session"); }
function accountToken() { return localStorage.getItem("kyuubi.token") || null; }

// Logged-in profile ({name, color, ...}) or null. Login is required to play, so
// this is populated on boot and guests are bounced to the home page.
let account = null;
function refreshAccount() {
  const token = accountToken();
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
// Display name for the pre-game forms: always the signed-in profile name.
function myName() { return (account && account.name) || drafts.name || ""; }

/* ---------------- state ---------------- */
let config = { colors: [], serverUrl: "" };
let state = null;
let session = loadSession();
let pre = "landing"; // landing | create | join | solo
let drafts = { name: "", color: "", joinCode: "", difficulty: "medium", rounds: 3 };
let hadFirstConnect = false;

let marks = []; // MY team's shared marks (0 empty, 1 X, 2 queen)
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
function N() { return state?.size || 0; }
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
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 250); }, 2600);
}

// Queens that break a rule (share a row/col/region, or touch another queen).
function conflictSet() {
  const n = N();
  const bad = new Set();
  if (!state?.regions) return bad;
  const qCells = [];
  for (let i = 0; i < marks.length; i++) if (marks[i] === 2) qCells.push(i);
  const rowCount = {}, colCount = {}, regCount = {};
  for (const cell of qCells) {
    const r = Math.floor(cell / n), c = cell % n, rid = state.regions[cell];
    (rowCount[r] = rowCount[r] || []).push(cell);
    (colCount[c] = colCount[c] || []).push(cell);
    (regCount[rid] = regCount[rid] || []).push(cell);
  }
  const flagGroups = (map) => {
    for (const g of Object.values(map)) if (g.length > 1) g.forEach((x) => bad.add(x));
  };
  flagGroups(rowCount); flagGroups(colCount); flagGroups(regCount);
  for (let a = 0; a < qCells.length; a++)
    for (let b = a + 1; b < qCells.length; b++) {
      const ra = Math.floor(qCells[a] / n), ca = qCells[a] % n;
      const rb = Math.floor(qCells[b] / n), cb = qCells[b] % n;
      if (Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1) { bad.add(qCells[a]); bad.add(qCells[b]); }
    }
  return bad;
}

/* ---------------- socket ---------------- */
socket.on("connect", () => {
  const firstLoad = !hadFirstConnect;
  hadFirstConnect = true;
  if (session?.code && session?.playerId) {
    socket.emit("queens_join", { code: session.code, playerId: session.playerId, token: accountToken() }, (res) => {
      if (!res?.ok) { clearSession(); state = null; render(); return; }
      if (firstLoad && res.state?.status !== "playing") {
        socket.emit("queens_leave");
        clearSession(); state = null; render();
        return;
      }
      if (res.marks) marks = res.marks.slice();
      applyState(res.state);
    });
  } else if (firstLoad) render();
});

socket.on("queens_config", (c) => {
  config = c;
  if (!drafts.color) drafts.color = config.colors[0] || "";
  render();
});
socket.on("queens_state", (next) => applyState(next));
socket.on("queens_marks", ({ team, marks: m }) => {
  if (team === myTeam()) { marks = m.slice(); render(); }
});
socket.on("queens_round", ({ round }) => {
  // Fresh board — clear local marks and re-anchor the timer for this board.
  marks = new Array(N() * N()).fill(0);
  startLocal = Date.now();
  if (round > 1) toast(`${t("round_of")} ${round} · ${t("next_board")}`, "ok");
});
socket.on("queens_solved", ({ team }) => {
  if (team === myTeam()) { sfx.point(); confettiBurst(1500); toast(t("board_solved"), "ok"); }
});
socket.on("queens_gameover", ({ winnerTeam }) => {
  confettiBurst();
  sfx.win();
  if (winnerTeam != null && myTeam() === winnerTeam) confettiBurst();
});
socket.on("queens_reward", ({ coins, xp, won }) => {
  toast(`${won ? "🏆 " : ""}${t("your_reward")} +${coins} 🪙 · +${xp} ${t("xp")}`, "ok");
});
socket.on("queens_notice", ({ type, message }) =>
  toast(tErr(message), type === "error" ? "error" : "ok")
);
socket.on("disconnect", () => toast(t("reconnecting"), "error"));

function applyState(next) {
  if (next.status === "playing") {
    // Anchor the local timer the first time we see this board.
    if (state?.status !== "playing" || state?.round !== next.round || !startLocal) {
      startLocal = next.roundStartMs || Date.now();
    }
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
    const el = document.getElementById("q-timer");
    if (el && !state?.teams.find((tm) => tm.index === myTeam())?.doneRound)
      el.textContent = fmtTime(Date.now() - startLocal);
  }, 250);
}
function stopTick() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}

/* ---------------- actions ---------------- */
function createRoom() {
  const name = (myName() || "").trim();
  if (!name) return toast(t("your_name"), "error");
  socket.emit("queens_create", { name, color: drafts.color, token: accountToken() }, (res) => {
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
  socket.emit("queens_join", { code, name, color: drafts.color, token: accountToken() }, (res) => {
    if (!res?.ok) return toast(tErr(res?.error), "error");
    saveSession({ code: res.code, playerId: res.playerId });
    applyState(res.state);
  });
}
// Solo: create a private room, set difficulty/rounds, and start alone in one step.
function startSolo() {
  const name = (myName() || "").trim();
  if (!name) return toast(t("your_name"), "error");
  socket.emit("queens_create", { name, color: drafts.color, token: accountToken() }, (res) => {
    if (!res?.ok) return toast(tErr(res?.error), "error");
    saveSession({ code: res.code, playerId: res.playerId });
    socket.emit("queens_settings", { difficulty: drafts.difficulty, rounds: Number(drafts.rounds) });
    socket.emit("queens_start", { solo: true });
    applyState(res.state);
  });
}
// Tap cycles a cell: empty → X note → crown → empty.
function tapCell(i) {
  if (!state || state.status !== "playing") return;
  if (state.teams.find((tm) => tm.index === myTeam())?.doneRound) return;
  const cur = marks[i] || 0;
  const nextVal = (cur + 1) % 3;
  marks[i] = nextVal; // optimistic; server confirms via queens_marks
  socket.emit("queens_set", { idx: i, val: nextVal });
  if (nextVal === 2) sfx.point?.(); else if (nextVal === 1) sfx.click?.(); else sfx.tick?.();
  render();
}

/* ---------------- render ---------------- */
function langBar() {
  return `<div class="langbar">${LANGS.map(
    (l) => `<button class="langpill flagpill ${lang === l.code ? "on" : ""}" data-lang="${l.code}" aria-label="${l.code}">${flagSVG(l.code)}</button>`
  ).join("")}</div>`;
}
function colorDots(selectedColor) {
  return `<div class="q-colors">${config.colors
    .map((c) => `<button class="q-dot ${c === selectedColor ? "on" : ""}" data-color="${c}" style="background:${c}"></button>`)
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
    <div class="q-top">
      <span class="q-logo">👑 ${t("brand")}</span>
      ${langBar()}
    </div>
    <div class="q-wrap">${inner}</div>
  `;
}

function difficultySelect(id) {
  return `<select class="q-select" id="${id}">
    ${["easy", "medium", "hard"].map((d) => `<option value="${d}" ${drafts.difficulty === d ? "selected" : ""}>${t(d)}</option>`).join("")}
  </select>`;
}
function roundsSelect(id) {
  return `<select class="q-select" id="${id}">
    ${[1, 3, 5].map((n) => `<option value="${n}" ${Number(drafts.rounds) === n ? "selected" : ""}>${n}</option>`).join("")}
  </select>`;
}

function renderPre() {
  if (pre === "solo") {
    $app.innerHTML = shell(`
      <div class="q-card q-form">
        <button class="q-link" data-act="landing">‹ ${t("back")}</button>
        <h2 class="q-h2">${t("solo_title")}</h2>
        <label class="q-label">${t("your_name")}</label>
        <div class="q-input q-name-chip">${esc(myName())}</div>
        <label class="q-label">${t("difficulty")}</label>
        ${difficultySelect("q-diff")}
        <label class="q-label">${t("rounds")}</label>
        ${roundsSelect("q-rounds")}
        <label class="q-label">${t("pick_color")}</label>
        ${colorDots(drafts.color)}
        <button class="q-btn primary" data-act="solo">${t("solo_start")}</button>
      </div>
    `);
    return;
  }
  if (pre === "create" || pre === "join") {
    const isCreate = pre === "create";
    $app.innerHTML = shell(`
      <div class="q-card q-form">
        <button class="q-link" data-act="landing">‹ ${t("back")}</button>
        <h2 class="q-h2">${isCreate ? t("create") : t("join")}</h2>
        <label class="q-label">${t("your_name")}</label>
        <div class="q-input q-name-chip">${esc(myName())}</div>
        ${isCreate ? "" : `
          <label class="q-label">${t("room_code")}</label>
          <input class="q-input" id="q-code" maxlength="12" value="${esc(drafts.joinCode)}" placeholder="QN-ABCD" style="text-transform:uppercase" />`}
        <label class="q-label">${t("pick_color")}</label>
        ${colorDots(drafts.color)}
        <button class="q-btn primary" data-act="${isCreate ? "create" : "join"}">${isCreate ? t("create_go") : t("join_go")}</button>
      </div>
    `);
    return;
  }
  // Full-screen queens.png wallpaper. Create / Join / Play solo and the flags are
  // painted into the image; transparent %-positioned hit-areas (shared .hit
  // classes, queens positions under .qn-fs) sit over them.
  $app.innerHTML = `<div class="qn-fs">
    <div class="qn-stage">
      <img class="qn-photo-img" src="/media/queens-full.png" alt="Queens — crown logic puzzle" width="1400" height="781" />
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
  const qr = `/api/qr?text=${encodeURIComponent(base + "/queens")}`;

  const teamCards = state.teams
    .map((tm) => {
      const members = state.players.filter((p) => p.team === tm.index);
      const mine = me?.team === tm.index;
      return `
        <button class="q-team ${mine ? "mine" : ""}" data-team="${tm.index}" style="--tc:${tm.color}">
          <div class="q-team-name">${esc(teamName(tm.index))}</div>
          <div class="q-team-members">
            ${members.map((p) => `<span class="q-chip" style="--pc:${p.color}">${esc(p.name)}${p.id === myId() ? " ·" + t("you") : ""}</span>`).join("") || `<span class="q-empty">—</span>`}
          </div>
        </button>`;
    })
    .join("");

  const diffOptions = ["easy", "medium", "hard"]
    .map((d) => `<option value="${d}" ${state.settings.difficulty === d ? "selected" : ""}>${t(d)}</option>`)
    .join("");
  const roundOptions = [1, 3, 5]
    .map((n) => `<option value="${n}" ${state.settings.rounds === n ? "selected" : ""}>${n}</option>`)
    .join("");

  $app.innerHTML = shell(`
    <div class="q-lobby">
      <div class="q-card">
        <div class="q-code-row">
          <div>
            <div class="q-label">${t("room_code")}</div>
            <div class="q-code">${esc(state.code)}</div>
            <div class="q-hint">${t("share_hint")}</div>
          </div>
          <img class="q-qr" src="${qr}" alt="QR" onerror="this.style.display='none'" />
        </div>
      </div>

      <div class="q-card">
        <h3 class="q-h3">${t("teams")} · <span class="q-muted">${t("pick_team")}</span></h3>
        <div class="q-teams">${teamCards}</div>
      </div>

      ${host ? `
      <div class="q-card">
        <h3 class="q-h3">${t("settings")}</h3>
        <div class="q-set-row">
          <label class="q-label">${t("num_teams")}</label>
          <select class="q-select" data-set="numTeams">
            ${[2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${state.settings.numTeams === n ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </div>
        <div class="q-set-row">
          <label class="q-label">${t("difficulty")}</label>
          <select class="q-select" data-set="difficulty">${diffOptions}</select>
        </div>
        <div class="q-set-row">
          <label class="q-label">${t("rounds")}</label>
          <select class="q-select" data-set="rounds">${roundOptions}</select>
        </div>
        <button class="q-btn primary full" data-act="start">${t("start_game")}</button>
      </div>
      ` : `<div class="q-card q-center q-muted">${t("waiting_host")}</div>`}

      ${accountToken() ? "" : `<div class="q-card q-center q-muted">${t("login_hint")}</div>`}
      <button class="q-link danger" data-act="leave">${t("go_home")} ✕</button>
    </div>
  `);
}

// Thick borders where a cell's region differs from the neighbour on that side.
function regionBorders(i) {
  const n = N();
  const rid = state.regions[i];
  const r = Math.floor(i / n), c = i % n;
  const cls = [];
  if (c === n - 1 || state.regions[i + 1] !== rid) cls.push("rr");
  if (c === 0 || state.regions[i - 1] !== rid) cls.push("rl");
  if (r === n - 1 || state.regions[i + n] !== rid) cls.push("rb");
  if (r === 0 || state.regions[i - n] !== rid) cls.push("rt");
  return cls;
}

function boardHTML() {
  const n = N();
  const bad = conflictSet();
  const cells = [];
  for (let i = 0; i < n * n; i++) {
    const v = marks[i] || 0;
    const rid = state.regions[i];
    const color = REGION_COLORS[rid % REGION_COLORS.length];
    const classes = ["q-cell", ...regionBorders(i)];
    if (v === 2 && bad.has(i)) classes.push("bad");
    const glyph = v === 2 ? "👑" : v === 1 ? "✕" : "";
    cells.push(
      `<button class="${classes.join(" ")}" data-cell="${i}" style="--rc:${color}"><span class="q-glyph">${glyph}</span></button>`
    );
  }
  return `<div class="q-board" style="grid-template-columns:repeat(${n},1fr)">${cells.join("")}</div>`;
}

function roundPips() {
  const total = state.rounds || 1;
  const mine = state.teams.find((tm) => tm.index === myTeam());
  const solved = mine?.solved || 0;
  let s = "";
  for (let i = 1; i <= total; i++) {
    const cls = i < state.round || (i === state.round && mine?.doneRound) ? "on" : i === state.round ? "cur" : "";
    s += `<span class="q-pip ${cls}"></span>`;
  }
  return `<div class="q-pips" title="${solved}/${total} ${t("solved_n")}">${s}</div>`;
}

function progressPanel() {
  return state.teams
    .filter((tm) => tm.members.length)
    .slice()
    .sort((a, b) => (b.solved - a.solved) || (a.totalMs - b.totalMs) || (b.placed - a.placed))
    .map((tm) => {
      const target = tm.target || N() || 1;
      const pct = Math.round((tm.placed / target) * 100);
      const mine = tm.index === myTeam();
      const roundTimes = (tm.times || [])
        .map((ms) => `<span class="q-rt ${ms == null ? "dnf" : ""}">${fmtTime(ms)}</span>`)
        .join("");
      return `
        <div class="q-prow ${mine ? "me" : ""}" style="--tc:${tm.color}">
          <span class="q-pname">${esc(teamName(tm.index))} <b class="q-solved">${tm.solved}/${state.rounds}</b></span>
          ${tm.doneRound ? `<span class="q-badge">✓</span>` : `<div class="q-pbar"><span style="width:${pct}%"></span></div>`}
          <span class="q-times">${roundTimes}</span>
        </div>`;
    })
    .join("");
}

function renderPlaying() {
  const mt = myTeam();
  const mine = state.teams.find((tm) => tm.index === mt);
  const waiting = mine?.doneRound;
  $app.innerHTML = shell(`
    <div class="q-play">
      <div class="q-hud">
        <div class="q-hud-item"><span class="q-hud-k">${t("your_team")}</span><span class="q-hud-v" style="color:${teamColor(mt)}">${esc(teamName(mt))}</span></div>
        <div class="q-hud-item"><span class="q-hud-k">${t("round_of")}</span><span class="q-hud-v">${state.round}/${state.rounds}</span>${roundPips()}</div>
        <div class="q-hud-item"><span class="q-hud-k">${t("time")}</span><span class="q-hud-v" id="q-timer">${fmtTime(Date.now() - startLocal)}</span></div>
      </div>
      ${waiting ? `<div class="q-card q-center q-solvedbig" style="--tc:${teamColor(mt)}">🎉 ${t("board_solved")}<div class="q-muted">${state.solo ? t("next_board") : t("waiting_host")}</div></div>` : boardHTML()}
      ${!waiting ? `<div class="q-howto">${t("how_to")}</div>` : ""}
      ${state.solo && !waiting ? `
      <div class="q-hintbar">
        <span class="q-hintbar-txt">✨ ${t("stuck")}</span>
        <button class="q-hintbar-btn" data-act="hint">${t("use_hint")}</button>
      </div>` : ""}
      ${state.solo ? "" : `<div class="q-hint q-center">${t("shared_hint")}</div>`}
      <div class="q-progress">
        ${progressPanel()}
      </div>
      ${isHost() ? `<div class="q-hostbar">
        <button class="q-link" data-act="skip">${t("skip")} ⏭</button>
        <button class="q-link danger" data-act="end">${t("end_game")}</button>
      </div>` : ""}
    </div>
  `);
}

function renderFinished() {
  const w = state.winnerTeam;
  const standings = state.result?.standings || [];
  const host = isHost();

  if (state.solo) {
    const mine = standings.find((s) => s.team === myTeam()) || standings[0];
    $app.innerHTML = shell(`
      <div class="q-wrap-narrow">
        <div class="q-card q-center q-champ" style="--tc:${teamColor(myTeam())}">
          <div class="q-trophy big">🎉</div>
          <div class="q-champ-label">${t("solo_done")}</div>
          <div class="q-champ-team" style="color:${teamColor(myTeam())}">${mine?.solved || 0}/${state.rounds} · ${fmtTime(mine?.totalMs || 0)}</div>
          <div class="q-muted">${t(state.difficulty)}</div>
        </div>
        ${host ? `<button class="q-btn primary full" data-act="again">${t("play_again")}</button>` : ""}
        <button class="q-link" data-act="leave">${t("go_home")}</button>
      </div>
    `);
    return;
  }

  $app.innerHTML = shell(`
    <div class="q-wrap-narrow">
      <div class="q-card q-center q-champ" style="--tc:${teamColor(w)}">
        <div class="q-trophy big">🏆</div>
        <div class="q-champ-label">${t("champion")}</div>
        <div class="q-champ-team" style="color:${teamColor(w)}">${w != null ? esc(teamName(w)) : "—"}</div>
      </div>
      <div class="q-card">
        <h3 class="q-h3">${t("final")}</h3>
        <div class="q-final-list">
          ${standings.map((s, i) => `
            <div class="q-finalrow" style="--tc:${s.color}">
              <span class="q-rank">${i + 1}</span>
              <span class="q-swatch"></span>
              <span class="q-winname">${esc(loc(s.name))}</span>
              <span class="q-winstat">${s.solved}/${state.rounds} ${t("solved_n")} · ${fmtTime(s.totalMs)}</span>
            </div>`).join("")}
        </div>
      </div>
      ${host ? `<button class="q-btn primary full" data-act="again">${t("play_again")}</button>` : `<div class="q-card q-center q-muted">${t("waiting_host")}</div>`}
      <button class="q-link" data-act="leave">${t("go_home")}</button>
    </div>
  `);
}

/* ---------------- events (delegated) ---------------- */
$app.addEventListener("input", (e) => {
  if (e.target.id === "q-name") drafts.name = e.target.value;
  if (e.target.id === "q-code") drafts.joinCode = e.target.value;
});
$app.addEventListener("change", (e) => {
  if (e.target.id === "q-diff") { drafts.difficulty = e.target.value; return; }
  if (e.target.id === "q-rounds") { drafts.rounds = Number(e.target.value); return; }
  const set = e.target.dataset.set;
  if (set) {
    const val = set === "difficulty" ? e.target.value : Number(e.target.value);
    socket.emit("queens_settings", { [set]: val });
  }
});
$app.addEventListener("click", (e) => {
  const langBtn = e.target.closest("[data-lang]");
  if (langBtn) return setLang(langBtn.dataset.lang);

  const dot = e.target.closest("[data-color]");
  if (dot) { drafts.color = dot.dataset.color; return render(); }

  const cell = e.target.closest("[data-cell]");
  if (cell) return tapCell(Number(cell.dataset.cell));

  const team = e.target.closest("[data-team]");
  if (team) return socket.emit("queens_join_team", { team: Number(team.dataset.team) });

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
    case "start": return socket.emit("queens_start");
    case "hint": return socket.emit("queens_hint");
    case "skip": return socket.emit("queens_skip");
    case "end": return socket.emit("queens_end");
    case "again":
      if (state?.solo) { socket.emit("queens_again"); socket.emit("queens_start", { solo: true }); return; }
      return socket.emit("queens_again");
    case "leave":
      socket.emit("queens_leave");
      clearSession();
      state = null;
      pre = "landing";
      stopTick();
      return render();
  }
});

refreshAccount();
render();
