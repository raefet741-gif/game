// public/js/draw.js
// DOODLE DUEL client. The server (/draw namespace) owns all game state; this file
// renders the lobby, the drawing canvas (with live team-sync), the AI/vote judging
// screens, and the full Pass & Guess (Telestrations) relay + book reveal.
//
// The canvas is kept as a replayable list of normalized strokes (`paths`) so any
// re-render — or a reconnect — can rebuild it pixel-for-pixel, and teammate
// strokes can be merged in live.

import { sfx, confettiBurst } from "./effects.js";

const socket = io("/draw", { reconnection: true });
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
  socket.emit("dd_settings_lang", { lang }); // best-effort; server reads on (re)join
  fullRender();
}

const T = {
  en: {
    brand: "DOODLE DUEL", tagline: "Draw it, guess it, win it. Sketch a word or pass drawings around the circle.",
    create: "Create room", join: "Join room", back: "Back",
    your_name: "Your name", pick_color: "Pick a color", room_code: "Room code",
    create_go: "Create", join_go: "Join", lobby: "Lobby",
    share_hint: "Share this code so friends can join:",
    game: "Game", game_sketch: "Sketch Match", game_relay: "Pass & Guess",
    game_sketch_d: "Everyone draws the same word. AI or a vote picks the best.",
    game_relay_d: "Draw a secret word, then pass — guess, redraw, guess around the circle.",
    mode: "Mode", mode_solo: "Solo", mode_versus: "Versus", mode_teams: "Teams",
    mode_solo_d: "Draw alone — the AI scores every round.",
    mode_versus_d: "Everyone draws their own — best drawing wins the round.",
    mode_teams_d: "Teammates share one live canvas — best team drawing wins.",
    judging: "Judge by", judge_ai: "AI 🤖", judge_vote: "Player vote 🗳️",
    judge_ai_d: "Gemini scans each drawing and scores how well it matches the word.",
    judge_vote_d: "Everyone votes for the drawing they like best.",
    relay_teams: "Team points", relay_teams_d: "Pool each team's points together.",
    rounds: "Rounds", difficulty: "Difficulty", easy: "Easy", medium: "Medium", hard: "Hard",
    draw_time: "Draw time", secs: "s",
    num_teams: "Number of teams", pick_team: "Tap a team to join it",
    teams: "Teams", players: "Players", start_game: "Start game",
    need_players: "Need at least 1 player.", need_teams: "Fill at least 2 teams.",
    need_relay: "Pass & Guess needs at least 2 players.",
    host_only: "Only the host can do that.", waiting_host: "Waiting for the host to start…",
    you: "you", host: "host",
    draw_word: "Draw", time: "Time", im_done: "I'm done", done: "Done",
    waiting_others: "Waiting for the others…", finishing: "Finishing up…",
    clear: "Clear", undo: "Undo", eraser: "Eraser",
    team_live: "Your team is drawing together — everyone's strokes appear here.",
    ai_judging: "The AI is judging the drawings…",
    vote_title: "Vote for the best drawing", vote_hint: "Which one best shows the word? (You can't vote your own.)",
    voted: "Voted!", cant_vote_own: "You can't vote for your own drawing.",
    reveal_title: "Round result", the_word_was: "The word was",
    ai_score: "AI score", ai_guess: "AI saw", votes_lbl: "votes",
    round_won: "wins the round!", you_won_round: "You won the round!", no_winner: "No winner this round.",
    next_round: "Next round", see_final: "See final result",
    end_round: "End round now", end_game: "End game",
    relay_draw_title: "Draw this secret word", relay_guess_title: "What is this drawing?",
    your_guess: "Type your guess", submit_guess: "Submit guess", submit_draw: "Submit drawing",
    relay_wait: "Sent! Waiting for the others…", turn: "Turn",
    books_title: "The books are in!", started_with: "started with",
    correct_guess: "Correct!", drew: "drew", guessed: "guessed", blank_page: "(no answer)",
    champion: "Champion!", final: "Final standings", play_again: "Play again", go_home: "Home",
    points: "pts", wins: "wins",
    you_earned: "You earned", coins: "coins", xp: "XP",
    reconnecting: "Reconnecting…",
    err_locked: "Can't change that after the game starts.",
    err_started: "That game already started.", err_no_code: "No room with that code.",
    err_own_vote: "You can't vote for your own drawing.",
    err_generic: "Something glitched — try again.",
  },
  fr: {
    brand: "DOODLE DUEL", tagline: "Dessine, devine, gagne. Croque un mot ou fais tourner les dessins.",
    create: "Créer un salon", join: "Rejoindre", back: "Retour",
    your_name: "Ton nom", pick_color: "Choisis une couleur", room_code: "Code du salon",
    create_go: "Créer", join_go: "Rejoindre", lobby: "Salon",
    share_hint: "Partage ce code pour que tes amis rejoignent :",
    game: "Jeu", game_sketch: "Dessine le mot", game_relay: "Passe & Devine",
    game_sketch_d: "Tout le monde dessine le même mot. L'IA ou un vote choisit le meilleur.",
    game_relay_d: "Dessine un mot secret, puis passe — devine, redessine, devine en cercle.",
    mode: "Mode", mode_solo: "Solo", mode_versus: "Versus", mode_teams: "Équipes",
    mode_solo_d: "Dessine seul — l'IA note chaque manche.",
    mode_versus_d: "Chacun dessine le sien — le meilleur dessin gagne la manche.",
    mode_teams_d: "Les coéquipiers partagent une toile en direct — le meilleur dessin d'équipe gagne.",
    judging: "Jugé par", judge_ai: "IA 🤖", judge_vote: "Vote 🗳️",
    judge_ai_d: "Gemini analyse chaque dessin et note sa ressemblance au mot.",
    judge_vote_d: "Chacun vote pour le dessin qu'il préfère.",
    relay_teams: "Points d'équipe", relay_teams_d: "Regroupe les points de chaque équipe.",
    rounds: "Manches", difficulty: "Difficulté", easy: "Facile", medium: "Moyen", hard: "Difficile",
    draw_time: "Temps de dessin", secs: "s",
    num_teams: "Nombre d'équipes", pick_team: "Touche une équipe pour la rejoindre",
    teams: "Équipes", players: "Joueurs", start_game: "Démarrer",
    need_players: "Il faut au moins 1 joueur.", need_teams: "Remplis au moins 2 équipes.",
    need_relay: "Passe & Devine demande au moins 2 joueurs.",
    host_only: "Seul l'hôte peut faire ça.", waiting_host: "En attente du lancement par l'hôte…",
    you: "toi", host: "hôte",
    draw_word: "Dessine", time: "Temps", im_done: "J'ai fini", done: "Fini",
    waiting_others: "En attente des autres…", finishing: "Finalisation…",
    clear: "Effacer", undo: "Annuler", eraser: "Gomme",
    team_live: "Ton équipe dessine ensemble — tous les traits apparaissent ici.",
    ai_judging: "L'IA juge les dessins…",
    vote_title: "Vote pour le meilleur dessin", vote_hint: "Lequel montre le mieux le mot ? (Pas le tien.)",
    voted: "Voté !", cant_vote_own: "Tu ne peux pas voter pour ton dessin.",
    reveal_title: "Résultat de la manche", the_word_was: "Le mot était",
    ai_score: "Score IA", ai_guess: "L'IA a vu", votes_lbl: "votes",
    round_won: "gagne la manche !", you_won_round: "Tu gagnes la manche !", no_winner: "Aucun gagnant cette manche.",
    next_round: "Manche suivante", see_final: "Voir le résultat",
    end_round: "Terminer la manche", end_game: "Terminer",
    relay_draw_title: "Dessine ce mot secret", relay_guess_title: "C'est quoi ce dessin ?",
    your_guess: "Écris ta réponse", submit_guess: "Envoyer", submit_draw: "Envoyer le dessin",
    relay_wait: "Envoyé ! En attente des autres…", turn: "Tour",
    books_title: "Les carnets sont là !", started_with: "a commencé par",
    correct_guess: "Correct !", drew: "a dessiné", guessed: "a deviné", blank_page: "(pas de réponse)",
    champion: "Champion !", final: "Classement final", play_again: "Rejouer", go_home: "Accueil",
    points: "pts", wins: "victoires",
    you_earned: "Tu as gagné", coins: "pièces", xp: "XP",
    reconnecting: "Reconnexion…",
    err_locked: "Impossible de changer ça une fois lancé.",
    err_started: "La partie a déjà commencé.", err_no_code: "Aucun salon avec ce code.",
    err_own_vote: "Tu ne peux pas voter pour ton dessin.",
    err_generic: "Un bug — réessaie.",
  },
  ar: {
    brand: "DOODLE DUEL", tagline: "ارسم، خمّن، اربح. ارسم كلمة أو مرّر الرسوم في الحلقة.",
    create: "إنشاء غرفة", join: "انضمام", back: "رجوع",
    your_name: "اسمك", pick_color: "اختر لونًا", room_code: "رمز الغرفة",
    create_go: "إنشاء", join_go: "انضمام", lobby: "الغرفة",
    share_hint: "شارك هذا الرمز لينضم أصدقاؤك:",
    game: "اللعبة", game_sketch: "ارسم الكلمة", game_relay: "مرّر وخمّن",
    game_sketch_d: "الجميع يرسم الكلمة نفسها. الذكاء الاصطناعي أو التصويت يختار الأفضل.",
    game_relay_d: "ارسم كلمة سرية ثم مرّر — خمّن، أعد الرسم، خمّن في الحلقة.",
    mode: "الوضع", mode_solo: "فردي", mode_versus: "تنافسي", mode_teams: "فرق",
    mode_solo_d: "ارسم بمفردك — الذكاء الاصطناعي يقيّم كل جولة.",
    mode_versus_d: "كلٌّ يرسم رسمته — أفضل رسمة تفوز بالجولة.",
    mode_teams_d: "أعضاء الفريق يتشاركون لوحة حية — أفضل رسمة فريق تفوز.",
    judging: "الحكم", judge_ai: "ذكاء 🤖", judge_vote: "تصويت 🗳️",
    judge_ai_d: "جيميني يفحص كل رسمة ويقيّم مطابقتها للكلمة.",
    judge_vote_d: "الجميع يصوّت للرسمة الأفضل.",
    relay_teams: "نقاط الفريق", relay_teams_d: "اجمع نقاط كل فريق معًا.",
    rounds: "الجولات", difficulty: "الصعوبة", easy: "سهل", medium: "متوسط", hard: "صعب",
    draw_time: "وقت الرسم", secs: "ث",
    num_teams: "عدد الفرق", pick_team: "اضغط على فريق للانضمام",
    teams: "الفرق", players: "اللاعبون", start_game: "ابدأ اللعبة",
    need_players: "تحتاج لاعبًا واحدًا على الأقل.", need_teams: "املأ فريقين على الأقل.",
    need_relay: "«مرّر وخمّن» يحتاج لاعبَين على الأقل.",
    host_only: "المضيف فقط يمكنه ذلك.", waiting_host: "بانتظار أن يبدأ المضيف…",
    you: "أنت", host: "المضيف",
    draw_word: "ارسم", time: "الوقت", im_done: "انتهيت", done: "تم",
    waiting_others: "بانتظار الآخرين…", finishing: "جارٍ الإنهاء…",
    clear: "مسح", undo: "تراجع", eraser: "ممحاة",
    team_live: "فريقك يرسم معًا — كل الخطوط تظهر هنا.",
    ai_judging: "الذكاء الاصطناعي يحكم على الرسوم…",
    vote_title: "صوّت لأفضل رسمة", vote_hint: "أيها يُظهر الكلمة أفضل؟ (ليس رسمتك.)",
    voted: "تم التصويت!", cant_vote_own: "لا يمكنك التصويت لرسمتك.",
    reveal_title: "نتيجة الجولة", the_word_was: "الكلمة كانت",
    ai_score: "تقييم الذكاء", ai_guess: "رأى الذكاء", votes_lbl: "أصوات",
    round_won: "يفوز بالجولة!", you_won_round: "فزت بالجولة!", no_winner: "لا فائز هذه الجولة.",
    next_round: "الجولة التالية", see_final: "عرض النتيجة",
    end_round: "إنهاء الجولة", end_game: "إنهاء",
    relay_draw_title: "ارسم هذه الكلمة السرية", relay_guess_title: "ما هذه الرسمة؟",
    your_guess: "اكتب تخمينك", submit_guess: "أرسل", submit_draw: "أرسل الرسمة",
    relay_wait: "أُرسل! بانتظار الآخرين…", turn: "الدور",
    books_title: "الكتيّبات جاهزة!", started_with: "بدأ بـ",
    correct_guess: "صحيح!", drew: "رسم", guessed: "خمّن", blank_page: "(بدون إجابة)",
    champion: "البطل!", final: "الترتيب النهائي", play_again: "العب مجددًا", go_home: "الرئيسية",
    points: "نقاط", wins: "انتصارات",
    you_earned: "لقد ربحت", coins: "عملات", xp: "خبرة",
    reconnecting: "إعادة الاتصال…",
    err_locked: "لا يمكن تغيير ذلك بعد البدء.",
    err_started: "بدأت اللعبة بالفعل.", err_no_code: "لا توجد غرفة بهذا الرمز.",
    err_own_vote: "لا يمكنك التصويت لرسمتك.",
    err_generic: "حدث خلل — حاول مجددًا.",
  },
};
const t = (k) => (T[lang] || T.en)[k] ?? T.en[k] ?? k;
const ERR_MAP = {
  dd_err_locked: "err_locked", dd_err_host_only: "host_only",
  dd_err_need_players: "need_players", dd_err_need_teams: "need_teams",
  dd_err_need_relay: "need_relay", dd_err_started: "err_started",
  dd_err_no_code: "err_no_code", dd_err_own_vote: "err_own_vote",
};
const tErr = (key) => t(ERR_MAP[key] || "err_generic");

