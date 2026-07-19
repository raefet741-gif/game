// public/js/zip.js
// ZIP RACE client. The server (/zip namespace) owns the authoritative game; this
// file renders zip_state, draws the player's own TEAM path (shared with teammates)
// over the shared puzzle board, and turns drags into zip_draw events. Opponent
// paths are never sent — only their fill progress — so nobody can copy. Winning
// teams earn coins + XP.
//
// Rules: draw ONE continuous line starting at cell "1", pass every numbered cell in
// order (1 → 2 → 3 …) and cover EVERY cell exactly once. Walls block some edges.

import { sfx, confettiBurst } from "./effects.js";

const socket = io("/zip", { reconnection: true });
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
    brand: "ZIP RACE",
    tagline: "Team vs team. One line, every cell, in order — finish first for the coins.",
    create: "Create room", join: "Join room", solo: "Play solo", back: "Back",
    solo_title: "Solo puzzle", solo_start: "Start puzzle",
    solo_done: "Solved!", solo_reward: "Puzzle complete — coins earned!",
    your_name: "Your name", pick_color: "Pick a color",
    room_code: "Room code", create_go: "Create", join_go: "Join",
    lobby: "Lobby", share_hint: "Share this code so friends can join:",
    pick_team: "Tap a team to join it", teams: "Teams", players: "Players",
    settings: "Settings", num_teams: "Number of teams", difficulty: "Difficulty",
    easy: "Easy", medium: "Medium", hard: "Hard",
    start_game: "Start game", need_players: "Need at least 2 players.",
    need_teams: "Fill at least 2 teams.", host_only: "Only the host can do that.",
    waiting_host: "Waiting for the host to start…", you: "you", host: "host",
    time: "Time", filled: "Filled", your_team: "Your team",
    how_to: "Start at ①, then drag through every cell in order. Tap a cell on your line to undo back to it.",
    reset: "Reset line", progress: "Progress", solved: "Solved!",
    end_game: "End game", go_home: "Home",
    champion: "Champion", play_again: "Play again",
    final: "Final result", won_line: "finishes first!", dnf: "—",
    your_reward: "You earned", coins: "coins", xp: "XP",
    login_hint: "Log in on the home page to keep your coins & XP.",
    reconnecting: "Reconnecting…",
    err_locked: "Can't change that after the game starts.",
    err_started: "That game already started.", err_no_code: "No room with that code.",
    err_generic: "Something glitched — try again.",
  },
  fr: {
    brand: "ZIP RACE",
    tagline: "Équipe contre équipe. Une ligne, toutes les cases, dans l'ordre — finis en premier pour rafler les pièces.",
    create: "Créer un salon", join: "Rejoindre", solo: "Jouer solo", back: "Retour",
    solo_title: "Grille solo", solo_start: "Commencer",
    solo_done: "Résolu !", solo_reward: "Grille terminée — pièces gagnées !",
    your_name: "Ton nom", pick_color: "Choisis une couleur",
    room_code: "Code du salon", create_go: "Créer", join_go: "Rejoindre",
    lobby: "Salon", share_hint: "Partage ce code pour que tes amis rejoignent :",
    pick_team: "Touche une équipe pour la rejoindre", teams: "Équipes", players: "Joueurs",
    settings: "Réglages", num_teams: "Nombre d'équipes", difficulty: "Difficulté",
    easy: "Facile", medium: "Moyen", hard: "Difficile",
    start_game: "Démarrer", need_players: "Il faut au moins 2 joueurs.",
    need_teams: "Remplis au moins 2 équipes.", host_only: "Seul l'hôte peut faire ça.",
    waiting_host: "En attente du lancement par l'hôte…", you: "toi", host: "hôte",
    time: "Temps", filled: "Rempli", your_team: "Ton équipe",
    how_to: "Commence à ①, puis glisse à travers toutes les cases dans l'ordre. Touche une case de ta ligne pour revenir en arrière.",
    reset: "Effacer la ligne", progress: "Progression", solved: "Résolu !",
    end_game: "Terminer", go_home: "Accueil",
    champion: "Champion", play_again: "Rejouer",
    final: "Résultat final", won_line: "termine en premier !", dnf: "—",
    your_reward: "Tu as gagné", coins: "pièces", xp: "XP",
    login_hint: "Connecte-toi sur l'accueil pour garder tes pièces et ton XP.",
    reconnecting: "Reconnexion…",
    err_locked: "Impossible de changer ça une fois lancé.",
    err_started: "La partie a déjà commencé.", err_no_code: "Aucun salon avec ce code.",
    err_generic: "Un bug — réessaie.",
  },
  ar: {
    brand: "سباق زيب",
    tagline: "فريق ضد فريق. خط واحد، كل الخلايا، بالترتيب — أنهِ أولًا لتربح العملات.",
    create: "إنشاء غرفة", join: "انضمام", solo: "العب منفردًا", back: "رجوع",
    solo_title: "لغز فردي", solo_start: "ابدأ اللغز",
    solo_done: "حُلّت!", solo_reward: "اكتمل اللغز — ربحت عملات!",
    your_name: "اسمك", pick_color: "اختر لونًا",
    room_code: "رمز الغرفة", create_go: "إنشاء", join_go: "انضمام",
    lobby: "الغرفة", share_hint: "شارك هذا الرمز لينضم أصدقاؤك:",
    pick_team: "اضغط على فريق للانضمام إليه", teams: "الفرق", players: "اللاعبون",
    settings: "الإعدادات", num_teams: "عدد الفرق", difficulty: "الصعوبة",
    easy: "سهل", medium: "متوسط", hard: "صعب",
    start_game: "ابدأ اللعبة", need_players: "تحتاج لاعبَين على الأقل.",
    need_teams: "املأ فريقين على الأقل.", host_only: "المضيف فقط يمكنه ذلك.",
    waiting_host: "بانتظار أن يبدأ المضيف…", you: "أنت", host: "المضيف",
    time: "الوقت", filled: "مملوء", your_team: "فريقك",
    how_to: "ابدأ من ①، ثم اسحب عبر كل الخلايا بالترتيب. اضغط على خلية في خطك للتراجع إليها.",
    reset: "مسح الخط", progress: "التقدّم", solved: "حُلّت!",
    end_game: "إنهاء", go_home: "الرئيسية",
    champion: "البطل", play_again: "العب مجددًا",
    final: "النتيجة النهائية", won_line: "ينهي أولًا!", dnf: "—",
    your_reward: "لقد ربحت", coins: "عملة", xp: "خبرة",
    login_hint: "سجّل الدخول من الصفحة الرئيسية للاحتفاظ بعملاتك وخبرتك.",
    reconnecting: "إعادة الاتصال…",
    err_locked: "لا يمكن تغيير ذلك بعد بدء اللعبة.",
    err_started: "بدأت اللعبة بالفعل.", err_no_code: "لا توجد غرفة بهذا الرمز.",
    err_generic: "حدث خلل — حاول مجددًا.",
  },
};
const t = (k) => (T[lang] || T.en)[k] || T.en[k] || k;

