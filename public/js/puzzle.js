// public/js/puzzle.js
// PICTURE PUZZLE client. Drag pieces on a board to rebuild a sliced image.
//   • Solo  — fully local (pick an image + difficulty, beat your best time).
//   • Multiplayer — free-for-all race on the /puzzle namespace: everyone gets
//     the SAME scramble on their own board; first to finish wins coins + XP.
//   • Custom image — upload a photo or take a selfie; the server runs it through
//     the Gemini image model (falls back to the raw photo when no key).

import { sfx, confettiBurst, flagSVG } from "./effects.js";

const socket = io("/puzzle", { reconnection: true });
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
  document.documentElement.lang = code;
  document.documentElement.dir = LANGS.find((l) => l.code === code).dir;
  render();
}

const T = {
  en: {
    brand: "PICTURE PUZZLE",
    tagline: "Drag the pieces to rebuild the picture. Play solo or race your friends.",
    solo: "Solo", multiplayer: "Multiplayer", back: "Back",
    pick_image: "Pick a picture", difficulty: "Difficulty",
    easy: "Easy", medium: "Medium", hard: "Hard", pieces: "pieces",
    start: "Start puzzle", custom: "Your photo", your_photo: "Your photo",
    upload: "Upload photo", selfie: "Take selfie", capture: "Capture",
    make_puzzle: "Make puzzle ✨", generating: "Making your puzzle…",
    ai_done: "AI puzzle ready!", ai_fallback: "Used your photo (no AI key set).",
    ai_failed: "AI was busy — used your photo.", retake: "Retake",
    time: "Time", moves: "Moves", progress: "Progress", peek: "Peek", hide: "Hide",
    solved: "Solved!", your_time: "Your time", best: "Best", new_best: "New best! 🎉",
    play_again: "Play again", change: "Change puzzle",
    create: "Create room", join: "Join room", your_name: "Your name",
    pick_color: "Pick a color", room_code: "Room code",
    create_go: "Create", join_go: "Join", lobby: "Lobby",
    share_hint: "Share this code so friends can join:",
    host_setup: "Host picks the picture & difficulty", players: "Players",
    start_game: "Start race", waiting_host: "Waiting for the host to start…",
    need_players: "Need at least 2 players.",
    race: "Race", first_wins: "First to finish wins!", finished: "Finished",
    winner: "Winner", you_win: "You win! 🏆", end_game: "End race",
    your_reward: "You earned", coins: "coins", xp: "XP",
    login_to_play: "Log in on the home page to race others & earn coins.",
    go_home: "Home", reconnecting: "Reconnecting…",
    cam_denied: "Camera not available — try Upload photo instead.",
    err_login: "Log in on the home page first.",
    err_started: "That race already started.", err_no_code: "No room with that code.",
    err_need_players: "Need at least 2 players.", err_host_only: "Only the host can do that.",
    err_generic: "Something glitched — try again.",
  },
  fr: {
    brand: "PUZZLE PHOTO",
    tagline: "Glisse les pièces pour reconstruire l'image. Joue en solo ou défie tes amis.",
    solo: "Solo", multiplayer: "Multijoueur", back: "Retour",
    pick_image: "Choisis une image", difficulty: "Difficulté",
    easy: "Facile", medium: "Moyen", hard: "Difficile", pieces: "pièces",
    start: "Commencer", custom: "Ta photo", your_photo: "Ta photo",
    upload: "Importer une photo", selfie: "Selfie", capture: "Capturer",
    make_puzzle: "Créer le puzzle ✨", generating: "Création de ton puzzle…",
    ai_done: "Puzzle IA prêt !", ai_fallback: "Photo utilisée (pas de clé IA).",
    ai_failed: "IA occupée — photo utilisée.", retake: "Reprendre",
    time: "Temps", moves: "Coups", progress: "Progression", peek: "Voir", hide: "Cacher",
    solved: "Résolu !", your_time: "Ton temps", best: "Record", new_best: "Nouveau record ! 🎉",
    play_again: "Rejouer", change: "Changer",
    create: "Créer un salon", join: "Rejoindre", your_name: "Ton nom",
    pick_color: "Choisis une couleur", room_code: "Code du salon",
    create_go: "Créer", join_go: "Rejoindre", lobby: "Salon",
    share_hint: "Partage ce code pour que tes amis rejoignent :",
    host_setup: "L'hôte choisit l'image et la difficulté", players: "Joueurs",
    start_game: "Lancer la course", waiting_host: "En attente de l'hôte…",
    need_players: "Il faut au moins 2 joueurs.",
    race: "Course", first_wins: "Le premier à finir gagne !", finished: "Terminé",
    winner: "Gagnant", you_win: "Tu gagnes ! 🏆", end_game: "Arrêter",
    your_reward: "Tu as gagné", coins: "pièces", xp: "XP",
    login_to_play: "Connecte-toi sur l'accueil pour défier les autres et gagner des pièces.",
    go_home: "Accueil", reconnecting: "Reconnexion…",
    cam_denied: "Caméra indisponible — essaie Importer une photo.",
    err_login: "Connecte-toi d'abord sur l'accueil.",
    err_started: "La course a déjà commencé.", err_no_code: "Aucun salon avec ce code.",
    err_need_players: "Il faut au moins 2 joueurs.", err_host_only: "Seul l'hôte peut faire ça.",
    err_generic: "Un bug — réessaie.",
  },
  ar: {
    brand: "أحجية الصور",
    tagline: "اسحب القطع لإعادة تركيب الصورة. العب منفردًا أو تسابق أصدقاءك.",
    solo: "منفرد", multiplayer: "متعدد اللاعبين", back: "رجوع",
    pick_image: "اختر صورة", difficulty: "الصعوبة",
    easy: "سهل", medium: "متوسط", hard: "صعب", pieces: "قطعة",
    start: "ابدأ", custom: "صورتك", your_photo: "صورتك",
    upload: "رفع صورة", selfie: "التقط سيلفي", capture: "التقاط",
    make_puzzle: "اصنع الأحجية ✨", generating: "جارٍ إنشاء أحجيتك…",
    ai_done: "أحجية الذكاء جاهزة!", ai_fallback: "استُخدمت صورتك (لا مفتاح ذكاء).",
    ai_failed: "الذكاء مشغول — استُخدمت صورتك.", retake: "إعادة",
    time: "الوقت", moves: "الحركات", progress: "التقدّم", peek: "معاينة", hide: "إخفاء",
    solved: "تم الحل!", your_time: "وقتك", best: "الأفضل", new_best: "رقم قياسي جديد! 🎉",
    play_again: "العب مجددًا", change: "تغيير",
    create: "إنشاء غرفة", join: "انضمام", your_name: "اسمك",
    pick_color: "اختر لونًا", room_code: "رمز الغرفة",
    create_go: "إنشاء", join_go: "انضمام", lobby: "الغرفة",
    share_hint: "شارك هذا الرمز لينضم أصدقاؤك:",
    host_setup: "المضيف يختار الصورة والصعوبة", players: "اللاعبون",
    start_game: "ابدأ السباق", waiting_host: "بانتظار أن يبدأ المضيف…",
    need_players: "تحتاج لاعبَين على الأقل.",
    race: "سباق", first_wins: "أول من ينهي يفوز!", finished: "انتهى",
    winner: "الفائز", you_win: "لقد فزت! 🏆", end_game: "إنهاء",
    your_reward: "لقد ربحت", coins: "عملة", xp: "خبرة",
    login_to_play: "سجّل الدخول من الصفحة الرئيسية لتتسابق وتربح العملات.",
    go_home: "الرئيسية", reconnecting: "إعادة الاتصال…",
    cam_denied: "الكاميرا غير متاحة — جرّب رفع صورة.",
    err_login: "سجّل الدخول من الصفحة الرئيسية أولًا.",
    err_started: "بدأ السباق بالفعل.", err_no_code: "لا توجد غرفة بهذا الرمز.",
    err_need_players: "تحتاج لاعبَين على الأقل.", err_host_only: "المضيف فقط يمكنه ذلك.",
    err_generic: "حدث خلل — حاول مجددًا.",
  },
};
const t = (k) => (T[lang] || T.en)[k] || T.en[k] || k;
const ERR_MAP = {
  pz_err_login: "err_login", pz_err_started: "err_started", pz_err_no_code: "err_no_code",
  pz_err_need_players: "err_need_players", pz_err_host_only: "err_host_only",
};
const tErr = (k) => t(ERR_MAP[k] || "err_generic");