/* ---------------- session / account ---------------- */
function loadSession() {
  try { return JSON.parse(localStorage.getItem("draw.session") || "null"); }
  catch { return null; }
}
function saveSession(s) { session = s; localStorage.setItem("draw.session", JSON.stringify(s)); }
function clearSession() { session = null; localStorage.removeItem("draw.session"); }
function getToken() { return localStorage.getItem("kyuubi.token"); }

/* ---------------- state ---------------- */
let config = { colors: [], serverUrl: "" };
let state = null;
let session = loadSession();
let pre = "landing"; // landing | create | join
let drafts = { name: "", color: "", joinCode: "" };
let account = null;

// The private prompt/turn info delivered per-socket (never in shared state).
let myWord = null;        // sketch: the word to draw
let relayTask = null;     // relay: { action, word, image, turn, totalTurns }
let relaySubmitted = false;
let iDrew = false; // sketch: I tapped "I'm done" (instant switch to waiting)
let guessDraft = "";

let renderedView = null;  // guards against wiping the canvas on every broadcast
let phaseTick = null;

/* ---------------- canvas model ---------------- */
const CW = 800, CH = 600; // internal resolution (4:3)
let paths = [];           // [{c,w,pts:[[x,y]...]}] normalized 0..1
let cur = null;           // in-progress stroke
let isDrawing = false;
let pendingRender = false;
let penColor = "#111111";
let penSize = 6;          // px in internal space
let erasing = false;
let cvs = null, ctx = null;
let autosaveTimer = null;

