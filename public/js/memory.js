// public/js/memory.js
// MEMORY MATCH client. The server (/memory namespace) owns the authoritative
// game; this file renders mem_state, draws each player's own board, and turns
// taps into mem_flip events. Card faces are revealed one at a time by the
// server (mem_reveal), so a client can never peek at the whole board.

import { sfx, confettiBurst } from "./effects.js";

const socket = io("/memory", { reconnection: true });
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
    brand: "MEMORY MATCH",
    tagline: "Flip, remember, race your team to the finish.",
    create: "Create room", join: "Join room", back: "Back",
    your_name: "Your name", pick_color: "Pick a color",
    room_code: "Room code", create_go: "Create", join_go: "Join",
    lobby: "Lobby", share_hint: "Share this code so friends can join:",
    pick_team: "Tap a team to join it", teams: "Teams", players: "Players",
    settings: "Settings", num_teams: "Number of teams", max_grid: "Hardest grid",
    start_game: "Start game", need_players: "Need at least 2 players.",
    need_teams: "Fill at least 2 teams.", host_only: "Only the host can do that.",
    waiting_host: "Waiting for the host to start…", you: "you", host: "host",
    round: "Round", of: "of", moves: "Moves", pairs: "Pairs", time: "Time",
    your_board: "Your board", scoreboard: "Progress", finished: "Done!",
    waiting_team: "Waiting for your team…", team_wins: "Round wins",
    round_won: "wins the round!", your_time: "Your time",
    next_round: "Next round", see_final: "See final result", end_game: "End game",
    champion: "Champion", play_again: "Play again", go_home: "Home",
    final: "Final result", rounds_won: "rounds won", dnf: "—",
    reconnecting: "Reconnecting…", removed: "Room closed.",
    err_locked: "Can't change that after the game starts.",
    err_started: "That game already started.", err_no_code: "No room with that code.",
    err_generic: "Something glitched — try again.",
  },
  fr: {
    brand: "MEMORY MATCH",
    tagline: "Retourne, mémorise, cours vers la victoire avec ton équipe.",
    create: "Créer un salon", join: "Rejoindre", back: "Retour",
    your_name: "Ton nom", pick_color: "Choisis une couleur",
    room_code: "Code du salon", create_go: "Créer", join_go: "Rejoindre",
    lobby: "Salon", share_hint: "Partage ce code pour que tes amis rejoignent :",
    pick_team: "Touche une équipe pour la rejoindre", teams: "Équipes", players: "Joueurs",
    settings: "Réglages", num_teams: "Nombre d'équipes", max_grid: "Grille la plus dure",
    start_game: "Démarrer", need_players: "Il faut au moins 2 joueurs.",
    need_teams: "Remplis au moins 2 équipes.", host_only: "Seul l'hôte peut faire ça.",
    waiting_host: "En attente du lancement par l'hôte…", you: "toi", host: "hôte",
    round: "Manche", of: "sur", moves: "Coups", pairs: "Paires", time: "Temps",
    your_board: "Ton plateau", scoreboard: "Progression", finished: "Terminé !",
    waiting_team: "En attente de ton équipe…", team_wins: "Manches gagnées",
    round_won: "gagne la manche !", your_time: "Ton temps",
    next_round: "Manche suivante", see_final: "Voir le résultat", end_game: "Terminer",
    champion: "Champion", play_again: "Rejouer", go_home: "Accueil",
    final: "Résultat final", rounds_won: "manches gagnées", dnf: "—",
    reconnecting: "Reconnexion…", removed: "Salon fermé.",
    err_locked: "Impossible de changer ça une fois lancé.",
    err_started: "La partie a déjà commencé.", err_no_code: "Aucun salon avec ce code.",
    err_generic: "Un bug — réessaie.",
  },
  ar: {
    brand: "لعبة الذاكرة",
    tagline: "اقلب، تذكّر، وتسابق مع فريقك حتى النهاية.",
    create: "إنشاء غرفة", join: "انضمام", back: "رجوع",
    your_name: "اسمك", pick_color: "اختر لونًا",
    room_code: "رمز الغرفة", create_go: "إنشاء", join_go: "انضمام",
    lobby: "الغرفة", share_hint: "شارك هذا الرمز لينضم أصدقاؤك:",
    pick_team: "اضغط على فريق للانضمام إليه", teams: "الفرق", players: "اللاعبون",
    settings: "الإعدادات", num_teams: "عدد الفرق", max_grid: "أصعب شبكة",
    start_game: "ابدأ اللعبة", need_players: "تحتاج لاعبَين على الأقل.",
    need_teams: "املأ فريقين على الأقل.", host_only: "المضيف فقط يمكنه ذلك.",
    waiting_host: "بانتظار أن يبدأ المضيف…", you: "أنت", host: "المضيف",
    round: "الجولة", of: "من", moves: "الحركات", pairs: "الأزواج", time: "الوقت",
    your_board: "لوحتك", scoreboard: "التقدّم", finished: "انتهيت!",
    waiting_team: "بانتظار فريقك…", team_wins: "الجولات الرابحة",
    round_won: "يفوز بالجولة!", your_time: "وقتك",
    next_round: "الجولة التالية", see_final: "عرض النتيجة", end_game: "إنهاء",
    champion: "البطل", play_again: "العب مجددًا", go_home: "الرئيسية",
    final: "النتيجة النهائية", rounds_won: "جولات رابحة", dnf: "—",
    reconnecting: "إعادة الاتصال…", removed: "أُغلقت الغرفة.",
    err_locked: "لا يمكن تغيير ذلك بعد بدء اللعبة.",
    err_started: "بدأت اللعبة بالفعل.", err_no_code: "لا توجد غرفة بهذا الرمز.",
    err_generic: "حدث خلل — حاول مجددًا.",
  },
};
const t = (k) => (T[lang] || T.en)[k] || T.en[k] || k;