const ERR_MAP = {
  zip_err_locked: "err_locked",
  zip_err_host_only: "host_only",
  zip_err_need_players: "need_players",
  zip_err_need_teams: "need_teams",
  zip_err_started: "err_started",
  zip_err_no_code: "err_no_code",
};
function tErr(key) {
  return t(ERR_MAP[key] || "err_generic");
}

/* ---------------- session + account ---------------- */
function loadSession() {
  try { return JSON.parse(localStorage.getItem("zip.session") || "null"); }
  catch { return null; }
}
function saveSession(s) { session = s; localStorage.setItem("zip.session", JSON.stringify(s)); }
function clearSession() { session = null; localStorage.removeItem("zip.session"); }
function accountToken() { return localStorage.getItem("kyuubi.token") || null; }

/* ---------------- state ---------------- */
let config = { colors: [], serverUrl: "" };
let state = null;
let session = loadSession();
let pre = "landing"; // landing | create | join | solo
let drafts = { name: "", color: "", joinCode: "", difficulty: "medium" };
let hadFirstConnect = false;

let path = []; // MY team's working path (array of cell indices)
let drawing = false;
let dirtyState = false; // a state update arrived mid-draw; full-render on pointerup
let syncTimer = null;
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
function size() { return state?.size || 0; }
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

