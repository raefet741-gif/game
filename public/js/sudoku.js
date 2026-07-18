// public/js/sudoku.js
// SUDOKU RACE client. The server (/sudoku namespace) owns the authoritative game;
// this file renders sdk_state, draws the player's own TEAM grid (shared with
// teammates), and turns taps into sdk_set events. Opponent grids are never sent —
// only their fill progress — so nobody can copy. Winning teams earn coins + XP.

import { sfx, confettiBurst } from "./effects.js";

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

/* ---------------- state ---------------- */
let config = { colors: [], serverUrl: "" };
let state = null;
let session = loadSession();
let pre = "landing"; // landing | create | join | solo
let drafts = { name: "", color: "", joinCode: "", difficulty: "medium" };
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
  const bad = new Set();
  const mark = (a, b) => { bad.add(a); bad.add(b); };
  for (let r = 0; r < 9; r++) {
    for (let c1 = 0; c1 < 9; c1++) {
      const i = r * 9 + c1;
      if (!grid[i]) continue;
      for (let c2 = c1 + 1; c2 < 9; c2++) {
        const j = r * 9 + c2;
        if (grid[j] === grid[i]) mark(i, j);
      }
    }
  }
  for (let c = 0; c < 9; c++) {
    for (let r1 = 0; r1 < 9; r1++) {
      const i = r1 * 9 + c;
      if (!grid[i]) continue;
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        const j = r2 * 9 + c;
        if (grid[j] === grid[i]) mark(i, j);
      }
    }
  }
  for (let br = 0; br < 3; br++)
    for (let bc = 0; bc < 3; bc++) {
      const cells = [];
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++)
          cells.push((br * 3 + dr) * 9 + (bc * 3 + dc));
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
  if (profile) toast(`${won ? "🏆 " : ""}${t("your_reward")} +${coins} 🪙 · +${xp} ${t("xp")}`, "ok");
});
socket.on("sdk_notice", ({ type, message }) =>
  toast(tErr(message), type === "error" ? "error" : "ok")
);
socket.on("disconnect", () => toast(t("reconnecting"), "error"));

function applyState(next) {
  if (next.status === "playing") {
    // Anchor the local timer the first time we see "playing" this game.
    if (state?.status !== "playing" || !startLocal) startLocal = Date.now();
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
  const name = (drafts.name || "").trim();
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
  const name = (drafts.name || "").trim();
  if (!name) return toast(t("your_name"), "error");
  const diff = drafts.difficulty || "medium";
  socket.emit("sdk_create", { name, color: drafts.color, token: accountToken() }, (res) => {
    if (!res?.ok) return toast(tErr(res?.error), "error");
    saveSession({ code: res.code, playerId: res.playerId });
    socket.emit("sdk_settings", { difficulty: diff });
    socket.emit("sdk_start", { solo: true });
    applyState(res.state);
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
    (l) => `<button class="langpill ${lang === l.code ? "on" : ""}" data-lang="${l.code}">${l.code === "ar" ? "ع" : l.code.toUpperCase()}</button>`
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

function renderPre() {
  if (pre === "solo") {
    $app.innerHTML = shell(`
      <div class="sdk-card sdk-form">
        <button class="sdk-link" data-act="landing">‹ ${t("back")}</button>
        <h2 class="sdk-h2">${t("solo_title")}</h2>
        <label class="sdk-label">${t("your_name")}</label>
        <input class="sdk-input" id="sdk-name" maxlength="16" value="${esc(drafts.name)}" placeholder="${t("your_name")}" />
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
        <input class="sdk-input" id="sdk-name" maxlength="16" value="${esc(drafts.name)}" placeholder="${t("your_name")}" />
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
  $app.innerHTML = shell(`
    <div class="sdk-hero">
      <div class="sdk-emoji">🔢</div>
      <h1 class="sdk-brand">${t("brand")}</h1>
      <p class="sdk-tagline">${t("tagline")}</p>
      <div class="sdk-cta-row">
        <button class="sdk-btn primary" data-act="go-create">${t("create")}</button>
        <button class="sdk-btn ghost" data-act="go-join">${t("join")}</button>
      </div>
      <div class="sdk-cta-row">
        <button class="sdk-btn ghost" data-act="go-solo">🧩 ${t("solo")}</button>
      </div>
    </div>
  `);
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
  const bad = conflictSet();
  const cells = [];
  for (let i = 0; i < 81; i++) {
    const v = grid[i];
    const given = state.given?.[i];
    const r = Math.floor(i / 9);
    const c = i % 9;
    const classes = ["sdk-cell"];
    if (given) classes.push("given");
    if (i === selected) classes.push("sel");
    if (v && bad.has(i)) classes.push("bad");
    if (selected >= 0 && v && v === grid[selected] && i !== selected) classes.push("same");
    if (c % 3 === 2 && c !== 8) classes.push("br");
    if (r % 3 === 2 && r !== 8) classes.push("bb");
    cells.push(`<button class="${classes.join(" ")}" data-cell="${i}" ${given ? "disabled" : ""}>${v || ""}</button>`);
  }
  return `<div class="sdk-board">${cells.join("")}</div>`;
}

function padHTML() {
  const counts = new Array(10).fill(0);
  for (const v of grid) if (v) counts[v]++;
  const keys = [];
  for (let n = 1; n <= 9; n++) {
    const done = counts[n] >= 9;
    keys.push(`<button class="sdk-key ${done ? "done" : ""}" data-num="${n}">${n}</button>`);
  }
  keys.push(`<button class="sdk-key erase" data-num="0">⌫</button>`);
  return `<div class="sdk-pad">${keys.join("")}</div>`;
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
      ${padHTML()}
      <div class="sdk-hint sdk-center">${t("shared_hint")}</div>
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
          ${finished ? `<div class="sdk-champ-team" style="color:${teamColor(myTeam())}">${fmtTime(mine.finishMs)}</div>` : `<div class="sdk-muted">${mine?.filled ?? 0}/81</div>`}
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
              <span class="sdk-wincount">${s.finishMs != null ? fmtTime(s.finishMs) : `${s.filled}/81`}</span>
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
  const set = e.target.dataset.set;
  if (set) {
    const val = set === "difficulty" ? e.target.value : Number(e.target.value);
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
  if (e.key >= "1" && e.key <= "9") { inputValue(Number(e.key)); e.preventDefault(); }
  else if (e.key === "0" || e.key === "Backspace" || e.key === "Delete") { inputValue(0); e.preventDefault(); }
  else if (e.key.startsWith("Arrow")) {
    const r = Math.floor(selected / 9), c = selected % 9;
    let nr = r, nc = c;
    if (e.key === "ArrowUp") nr = Math.max(0, r - 1);
    if (e.key === "ArrowDown") nr = Math.min(8, r + 1);
    if (e.key === "ArrowLeft") nc = Math.max(0, c - 1);
    if (e.key === "ArrowRight") nc = Math.min(8, c + 1);
    selected = nr * 9 + nc;
    render();
    e.preventDefault();
  }
});

render();