const PENS = ["#111111", "#FF3D77", "#22C7D6", "#FFC53D", "#4ADE80", "#8B5CF6", "#FB923C", "#8B5A2B"];
const SIZES = [3, 6, 12, 22];

/* ---------------- helpers ---------------- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function loc(x) { if (x == null) return ""; if (typeof x === "string") return x; return x[lang] || x.en || ""; }
function myId() { return session?.playerId || null; }
function myPlayer() { return state?.players.find((p) => p.id === myId()) || null; }
function isHost() { return state && myId() === state.hostId; }
function initials(name) { return (name || "?").trim().charAt(0).toUpperCase() || "?"; }
function teamMeta(i) { return state?.teams.find((tm) => tm.index === i) || null; }
function teamName(i) { const m = teamMeta(i); return m ? loc(m.name) : "?"; }
function teamColor(i) { const m = teamMeta(i); return m ? m.color : "#888"; }
function inviteBase() {
  const o = location.origin;
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(o) ? config.serverUrl || o : o;
}
function toast(message, kind = "ok") {
  const wrap = document.getElementById("toasts");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 250); }, 2200);
}
function flash(text) {
  const el = document.createElement("div");
  el.className = "dd-flash";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}
function remainingSecs() {
  if (!state?.phaseEndsAt) return null;
  return Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000));
}

/* ================= SOCKET ================= */
socket.on("dd_config", (cfg) => { config = cfg || config; });

socket.on("connect", () => {
  if (session?.code && session?.playerId) {
    socket.emit("dd_join", {
      code: session.code, playerId: session.playerId, token: getToken(), lang,
      name: drafts.name, color: drafts.color,
    }, (res) => {
      if (res && res.ok) { state = res.state; myWord = null; relayTask = null; fullRender(); }
      else { clearSession(); state = null; fullRender(); }
    });
  }
});

socket.on("dd_state", (s) => {
  state = s;
  // While actively dragging, defer the re-render so we never cut a stroke.
  if (isDrawing) { pendingRender = true; return; }
  reactToState();
});

socket.on("dd_notice", ({ message } = {}) => toast(tErr(message), "err"));

socket.on("dd_word", (payload) => {
  myWord = payload.word;
  relayTask = null;
  relaySubmitted = false;
  iDrew = false;
  // Fresh canvas each round (unless a reconnect handed us team stroke history).
  paths = [];
  if (Array.isArray(payload.strokes)) for (const seg of payload.strokes) applyRemoteSeg(seg, false);
  renderedView = null; // force a full render into the draw view
  reactToState();
});

socket.on("dd_collect", () => {
  // Server is closing the draw phase — push our latest canvas.
  if (state && (state.status === "draw" || state.status === "collect")) pushArt(false);
});

socket.on("dd_reveal", (result) => {
  if (state) state.roundResult = result;
  // winner celebration handled in render
});

socket.on("dd_relay_turn", (task) => {
  relayTask = task;
  relaySubmitted = !!task.already;
  myWord = null;
  guessDraft = "";
  if (task.action === "draw") paths = [];
  renderedView = null;
  reactToState();
});

socket.on("dd_relay_reveal", ({ reveal, result }) => {
  if (state) { state.relayReveal = reveal; state.result = result; }
  renderedView = null;
  reactToState();
});

socket.on("dd_gameover", ({ result }) => {
  if (state) state.result = result;
  sfx.win(); confettiBurst();
});

socket.on("dd_reward", ({ coins, xp, won }) => {
  toast(`${t("you_earned")} +${coins} 🪙 · +${xp} XP`, won ? "ok" : "ok");
});

// live team drawing
socket.on("dd_stroke", (seg) => applyRemoteSeg(seg, true));
socket.on("dd_clear", () => { paths = []; if (ctx) redraw(); });

/* ================= state reaction ================= */
function viewFor() {
  if (!state) return pre;
  const s = state.status;
  if (s === "lobby") return "lobby";
  if (s === "draw" || s === "collect") {
    const meDone = iDrew || myPlayer()?.finished;
    return meDone || s === "collect" ? "drawwait" : "draw";
  }
  if (s === "judge") return "judge";
  if (s === "vote") return "vote";
  if (s === "reveal") return "reveal";
  if (s === "relay") return relayTask?.action === "guess" ? "relayguess" : "relaydraw";
  if (s === "relaybooks") return "books";
  if (s === "finished") return "finished";
  return "lobby";
}

function reactToState() {
  const v = viewFor();
  // Canvas views: render once, then soft-update HUD so the drawing survives.
  const canvasView = v === "draw" || v === "relaydraw";
  if (v === renderedView && (canvasView || v === "drawwait" || v === "relayguess" || v === "vote" || v === "lobby")) {
    softUpdate(v);
    return;
  }
  fullRender();
}