const PZ_DIFF = {
  easy: { cols: 3, rows: 4 },
  medium: { cols: 4, rows: 6 },
  hard: { cols: 6, rows: 8 },
};

/* ---------------- session / account ---------------- */
function loadSession() { try { return JSON.parse(localStorage.getItem("puzzle.session") || "null"); } catch { return null; } }
function saveSession(s) { session = s; localStorage.setItem("puzzle.session", JSON.stringify(s)); }
function clearSession() { session = null; localStorage.removeItem("puzzle.session"); }
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
      bootRender();
    })
    .catch(() => {});
}
// Display name for the pre-game forms: always the signed-in profile name.
function myName() { return (account && account.name) || drafts.name || ""; }

/* ---------------- state ---------------- */
let config = { colors: [], serverUrl: "", images: [] };
let session = loadSession();
let mpState = null; // pz_state (multiplayer)
let mode = null; // 'solo' | 'mp'
let pre = "landing"; // landing | solo-setup | mp-menu | mp-create | mp-join
let hadFirstConnect = false;
let drafts = { name: "", color: "", joinCode: "" };

// Shared puzzle/board context.
let chosen = null; // { url, id, w, h, custom, ai }
let difficulty = "easy";
let board = null; // { arr, cols, rows, count, imgW, imgH, solved, moves }
let selectedSlot = null;
let peek = false;
let startLocal = 0;
let tickHandle = null;
let mpBoardInit = false;