/* ---------------- path geometry / rules ---------------- */
function rc(i) { return [Math.floor(i / size()), i % size()]; }
// Can the line step directly between grid-adjacent cells a and b (no wall)?
function edgeOpen(a, b) {
  const n = size();
  const [ra, ca] = rc(a);
  const [rb, cb] = rc(b);
  if (ra === rb && Math.abs(ca - cb) === 1) return !state.vWall[Math.min(a, b)];
  if (ca === cb && Math.abs(ra - rb) === 1) return !state.hWall[Math.min(a, b)];
  return false;
}
// Highest checkpoint number collected so far along the current path.
function collectedMax() {
  let max = 0;
  for (const cell of path) {
    const num = state.numbers[cell];
    if (num > max) max = num;
  }
  return max;
}
function isSolvedLocal() {
  return state && path.length === state.cellsTotal && collectedMax() === state.checkpointCount;
}

// Try to extend/rewind the current path to include cell i. Mirrors the server
// rules so drawing feels honest; the server re-validates authoritatively.
function extendTo(i) {
  if (!state || state.status !== "playing") return;
  const num = state.numbers[i];

  if (path.length === 0) {
    if (num === 1) { path = [i]; sfx.point?.(); afterPathChange(); }
    return;
  }

  const head = path[path.length - 1];
  if (i === head) return;

  const at = path.indexOf(i);
  if (at !== -1) {
    // Tapped/dragged back over the line → rewind to that cell (undo).
    if (at === path.length - 1) return;
    path = path.slice(0, at + 1);
    sfx.click?.();
    afterPathChange();
    return;
  }

  // New cell: must be an open, adjacent step, and honour number order.
  if (!edgeOpen(head, i)) return;
  if (num > 0 && num !== collectedMax() + 1) return; // can't reach this number yet
  path.push(i);
  sfx.point?.();
  afterPathChange();
}

function afterPathChange() {
  paintPath();
  queueSync();
}

// Coalesce rapid drag updates into ~50ms bursts to spare the socket.
function queueSync() {
  if (syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    socket.emit("zip_draw", { path });
  }, 50);
}
function flushSync() {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  socket.emit("zip_draw", { path });
}
function resetPath() {
  path = [];
  paintPath();
  flushSync();
}

/* ---------------- socket ---------------- */
socket.on("connect", () => {
  const firstLoad = !hadFirstConnect;
  hadFirstConnect = true;
  if (session?.code && session?.playerId) {
    socket.emit("zip_join", { code: session.code, playerId: session.playerId, token: accountToken() }, (res) => {
      if (!res?.ok) { clearSession(); state = null; render(); return; }
      if (firstLoad && res.state?.status !== "playing") {
        socket.emit("zip_leave");
        clearSession(); state = null; render();
        return;
      }
      if (Array.isArray(res.path)) path = res.path.slice();
      applyState(res.state);
    });
  } else if (firstLoad) render();
});

socket.on("zip_config", (c) => {
  config = c;
  if (!drafts.color) drafts.color = config.colors[0] || "";
  render();
});
socket.on("zip_state", (next) => applyState(next));
socket.on("zip_path", ({ team, path: p }) => {
  if (team !== myTeam()) return;
  // Ignore my own echo while actively drawing so it can't stomp a fresh drag.
  if (drawing) return;
  path = Array.isArray(p) ? p.slice() : [];
  if (state?.status === "playing") paintPath();
});
socket.on("zip_gameover", ({ winnerTeam }) => {
  confettiBurst();
  sfx.win();
  if (winnerTeam != null && myTeam() === winnerTeam) confettiBurst();
});
socket.on("zip_reward", ({ coins, xp, won }) => {
  toast(`${won ? "🏆 " : ""}${t("your_reward")} +${coins} 🪙 · +${xp} ${t("xp")}`, "ok");
});
socket.on("zip_notice", ({ type, message }) =>
  toast(tErr(message), type === "error" ? "error" : "ok")
);
socket.on("disconnect", () => toast(t("reconnecting"), "error"));

function applyState(next) {
  const wasPlaying = state?.status === "playing";
  if (next.status === "playing") {
    if (!wasPlaying || !startLocal) startLocal = Date.now();
    if (!tickHandle) startTick();
  } else {
    stopTick();
  }
  // Fresh game → clear my stale line.
  if (next.status === "playing" && !wasPlaying) path = [];
  state = next;
  // Mid-draw state pings only refresh progress; defer the full rebuild.
  if (drawing && next.status === "playing") { dirtyState = true; paintPath(); return; }
  render();
}

/* ---------------- local clock ---------------- */
function startTick() {
  stopTick();
  tickHandle = setInterval(() => {
    const el = document.getElementById("zip-timer");
    if (el) el.textContent = fmtTime(Date.now() - startLocal);
  }, 250);
}
function stopTick() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}