/* ================= render ================= */
function fullRender() {
  stopTick();
  const v = viewFor();
  renderedView = v;
  let html = "";
  if (!state) html = renderPre();
  else if (v === "lobby") html = renderLobby();
  else if (v === "draw" || v === "drawwait") html = renderDraw();
  else if (v === "judge") html = renderJudge();
  else if (v === "vote") html = renderVote();
  else if (v === "reveal") html = renderReveal();
  else if (v === "relaydraw") html = renderRelayDraw();
  else if (v === "relayguess") html = renderRelayGuess();
  else if (v === "books") html = renderBooks();
  else if (v === "finished") html = renderFinished();
  $app.innerHTML = `<div class="dd-wrap">${html}</div>`;

  if (v === "draw" || v === "relaydraw") mountCanvas();
  if (v === "draw" || v === "vote" || v === "relaydraw" || v === "relayguess" || v === "judge") startTick();
  if (v === "relayguess") {
    const inp = document.getElementById("dd-guess");
    if (inp) { inp.value = guessDraft; inp.focus(); }
  }
  if (v === "finished" || (v === "reveal" && didWin())) { /* celebration via events */ }
}

// Cheap per-second updates that must not rebuild the canvas.
function softUpdate() {
  const rp = remainingSecs();
  const tEl = document.getElementById("dd-timer");
  if (tEl && rp != null) { tEl.textContent = rp + t("secs"); tEl.classList.toggle("low", rp <= 10); }
  const done = document.getElementById("dd-donecount");
  if (done && state) {
    const total = countUnits();
    const fin = state.players ? countFinished() : 0;
    done.textContent = `${fin}/${total}`;
  }
  const roster = document.getElementById("dd-roster");
  if (roster) roster.innerHTML = rosterHTML();
}

/* ---------------- pre-room ---------------- */
function topBar() {
  return `<div class="dd-row dd-spread" style="margin-bottom:6px">
    <span class="dd-muted" style="font-weight:700">🎨 DOODLE DUEL</span>
    <div class="dd-seg" style="padding:3px">${LANGS.map((l) => `<button class="${lang === l.code ? "on" : ""}" data-act="lang" data-lang="${l.code}">${l.code === "ar" ? "ع" : l.code.toUpperCase()}</button>`).join("")}</div>
  </div>`;
}
function colorSwatches(sel) {
  const cs = config.colors && config.colors.length ? config.colors : ["#FF3D77", "#22E0D6", "#FFC53D", "#8B5CF6"];
  return `<div class="dd-colors">${cs.map((c) => `<button class="dd-swatch ${sel === c ? "on" : ""}" style="background:${c}" data-act="pick-color" data-color="${c}"></button>`).join("")}</div>`;
}
function renderPre() {
  if (pre === "create" || pre === "join") {
    const joining = pre === "join";
    return `${topBar()}
      <h1 class="dd-brand">${t("brand")}</h1>
      <div class="dd-card">
        <button class="btn btn-ghost sm" data-act="pre-back" style="margin-bottom:8px">‹ ${t("back")}</button>
        <label class="dd-field"><span>${t("your_name")}</span>
          <input class="dd-input" id="dd-name" maxlength="16" value="${esc(drafts.name)}" placeholder="${t("your_name")}" /></label>
        ${joining ? `<label class="dd-field"><span>${t("room_code")}</span>
          <input class="dd-input" id="dd-code" maxlength="8" style="text-transform:uppercase" value="${esc(drafts.joinCode)}" placeholder="DOO-XXXX" /></label>` : ""}
        <label class="dd-field"><span>${t("pick_color")}</span>${colorSwatches(drafts.color)}</label>
        <button class="btn btn-pink block lg" data-act="${joining ? "do-join" : "do-create"}" style="margin-top:8px">${joining ? t("join_go") : t("create_go")}</button>
      </div>`;
  }
  return `${topBar()}
    <div style="text-align:center;font-size:56px;margin-top:10px">🎨</div>
    <h1 class="dd-brand">${t("brand")}</h1>
    <p class="dd-tag">${t("tagline")}</p>
    <div class="dd-card">
      <button class="btn btn-pink block lg" data-act="pre-create">✏️ ${t("create")}</button>
      <button class="btn btn-cyan block lg" data-act="pre-join" style="margin-top:10px">🔑 ${t("join")}</button>
    </div>`;
}