// custom-image builder modal state
let customUI = null; // { open, stage:'choose'|'preview'|'busy', dataUrl, note }
let camStream = null;

/* ---------------- helpers ---------------- */
function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function myId() { return session?.playerId || null; }
function myMpPlayer() { return mpState?.players.find((p) => p.id === myId()) || null; }
function isHost() { return mpState && myId() === mpState.hostId; }
function initials(n) { return (n || "?").trim().charAt(0).toUpperCase() || "?"; }
function fmtTime(ms) {
  if (ms == null) return "—";
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
function bestKey(url, diff) { return `puzzle.best.${diff}.${url}`; }

/* ---------------- socket ---------------- */
socket.on("connect", () => {
  const firstLoad = !hadFirstConnect;
  hadFirstConnect = true;
  if (session?.code && session?.playerId) {
    socket.emit("pz_join", { code: session.code, playerId: session.playerId, token: accountToken() }, (res) => {
      if (!res?.ok) { clearSession(); return; }
      if (firstLoad && res.state?.status !== "playing") {
        socket.emit("pz_leave"); clearSession(); return;
      }
      mode = "mp";
      if (res.board) { mpBoardInit = false; }
      applyMpState(res.state, res.board);
    });
  }
});
socket.on("pz_config", (c) => {
  config = c;
  if (!drafts.color) drafts.color = (config.colors || [])[0] || "";
  if (!chosen && config.images?.length) preselectFirst();
  render();
});
socket.on("pz_state", (s) => applyMpState(s));
socket.on("pz_gameover", ({ winnerId }) => {
  confettiBurst(); sfx.win();
  if (winnerId === myId()) confettiBurst();
});
socket.on("pz_reward", ({ coins, xp, won }) => {
  toast(`${won ? "🏆 " : ""}${t("your_reward")} +${coins} 🪙 · +${xp} ${t("xp")}`, "ok");
});
socket.on("pz_notice", ({ type, message }) => toast(tErr(message), type === "error" ? "error" : "ok"));
socket.on("disconnect", () => { if (mode === "mp") toast(t("reconnecting"), "error"); });

function preselectFirst() {
  const first = config.images[0];
  if (first) chosen = { url: first.url, id: first.id, custom: false };
}

/* ---------------- multiplayer state ---------------- */
function applyMpState(next, boardData) {
  const wasPlaying = mpState?.status === "playing";
  mpState = next;
  mode = "mp";
  if (next.status === "playing") {
    if (!mpBoardInit) {
      const arr = boardData?.arrangement || next.scramble || [];
      board = {
        arr: arr.slice(),
        cols: next.grid.cols, rows: next.grid.rows, count: next.grid.count,
        imgW: 0, imgH: 0, solved: !!boardData?.solved, moves: boardData?.moves || 0,
      };
      chosen = { url: next.imageUrl, custom: next.imageUrl?.includes("/api/puzzle/") };
      mpBoardInit = true;
      startLocal = Date.now();
      loadImageDims(next.imageUrl).then(() => render());
      startTick();
    }
  } else {
    stopTick();
    if (next.status === "lobby") mpBoardInit = false;
  }
  render();
}

/* ---------------- timer ---------------- */
function startTick() {
  stopTick();
  tickHandle = setInterval(() => {
    const el = document.getElementById("pz-timer");
    if (el) el.textContent = liveTime();
  }, 250);
}
function stopTick() { if (tickHandle) { clearInterval(tickHandle); tickHandle = null; } }
function liveTime() {
  if (mode === "mp") {
    const me = myMpPlayer();
    if (me?.solved && me.solveMs != null) return fmtTime(me.solveMs);
  } else if (board?.solved && board.solveMs != null) {
    return fmtTime(board.solveMs);
  }
  return fmtTime(Date.now() - startLocal);
}

/* ---------------- image helpers ---------------- */
function loadImageDims(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { if (board) { board.imgW = img.naturalWidth; board.imgH = img.naturalHeight; } resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => resolve({ w: 3, h: 4 });
    img.src = url;
  });
}
// Downscale a data URL so uploads stay small.
function downscale(dataUrl, max = 1024) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/* ---------------- board rendering ---------------- */
function scrambled(count) {
  let a;
  do { a = [...Array(count).keys()]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
  while (count > 1 && a.every((v, i) => v === i));
  return a;
}
function pieceStyle(pieceId, cols, rows, url) {
  const col = pieceId % cols, row = Math.floor(pieceId / cols);
  const px = cols > 1 ? (col / (cols - 1)) * 100 : 0;
  const py = rows > 1 ? (row / (rows - 1)) * 100 : 0;
  return `background-image:url('${url}');background-size:${cols * 100}% ${rows * 100}%;background-position:${px}% ${py}%`;
}
function boardHTML() {
  if (!board) return "";
  const { arr, cols, rows, imgW, imgH } = board;
  const ar = imgW && imgH ? `${imgW}/${imgH}` : `${cols}/${rows}`;
  const url = chosen?.url || "";
  const cells = arr.map((pieceId, slot) => {
    const correct = pieceId === slot;
    const sel = selectedSlot === slot ? "sel" : "";
    return `<div class="pz-piece ${correct ? "ok" : ""} ${sel}" data-slot="${slot}" style="${pieceStyle(pieceId, cols, rows, url)}"></div>`;
  }).join("");
  return `<div class="pz-board" id="pz-board" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);aspect-ratio:${ar}">${cells}</div>`;
}
function correctCount() { return board ? board.arr.reduce((n, v, i) => n + (v === i ? 1 : 0), 0) : 0; }

function doSwap(a, b) {
  if (!board || board.solved || a === b) return;
  [board.arr[a], board.arr[b]] = [board.arr[b], board.arr[a]];
  board.moves += 1;
  if (mode === "mp") socket.emit("pz_swap", { a, b });
  const solved = board.arr.every((v, i) => v === i);
  if (solved) {
    board.solved = true;
    board.solveMs = Date.now() - startLocal;
    sfx.point();
    if (mode === "solo") onSoloSolved();
  } else {
    sfx.click();
  }
  render();
}

function onSoloSolved() {
  stopTick();
  confettiBurst(); sfx.win();
  const key = bestKey(chosen.url, difficulty);
  const prev = Number(localStorage.getItem(key) || 0);
  board.newBest = !prev || board.solveMs < prev;
  if (board.newBest) localStorage.setItem(key, String(board.solveMs));
  board.prevBest = prev;
  recordSoloWin();
}

// Tell the server a solo puzzle was completed so it credits solo XP/coins and
// the solo leaderboard. Silent no-op for guests (no account token).
function recordSoloWin() {
  const token = accountToken();
  if (!token) return;
  fetch("/api/solo/record", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ game: "puzzle", difficulty }),
  }).catch(() => {});
}