const ERR_MAP = {
  mem_err_locked: "err_locked",
  mem_err_host_only: "host_only",
  mem_err_need_players: "need_players",
  mem_err_need_teams: "need_teams",
  mem_err_started: "err_started",
  mem_err_no_code: "err_no_code",
};
function tErr(key) {
  return t(ERR_MAP[key] || "err_generic");
}

/* ---------------- session ---------------- */
function loadSession() {
  try { return JSON.parse(localStorage.getItem("memory.session") || "null"); }
  catch { return null; }
}
function saveSession(s) { session = s; localStorage.setItem("memory.session", JSON.stringify(s)); }
function clearSession() { session = null; localStorage.removeItem("memory.session"); }

/* ---------------- state ---------------- */
let config = { colors: [], serverUrl: "" };
let state = null;
let session = loadSession();
let pre = "landing"; // landing | create | join
let drafts = { name: "", color: "", joinCode: "" };
let hadFirstConnect = false;

// Local view of MY board for the current round.
let board = {
  round: -1,
  shown: new Map(), // index -> emoji (face-up OR matched)
  matched: new Set(), // matched indices
  pending: new Set(), // taps awaiting a server reveal
  busy: false, // mismatch flip-back animation in progress
};
let roundStartLocal = 0;
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
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 250); }, 2600);
}

/* ---------------- socket ---------------- */
socket.on("connect", () => {
  const firstLoad = !hadFirstConnect;
  hadFirstConnect = true;
  if (session?.code && session?.playerId) {
    socket.emit("mem_join", { code: session.code, playerId: session.playerId }, (res) => {
      if (!res?.ok) { clearSession(); state = null; render(); return; }
      if (firstLoad && res.state?.status !== "playing" && res.state?.status !== "roundover") {
        socket.emit("mem_leave");
        clearSession(); state = null; render();
        return;
      }
      if (res.board) restoreBoard(res.board, res.state);
      applyState(res.state);
    });
  } else if (firstLoad) render();
});

socket.on("mem_config", (c) => {
  config = c;
  if (!drafts.color) drafts.color = config.colors[0] || "";
  render();
});
socket.on("mem_state", (next) => applyState(next));