/* ---------------- lobby ---------------- */
function rosterHTML() {
  if (!state) return "";
  return state.players.map((p) => {
    const badges = [];
    if (p.isHost) badges.push(`<span class="dd-badge host">${t("host")}</span>`);
    if (p.id === myId()) badges.push(`<span class="dd-badge you">${t("you")}</span>`);
    return `<div class="dd-pl">
      <span class="dd-avatar" style="background:${esc(p.color)}">${esc(initials(p.name))}</span>
      <span class="nm">${esc(p.name)}</span>
      ${state.status !== "lobby" && state.settings.game === "sketch" && p.finished ? `<span class="dd-badge ok">✓</span>` : ""}
      ${state.status === "vote" && p.voted ? `<span class="dd-badge ok">🗳️</span>` : ""}
      ${state.status === "relay" && p.submitted ? `<span class="dd-badge ok">✓</span>` : ""}
      <span style="flex:1"></span>${badges.join("")}
      ${!p.connected ? `<span class="dd-badge">···</span>` : ""}
    </div>`;
  }).join("");
}
function segBtns(act, current, opts) {
  return `<div class="dd-seg">${opts.map((o) => `<button class="${current === o.v ? "on" : ""}" data-act="${act}" data-v="${o.v}">${o.l}</button>`).join("")}</div>`;
}
function renderLobby() {
  const s = state.settings;
  const host = isHost();
  const dis = host ? "" : "disabled";
  const isSketch = s.game === "sketch";
  const showTeams = (isSketch && s.mode === "teams") || (!isSketch && s.relayTeams);

  const gameDesc = isSketch ? t("game_sketch_d") : t("game_relay_d");
  let controls = `
    <div class="dd-sec-title">${t("game")}</div>
    ${segBtns("set-game", s.game, [{ v: "sketch", l: "✏️ " + t("game_sketch") }, { v: "relay", l: "🔄 " + t("game_relay") }])}
    <div class="dd-opt-d">${gameDesc}</div>`;

  if (isSketch) {
    const modeDesc = s.mode === "solo" ? t("mode_solo_d") : s.mode === "versus" ? t("mode_versus_d") : t("mode_teams_d");
    controls += `
      <div class="dd-sec-title">${t("mode")}</div>
      ${segBtns("set-mode", s.mode, [{ v: "solo", l: t("mode_solo") }, { v: "versus", l: t("mode_versus") }, { v: "teams", l: t("mode_teams") }])}
      <div class="dd-opt-d">${modeDesc}</div>`;
    if (s.mode !== "solo") {
      const jDesc = s.judging === "ai" ? t("judge_ai_d") : t("judge_vote_d");
      controls += `
        <div class="dd-sec-title">${t("judging")}</div>
        ${segBtns("set-judging", s.judging, [{ v: "ai", l: t("judge_ai") }, { v: "vote", l: t("judge_vote") }])}
        <div class="dd-opt-d">${jDesc}</div>`;
    }
  } else {
    controls += `
      <div class="dd-sec-title">${t("relay_teams")}</div>
      ${segBtns("set-relayteams", s.relayTeams ? "on" : "off", [{ v: "off", l: "✕" }, { v: "on", l: "✓ " + t("relay_teams") }])}
      <div class="dd-opt-d">${t("relay_teams_d")}</div>`;
  }

  controls += `
    <div class="dd-sec-title">${t("difficulty")}</div>
    ${segBtns("set-diff", s.difficulty, [{ v: "easy", l: t("easy") }, { v: "medium", l: t("medium") }, { v: "hard", l: t("hard") }])}`;

  if (isSketch) {
    controls += `
      <div class="dd-sec-title">${t("rounds")}: <b style="color:#fff">${s.rounds}</b></div>
      <input type="range" min="1" max="10" value="${s.rounds}" data-act="set-rounds" ${dis} style="width:100%">`;
  }
  controls += `
    <div class="dd-sec-title">${t("draw_time")}: <b style="color:#fff">${s.drawSeconds}${t("secs")}</b></div>
    <input type="range" min="30" max="180" step="15" value="${s.drawSeconds}" data-act="set-drawtime" ${dis} style="width:100%">`;

  let teamsUI = "";
  if (showTeams) {
    teamsUI = `
      <div class="dd-sec-title">${t("num_teams")}</div>
      ${segBtns("set-numteams", String(s.numTeams), [2, 3, 4].map((n) => ({ v: String(n), l: String(n) })))}
      <div class="dd-sec-title">${t("teams")} · ${t("pick_team")}</div>
      <div class="dd-teams">${state.teams.slice(0, s.numTeams).map((tm) => {
        const mine = myPlayer() && myPlayer().team === tm.index;
        const members = state.players.filter((p) => p.team === tm.index);
        return `<div class="dd-team ${mine ? "mine" : ""}" data-act="join-team" data-team="${tm.index}">
          <div class="dd-team-hd"><span class="dd-dot" style="background:${tm.color}"></span>${loc(tm.name)}</div>
          ${members.map((p) => `<span class="dd-chip"><span class="dd-avatar" style="width:20px;height:20px;font-size:11px;background:${p.color}">${esc(initials(p.name))}</span>${esc(p.name)}</span>`).join("") || `<span class="dd-muted" style="font-size:12px">—</span>`}
        </div>`;
      }).join("")}</div>`;
  }

  const startBtn = host
    ? `<button class="btn btn-pink block lg" data-act="start" style="margin-top:16px">🚀 ${t("start_game")}</button>`
    : `<div class="dd-muted" style="text-align:center;margin-top:16px">${t("waiting_host")}</div>`;

  return `${topBar()}
    <div class="dd-card" style="text-align:center;margin-bottom:12px">
      <div class="dd-muted" style="font-size:12px">${t("share_hint")}</div>
      <div class="dd-code" data-act="copy-code">${esc(state.code)}</div>
    </div>
    <div class="dd-card">
      ${host ? controls : `<div class="dd-muted" style="text-align:center">${t("waiting_host")}</div>`}
      ${teamsUI}
    </div>
    <div class="dd-sec-title">${t("players")} · ${state.players.length}</div>
    <div class="dd-players" id="dd-roster">${rosterHTML()}</div>
    ${startBtn}`;
}

/* ---------------- helpers for counts ---------------- */
function countUnits() {
  if (!state) return 0;
  if (state.settings.game === "sketch" && state.settings.mode === "teams")
    return state.teams.filter((tm) => state.players.some((p) => p.connected && p.team === tm.index)).length;
  return state.players.filter((p) => p.connected).length;
}
function countFinished() {
  if (!state) return 0;
  if (state.settings.game === "sketch" && state.settings.mode === "teams") {
    const teams = new Set(state.players.filter((p) => p.finished).map((p) => p.team));
    return teams.size;
  }
  return state.players.filter((p) => p.finished).length;
}

/* ---------------- draw (sketch) ---------------- */
function drawHUD(promptText) {
  const rp = remainingSecs();
  return `<div class="dd-hud">
      <button class="btn btn-ghost sm" data-act="leave">‹</button>
      <div style="flex:1"><div class="dd-prompt"><small>${t("draw_word").toUpperCase()}</small>${esc(promptText || "…")}</div></div>
      <div class="dd-timer ${rp != null && rp <= 10 ? "low" : ""}" id="dd-timer">${rp != null ? rp + t("secs") : "—"}</div>
    </div>`;
}
function toolbar() {
  return `<div class="dd-tools">
    <div class="dd-pens">
      ${PENS.map((c) => `<button class="dd-pen ${!erasing && penColor === c ? "on" : ""}" style="background:${c}" data-act="pen" data-c="${c}"></button>`).join("")}
      <button class="dd-tool-btn ${erasing ? "on" : ""}" data-act="eraser" title="${t("eraser")}">🧽</button>
    </div>
    <span style="flex:1"></span>
    <div class="dd-sizes">${SIZES.map((sz) => `<button class="dd-size ${penSize === sz ? "on" : ""}" data-act="size" data-s="${sz}"><i style="width:${Math.min(sz, 18)}px;height:${Math.min(sz, 18)}px"></i></button>`).join("")}</div>
  </div>
  <div class="dd-tools" style="margin-top:8px">
    <button class="dd-tool-btn" data-act="undo">↶ ${t("undo")}</button>
    <button class="dd-tool-btn" data-act="clearcanvas">🗑 ${t("clear")}</button>
    <span style="flex:1"></span>
  </div>`;
}
function renderDraw() {
  const meDone = iDrew || (myPlayer() && myPlayer().finished);
  if (meDone || state.status === "collect") {
    return drawHUD(myWord) + waitingCard(state.status === "collect" ? t("finishing") : t("waiting_others"));
  }
  const isTeam = state.settings.mode === "teams";
  return `${drawHUD(myWord)}
    <div class="dd-stage"><canvas id="dd-canvas" class="dd-canvas"></canvas></div>
    ${isTeam ? `<div class="dd-live-note">🖌️ ${t("team_live")}</div>` : ""}
    ${toolbar()}
    <button class="btn btn-green block lg" data-act="done-draw" style="margin-top:12px">✓ ${t("im_done")} <span id="dd-donecount" class="dd-muted" style="font-size:13px">${countFinished()}/${countUnits()}</span></button>
    ${isHost() ? `<button class="btn btn-ghost block sm" data-act="end-phase" style="margin-top:8px">${t("end_round")}</button>` : ""}`;
}
function waitingCard(msg) {
  return `<div class="dd-card dd-wait">
    <div class="dd-spinner"></div>
    <div style="font-weight:700">${esc(msg)}</div>
    <div class="dd-muted" id="dd-donecount" style="margin-top:6px">${countFinished()}/${countUnits()}</div>
  </div>`;
}