/* ---------------- drag + tap input ---------------- */
let press = null; // { slot, x, y, dragging, ghost }
function pieceUnder(x, y) {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest(".pz-piece") : null;
}
function onPointerDown(e) {
  const piece = e.target.closest?.(".pz-piece");
  if (!piece || !board || board.solved) return;
  const slot = Number(piece.dataset.slot);
  press = { slot, x: e.clientX, y: e.clientY, dragging: false, ghost: null, el: piece };
  piece.setPointerCapture?.(e.pointerId);
}
function onPointerMove(e) {
  if (!press) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y;
  if (!press.dragging && Math.hypot(dx, dy) > 6) {
    press.dragging = true;
    press.el.classList.add("dragging");
    const g = document.createElement("div");
    g.className = "pz-ghost";
    const r = press.el.getBoundingClientRect();
    g.style.width = r.width + "px"; g.style.height = r.height + "px";
    g.style.cssText += press.el.getAttribute("style");
    g.style.position = "fixed"; g.style.pointerEvents = "none"; g.style.zIndex = "9999";
    g.style.opacity = "0.9"; g.style.borderRadius = "8px";
    document.body.appendChild(g);
    press.ghost = g;
  }
  if (press.dragging && press.ghost) {
    press.ghost.style.left = e.clientX - press.ghost.offsetWidth / 2 + "px";
    press.ghost.style.top = e.clientY - press.ghost.offsetHeight / 2 + "px";
    document.querySelectorAll(".pz-piece.drop").forEach((n) => n.classList.remove("drop"));
    const over = pieceUnder(e.clientX, e.clientY);
    if (over && Number(over.dataset.slot) !== press.slot) over.classList.add("drop");
  }
}
function onPointerUp(e) {
  if (!press) return;
  const wasDragging = press.dragging;
  if (press.ghost) press.ghost.remove();
  press.el.classList.remove("dragging");
  document.querySelectorAll(".pz-piece.drop").forEach((n) => n.classList.remove("drop"));

  if (wasDragging) {
    const over = pieceUnder(e.clientX, e.clientY);
    if (over) { const target = Number(over.dataset.slot); if (target !== press.slot) doSwap(press.slot, target); }
    selectedSlot = null;
  } else {
    // tap-to-select / tap-to-swap
    if (selectedSlot === null) { selectedSlot = press.slot; render(); }
    else if (selectedSlot === press.slot) { selectedSlot = null; render(); }
    else { const a = selectedSlot; selectedSlot = null; doSwap(a, press.slot); }
  }
  press = null;
}

/* ---------------- solo actions ---------------- */
function startSolo() {
  if (!chosen?.url) return;
  const d = PZ_DIFF[difficulty];
  const count = d.cols * d.rows;
  board = { arr: scrambled(count), cols: d.cols, rows: d.rows, count, imgW: 0, imgH: 0, solved: false, moves: 0 };
  selectedSlot = null; peek = false;
  mode = "solo"; pre = "solo-play";
  startLocal = Date.now();
  startTick();
  loadImageDims(chosen.url).then(() => render());
  render();
}