socket.on("mem_reveal", ({ index, emoji }) => {
  board.pending.delete(index);
  board.shown.set(index, emoji);
  sfx.click();
  render();
});
socket.on("mem_pair", ({ a, b, match }) => {
  if (match) {
    board.matched.add(a);
    board.matched.add(b);
    sfx.point();
    render();
  } else {
    board.busy = true;
    sfx.buzz();
    render();
    setTimeout(() => {
      board.shown.delete(a);
      board.shown.delete(b);
      board.busy = false;
      render();
    }, 950);
  }
});
socket.on("mem_roundover", () => sfx.win());
socket.on("mem_gameover", ({ winnerTeam }) => {
  confettiBurst();
  sfx.win();
  if (winnerTeam != null && myPlayer()?.team === winnerTeam) confettiBurst();
});
socket.on("mem_notice", ({ type, message }) =>
  toast(tErr(message), type === "error" ? "error" : "ok")
);
socket.on("disconnect", () => toast(t("reconnecting"), "error"));

function restoreBoard(b, st) {
  resetBoard(st?.round ?? 0);
  for (const c of b.matched || []) { board.shown.set(c.index, c.emoji); board.matched.add(c.index); }
  for (const c of b.up || []) board.shown.set(c.index, c.emoji);
}

function resetBoard(round) {
  board = { round, shown: new Map(), matched: new Set(), pending: new Set(), busy: false };
  roundStartLocal = Date.now();
}

function applyState(next) {
  // A new round bumps next.round → wipe the local board and restart the clock.
  // (On reconnect, restoreBoard() has already set board.round to match, so we
  // keep the restored faces and just make sure the clock is ticking.)
  if (next.status === "playing") {
    if (board.round !== next.round) resetBoard(next.round);
    if (!tickHandle) startTick();
  } else {
    stopTick();
  }
  state = next;
  render();
}

/* ---------------- local round clock ---------------- */
function startTick() {
  stopTick();
  tickHandle = setInterval(() => {
    const el = document.getElementById("mm-timer");
    if (el) el.textContent = liveTime();
  }, 250);
}
function stopTick() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}
function liveTime() {
  const me = myPlayer();
  if (me?.finished && me.finishMs != null) return fmtTime(me.finishMs);
  return fmtTime(Date.now() - roundStartLocal);
}