/* ---------------- judge (AI) ---------------- */
function renderJudge() {
  return `${drawHUD(myWord)}
    <div class="dd-card dd-wait">
      <div style="font-size:44px">🤖</div>
      <div class="dd-spinner"></div>
      <div style="font-weight:700">${t("ai_judging")}</div>
    </div>`;
}

/* ---------------- vote ---------------- */
function renderVote() {
  const board = state.voteBoard || [];
  const meVoted = myPlayer() && myPlayer().voted;
  const rp = remainingSecs();
  return `<div class="dd-hud">
      <div style="flex:1"><div class="dd-title">🗳️ ${t("vote_title")}</div><div class="dd-muted" style="font-size:12.5px">${t("vote_hint")}</div></div>
      <div class="dd-timer ${rp != null && rp <= 10 ? "low" : ""}" id="dd-timer">${rp != null ? rp + t("secs") : "—"}</div>
    </div>
    <div class="dd-gallery">
      ${board.map((a) => {
        const mine = a.id === myUnitId();
        const votable = !mine && !meVoted;
        return `<div class="dd-art ${votable ? "votable" : ""} ${mine ? "mine" : ""}" ${votable ? `data-act="vote" data-unit="${a.id}"` : ""}>
          ${a.art ? `<img src="${a.art}" alt="">` : `<div class="dd-art-empty">—</div>`}
          <div class="dd-art-foot"><span class="dd-dot" style="background:${a.color}"></span><span>${esc(loc(a.name))}${mine ? " (" + t("you") + ")" : ""}</span></div>
        </div>`;
      }).join("")}
    </div>
    ${meVoted ? `<div class="dd-card" style="text-align:center;margin-top:12px">✅ ${t("voted")}</div>` : ""}
    ${isHost() ? `<button class="btn btn-ghost block sm" data-act="end-phase" style="margin-top:10px">${t("end_round")}</button>` : ""}`;
}
function myUnitId() {
  const p = myPlayer();
  if (!p) return null;
  return state.settings.game === "sketch" && state.settings.mode === "teams" ? `t${p.team}` : `p${p.id}`;
}

/* ---------------- reveal ---------------- */
function didWin() {
  const r = state?.roundResult;
  if (!r) return false;
  return r.winnerUnitId && r.winnerUnitId === myUnitId();
}
function renderReveal() {
  const r = state.roundResult;
  if (!r) return waitingCard("…");
  const arts = (r.artworks || []).slice().sort((a, b) => {
    if (r.judging === "ai") return (b.score || 0) - (a.score || 0);
    return (b.votes || 0) - (a.votes || 0);
  });
  const winner = arts.find((a) => a.id === r.winnerUnitId);
  const isLast = state.round + 1 >= state.totalRounds;
  return `<h2 class="dd-title" style="text-align:center">${t("reveal_title")}</h2>
    <div class="dd-reveal-word">“${esc(loc(r.word))}”</div>
    <div class="dd-muted" style="text-align:center;margin-bottom:8px">${t("the_word_was")}</div>
    ${winner ? `<div style="text-align:center;font-weight:800;margin-bottom:8px">🏆 ${didWin() ? t("you_won_round") : esc(loc(winner.name)) + " " + t("round_won")}</div>` : `<div class="dd-muted" style="text-align:center">${t("no_winner")}</div>`}
    <div class="dd-gallery">
      ${arts.map((a) => `<div class="dd-art ${a.id === r.winnerUnitId ? "win" : ""}">
        ${a.art ? `<img src="${a.art}" alt="">` : `<div class="dd-art-empty">—</div>`}
        ${r.judging === "ai" && a.score != null ? `<span class="dd-score-badge">${a.score}</span>` : ""}
        ${r.judging === "vote" ? `<span class="dd-vote-badge">${a.votes || 0} ${t("votes_lbl")}</span>` : ""}
        <div class="dd-art-foot"><span class="dd-dot" style="background:${a.color}"></span><span>${esc(loc(a.name))}</span>
        ${r.judging === "ai" && a.guess ? `<span class="dd-muted" style="font-weight:400">· ${esc(a.guess)}</span>` : ""}</div>
      </div>`).join("")}
    </div>
    ${miniStandings()}
    ${isHost() ? `<div class="dd-sticky-actions">
      <button class="btn btn-pink block lg" data-act="next">${isLast ? "🏁 " + t("see_final") : "➡️ " + t("next_round")}</button>
    </div>` : `<div class="dd-muted" style="text-align:center;margin-top:12px">${t("waiting_host")}</div>`}`;
}
function miniStandings() {
  if (!state) return "";
  const teams = state.settings.game === "sketch" && state.settings.mode === "teams";
  let rows;
  if (teams) {
    rows = state.teams
      .filter((tm) => state.players.some((p) => p.team === tm.index))
      .map((tm) => ({ name: loc(tm.name), color: tm.color, score: tm.wins }))
      .sort((a, b) => b.score - a.score);
  } else {
    rows = state.players.map((p) => ({ name: p.name, color: p.color, score: p.wins })).sort((a, b) => b.score - a.score);
  }
  return `<div class="dd-sec-title">${t("final")}</div>
    <div class="dd-standings">${rows.map((r, i) => `<div class="dd-stand-row ${i === 0 ? "first" : ""}">
      <span class="dd-rank">${["🥇", "🥈", "🥉"][i] || i + 1}</span>
      <span class="dd-dot" style="background:${r.color}"></span>
      <span class="dd-stand-name">${esc(r.name)}</span>
      <span class="dd-stand-score">${r.score} <small class="dd-muted" style="font-size:12px">${t("wins")}</small></span>
    </div>`).join("")}</div>`;
}

/* ---------------- relay: draw ---------------- */
function relayHUD(title) {
  const rp = remainingSecs();
  return `<div class="dd-hud">
    <div style="flex:1"><div class="dd-title">${title}</div>
    <div class="dd-muted" style="font-size:12px">${t("turn")} ${(relayTask?.turn ?? 0) + 1}/${relayTask?.totalTurns ?? "?"}</div></div>
    <div class="dd-timer ${rp != null && rp <= 10 ? "low" : ""}" id="dd-timer">${rp != null ? rp + t("secs") : "—"}</div>
  </div>`;
}
function renderRelayDraw() {
  if (relaySubmitted) return relayHUD("✏️ " + t("relay_draw_title")) + waitingCard(t("relay_wait"));
  return `${relayHUD("✏️ " + t("relay_draw_title"))}
    <div class="dd-reveal-word" style="font-size:clamp(24px,7vw,38px)">“${esc(relayTask?.word || "…")}”</div>
    <div class="dd-stage"><canvas id="dd-canvas" class="dd-canvas"></canvas></div>
    ${toolbar()}
    <button class="btn btn-green block lg" data-act="submit-draw" style="margin-top:12px">✓ ${t("submit_draw")}</button>`;
}
function renderRelayGuess() {
  if (relaySubmitted) return relayHUD("💭 " + t("relay_guess_title")) + waitingCard(t("relay_wait"));
  return `${relayHUD("💭 " + t("relay_guess_title"))}
    ${relayTask?.image ? `<img class="dd-guess-img" src="${relayTask.image}" alt="">` : `<div class="dd-card dd-wait">${t("blank_page")}</div>`}
    <label class="dd-field" style="margin-top:12px"><span>${t("your_guess")}</span>
      <input class="dd-input" id="dd-guess" maxlength="40" value="${esc(guessDraft)}" placeholder="${t("your_guess")}" /></label>
    <button class="btn btn-cyan block lg" data-act="submit-guess">${t("submit_guess")}</button>`;
}