/* ---------------- multiplayer actions ---------------- */
function createRoom() {
  if (!accountToken()) return toast(t("err_login"), "error");
  const name = (myName() || "").trim();
  if (!name) return toast(t("your_name"), "error");
  socket.emit("pz_create", { name, color: drafts.color, token: accountToken() }, (res) => {
    if (!res?.ok) return toast(tErr(res?.error), "error");
    saveSession({ code: res.code, playerId: res.playerId });
    mpBoardInit = false;
    applyMpState(res.state);
  });
}
function joinRoom() {
  const name = (myName() || "").trim();
  const code = (drafts.joinCode || "").trim().toUpperCase();
  if (!name) return toast(t("your_name"), "error");
  if (!code) return toast(t("room_code"), "error");
  socket.emit("pz_join", { code, name, color: drafts.color, token: accountToken() }, (res) => {
    if (!res?.ok) return toast(tErr(res?.error), "error");
    saveSession({ code: res.code, playerId: res.playerId });
    mpBoardInit = false;
    applyMpState(res.state, res.board);
  });
}
function leaveMp() {
  socket.emit("pz_leave"); clearSession(); mpState = null; board = null; mode = null; pre = "landing"; stopTick(); render();
}

/* ---------------- custom image (upload / selfie / Gemini) ---------------- */
function openCustom() { customUI = { open: true, stage: "choose", dataUrl: null, note: null }; render(); }
function closeCustom() { stopCam(); customUI = null; render(); }
function stopCam() { if (camStream) { camStream.getTracks().forEach((tr) => tr.stop()); camStream = null; } }

async function startSelfie() {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    customUI.stage = "camera"; render();
    setTimeout(() => { const v = document.getElementById("pz-cam"); if (v) { v.srcObject = camStream; v.play?.(); } }, 40);
  } catch { toast(t("cam_denied"), "error"); }
}
function captureSelfie() {
  const v = document.getElementById("pz-cam");
  if (!v) return;
  const c = document.createElement("canvas");
  c.width = v.videoWidth || 720; c.height = v.videoHeight || 960;
  c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  stopCam();
  customUI.dataUrl = c.toDataURL("image/jpeg", 0.9);
  customUI.stage = "preview"; render();
}
function onFilePicked(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = async () => { customUI.dataUrl = await downscale(r.result, 1200); customUI.stage = "preview"; render(); };
  r.readAsDataURL(file);
}
async function makePuzzleFromCustom() {
  if (!customUI?.dataUrl) return;
  customUI.stage = "busy"; render();
  try {
    const small = await downscale(customUI.dataUrl, 1024);
    const res = await fetch("/api/puzzle/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: small }),
    });
    const j = await res.json();
    if (!j?.ok) throw new Error(j?.error || "failed");
    chosen = { url: j.url, id: j.id, custom: true, ai: j.ai };
    const msg = j.ai ? t("ai_done") : j.note === "no_key" ? t("ai_fallback") : t("ai_failed");
    toast(msg, "ok");
    // In a multiplayer lobby the host must push the image to everyone.
    if (mode === "mp" && isHost()) socket.emit("pz_settings", { imageId: j.id });
    closeCustom();
  } catch {
    customUI.stage = "preview";
    toast(t("err_generic"), "error");
    render();
  }
}

/* ---------------- render ---------------- */
function langBar() {
  return `<div class="langbar">${LANGS.map((l) => `<button class="langpill flagpill ${lang === l.code ? "on" : ""}" data-lang="${l.code}" aria-label="${l.code}">${flagSVG(l.code)}</button>`).join("")}</div>`;
}
function shell(inner) {
  return `<div class="pz-top"><span class="pz-logo">🧩 ${t("brand")}</span>${langBar()}</div><div class="pz-wrap">${inner}</div>${customUI?.open ? customModal() : ""}`;
}
function colorDots(sel) {
  return `<div class="pz-colors">${(config.colors || []).map((c) => `<button class="pz-dot ${c === sel ? "on" : ""}" data-color="${c}" style="background:${c}"></button>`).join("")}</div>`;
}
function diffChips() {
  return `<div class="pz-diffs">${["easy", "medium", "hard"].map((d) => {
    const g = PZ_DIFF[d];
    return `<button class="pz-diff ${difficulty === d ? "on" : ""}" data-diff="${d}"><b>${t(d)}</b><span>${g.cols * g.rows} ${t("pieces")}</span></button>`;
  }).join("")}</div>`;
}
function imagePicker() {
  const tiles = (config.images || []).map((im) => `<button class="pz-thumb ${chosen?.url === im.url ? "on" : ""}" data-img="${esc(im.url)}" data-id="${esc(im.id)}" style="background-image:url('${im.url}')"></button>`).join("");
  const customTile = `<button class="pz-thumb custom ${chosen?.custom ? "on" : ""}" data-act="open-custom">${chosen?.custom ? `<span style="background-image:url('${esc(chosen.url)}')" class="pz-thumb-img"></span>` : `<span class="pz-plus">＋</span><span class="pz-plus-t">${t("your_photo")}</span>`}</button>`;
  return `<div class="pz-thumbs">${customTile}${tiles}</div>`;
}