/* ---------------- actions ---------------- */
function createRoom() {
  const name = (drafts.name || "").trim();
  if (!name) return toast(t("your_name"), "error");
  socket.emit("mem_create", { name, color: drafts.color }, (res) => {
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
  socket.emit("mem_join", { code, name, color: drafts.color }, (res) => {
    if (!res?.ok) return toast(tErr(res?.error), "error");
    saveSession({ code: res.code, playerId: res.playerId });
    applyState(res.state);
  });
}
function flipCard(i) {
  if (board.busy) return;
  if (board.matched.has(i) || board.shown.has(i) || board.pending.has(i)) return;
  const liveUp = [...board.shown.keys()].filter((k) => !board.matched.has(k)).length;
  if (liveUp >= 2) return;
  board.pending.add(i);
  socket.emit("mem_flip", { index: i });
  render();
}

/* ---------------- render ---------------- */
function langBar() {
  return `<div class="langbar">${LANGS.map(
    (l) => `<button class="langpill ${lang === l.code ? "on" : ""}" data-lang="${l.code}">${l.code === "ar" ? "ع" : l.code.toUpperCase()}</button>`
  ).join("")}</div>`;
}
function colorDots(selected) {
  return `<div class="mm-colors">${config.colors
    .map((c) => `<button class="mm-dot ${c === selected ? "on" : ""}" data-color="${c}" style="background:${c}"></button>`)
    .join("")}</div>`;
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
      <div class="mm-card mm-form">
        <button class="mm-link" data-act="landing">‹ ${t("back")}</button>
        <h2 class="mm-h2">${isCreate ? t("create") : t("join")}</h2>
        <label class="mm-label">${t("your_name")}</label>
        <input class="mm-input" id="mm-name" maxlength="16" value="${esc(drafts.name)}" placeholder="${t("your_name")}" />
        ${isCreate ? "" : `
          <label class="mm-label">${t("room_code")}</label>
          <input class="mm-input" id="mm-code" maxlength="12" value="${esc(drafts.joinCode)}" placeholder="MEM-ABCD" style="text-transform:uppercase" />`}
        <label class="mm-label">${t("pick_color")}</label>
        ${colorDots(drafts.color)}
        <button class="mm-btn primary" data-act="${isCreate ? "create" : "join"}">${isCreate ? t("create_go") : t("join_go")}</button>
      </div>
    `);
    return;
  }
  $app.innerHTML = shell(`
    <div class="mm-hero">
      <div class="mm-emoji">🧠</div>
      <h1 class="mm-brand">${t("brand")}</h1>
      <p class="mm-tagline">${t("tagline")}</p>
      <div class="mm-cta-row">
        <button class="mm-btn primary" data-act="go-create">${t("create")}</button>
        <button class="mm-btn ghost" data-act="go-join">${t("join")}</button>
      </div>
    </div>
  `);
}

function shell(inner) {
  return `
    <div class="mm-top">
      <span class="mm-logo">🧠 ${t("brand")}</span>
      ${langBar()}
    </div>
    <div class="mm-wrap">${inner}</div>
  `;
}

function renderLobby() {
  const me = myPlayer();
  const host = isHost();
  const base = inviteBase();
  const qr = `/api/qr?text=${encodeURIComponent(base + "/memory")}`;

  const teamCards = state.teams
    .map((tm) => {
      const members = state.players.filter((p) => p.team === tm.index);
      const mine = me?.team === tm.index;
      return `
        <button class="mm-team ${mine ? "mine" : ""}" data-team="${tm.index}" style="--tc:${tm.color}">
          <div class="mm-team-name">${esc(teamName(tm.index))}</div>
          <div class="mm-team-members">
            ${members.map((p) => `<span class="mm-chip" style="--pc:${p.color}">${esc(p.name)}${p.id === myId() ? " ·" + t("you") : ""}</span>`).join("") || `<span class="mm-empty">—</span>`}
          </div>
        </button>`;
    })
    .join("");

  const gridOptions = [
    [0, "4×4"], [1, "4×6"], [2, "6×6"], [3, "6×8"], [4, "8×8"],
  ]
    .map(([i, label]) => `<option value="${i}" ${state.settings.maxGridIndex === i ? "selected" : ""}>${label}</option>`)
    .join("");

  $app.innerHTML = shell(`
    <div class="mm-lobby">
      <div class="mm-card">
        <div class="mm-code-row">
          <div>
            <div class="mm-label">${t("room_code")}</div>
            <div class="mm-code">${esc(state.code)}</div>
            <div class="mm-hint">${t("share_hint")}</div>
          </div>
          <img class="mm-qr" src="${qr}" alt="QR" onerror="this.style.display='none'" />
        </div>
      </div>

      <div class="mm-card">
        <h3 class="mm-h3">${t("teams")} · <span class="mm-muted">${t("pick_team")}</span></h3>
        <div class="mm-teams">${teamCards}</div>
      </div>

      ${host ? `
      <div class="mm-card">
        <h3 class="mm-h3">${t("settings")}</h3>
        <div class="mm-set-row">
          <label class="mm-label">${t("num_teams")}</label>
          <select class="mm-select" data-set="numTeams">
            ${[2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${state.settings.numTeams === n ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </div>
        <div class="mm-set-row">
          <label class="mm-label">${t("max_grid")}</label>
          <select class="mm-select" data-set="maxGridIndex">${gridOptions}</select>
        </div>
        <div class="mm-hint">${t("round")} 4×4 → ${["4×4", "4×6", "6×6", "6×8", "8×8"][state.settings.maxGridIndex]} · ${state.totalRounds} ${t("round").toLowerCase()}s</div>
        <button class="mm-btn primary full" data-act="start">${t("start_game")}</button>
      </div>
      ` : `<div class="mm-card mm-center mm-muted">${t("waiting_host")}</div>`}

      <button class="mm-link danger" data-act="leave">${t("go_home")} ✕</button>
    </div>
  `);
}

function progressBar(p, pairs) {
  const pct = pairs ? Math.round((p.matchedPairs / pairs) * 100) : 0;
  const done = p.finished;
  return `
    <div class="mm-prow ${p.id === myId() ? "me" : ""}">
      <span class="mm-pav" style="background:${p.color}">${esc(initials(p.name))}</span>
      <div class="mm-pinfo">
        <div class="mm-pname">${esc(p.name)}${done ? ` <b class="mm-done">✓ ${fmtTime(p.finishMs)}</b>` : ""}</div>
        <div class="mm-pbar"><span style="width:${pct}%;background:${teamColor(p.team)}"></span></div>
      </div>
      <span class="mm-ppairs">${p.matchedPairs}/${pairs}</span>
    </div>`;
}

function renderPlaying() {
  const me = myPlayer();
  const pairs = state.grid.pairs;
  const cols = state.grid.cols;
  const rows = state.grid.rows;
  const total = cols * rows;

  // Opponents / teammates progress, grouped by team.
  const teamsProgress = state.teams
    .map((tm) => {
      const members = state.players.filter((p) => p.team === tm.index);
      if (!members.length) return "";
      return `
        <div class="mm-teamblock" style="--tc:${tm.color}">
          <div class="mm-teamhdr">${esc(teamName(tm.index))} · ${tm.wins} 🏆</div>
          ${members.map((p) => progressBar(p, pairs)).join("")}
        </div>`;
    })
    .join("");

  let boardHTML;
  if (me?.finished) {
    boardHTML = `<div class="mm-finished">
      <div class="mm-fin-emoji">🎉</div>
      <div class="mm-fin-title">${t("finished")}</div>
      <div class="mm-fin-time">${t("your_time")}: <b>${fmtTime(me.finishMs)}</b></div>
      <div class="mm-muted">${t("waiting_team")}</div>
    </div>`;
  } else {
    const cells = [];
    for (let i = 0; i < total; i++) {
      const emoji = board.shown.get(i);
      const matched = board.matched.has(i);
      const up = emoji !== undefined && !matched;
      const cls = matched ? "matched" : up ? "up" : board.pending.has(i) ? "pending" : "down";
      cells.push(`<button class="mm-cell ${cls}" data-cell="${i}" ${matched ? "disabled" : ""}>
        <span class="mm-face">${emoji ? esc(emoji) : ""}</span>
        <span class="mm-back">?</span>
      </button>`);
    }
    boardHTML = `<div class="mm-board" style="grid-template-columns:repeat(${cols},1fr)" data-cols="${cols}">${cells.join("")}</div>`;
  }

  $app.innerHTML = shell(`
    <div class="mm-play">
      <div class="mm-hud">
        <div class="mm-hud-item"><span class="mm-hud-k">${t("round")}</span><span class="mm-hud-v">${state.round + 1}/${state.totalRounds}</span></div>
        <div class="mm-hud-item"><span class="mm-hud-k">${cols}×${rows}</span><span class="mm-hud-v">${pairs} ${t("pairs")}</span></div>
        <div class="mm-hud-item"><span class="mm-hud-k">${t("time")}</span><span class="mm-hud-v" id="mm-timer">${liveTime()}</span></div>
        <div class="mm-hud-item"><span class="mm-hud-k">${t("moves")}</span><span class="mm-hud-v">${me?.moves ?? 0}</span></div>
      </div>
      ${boardHTML}
      <div class="mm-progress">
        <h3 class="mm-h3">${t("scoreboard")}</h3>
        ${teamsProgress}
      </div>
      ${isHost() ? `<button class="mm-link danger" data-act="end">${t("end_game")}</button>` : ""}
    </div>
  `);
}

function renderRoundOver() {
  const r = state.lastRoundResult;
  const winTeam = state.roundWinnerTeam;
  const host = isHost();
  const last = state.round >= state.maxGridIndex;

  const rows = (r?.standings || [])
    .slice()
    .sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return (a.finishMs ?? Infinity) - (b.finishMs ?? Infinity);
    })
    .map((s) => `
      <div class="mm-prow">
        <span class="mm-pav" style="background:${s.color}">${esc(initials(s.name))}</span>
        <div class="mm-pinfo">
          <div class="mm-pname">${esc(s.name)} <span class="mm-teamtag" style="color:${teamColor(s.team)}">${esc(teamName(s.team))}</span></div>
        </div>
        <span class="mm-ppairs">${s.finished ? fmtTime(s.finishMs) : t("dnf")}</span>
      </div>`)
    .join("");

  $app.innerHTML = shell(`
    <div class="mm-wrap-narrow">
      <div class="mm-card mm-center" style="--tc:${teamColor(winTeam)}">
        <div class="mm-trophy">🏆</div>
        <div class="mm-winline"><b style="color:${teamColor(winTeam)}">${esc(teamName(winTeam))}</b> ${t("round_won")}</div>
        <div class="mm-muted">${r ? `${r.cols}×${r.rows}` : ""} · ${fmtTime(r?.winnerTime)}</div>
      </div>
      ${teamWinsCard()}
      <div class="mm-card">
        <h3 class="mm-h3">${t("time")}</h3>
        ${rows}
      </div>
      ${host
        ? `<button class="mm-btn primary full" data-act="next">${last ? t("see_final") : t("next_round")}</button>`
        : `<div class="mm-card mm-center mm-muted">${t("waiting_host")}</div>`}
    </div>
  `);
}

function teamWinsCard() {
  const teams = state.teams.slice().sort((a, b) => b.wins - a.wins);
  return `
    <div class="mm-card">
      <h3 class="mm-h3">${t("team_wins")}</h3>
      <div class="mm-winsgrid">
        ${teams.map((tm) => `
          <div class="mm-wincell" style="--tc:${tm.color}">
            <span class="mm-swatch"></span>
            <span class="mm-winname">${esc(teamName(tm.index))}</span>
            <span class="mm-wincount">${tm.wins}</span>
          </div>`).join("")}
      </div>
    </div>`;
}

function renderFinished() {
  const w = state.overallWinnerTeam;
  const teams = state.teams.slice().sort((a, b) => b.wins - a.wins);
  const host = isHost();
  $app.innerHTML = shell(`
    <div class="mm-wrap-narrow">
      <div class="mm-card mm-center mm-champ" style="--tc:${teamColor(w)}">
        <div class="mm-trophy big">🏆</div>
        <div class="mm-champ-label">${t("champion")}</div>
        <div class="mm-champ-team" style="color:${teamColor(w)}">${w != null ? esc(teamName(w)) : "—"}</div>
      </div>
      <div class="mm-card">
        <h3 class="mm-h3">${t("final")}</h3>
        <div class="mm-final-list">
          ${teams.map((tm, i) => `
            <div class="mm-finalrow">
              <span class="mm-rank">${i + 1}</span>
              <span class="mm-swatch" style="background:${tm.color}"></span>
              <span class="mm-winname">${esc(teamName(tm.index))}</span>
              <span class="mm-wincount">${tm.wins} <small>${t("rounds_won")}</small></span>
            </div>`).join("")}
        </div>
      </div>
      ${host ? `<button class="mm-btn primary full" data-act="again">${t("play_again")}</button>` : `<div class="mm-card mm-center mm-muted">${t("waiting_host")}</div>`}
      <button class="mm-link" data-act="leave">${t("go_home")}</button>
    </div>
  `);
}

/* ---------------- events (delegated) ---------------- */
$app.addEventListener("input", (e) => {
  if (e.target.id === "mm-name") drafts.name = e.target.value;
  if (e.target.id === "mm-code") drafts.joinCode = e.target.value;
});
$app.addEventListener("change", (e) => {
  const set = e.target.dataset.set;
  if (set) {
    const val = Number(e.target.value);
    socket.emit("mem_settings", { [set]: val });
  }
});
$app.addEventListener("click", (e) => {
  const langBtn = e.target.closest("[data-lang]");
  if (langBtn) return setLang(langBtn.dataset.lang);

  const dot = e.target.closest("[data-color]");
  if (dot) { drafts.color = dot.dataset.color; return render(); }

  const cell = e.target.closest("[data-cell]");
  if (cell) return flipCard(Number(cell.dataset.cell));

  const team = e.target.closest("[data-team]");
  if (team) return socket.emit("mem_join_team", { team: Number(team.dataset.team) });

  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  switch (act) {
    case "go-create": pre = "create"; return renderPre();
    case "go-join": pre = "join"; return renderPre();
    case "landing": pre = "landing"; return renderPre();
    case "create": return createRoom();
    case "join": return joinRoom();
    case "start": return socket.emit("mem_start");
    case "next": return socket.emit("mem_next");
    case "end": return socket.emit("mem_end");
    case "again": return socket.emit("mem_again");
    case "leave":
      socket.emit("mem_leave");
      clearSession();
      state = null;
      pre = "landing";
      stopTick();
      return render();
  }
});

render();