/* ---------------- relay: books reveal ---------------- */
function renderBooks() {
  const reveal = state.relayReveal;
  const books = reveal?.books || [];
  return `<h2 class="dd-title" style="text-align:center">📖 ${t("books_title")}</h2>
    ${books.map((b) => `<div class="dd-book">
      <div class="dd-book-hd"><span class="dd-dot" style="background:${b.owner?.color || "#888"}"></span>
        <b>${esc(b.owner?.name || "?")}</b> <span class="dd-muted">${t("started_with")} “${esc(loc(b.seed))}”</span></div>
      <div class="dd-chain">
        ${b.pages.map((pg) => bookPage(pg)).join("")}
      </div>
    </div>`).join("")}
    ${relayStandings()}
    ${isHost() ? `<div class="dd-sticky-actions">
      <button class="btn btn-pink block lg" data-act="again">🔁 ${t("play_again")}</button>
      <a class="btn btn-ghost block lg" href="/" style="text-align:center">${t("go_home")}</a>
    </div>` : `<div class="dd-muted" style="text-align:center;margin-top:12px">${t("waiting_host")}</div>`}`;
}
function bookPage(pg) {
  const by = pg.by ? `<div class="by"><span class="dd-dot" style="width:10px;height:10px;background:${pg.by.color}"></span>${esc(pg.by.name)}</div>` : "";
  if (pg.seed) return `<div class="dd-page seed"><div class="pw">“${esc(pg.text)}”</div><div class="by">${t("started_with")}</div></div>`;
  if (pg.type === "drawing") {
    return `<div class="dd-page">${pg.image ? `<img src="${pg.image}" alt="">` : `<div class="dd-art-empty">${t("blank_page")}</div>`}${by}</div>`;
  }
  const cls = pg.blank ? "" : pg.correct ? "correct" : "";
  const mark = pg.blank ? "" : pg.correct ? `<span class="tick">✓</span>` : `<span class="miss">✕</span>`;
  return `<div class="dd-page ${cls}"><div class="pw">${pg.blank ? t("blank_page") : "“" + esc(pg.text) + "” " + mark}</div>${by}</div>`;
}
function relayStandings() {
  const res = state.result;
  if (!res) return "";
  return renderStandingsBlock(res);
}

/* ---------------- finished ---------------- */
function renderFinished() {
  const res = state.result;
  if (!res) return waitingCard("…");
  const champ = res.champion;
  return `<div style="text-align:center;font-size:54px">🏆</div>
    <h2 class="dd-brand" style="font-size:34px">${t("champion")}</h2>
    ${champ ? `<div style="text-align:center;font-weight:800;font-size:20px;margin-bottom:6px"><span class="dd-dot" style="display:inline-block;background:${champ.color}"></span> ${esc(loc(champ.name))}</div>` : ""}
    ${renderStandingsBlock(res)}
    <div class="dd-sticky-actions">
      ${isHost() ? `<button class="btn btn-pink block lg" data-act="again">🔁 ${t("play_again")}</button>` : ""}
      <a class="btn btn-ghost block lg" href="/" style="text-align:center">${t("go_home")}</a>
    </div>`;
}
function renderStandingsBlock(res) {
  const unit = res.game === "relay" ? t("points") : t("wins");
  return `<div class="dd-sec-title">${t("final")}</div>
    <div class="dd-standings">${(res.standings || []).map((r, i) => `<div class="dd-stand-row ${i === 0 ? "first" : ""}">
      <span class="dd-rank">${["🥇", "🥈", "🥉"][i] || i + 1}</span>
      <span class="dd-dot" style="background:${r.color}"></span>
      <span class="dd-stand-name">${esc(loc(r.name))}${r.members ? `<div class="dd-sub-members">${r.members.map((m) => esc(m.name)).join(", ")}</div>` : ""}</span>
      <span class="dd-stand-score">${r.score} <small class="dd-muted" style="font-size:12px">${unit}</small></span>
    </div>`).join("")}</div>`;
}

/* ================= canvas ================= */
function mountCanvas() {
  cvs = document.getElementById("dd-canvas");
  if (!cvs) return;
  cvs.width = CW; cvs.height = CH;
  ctx = cvs.getContext("2d");
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  redraw();
  attachCanvas();
}
function redraw() {
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CW, CH);
  for (const st of paths) strokePath(st);
  if (cur) strokePath(cur);
}
function strokePath(st) {
  const pts = st.pts;
  if (!pts.length) return;
  ctx.strokeStyle = st.c;
  ctx.lineWidth = st.w * CW;
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * CW, pts[0][1] * CH);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * CW, pts[i][1] * CH);
  if (pts.length === 1) ctx.lineTo(pts[0][0] * CW + 0.01, pts[0][1] * CH);
  ctx.stroke();
}
function ptFromEvent(e) {
  const r = cvs.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
}
function attachCanvas() {
  cvs.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    cvs.setPointerCapture(e.pointerid ?? e.pointerId);
    isDrawing = true;
    const p = ptFromEvent(e);
    cur = { c: erasing ? "#ffffff" : penColor, w: (erasing ? penSize * 2.2 : penSize) / CW, pts: [p] };
    strokePath(cur);
  });
  cvs.addEventListener("pointermove", (e) => {
    if (!isDrawing || !cur) return;
    e.preventDefault();
    const p = ptFromEvent(e);
    const last = cur.pts[cur.pts.length - 1];
    cur.pts.push(p);
    // draw just the new segment
    ctx.strokeStyle = cur.c; ctx.lineWidth = cur.w * CW;
    ctx.beginPath();
    ctx.moveTo(last[0] * CW, last[1] * CH);
    ctx.lineTo(p[0] * CW, p[1] * CH);
    ctx.stroke();
    maybeEmitSeg(last, p, cur);
  });
  const end = () => {
    if (!isDrawing) return;
    isDrawing = false;
    if (cur && cur.pts.length) paths.push(cur);
    cur = null;
    scheduleAutosave();
    if (pendingRender) { pendingRender = false; reactToState(); }
  };
  cvs.addEventListener("pointerup", end);
  cvs.addEventListener("pointercancel", end);
  cvs.addEventListener("pointerleave", (e) => { if (isDrawing && (e.buttons === 0)) end(); });
}
// Emit live segments only for the shared team canvas.
function maybeEmitSeg(a, b, st) {
  if (!(state?.settings?.game === "sketch" && state.settings.mode === "teams")) return;
  socket.emit("dd_stroke", { a, b, c: st.c, w: st.w });
}
function applyRemoteSeg(seg, live) {
  // Store as a tiny 2-point stroke so redraws stay faithful.
  paths.push({ c: seg.c, w: seg.w, pts: [seg.a, seg.b] });
  if (live && ctx) {
    ctx.strokeStyle = seg.c; ctx.lineWidth = seg.w * CW;
    ctx.beginPath();
    ctx.moveTo(seg.a[0] * CW, seg.a[1] * CH);
    ctx.lineTo(seg.b[0] * CW, seg.b[1] * CH);
    ctx.stroke();
  }
}
function exportArt() {
  if (!cvs) return null;
  try { return cvs.toDataURL("image/jpeg", 0.82); } catch { return null; }
}
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => pushArt(false), 700);
}
function pushArt(done) {
  const dataUrl = exportArt();
  if (!dataUrl) return;
  socket.emit("dd_art", { dataUrl, done: !!done });
}