function render() {
  if (mode === "mp" && mpState) {
    if (mpState.status === "lobby") return renderLobby();
    if (mpState.status === "playing") return renderMpPlay();
    if (mpState.status === "finished") return renderMpFinished();
  }
  if (pre === "solo-play") return renderSoloPlay();
  if (pre === "solo-setup") return renderSoloSetup();
  if (pre === "mp-menu") return renderMpMenu();
  if (pre === "mp-create" || pre === "mp-join") return renderMpForm();
  return renderLanding();
}

function renderLanding() {
  // Full-screen puzzle.png wallpaper. The Solo / Multiplayer buttons and flags
  // are painted into the image; transparent %-positioned hit-areas (shared .hit
  // classes, puzzle positions under .pz-fs) sit over them.
  $app.innerHTML = `<div class="pz-fs">
    <div class="pz-stage">
      <img class="pz-photo-img" src="/media/puzzle-full.png" alt="Picture Puzzle — jigsaw race" width="1400" height="778" />
      <button class="hit hit-solo" data-act="go-solo" aria-label="${esc(t("solo"))}"></button>
      <button class="hit hit-multi" data-act="go-mp" aria-label="${esc(t("multiplayer"))}"></button>
      <button class="hit hit-flag hit-en ${lang === "en" ? "on" : ""}" data-lang="en" aria-label="English"></button>
      <button class="hit hit-flag hit-fr ${lang === "fr" ? "on" : ""}" data-lang="fr" aria-label="Français"></button>
      <button class="hit hit-flag hit-ar ${lang === "ar" ? "on" : ""}" data-lang="ar" aria-label="العربية"></button>
    </div>
  </div>`;
}

function renderSoloSetup() {
  $app.innerHTML = shell(`
    <div class="pz-setup">
      <button class="pz-link" data-act="landing">‹ ${t("back")}</button>
      <div class="pz-card">
        <h3 class="pz-h3">${t("pick_image")}</h3>
        ${imagePicker()}
      </div>
      <div class="pz-card">
        <h3 class="pz-h3">${t("difficulty")}</h3>
        ${diffChips()}
      </div>
      <button class="pz-btn primary full" data-act="start-solo" ${chosen?.url ? "" : "disabled"}>${t("start")}</button>
    </div>`);
}

function renderSoloPlay() {
  const solved = board?.solved;
  $app.innerHTML = shell(`
    <div class="pz-play">
      <div class="pz-hud">
        <div class="pz-hud-item"><span class="pz-hud-k">${t("time")}</span><span class="pz-hud-v" id="pz-timer">${liveTime()}</span></div>
        <div class="pz-hud-item"><span class="pz-hud-k">${t("moves")}</span><span class="pz-hud-v">${board?.moves ?? 0}</span></div>
        <div class="pz-hud-item"><span class="pz-hud-k">${t("progress")}</span><span class="pz-hud-v">${correctCount()}/${board?.count ?? 0}</span></div>
        <button class="pz-hud-item pz-peek" data-act="peek">${t(peek ? "hide" : "peek")}</button>
      </div>
      <div class="pz-stage">
        ${boardHTML()}
        ${peek ? `<img class="pz-peekimg" src="${esc(chosen.url)}" alt="" />` : ""}
      </div>
      ${solved ? soloWin() : ""}
      <div class="pz-actions">
        <button class="pz-link" data-act="solo-setup">‹ ${t("change")}</button>
      </div>
    </div>`);
}

function soloWin() {
  return `<div class="pz-win">
    <div class="pz-win-emoji">🎉</div>
    <div class="pz-win-title">${t("solved")}</div>
    <div class="pz-win-stats">${t("your_time")}: <b>${fmtTime(board.solveMs)}</b> · ${board.moves} ${t("moves")}</div>
    ${board.newBest ? `<div class="pz-newbest">${t("new_best")}</div>` : board.prevBest ? `<div class="pz-muted">${t("best")}: ${fmtTime(board.prevBest)}</div>` : ""}
    <button class="pz-btn primary" data-act="start-solo">${t("play_again")}</button>
  </div>`;
}

function renderMpForm() {
  const isCreate = pre === "mp-create";
  $app.innerHTML = shell(`
    <div class="pz-card pz-form">
      <button class="pz-link" data-act="go-mp">‹ ${t("back")}</button>
      <h2 class="pz-h2">${isCreate ? t("create") : t("join")}</h2>
      <label class="pz-label">${t("your_name")}</label>
      <div class="pz-input pz-name-chip">${esc(myName())}</div>
      ${isCreate ? "" : `<label class="pz-label">${t("room_code")}</label><input class="pz-input" id="pz-code" maxlength="12" value="${esc(drafts.joinCode)}" placeholder="PZL-ABCD" style="text-transform:uppercase" />`}
      <label class="pz-label">${t("pick_color")}</label>
      ${colorDots(drafts.color)}
      <button class="pz-btn primary" data-act="${isCreate ? "create" : "join"}">${isCreate ? t("create_go") : t("join_go")}</button>
    </div>`);
}