/* ---------------- actions ---------------- */
function createRoom() {
  const name = (drafts.name || "").trim();
  if (!name) return toast(t("your_name"), "error");
  socket.emit("zip_create", { name, color: drafts.color, token: accountToken() }, (res) => {
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
  socket.emit("zip_join", { code, name, color: drafts.color, token: accountToken() }, (res) => {
    if (!res?.ok) return toast(tErr(res?.error), "error");
    saveSession({ code: res.code, playerId: res.playerId });
    applyState(res.state);
  });
}
// Solo: create a private room, set difficulty, and start alone in one step.
function startSolo() {
  const name = (drafts.name || "").trim();
  if (!name) return toast(t("your_name"), "error");
  const diff = drafts.difficulty || "medium";
  socket.emit("zip_create", { name, color: drafts.color, token: accountToken() }, (res) => {
    if (!res?.ok) return toast(tErr(res?.error), "error");
    saveSession({ code: res.code, playerId: res.playerId });
    socket.emit("zip_settings", { difficulty: diff });
    socket.emit("zip_start", { solo: true });
    applyState(res.state);
  });
}

/* ---------------- render ---------------- */
function langBar() {
  return `<div class="langbar">${LANGS.map(
    (l) => `<button class="langpill ${lang === l.code ? "on" : ""}" data-lang="${l.code}">${l.code === "ar" ? "ع" : l.code.toUpperCase()}</button>`
  ).join("")}</div>`;
}
function colorDots(selectedColor) {
  return `<div class="zip-colors">${config.colors
    .map((c) => `<button class="zip-dot ${c === selectedColor ? "on" : ""}" data-color="${c}" style="background:${c}"></button>`)
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
    <div class="zip-top">
      <span class="zip-logo">⚡ ${t("brand")}</span>
      ${langBar()}
    </div>
    <div class="zip-wrap">${inner}</div>
  `;
}

function difficultySelect() {
  return `<select class="zip-select" id="zip-diff">
    ${["easy", "medium", "hard"].map((d) => `<option value="${d}" ${drafts.difficulty === d ? "selected" : ""}>${t(d)}</option>`).join("")}
  </select>`;
}

function renderPre() {
  if (pre === "solo") {
    $app.innerHTML = shell(`
      <div class="zip-card zip-form">
        <button class="zip-link" data-act="landing">‹ ${t("back")}</button>
        <h2 class="zip-h2">${t("solo_title")}</h2>
        <label class="zip-label">${t("your_name")}</label>
        <input class="zip-input" id="zip-name" maxlength="16" value="${esc(drafts.name)}" placeholder="${t("your_name")}" />
        <label class="zip-label">${t("difficulty")}</label>
        ${difficultySelect()}
        <label class="zip-label">${t("pick_color")}</label>
        ${colorDots(drafts.color)}
        <button class="zip-btn primary" data-act="solo">${t("solo_start")}</button>
      </div>
    `);
    return;
  }
  if (pre === "create" || pre === "join") {
    const isCreate = pre === "create";
    $app.innerHTML = shell(`
      <div class="zip-card zip-form">
        <button class="zip-link" data-act="landing">‹ ${t("back")}</button>
        <h2 class="zip-h2">${isCreate ? t("create") : t("join")}</h2>
        <label class="zip-label">${t("your_name")}</label>
        <input class="zip-input" id="zip-name" maxlength="16" value="${esc(drafts.name)}" placeholder="${t("your_name")}" />
        ${isCreate ? "" : `
          <label class="zip-label">${t("room_code")}</label>
          <input class="zip-input" id="zip-code" maxlength="12" value="${esc(drafts.joinCode)}" placeholder="ZIP-ABCD" style="text-transform:uppercase" />`}
        <label class="zip-label">${t("pick_color")}</label>
        ${colorDots(drafts.color)}
        <button class="zip-btn primary" data-act="${isCreate ? "create" : "join"}">${isCreate ? t("create_go") : t("join_go")}</button>
      </div>
    `);
    return;
  }
  $app.innerHTML = shell(`
    <div class="zip-hero">
      <div class="zip-emoji">⚡</div>
      <h1 class="zip-brand">${t("brand")}</h1>
      <p class="zip-tagline">${t("tagline")}</p>
      <div class="zip-cta-row">
        <button class="zip-btn primary" data-act="go-create">${t("create")}</button>
        <button class="zip-btn ghost" data-act="go-join">${t("join")}</button>
      </div>
      <div class="zip-cta-row">
        <button class="zip-btn ghost" data-act="go-solo">🧩 ${t("solo")}</button>
      </div>
    </div>
  `);
}

function renderLobby() {
  const me = myPlayer();
  const host = isHost();
  const base = inviteBase();
  const qr = `/api/qr?text=${encodeURIComponent(base + "/zip")}`;

  const teamCards = state.teams
    .map((tm) => {
      const members = state.players.filter((p) => p.team === tm.index);
      const mine = me?.team === tm.index;
      return `
        <button class="zip-team ${mine ? "mine" : ""}" data-team="${tm.index}" style="--tc:${tm.color}">
          <div class="zip-team-name">${esc(teamName(tm.index))}</div>
          <div class="zip-team-members">
            ${members.map((p) => `<span class="zip-chip" style="--pc:${p.color}">${esc(p.name)}${p.id === myId() ? " ·" + t("you") : ""}</span>`).join("") || `<span class="zip-empty">—</span>`}
          </div>
        </button>`;
    })
    .join("");

  const diffOptions = ["easy", "medium", "hard"]
    .map((d) => `<option value="${d}" ${state.settings.difficulty === d ? "selected" : ""}>${t(d)}</option>`)
    .join("");

  $app.innerHTML = shell(`
    <div class="zip-lobby">
      <div class="zip-card">
        <div class="zip-code-row">
          <div>
            <div class="zip-label">${t("room_code")}</div>
            <div class="zip-code">${esc(state.code)}</div>
            <div class="zip-hint">${t("share_hint")}</div>
          </div>
          <img class="zip-qr" src="${qr}" alt="QR" onerror="this.style.display='none'" />
        </div>
      </div>

      <div class="zip-card">
        <h3 class="zip-h3">${t("teams")} · <span class="zip-muted">${t("pick_team")}</span></h3>
        <div class="zip-teams">${teamCards}</div>
      </div>

      ${host ? `
      <div class="zip-card">
        <h3 class="zip-h3">${t("settings")}</h3>
        <div class="zip-set-row">
          <label class="zip-label">${t("num_teams")}</label>
          <select class="zip-select" data-set="numTeams">
            ${[2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${state.settings.numTeams === n ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </div>
        <div class="zip-set-row">
          <label class="zip-label">${t("difficulty")}</label>
          <select class="zip-select" data-set="difficulty">${diffOptions}</select>
        </div>
        <button class="zip-btn primary full" data-act="start">${t("start_game")}</button>
      </div>
      ` : `<div class="zip-card zip-center zip-muted">${t("waiting_host")}</div>`}

      ${accountToken() ? "" : `<div class="zip-card zip-center zip-muted">${t("login_hint")}</div>`}
      <button class="zip-link danger" data-act="leave">${t("go_home")} ✕</button>
    </div>
  `);
}

// The board: a CSS grid of cells with an SVG overlay for walls + the drawn line.
function boardHTML() {
  const n = size();
  const cells = [];
  for (let i = 0; i < n * n; i++) {
    const num = state.numbers[i];
    cells.push(
      `<button class="zip-cell" data-cell="${i}">${num > 0 ? `<span class="zip-num">${num}</span>` : ""}</button>`
    );
  }
  // Static wall segments (computed once per board — they never change mid-game).
  let wallSvg = "";
  for (let i = 0; i < n * n; i++) {
    const [r, c] = [Math.floor(i / n), i % n];
    if (c < n - 1 && state.vWall[i])
      wallSvg += `<line class="zip-wall" x1="${c + 1}" y1="${r}" x2="${c + 1}" y2="${r + 1}" />`;
    if (r < n - 1 && state.hWall[i])
      wallSvg += `<line class="zip-wall" x1="${c}" y1="${r + 1}" x2="${c + 1}" y2="${r + 1}" />`;
  }
  return `
    <div class="zip-board" id="zip-board" style="--n:${n}" data-n="${n}">
      <div class="zip-cells">${cells.join("")}</div>
      <svg class="zip-svg" id="zip-svg" viewBox="0 0 ${n} ${n}" preserveAspectRatio="none" aria-hidden="true">
        <polyline class="zip-line" id="zip-line" points="" />
        <g class="zip-walls">${wallSvg}</g>
      </svg>
    </div>`;
}

// Update ONLY the line + cell states + progress bars — no innerHTML rebuild, so
// dragging stays smooth and the pointer target survives.
function paintPath() {
  const n = size();
  if (!n) return;
  const board = document.getElementById("zip-board");
  const line = document.getElementById("zip-line");
  if (!board || !line) return;

  const col = teamColor(myTeam());
  const inPath = new Set(path);
  const head = path.length ? path[path.length - 1] : -1;

  // Polyline through cell centres (viewBox units are grid cells).
  line.setAttribute(
    "points",
    path.map((i) => `${(i % n) + 0.5},${Math.floor(i / n) + 0.5}`).join(" ")
  );
  line.setAttribute("stroke", col);

  board.querySelectorAll(".zip-cell").forEach((el, i) => {
    el.classList.toggle("on", inPath.has(i));
    el.classList.toggle("head", i === head);
    if (inPath.has(i)) el.style.setProperty("--tc", col);
  });

  updateProgress();
}

function progressPanelHTML() {
  const total = state.cellsTotal || size() * size();
  return `<div id="zip-prows">${state.teams
    .filter((tm) => tm.members.length)
    .sort((a, b) => b.filled - a.filled)
    .map((tm) => progressRow(tm, total))
    .join("")}</div>`;
}
function progressRow(tm, total) {
  const filled = tm.index === myTeam() ? path.length : tm.filled;
  const pct = total ? Math.round((filled / total) * 100) : 0;
  const mine = tm.index === myTeam();
  return `
    <div class="zip-prow ${mine ? "me" : ""}" data-team="${tm.index}" style="--tc:${tm.color}">
      <span class="zip-pname">${esc(teamName(tm.index))}${tm.finished ? ` <b class="zip-done">✓ ${fmtTime(tm.finishMs)}</b>` : ""}</span>
      <div class="zip-pbar"><span style="width:${pct}%"></span></div>
      <span class="zip-pcount">${filled}/${total}</span>
    </div>`;
}
function updateProgress() {
  const box = document.getElementById("zip-prows");
  if (!box) return;
  const total = state.cellsTotal || size() * size();
  box.innerHTML = state.teams
    .filter((tm) => tm.members.length)
    .sort((a, b) => {
      const fa = a.index === myTeam() ? path.length : a.filled;
      const fb = b.index === myTeam() ? path.length : b.filled;
      return fb - fa;
    })
    .map((tm) => progressRow(tm, total))
    .join("");
}

function renderPlaying() {
  const mt = myTeam();
  $app.innerHTML = shell(`
    <div class="zip-play">
      <div class="zip-hud">
        <div class="zip-hud-item"><span class="zip-hud-k">${t("your_team")}</span><span class="zip-hud-v" style="color:${teamColor(mt)}">${esc(teamName(mt))}</span></div>
        <div class="zip-hud-item"><span class="zip-hud-k">${t("difficulty")}</span><span class="zip-hud-v">${t(state.difficulty)}</span></div>
        <div class="zip-hud-item"><span class="zip-hud-k">${t("time")}</span><span class="zip-hud-v" id="zip-timer">${fmtTime(Date.now() - startLocal)}</span></div>
      </div>
      ${boardHTML()}
      <div class="zip-actions">
        <button class="zip-btn ghost small" data-act="reset">⟲ ${t("reset")}</button>
      </div>
      <div class="zip-hint zip-center">${t("how_to")}</div>
      <div class="zip-progress">
        <h3 class="zip-h3">${t("progress")}</h3>
        ${progressPanelHTML()}
      </div>
      ${isHost() ? `<button class="zip-link danger" data-act="end">${t("end_game")}</button>` : ""}
    </div>
  `);
  paintPath();
  bindBoard();
}

function renderFinished() {
  const w = state.winnerTeam;
  const standings = state.result?.standings || [];
  const host = isHost();

  if (state.solo) {
    const mine = standings.find((s) => s.team === myTeam()) || standings[0];
    const finished = mine?.finishMs != null;
    const total = state.cellsTotal || size() * size();
    $app.innerHTML = shell(`
      <div class="zip-wrap-narrow">
        <div class="zip-card zip-center zip-champ" style="--tc:${teamColor(myTeam())}">
          <div class="zip-trophy big">${finished ? "🎉" : "⚡"}</div>
          <div class="zip-champ-label">${t("solo_done")}</div>
          ${finished ? `<div class="zip-champ-team" style="color:${teamColor(myTeam())}">${fmtTime(mine.finishMs)}</div>` : `<div class="zip-muted">${mine?.filled ?? 0}/${total}</div>`}
          <div class="zip-muted">${t(state.difficulty)}</div>
        </div>
        ${host ? `<button class="zip-btn primary full" data-act="again">${t("play_again")}</button>` : ""}
        <button class="zip-link" data-act="leave">${t("go_home")}</button>
      </div>
    `);
    return;
  }

  const total = state.cellsTotal || size() * size();
  $app.innerHTML = shell(`
    <div class="zip-wrap-narrow">
      <div class="zip-card zip-center zip-champ" style="--tc:${teamColor(w)}">
        <div class="zip-trophy big">🏆</div>
        <div class="zip-champ-label">${t("champion")}</div>
        <div class="zip-champ-team" style="color:${teamColor(w)}">${w != null ? esc(teamName(w)) : "—"}</div>
        ${w != null && standings.find((s) => s.team === w)?.finishMs != null
          ? `<div class="zip-muted">${fmtTime(standings.find((s) => s.team === w).finishMs)}</div>` : ""}
      </div>
      <div class="zip-card">
        <h3 class="zip-h3">${t("final")}</h3>
        <div class="zip-final-list">
          ${standings.map((s, i) => `
            <div class="zip-finalrow" style="--tc:${s.color}">
              <span class="zip-rank">${i + 1}</span>
              <span class="zip-swatch"></span>
              <span class="zip-winname">${esc(loc(s.name))}</span>
              <span class="zip-wincount">${s.finishMs != null ? fmtTime(s.finishMs) : `${s.filled}/${total}`}</span>
            </div>`).join("")}
        </div>
      </div>
      ${host ? `<button class="zip-btn primary full" data-act="again">${t("play_again")}</button>` : `<div class="zip-card zip-center zip-muted">${t("waiting_host")}</div>`}
      <button class="zip-link" data-act="leave">${t("go_home")}</button>
    </div>
  `);
}

/* ---------------- board pointer drawing ---------------- */
function cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const c = el && el.closest ? el.closest("[data-cell]") : null;
  return c ? Number(c.dataset.cell) : null;
}
function bindBoard() {
  const board = document.getElementById("zip-board");
  if (!board) return;
  board.addEventListener("pointerdown", (e) => {
    if (state?.status !== "playing") return;
    drawing = true;
    dirtyState = false;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (cell != null) extendTo(cell);
    e.preventDefault();
  });
  board.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (cell != null) extendTo(cell);
    e.preventDefault();
  });
}
function endDraw() {
  if (!drawing) return;
  drawing = false;
  flushSync();
  if (isSolvedLocal()) { confettiBurst(); }
  // A state update landed while drawing — do the deferred full rebuild now.
  if (dirtyState) { dirtyState = false; if (state?.status !== "playing") render(); }
}
window.addEventListener("pointerup", endDraw);
window.addEventListener("pointercancel", endDraw);

/* ---------------- events (delegated) ---------------- */
$app.addEventListener("input", (e) => {
  if (e.target.id === "zip-name") drafts.name = e.target.value;
  if (e.target.id === "zip-code") drafts.joinCode = e.target.value;
});
$app.addEventListener("change", (e) => {
  if (e.target.id === "zip-diff") { drafts.difficulty = e.target.value; return; }
  const set = e.target.dataset.set;
  if (set) {
    const val = set === "difficulty" ? e.target.value : Number(e.target.value);
    socket.emit("zip_settings", { [set]: val });
  }
});
$app.addEventListener("click", (e) => {
  const langBtn = e.target.closest("[data-lang]");
  if (langBtn) return setLang(langBtn.dataset.lang);

  const dot = e.target.closest("[data-color]");
  if (dot) { drafts.color = dot.dataset.color; return render(); }

  const team = e.target.closest("[data-team]");
  if (team && state?.status === "lobby") return socket.emit("zip_join_team", { team: Number(team.dataset.team) });

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
    case "start": return socket.emit("zip_start");
    case "reset": return resetPath();
    case "end": return socket.emit("zip_end");
    case "again":
      if (state?.solo) { socket.emit("zip_again"); socket.emit("zip_start", { solo: true }); return; }
      return socket.emit("zip_again");
    case "leave":
      socket.emit("zip_leave");
      clearSession();
      state = null;
      pre = "landing";
      path = [];
      stopTick();
      return render();
  }
});

render();