/* ================= tick ================= */
function startTick() {
  stopTick();
  phaseTick = setInterval(() => {
    const rp = remainingSecs();
    const el = document.getElementById("dd-timer");
    if (el && rp != null) { el.textContent = rp + t("secs"); el.classList.toggle("low", rp <= 10); }
    if (rp === 5) sfx.tick();
  }, 500);
}
function stopTick() { if (phaseTick) { clearInterval(phaseTick); phaseTick = null; } }

/* ================= events ================= */
$app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  const A = onAct[act];
  if (A) A(el);
});
$app.addEventListener("input", (e) => {
  if (e.target.id === "dd-name") drafts.name = e.target.value;
  else if (e.target.id === "dd-code") drafts.joinCode = e.target.value.toUpperCase();
  else if (e.target.id === "dd-guess") guessDraft = e.target.value;
  else if (e.target.dataset.act === "set-rounds") liveSetting("rounds", +e.target.value, e.target);
  else if (e.target.dataset.act === "set-drawtime") liveSetting("drawSeconds", +e.target.value, e.target);
});
$app.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "dd-guess") { e.preventDefault(); onAct["submit-guess"](); }
});
// Live-update the label next to a slider without a full re-render mid-drag.
function liveSetting(key, val, inputEl) {
  const label = inputEl.previousElementSibling;
  if (label && label.querySelector("b")) label.querySelector("b").textContent = key === "drawSeconds" ? val + t("secs") : val;
  socket.emit("dd_settings", { [key]: val });
}

const onAct = {
  lang: (el) => setLang(el.dataset.lang),
  "pre-create": () => { pre = "create"; fullRender(); },
  "pre-join": () => { pre = "join"; fullRender(); },
  "pre-back": () => { pre = "landing"; fullRender(); },
  "pick-color": (el) => { drafts.color = el.dataset.color; fullRender(); },
  "do-create": () => {
    drafts.name = (document.getElementById("dd-name")?.value || "").trim();
    if (!drafts.name) return toast(t("your_name"), "err");
    socket.emit("dd_create", { name: drafts.name, color: drafts.color, token: getToken(), lang }, joinCb);
  },
  "do-join": () => {
    drafts.name = (document.getElementById("dd-name")?.value || "").trim();
    drafts.joinCode = (document.getElementById("dd-code")?.value || "").trim().toUpperCase();
    if (!drafts.name || !drafts.joinCode) return toast(t("your_name"), "err");
    socket.emit("dd_join", { code: drafts.joinCode, name: drafts.name, color: drafts.color, token: getToken(), lang }, joinCb);
  },
  "copy-code": () => { if (state) navigator.clipboard?.writeText(state.code).then(() => toast(state.code)); },
  leave: () => { socket.emit("dd_leave"); clearSession(); state = null; pre = "landing"; fullRender(); },
  "join-team": (el) => socket.emit("dd_join_team", { team: +el.dataset.team }),
  "set-game": (el) => socket.emit("dd_settings", { game: el.dataset.v }),
  "set-mode": (el) => socket.emit("dd_settings", { mode: el.dataset.v }),
  "set-judging": (el) => socket.emit("dd_settings", { judging: el.dataset.v }),
  "set-relayteams": (el) => socket.emit("dd_settings", { relayTeams: el.dataset.v === "on" }),
  "set-diff": (el) => socket.emit("dd_settings", { difficulty: el.dataset.v }),
  "set-numteams": (el) => socket.emit("dd_settings", { numTeams: +el.dataset.v }),
  start: () => socket.emit("dd_start"),
  pen: (el) => { penColor = el.dataset.c; erasing = false; refreshTools(); },
  eraser: () => { erasing = !erasing; refreshTools(); },
  size: (el) => { penSize = +el.dataset.s; refreshTools(); },
  undo: () => { paths.pop(); redraw(); scheduleAutosave(); },
  clearcanvas: () => { paths = []; redraw(); socket.emit("dd_clear"); scheduleAutosave(); },
  "done-draw": () => { pushArt(true); iDrew = true; fullRender(); },
  "submit-draw": () => { relaySubmitted = true; const art = exportArt(); socket.emit("dd_relay_submit", { dataUrl: art }); fullRender(); },
  "submit-guess": () => {
    const v = (document.getElementById("dd-guess")?.value || "").trim();
    if (!v) return;
    guessDraft = v; relaySubmitted = true;
    socket.emit("dd_relay_submit", { text: v }); fullRender();
  },
  vote: (el) => socket.emit("dd_vote", { unitId: el.dataset.unit }),
  next: () => socket.emit("dd_next"),
  "end-phase": () => socket.emit("dd_end_phase"),
  again: () => socket.emit("dd_again"),
};

function refreshTools() {
  // Re-render just the toolbar buttons' selected state without touching canvas.
  document.querySelectorAll(".dd-pen").forEach((b) => b.classList.toggle("on", !erasing && b.dataset.c === penColor));
  document.querySelectorAll('[data-act="eraser"]').forEach((b) => b.classList.toggle("on", erasing));
  document.querySelectorAll(".dd-size").forEach((b) => b.classList.toggle("on", +b.dataset.s === penSize));
}

function joinCb(res) {
  if (res && res.ok) {
    saveSession({ code: res.code, playerId: res.playerId });
    state = res.state;
    myWord = null; relayTask = null;
    fullRender();
  } else {
    toast(tErr(res && res.error), "err");
  }
}

/* ---------------- boot ---------------- */
document.documentElement.lang = lang;
document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
fullRender();