function renderMpMenu() {
  $app.innerHTML = shell(`
    <div class="pz-setup">
      <button class="pz-link" data-act="landing">‹ ${t("back")}</button>
      <div class="pz-cta-col">
        <button class="pz-btn primary" data-act="go-create">${t("create")}</button>
        <button class="pz-btn ghost" data-act="go-join">${t("join")}</button>
      </div>
    </div>`);
}

function renderLobby() {
  const host = isHost();
  const base = inviteBase();
  const qr = `/api/qr?text=${encodeURIComponent(base + "/puzzle")}`;
  const players = mpState.players.map((p) => `<span class="pz-chip" style="--pc:${p.color}">${esc(p.name)}${p.isHost ? " 👑" : ""}${p.id === myId() ? " ·" + t("solo").toLowerCase() : ""}</span>`).join("");
  const g = PZ_DIFF[mpState.settings.difficulty];
  $app.innerHTML = shell(`
    <div class="pz-lobby">
      <div class="pz-card">
        <div class="pz-code-row">
          <div><div class="pz-label">${t("room_code")}</div><div class="pz-code">${esc(mpState.code)}</div><div class="pz-hint">${t("share_hint")}</div></div>
          <img class="pz-qr" src="${qr}" alt="QR" onerror="this.style.display='none'" />
        </div>
      </div>
      <div class="pz-card">
        <h3 class="pz-h3">${t("players")} (${mpState.players.length})</h3>
        <div class="pz-chips">${players}</div>
      </div>
      ${host ? `
      <div class="pz-card">
        <h3 class="pz-h3">${t("pick_image")}</h3>
        ${imagePicker()}
        <h3 class="pz-h3" style="margin-top:14px">${t("difficulty")}</h3>
        ${diffChips()}
        <button class="pz-btn primary full" data-act="mp-start">${t("start_game")}</button>
      </div>` : `
      <div class="pz-card pz-center">
        <div class="pz-preview" style="background-image:url('${esc(mpState.imageUrl || "")}')"></div>
        <div class="pz-muted" style="margin-top:8px">${t(mpState.settings.difficulty)} · ${g.cols * g.rows} ${t("pieces")}</div>
        <div class="pz-muted">${t("waiting_host")}</div>
      </div>`}
      <button class="pz-link danger" data-act="leave">${t("go_home")} ✕</button>
    </div>`);
}

function renderMpPlay() {
  const me = myMpPlayer();
  const others = mpState.players.filter((p) => p.id !== myId());
  const bars = mpState.players.map((p) => {
    const pct = p.total ? Math.round((p.correct / p.total) * 100) : 0;
    return `<div class="pz-prow ${p.id === myId() ? "me" : ""}">
      <span class="pz-pav" style="background:${p.color}">${esc(initials(p.name))}</span>
      <div class="pz-pinfo"><div class="pz-pname">${esc(p.name)}${p.solved ? ` <b class="pz-done">✓ ${fmtTime(p.solveMs)}</b>` : ""}</div>
      <div class="pz-pbar"><span style="width:${pct}%;background:${p.color}"></span></div></div>
      <span class="pz-ppairs">${p.correct}/${p.total}</span></div>`;
  }).join("");
  $app.innerHTML = shell(`
    <div class="pz-play">
      <div class="pz-hud">
        <div class="pz-hud-item"><span class="pz-hud-k">${t("time")}</span><span class="pz-hud-v" id="pz-timer">${liveTime()}</span></div>
        <div class="pz-hud-item"><span class="pz-hud-k">${t("moves")}</span><span class="pz-hud-v">${board?.moves ?? 0}</span></div>
        <div class="pz-hud-item"><span class="pz-hud-k">${t("progress")}</span><span class="pz-hud-v">${correctCount()}/${board?.count ?? 0}</span></div>
        <button class="pz-hud-item pz-peek" data-act="peek">${t(peek ? "hide" : "peek")}</button>
      </div>
      <div class="pz-stage">
        ${boardHTML()}
        ${peek ? `<img class="pz-peekimg" src="${esc(chosen?.url || "")}" alt="" />` : ""}
        ${me?.solved ? `<div class="pz-solvedbadge">✓ ${t("solved")}</div>` : ""}
      </div>
      <div class="pz-progress"><h3 class="pz-h3">${t("race")} · <span class="pz-muted">${t("first_wins")}</span></h3>${bars}</div>
      ${isHost() ? `<button class="pz-link danger" data-act="mp-end">${t("end_game")}</button>` : ""}
    </div>`);
}

function renderMpFinished() {
  const w = mpState.players.find((p) => p.id === mpState.winnerId);
  const iWon = mpState.winnerId === myId();
  const ranked = mpState.players.slice().sort((a, b) => (b.solved - a.solved) || ((a.solveMs ?? Infinity) - (b.solveMs ?? Infinity)) || (b.correct - a.correct));
  $app.innerHTML = shell(`
    <div class="pz-wrap-narrow">
      <div class="pz-card pz-center pz-champ">
        <div class="pz-trophy">🏆</div>
        <div class="pz-champ-label">${t("winner")}</div>
        <div class="pz-champ-name" style="color:${w?.color || "var(--gold)"}">${w ? esc(w.name) : "—"}</div>
        ${iWon ? `<div class="pz-you-win">${t("you_win")}</div>` : ""}
      </div>
      <div class="pz-card">
        ${ranked.map((p, i) => `<div class="pz-prow"><span class="pz-rank">${i + 1}</span><span class="pz-pav" style="background:${p.color}">${esc(initials(p.name))}</span><div class="pz-pinfo"><div class="pz-pname">${esc(p.name)}</div></div><span class="pz-ppairs">${p.solved ? fmtTime(p.solveMs) : `${p.correct}/${p.total}`}</span></div>`).join("")}
      </div>
      ${isHost() ? `<button class="pz-btn primary full" data-act="mp-again">${t("play_again")}</button>` : `<div class="pz-card pz-center pz-muted">${t("waiting_host")}</div>`}
      <button class="pz-link" data-act="leave">${t("go_home")}</button>
    </div>`);
}

function customModal() {
  const s = customUI.stage;
  let body = "";
  if (s === "choose") {
    body = `<div class="pz-cta-col">
      <label class="pz-btn ghost file"><input type="file" accept="image/*" id="pz-file" hidden />${t("upload")}</label>
      <button class="pz-btn ghost" data-act="selfie">${t("selfie")}</button>
    </div>`;
  } else if (s === "camera") {
    body = `<video id="pz-cam" class="pz-cam" playsinline muted></video><button class="pz-btn primary full" data-act="capture">${t("capture")}</button>`;
  } else if (s === "preview") {
    body = `<img class="pz-cimg" src="${esc(customUI.dataUrl)}" alt="" />
      <div class="pz-cta-row">
        <button class="pz-btn ghost" data-act="cust-retake">${t("retake")}</button>
        <button class="pz-btn primary" data-act="make-puzzle">${t("make_puzzle")}</button>
      </div>`;
  } else if (s === "busy") {
    body = `<div class="pz-busy"><div class="pz-spinner"></div><div>${t("generating")}</div></div>`;
  }
  return `<div class="pz-modal-wrap" data-act="close-custom-bg"><div class="pz-modal"><button class="pz-modal-x" data-act="close-custom">✕</button><h3 class="pz-h3">${t("your_photo")}</h3>${body}</div></div>`;
}

/* ---------------- events ---------------- */
$app.addEventListener("input", (e) => {
  if (e.target.id === "pz-name") drafts.name = e.target.value;
  if (e.target.id === "pz-code") drafts.joinCode = e.target.value;
});
$app.addEventListener("change", (e) => {
  if (e.target.id === "pz-file") onFilePicked(e.target.files?.[0]);
});
$app.addEventListener("click", (e) => {
  const langBtn = e.target.closest("[data-lang]");
  if (langBtn) return setLang(langBtn.dataset.lang);

  const dot = e.target.closest("[data-color]");
  if (dot) { drafts.color = dot.dataset.color; return render(); }

  const diff = e.target.closest("[data-diff]");
  if (diff) {
    difficulty = diff.dataset.diff;
    if (mode === "mp" && isHost()) socket.emit("pz_settings", { difficulty });
    return render();
  }
  const thumb = e.target.closest("[data-img]");
  if (thumb) {
    chosen = { url: thumb.dataset.img, id: thumb.dataset.id, custom: false };
    if (mode === "mp" && isHost()) socket.emit("pz_settings", { imageId: thumb.dataset.id });
    return render();
  }

  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  switch (act) {
    case "go-solo": mode = "solo"; pre = "solo-setup"; return render();
    case "go-mp": mode = null; pre = "mp-menu"; return renderMpMenu();
    case "landing": mode = null; pre = "landing"; return render();
    case "go-create": pre = "mp-create"; return render();
    case "go-join": pre = "mp-join"; return render();
    case "solo-setup": pre = "solo-setup"; mode = "solo"; stopTick(); return render();
    case "start-solo": return startSolo();
    case "peek": peek = !peek; return render();
    case "create": return createRoom();
    case "join": return joinRoom();
    case "mp-start": return socket.emit("pz_start");
    case "mp-end": return socket.emit("pz_end");
    case "mp-again": mpBoardInit = false; return socket.emit("pz_next");
    case "leave": return leaveMp();
    case "open-custom": return openCustom();
    case "close-custom": return closeCustom();
    case "close-custom-bg": if (e.target.classList.contains("pz-modal-wrap")) return closeCustom(); return;
    case "selfie": return startSelfie();
    case "capture": return captureSelfie();
    case "cust-retake": customUI.stage = "choose"; customUI.dataUrl = null; return render();
    case "make-puzzle": return makePuzzleFromCustom();
  }
});

// Board drag/tap — pointer events on the whole app (delegated to pieces).
$app.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove, { passive: true });
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerUp);

// If pre is the mp menu we need to route it (menu isn't in the main switch by state).
function bootRender() {
  if (pre === "mp-menu") return renderMpMenu();
  render();
}
refreshAccount();
bootRender();
