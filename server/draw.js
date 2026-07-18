// server/draw.js
// Authoritative engine for DOODLE DUEL — a two-in-one drawing party game that
// runs on its own Socket.IO namespace ("/draw").
//
// Two host-chosen games share the same room/lobby/account plumbing:
//
//   • SKETCH MATCH ("sketch") — the room is given a WORD and everyone sketches
//     it. Solo / Versus (each draws their own) / Teams (teammates share ONE live
//     canvas, strokes synced in real time). When every unit is done (or the
//     timer runs out) the drawings are judged either by the AI (Gemini scans
//     each drawing and scores 0–100 how well it matches the word) or by a player
//     VOTE. Most wins across the rounds = champion.
//
//   • PASS & GUESS ("relay") — a full Telestrations chain. Everyone gets a secret
//     word and draws it, then books rotate: the next player guesses the drawing,
//     the next draws that guess, and so on around the whole circle. Correct
//     guesses score points; teammates pool their points. At the end every book's
//     chain is revealed for the laughs.
//
// Secret words never leave the server except to the one player who must act on
// them (the drawer in relay, or everyone in sketch since the word is the shared
// prompt). Mirrors the thin socket style of server/words.js & server/sudoku.js.

import crypto from "crypto";
import { userFromToken, grantReward } from "./accounts.js";
import { pickWords, label } from "./draw-words.js";

const rooms = new Map(); // code -> DrawRoom
let ioNsp = null;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

export const AVATAR_COLORS = [
  "#FF3D77", "#22E0D6", "#FFC53D", "#8B5CF6",
  "#4ADE80", "#FB923C", "#38BDF8", "#F472B6",
  "#A3E635", "#E879F9", "#2DD4BF", "#FBBF24",
  "#60A5FA", "#F87171", "#C084FC", "#34D399",
];

// Team identities (index === player.team). Up to 6 teams.
export const TEAM_DEFS = [
  { color: "#FF3D77", name: { en: "Red", fr: "Rouge", ar: "الأحمر" } },
  { color: "#22E0D6", name: { en: "Teal", fr: "Turquoise", ar: "الفيروزي" } },
  { color: "#FFC53D", name: { en: "Gold", fr: "Or", ar: "الذهبي" } },
  { color: "#8B5CF6", name: { en: "Violet", fr: "Violet", ar: "البنفسجي" } },
  { color: "#4ADE80", name: { en: "Green", fr: "Vert", ar: "الأخضر" } },
  { color: "#FB923C", name: { en: "Orange", fr: "Orange", ar: "البرتقالي" } },
];

export const GAMES = ["sketch", "relay"];
export const SKETCH_MODES = ["solo", "versus", "teams"];
export const JUDGING = ["ai", "vote"];
export const DIFFICULTIES = ["easy", "medium", "hard"];

// Reward economy (per whole game).
const REWARD_WIN = { coins: 50, xp: 25 };
const REWARD_PLAYED = { coins: 10, xp: 5 };

// Phase durations (seconds). Clamped ranges the host can tune where noted.
const DEFAULTS = {
  drawSeconds: 90, // sketch draw + relay "draw" turns
  voteSeconds: 30,
  guessSeconds: 40, // relay "guess" turns
  collectMs: 2500, // grace to pull final canvases after a phase closes
};

// Relay point values.
const RELAY_GUESS_PTS = 3; // a correct guess
const RELAY_DRAW_PTS = 1; // your drawing got guessed correctly

// Cap synced stroke history so a marathon round can't grow unbounded.
const MAX_STROKES = 6000;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function randId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}
function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Normalize a word for guess comparison: lowercase, strip accents + Arabic
// diacritics, keep letters/digits only.
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ًͯ-ْ]/g, "")
    .replace(/[^a-z0-9ء-ي]+/g, "")
    .trim();
}

// ---------------------------------------------------------------------------
// AI judging — Gemini vision scores how well a drawing matches the target word.
// Returns { score: 0..100, guess: string } or null on any failure (caller then
// falls back to a neutral score / vote so the game never stalls).
// ---------------------------------------------------------------------------
async function scoreDrawingAI(dataUrl, wordEn) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !dataUrl) return null;
  const m = String(dataUrl).match(/^data:(image\/[a-z.+-]+);base64,(.*)$/i);
  if (!m) return null;
  const mime = m[1];
  const b64 = m[2];
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-2.0-flash";
  const prompt =
    `You are the judge in a Pictionary-style drawing game. The artist was asked ` +
    `to draw: "${wordEn}". Study the image and rate, from 0 to 100, how clearly ` +
    `and recognizably it depicts "${wordEn}" (0 = nothing like it, 100 = ` +
    `unmistakable). Be fair to rough doodles but reward clarity. Also state, in ` +
    `one or two words, what the drawing most looks like. Respond with ONLY minified ` +
    `JSON: {"score":<int>,"guess":"<text>"}`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: b64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    };
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(to);
    if (!res.ok) return null;
    const json = await res.json();
    const text =
      json?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
    let score = clampInt(parsed.score, 0, 100);
    const guess = String(parsed.guess || "").slice(0, 40);
    return { score, guess };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------
export function createDrawRoom(hostName, hostColor) {
  let code;
  do {
    let s = "";
    for (let i = 0; i < 4; i++)
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    code = `DOO-${s}`;
  } while (rooms.has(code));
  const room = new DrawRoom(code);
  const host = room.addPlayer(hostName, hostColor);
  room.hostId = host.id;
  rooms.set(code, room);
  return { room, player: host };
}

export function getDrawRoom(code) {
  if (!code) return null;
  return rooms.get(code.toUpperCase().trim()) || null;
}

export function sweepDrawRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyConnected = room.players.some((p) => p.connected);
    if (anyConnected) {
      room.emptySince = null;
    } else {
      room.emptySince = room.emptySince || now;
      if (now - room.emptySince > 20 * 60 * 1000) {
        room.clearTimer();
        rooms.delete(code);
      }
    }
  }
}

class DrawRoom {
  constructor(code) {
    this.code = code;
    this.hostId = null;
    // lobby | draw | collect | judge | vote | reveal | relay | relaybooks | finished
    this.status = "lobby";
    this.settings = {
      game: "sketch", // sketch | relay
      mode: "versus", // sketch: solo | versus | teams
      judging: "ai", // sketch: ai | vote
      relayTeams: false, // relay: pool points by team
      numTeams: 2,
      rounds: 3,
      difficulty: "medium",
      drawSeconds: DEFAULTS.drawSeconds,
    };
    this.players = [];

    this.round = 0;
    this.currentWord = null; // {en,fr,ar} — sketch prompt (not secret in sketch)
    this.usedWords = new Set();
    this.phaseEndsAt = null;
    this.timer = null;

    // sketch per-round
    this.art = {}; // unitId -> dataUrl
    this.strokes = {}; // unitId -> [seg,...] (teams live-sync history)
    this.finishedUnits = new Set();
    this.votes = {}; // voterPlayerId -> unitId
    this.roundScores = {}; // unitId -> {score, guess} (AI)
    this.roundResult = null; // reveal snapshot
    this.collecting = false;

    // relay
    this.relayOrder = []; // [playerId,...] fixed at start
    this.books = []; // [{ownerId, pages:[{type,text?,en?,image?,by,blank?,correct?}]}]
    this.relayTurn = 0;
    this.relayAssign = {}; // playerId -> {bookIndex, action, word?, image?}
    this.relayPending = new Set(); // playerIds still to submit this turn
    this.relayReveal = null;

    this.result = null;
    this.rewarded = false;
    this.emptySince = null;
  }

  // ---------- timers ----------
  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.phaseEndsAt = null;
  }
  setTimer(ms, cb) {
    this.clearTimer();
    this.phaseEndsAt = Date.now() + ms;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.phaseEndsAt = null;
      try {
        cb();
      } catch (err) {
        console.error("draw timer error:", err);
      }
    }, ms);
  }

  // ---------- players / teams ----------
  addPlayer(name, color) {
    const clean = (name || "Player").toString().trim().slice(0, 16) || "Player";
    const used = new Set(this.players.map((p) => p.color));
    const chosen =
      color && AVATAR_COLORS.includes(color) && !used.has(color)
        ? color
        : AVATAR_COLORS.find((c) => !used.has(c)) ||
          AVATAR_COLORS[this.players.length % AVATAR_COLORS.length];
    const player = {
      id: randId(),
      name: clean,
      color: chosen,
      team: this.smallestTeam(),
      connected: true,
      socketId: null,
      userId: null,
      joinedAt: Date.now(),
      // cumulative
      wins: 0, // sketch rounds won
      relayScore: 0, // relay points
    };
    this.players.push(player);
    return player;
  }

  getPlayer(id) {
    return this.players.find((p) => p.id === id) || null;
  }
  connectedPlayers() {
    return this.players.filter((p) => p.connected);
  }
  isTeams() {
    return this.settings.game === "sketch" && this.settings.mode === "teams";
  }
  usesTeams() {
    // Team grouping is active for sketch-teams OR relay with pooling on.
    return this.isTeams() || (this.settings.game === "relay" && this.settings.relayTeams);
  }
  teamMembers(team, connectedOnly = false) {
    return this.players.filter(
      (p) => p.team === team && (!connectedOnly || p.connected)
    );
  }
  smallestTeam() {
    let best = 0;
    let bestCount = Infinity;
    for (let t = 0; t < this.settings.numTeams; t++) {
      const c = this.teamMembers(t).length;
      if (c < bestCount) {
        bestCount = c;
        best = t;
      }
    }
    return best;
  }
  filledTeams() {
    const set = new Set();
    for (const p of this.connectedPlayers()) set.add(p.team);
    return [...set].filter((t) => t < this.settings.numTeams).sort((a, b) => a - b);
  }

  removePlayer(id) {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx === -1) return;
    this.players.splice(idx, 1);
    if (this.hostId === id) {
      const next = this.players.find((p) => p.connected) || this.players[0];
      this.hostId = next ? next.id : null;
    }
  }

  joinTeam(playerId, team) {
    if (this.status !== "lobby") return { error: "dd_err_locked" };
    const p = this.getPlayer(playerId);
    if (!p) return;
    p.team = clampInt(team, 0, this.settings.numTeams - 1);
  }

  // A player's "unit" for sketch: their team (teams mode) or themselves.
  unitIdFor(player) {
    return this.isTeams() ? `t${player.team}` : `p${player.id}`;
  }
  // The list of sketch units currently in play.
  units() {
    if (this.isTeams()) {
      return this.filledTeams().map((t) => ({
        id: `t${t}`,
        kind: "team",
        team: t,
        color: TEAM_DEFS[t].color,
        name: TEAM_DEFS[t].name,
        playerIds: this.teamMembers(t, true).map((p) => p.id),
      }));
    }
    return this.connectedPlayers().map((p) => ({
      id: `p${p.id}`,
      kind: "player",
      color: p.color,
      name: p.name,
      playerIds: [p.id],
    }));
  }
  unitById(id) {
    return this.units().find((u) => u.id === id) || null;
  }

  // ---------- settings ----------
  updateSettings(playerId, patch = {}) {
    if (playerId !== this.hostId) return { error: "dd_err_host_only" };
    if (this.status !== "lobby") return { error: "dd_err_locked" };
    const s = this.settings;
    if ("game" in patch && GAMES.includes(patch.game)) s.game = patch.game;
    if ("mode" in patch && SKETCH_MODES.includes(patch.mode)) s.mode = patch.mode;
    if ("judging" in patch && JUDGING.includes(patch.judging)) s.judging = patch.judging;
    if ("relayTeams" in patch) s.relayTeams = !!patch.relayTeams;
    if ("numTeams" in patch) {
      s.numTeams = clampInt(patch.numTeams, 2, TEAM_DEFS.length);
      for (const p of this.players) {
        if (p.team >= s.numTeams) p.team = this.smallestTeam();
      }
    }
    if ("rounds" in patch) s.rounds = clampInt(patch.rounds, 1, 10);
    if ("difficulty" in patch && DIFFICULTIES.includes(patch.difficulty))
      s.difficulty = patch.difficulty;
    if ("drawSeconds" in patch) s.drawSeconds = clampInt(patch.drawSeconds, 30, 240);
    // Solo can't be voted (only one artist) — force AI judging.
    if (s.mode === "solo") s.judging = "ai";
  }

  // ---------- game flow ----------
  startGame(playerId) {
    if (playerId !== this.hostId) return { error: "dd_err_host_only" };
    if (this.status !== "lobby") return { error: "dd_err_locked" };
    const n = this.connectedPlayers().length;

    if (this.settings.game === "sketch") {
      if (this.settings.mode === "versus" && n < 1) return { error: "dd_err_need_players" };
      if (this.settings.mode === "teams") {
        if (n < 2) return { error: "dd_err_need_players" };
        if (this.filledTeams().length < 2) return { error: "dd_err_need_teams" };
      }
    } else {
      if (n < 2) return { error: "dd_err_need_relay" };
      if (this.settings.relayTeams && this.filledTeams().length < 2)
        return { error: "dd_err_need_teams" };
    }

    for (const p of this.players) {
      p.wins = 0;
      p.relayScore = 0;
    }
    this.usedWords = new Set();
    this.round = 0;
    this.rewarded = false;
    this.result = null;

    return this.settings.game === "relay" ? this.startRelay() : this.startSketchRound();
  }

  // ===================== SKETCH MATCH =====================
  startSketchRound() {
    const picks = pickWords(this.settings.difficulty, 1, this.usedWords);
    const word = picks[0];
    if (!word) return { error: "dd_err_glitch" };
    this.currentWord = word;
    this.usedWords.add(word.en);

    this.art = {};
    this.strokes = {};
    this.finishedUnits = new Set();
    this.votes = {};
    this.roundScores = {};
    this.roundResult = null;
    this.collecting = false;
    this.status = "draw";

    this.setTimer(this.settings.drawSeconds * 1000, () => this.closeDrawing());

    // Hand each drawer the localized prompt privately (kept out of shared state
    // so the client HUD can style it, but it isn't secret in sketch).
    for (const p of this.connectedPlayers()) {
      this.emitTo(p, "dd_word", {
        round: this.round,
        word: label(word, this.langOf(p)),
        seconds: this.settings.drawSeconds,
        unitId: this.unitIdFor(p),
        teammates: this.isTeams()
          ? this.teamMembers(p.team, true).filter((m) => m.id !== p.id).map((m) => m.id)
          : [],
      });
    }
    return { ok: true };
  }

  // Store a unit's current/final canvas. `done` flags the unit as finished.
  submitArt(playerId, dataUrl, done) {
    if (this.status !== "draw" && this.status !== "collect")
      return { error: "dd_err_not_drawing" };
    const p = this.getPlayer(playerId);
    if (!p || !p.connected) return {};
    const uid = this.unitIdFor(p);
    if (typeof dataUrl === "string" && dataUrl.startsWith("data:image")) {
      // Guard against absurd payloads (~a few hundred KB is plenty for a doodle).
      if (dataUrl.length < 2_000_000) this.art[uid] = dataUrl;
    }
    if (done && this.status === "draw") {
      this.finishedUnits.add(uid);
      // Every in-play unit finished → close early.
      const allIds = this.units().map((u) => u.id);
      if (allIds.length && allIds.every((id) => this.finishedUnits.has(id))) {
        this.closeDrawing();
      } else {
        this.broadcast();
      }
    }
    return { ok: true };
  }

  // Live stroke from one teammate → relay to the rest of the team's canvas.
  relayStroke(playerId, seg) {
    if (this.status !== "draw" || !this.isTeams()) return;
    const p = this.getPlayer(playerId);
    if (!p || !p.connected) return;
    const uid = this.unitIdFor(p);
    const hist = (this.strokes[uid] = this.strokes[uid] || []);
    if (hist.length < MAX_STROKES) hist.push(seg);
    for (const m of this.teamMembers(p.team, true)) {
      if (m.id !== playerId && m.socketId)
        ioNsp.to(m.socketId).emit("dd_stroke", seg);
    }
  }
  relayClear(playerId) {
    if (this.status !== "draw" || !this.isTeams()) return;
    const p = this.getPlayer(playerId);
    if (!p || !p.connected) return;
    const uid = this.unitIdFor(p);
    this.strokes[uid] = [];
    for (const m of this.teamMembers(p.team, true)) {
      if (m.id !== playerId && m.socketId) ioNsp.to(m.socketId).emit("dd_clear");
    }
  }

  closeDrawing() {
    if (this.status !== "draw") return;
    this.clearTimer();
    const allIds = this.units().map((u) => u.id);
    const haveAll = allIds.every((id) => this.art[id]);
    if (haveAll) return this.finalizeDrawing();
    // Ask any still-drawing clients to push their current canvas, brief grace.
    this.status = "collect";
    this.collecting = true;
    this.emitRoom("dd_collect", {});
    this.broadcast();
    this.setTimer(DEFAULTS.collectMs, () => this.finalizeDrawing());
  }

  finalizeDrawing() {
    if (this.status !== "draw" && this.status !== "collect") return;
    this.clearTimer();
    this.collecting = false;
    const units = this.units();
    // Trivial case: a single unit just wins the round outright.
    if (units.length <= 1) {
      return this.sketchReveal(units[0]?.id || null);
    }
    if (this.settings.judging === "vote") return this.beginVote();
    return this.beginJudge();
  }

  beginVote() {
    this.status = "vote";
    this.votes = {};
    this.setTimer(DEFAULTS.voteSeconds * 1000, () => this.tallyVotes());
    this.broadcast();
  }

  castVote(playerId, unitId) {
    if (this.status !== "vote") return { error: "dd_err_not_voting" };
    const p = this.getPlayer(playerId);
    if (!p || !p.connected) return {};
    const unit = this.unitById(unitId);
    if (!unit) return { error: "dd_err_glitch" };
    // Can't vote for your own drawing.
    if (unit.playerIds.includes(p.id)) return { error: "dd_err_own_vote" };
    this.votes[p.id] = unitId;
    // All eligible voters in → tally now.
    const eligible = this.connectedPlayers().filter((pl) => {
      const u = this.unitById(this.unitIdFor(pl));
      // A voter is eligible if there is at least one OTHER unit to vote for.
      return this.units().some((x) => x.id !== (u && u.id));
    });
    if (eligible.every((pl) => this.votes[pl.id])) this.tallyVotes();
    else this.broadcast();
    return { ok: true };
  }

  tallyVotes() {
    if (this.status !== "vote") return;
    this.clearTimer();
    const tally = {};
    for (const uid of Object.values(this.votes)) tally[uid] = (tally[uid] || 0) + 1;
    let best = -1;
    let winner = null;
    for (const u of this.units()) {
      const v = tally[u.id] || 0;
      if (v > best) {
        best = v;
        winner = u.id;
      }
    }
    this.roundResult = { votes: tally };
    this.sketchReveal(winner);
  }

  async beginJudge() {
    this.status = "judge";
    this.broadcast();
    const units = this.units();
    const scored = await Promise.all(
      units.map(async (u) => {
        const r = await scoreDrawingAI(this.art[u.id], this.currentWord.en);
        return { id: u.id, r };
      })
    );
    // If the room was reset/left while we awaited, bail.
    if (this.status !== "judge") return;
    let anyAI = false;
    for (const s of scored) {
      if (s.r) {
        anyAI = true;
        this.roundScores[s.id] = s.r;
      } else {
        this.roundScores[s.id] = { score: this.art[s.id] ? 1 : 0, guess: "" };
      }
    }
    // If the AI failed for everyone (no key / network), fall back to a vote so
    // the round still resolves fairly instead of by a coin-flip.
    if (!anyAI && units.length > 1) return this.beginVote();

    let best = -1;
    let winner = null;
    for (const u of units) {
      const sc = this.roundScores[u.id]?.score || 0;
      if (sc > best) {
        best = sc;
        winner = u.id;
      }
    }
    this.sketchReveal(winner);
  }

  sketchReveal(winnerUnitId) {
    this.clearTimer();
    this.status = "reveal";
    const winner = winnerUnitId ? this.unitById(winnerUnitId) : null;
    if (winner) {
      for (const pid of winner.playerIds) {
        const p = this.getPlayer(pid);
        if (p) p.wins += 1;
      }
    }
    this.roundResult = {
      word: this.currentWord, // reveal the English + localized labels
      judging: this.settings.judging,
      winnerUnitId: winnerUnitId,
      artworks: this.units().map((u) => ({
        id: u.id,
        name: u.name,
        color: u.color,
        kind: u.kind,
        art: this.art[u.id] || null,
        score: this.roundScores[u.id]?.score ?? null,
        guess: this.roundScores[u.id]?.guess ?? null,
        votes: this.roundResult?.votes?.[u.id] || 0,
      })),
    };
    this.emitRoom("dd_reveal", this.roundResult);
    this.broadcast();
  }

  nextRound(playerId) {
    if (playerId !== this.hostId) return { error: "dd_err_host_only" };
    if (this.status !== "reveal") return;
    if (this.round + 1 >= this.settings.rounds) return this.finishGame();
    this.round += 1;
    return this.startSketchRound();
  }

  // Host ends the drawing phase for everyone right now.
  endPhaseEarly(playerId) {
    if (playerId !== this.hostId) return { error: "dd_err_host_only" };
    if (this.status === "draw") return this.closeDrawing();
    if (this.status === "vote") return this.tallyVotes();
    if (this.status === "relay") return this.closeRelayTurn();
    return {};
  }

  // ===================== PASS & GUESS (relay) =====================
  startRelay() {
    const order = shuffle(this.connectedPlayers().map((p) => p.id));
    this.relayOrder = order;
    const P = order.length;
    const words = pickWords(this.settings.difficulty, P, this.usedWords);
    this.books = order.map((ownerId, i) => {
      const w = words[i % words.length];
      this.usedWords.add(w.en);
      return {
        ownerId,
        word: w, // the secret starting word (revealed only at the end)
        pages: [{ type: "word", text: w.en, en: w.en, word: w, by: null, seed: true }],
      };
    });
    this.relayTurn = 0;
    this.relayReveal = null;
    this.beginRelayTurn();
    return { ok: true };
  }

  relayAction() {
    // Turn 0 draws the seed word; then alternate guess/draw.
    return this.relayTurn % 2 === 0 ? "draw" : "guess";
  }
  relayTotalTurns() {
    return this.relayOrder.length; // each of P players touches each book once
  }

  beginRelayTurn() {
    const P = this.relayOrder.length;
    const t = this.relayTurn;
    const action = this.relayAction();
    this.relayAssign = {};
    this.relayPending = new Set();
    const seconds = action === "draw" ? this.settings.drawSeconds : DEFAULTS.guessSeconds;
    this.status = "relay";

    for (let k = 0; k < P; k++) {
      const pid = this.relayOrder[k];
      const p = this.getPlayer(pid);
      const bookIndex = ((k - t) % P + P) % P;
      const book = this.books[bookIndex];
      const last = book.pages[book.pages.length - 1];
      const assign = { bookIndex, action };
      if (action === "draw") {
        // Drawing the word on the last page.
        assign.word = p ? label(last.word || { en: last.text }, this.langOf(p)) : last.text;
      } else {
        // Guessing the drawing on the last page.
        assign.image = last.image || null;
      }
      this.relayAssign[pid] = assign;
      if (p && p.connected) {
        this.relayPending.add(pid);
        this.emitTo(p, "dd_relay_turn", {
          turn: t,
          totalTurns: this.relayTotalTurns(),
          action,
          seconds,
          word: assign.word || null,
          image: assign.image || null,
        });
      }
    }
    this.setTimer(seconds * 1000, () => this.closeRelayTurn());
    this.broadcast();
  }

  submitRelay(playerId, payload = {}) {
    if (this.status !== "relay") return { error: "dd_err_not_relay" };
    const assign = this.relayAssign[playerId];
    if (!assign) return {};
    if (!this.relayPending.has(playerId)) return { error: "dd_err_already" };
    const book = this.books[assign.bookIndex];
    const p = this.getPlayer(playerId);

    if (assign.action === "draw") {
      const dataUrl = payload.dataUrl;
      const ok = typeof dataUrl === "string" && dataUrl.startsWith("data:image") && dataUrl.length < 2_000_000;
      book.pages.push({ type: "drawing", image: ok ? dataUrl : null, by: playerId, blank: !ok });
    } else {
      const text = String(payload.text || "").slice(0, 40).trim();
      // The word this drawing was made from lives two pages back.
      const srcWord = book.pages[book.pages.length - 2];
      const correct =
        !!text &&
        (norm(text) === norm(srcWord?.en) ||
          norm(text) === norm(srcWord?.text) ||
          (srcWord?.word && norm(text) === norm(label(srcWord.word, this.langOf(p)))));
      book.pages.push({ type: "word", text, by: playerId, blank: !text, correct });
      if (correct && p) {
        p.relayScore += RELAY_GUESS_PTS;
        // The artist whose drawing was understood shares a point.
        const drawing = book.pages[book.pages.length - 2];
        const artist = drawing && this.getPlayer(drawing.by);
        if (artist) artist.relayScore += RELAY_DRAW_PTS;
      }
    }

    this.relayPending.delete(playerId);
    if (this.relayPending.size === 0) this.closeRelayTurn();
    else this.broadcast();
    return { ok: true };
  }

  closeRelayTurn() {
    if (this.status !== "relay") return;
    this.clearTimer();
    // Anyone who didn't submit leaves a blank page so books stay aligned.
    for (const pid of this.relayPending) {
      const assign = this.relayAssign[pid];
      if (!assign) continue;
      const book = this.books[assign.bookIndex];
      if (assign.action === "draw")
        book.pages.push({ type: "drawing", image: null, by: pid, blank: true });
      else book.pages.push({ type: "word", text: "", by: pid, blank: true, correct: false });
    }
    this.relayPending = new Set();
    this.relayTurn += 1;
    if (this.relayTurn >= this.relayTotalTurns()) return this.finishRelay();
    this.beginRelayTurn();
  }

  finishRelay() {
    this.clearTimer();
    this.status = "relaybooks";
    // Build the shareable book chains for the reveal gallery.
    this.relayReveal = {
      books: this.books.map((b) => {
        const owner = this.getPlayer(b.ownerId);
        return {
          owner: owner ? { name: owner.name, color: owner.color } : null,
          seed: b.word, // {en,fr,ar}
          pages: b.pages.map((pg) => {
            const by = pg.by ? this.getPlayer(pg.by) : null;
            return {
              type: pg.type,
              text: pg.type === "word" ? pg.text : null,
              image: pg.type === "drawing" ? pg.image || null : null,
              blank: !!pg.blank,
              correct: pg.type === "word" ? !!pg.correct : null,
              seed: !!pg.seed,
              by: by ? { name: by.name, color: by.color } : null,
            };
          }),
        };
      }),
    };
    this.result = this.buildResult();
    this.awardRewards();
    this.emitRoom("dd_relay_reveal", { reveal: this.relayReveal, result: this.result });
    this.broadcast();
  }

  // ===================== results / rewards =====================
  finishGame() {
    this.clearTimer();
    this.status = "finished";
    this.result = this.buildResult();
    this.awardRewards();
    this.emitRoom("dd_gameover", { result: this.result });
    this.broadcast();
    return { ok: true };
  }

  endByHost(playerId) {
    if (playerId !== this.hostId) return { error: "dd_err_host_only" };
    if (this.status === "lobby" || this.status === "finished") return;
    return this.finishGame();
  }

  buildResult() {
    const relay = this.settings.game === "relay";
    if (this.usesTeams()) {
      const standings = this.filledTeams()
        .map((t) => {
          const members = this.teamMembers(t);
          const score = relay
            ? members.reduce((s, m) => s + m.relayScore, 0)
            : members.reduce((s, m) => s + m.wins, 0);
          return {
            kind: "team",
            team: t,
            color: TEAM_DEFS[t].color,
            name: TEAM_DEFS[t].name,
            score,
            members: members.map((p) => ({
              id: p.id,
              name: p.name,
              color: p.color,
              score: relay ? p.relayScore : p.wins,
            })),
          };
        })
        .sort((a, b) => b.score - a.score);
      return { game: this.settings.game, teams: true, standings, champion: standings[0] || null };
    }
    const standings = this.players
      .map((p) => ({
        kind: "player",
        id: p.id,
        name: p.name,
        color: p.color,
        score: relay ? p.relayScore : p.wins,
      }))
      .sort((a, b) => b.score - a.score);
    return { game: this.settings.game, teams: false, standings, champion: standings[0] || null };
  }

  awardRewards() {
    if (this.rewarded) return;
    this.rewarded = true;
    const champ = this.result?.champion;
    const isWinner = (p) => {
      if (!champ || (champ.score || 0) <= 0) return false;
      return champ.kind === "team" ? p.team === champ.team : p.id === champ.id;
    };
    for (const p of this.players) {
      if (!p.userId) continue;
      const won = isWinner(p);
      const r = won ? REWARD_WIN : REWARD_PLAYED;
      const res = grantReward(p.userId, {
        coinGain: r.coins,
        xpGain: r.xp,
        won,
        played: true,
      });
      if (res && p.socketId && ioNsp) {
        ioNsp.to(p.socketId).emit("dd_reward", {
          coins: r.coins,
          xp: r.xp,
          won,
          profile: res.profile,
          unlocked: res.unlocked,
        });
      }
    }
  }

  playAgain(playerId) {
    if (playerId !== this.hostId) return { error: "dd_err_host_only" };
    this.clearTimer();
    this.status = "lobby";
    this.round = 0;
    this.currentWord = null;
    this.usedWords = new Set();
    this.art = {};
    this.strokes = {};
    this.finishedUnits = new Set();
    this.votes = {};
    this.roundScores = {};
    this.roundResult = null;
    this.relayOrder = [];
    this.books = [];
    this.relayTurn = 0;
    this.relayAssign = {};
    this.relayPending = new Set();
    this.relayReveal = null;
    this.result = null;
    this.rewarded = false;
    for (const p of this.players) {
      p.wins = 0;
      p.relayScore = 0;
    }
  }

  // ---------- serialization ----------
  langOf(player) {
    return player && player.lang && ["en", "fr", "ar"].includes(player.lang)
      ? player.lang
      : "en";
  }

  publicPlayer(p) {
    const uid = this.unitIdFor(p);
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      team: p.team,
      connected: p.connected,
      isHost: p.id === this.hostId,
      wins: p.wins,
      relayScore: p.relayScore,
      finished: this.finishedUnits.has(uid),
      voted: this.status === "vote" ? !!this.votes[p.id] : false,
      submitted:
        this.status === "relay" ? !this.relayPending.has(p.id) && !!this.relayAssign[p.id] : false,
    };
  }

  teamsState() {
    const out = [];
    for (let t = 0; t < this.settings.numTeams; t++) {
      const def = TEAM_DEFS[t];
      out.push({
        index: t,
        color: def.color,
        name: def.name,
        members: this.teamMembers(t).map((p) => p.id),
        wins: this.teamMembers(t).reduce((s, m) => s + m.wins, 0),
        relayScore: this.teamMembers(t).reduce((s, m) => s + m.relayScore, 0),
      });
    }
    return out;
  }

  // Artworks visible to voters during the vote phase (id, art, no scores yet).
  voteBoard() {
    if (this.status !== "vote") return null;
    return this.units().map((u) => ({
      id: u.id,
      name: u.name,
      color: u.color,
      kind: u.kind,
      art: this.art[u.id] || null,
    }));
  }

  toState() {
    return {
      code: this.code,
      hostId: this.hostId,
      status: this.status,
      settings: this.settings,
      round: this.round,
      totalRounds: this.settings.rounds,
      players: this.players.map((p) => this.publicPlayer(p)),
      teams: this.teamsState(),
      phaseEndsAt: this.phaseEndsAt,
      // sketch: the prompt is shown during the round (not secret in sketch).
      word:
        this.settings.game === "sketch" && ["draw", "collect", "judge", "vote"].includes(this.status)
          ? null // localized word is delivered per-socket via dd_word
          : null,
      relayInfo:
        this.settings.game === "relay" && this.status === "relay"
          ? { turn: this.relayTurn, totalTurns: this.relayTotalTurns(), action: this.relayAction() }
          : null,
      voteBoard: this.voteBoard(),
      roundResult: this.status === "reveal" ? this.roundResult : null,
      result: this.result,
    };
  }

  // ---------- emit ----------
  broadcast() {
    if (ioNsp) ioNsp.to(this.code).emit("dd_state", this.toState());
  }
  emitRoom(ev, data) {
    if (ioNsp) ioNsp.to(this.code).emit(ev, data);
  }
  emitTo(player, ev, data) {
    if (ioNsp && player && player.socketId) ioNsp.to(player.socketId).emit(ev, data);
  }

  // Re-send a reconnecting player whatever their current phase needs.
  resync(player) {
    if (this.status === "draw" || this.status === "collect") {
      if (this.settings.game === "sketch") {
        this.emitTo(player, "dd_word", {
          round: this.round,
          word: label(this.currentWord, this.langOf(player)),
          seconds: this.settings.drawSeconds,
          unitId: this.unitIdFor(player),
          teammates: this.isTeams()
            ? this.teamMembers(player.team, true).filter((m) => m.id !== player.id).map((m) => m.id)
            : [],
          strokes: this.isTeams() ? this.strokes[this.unitIdFor(player)] || [] : [],
        });
      }
    } else if (this.status === "relay") {
      const assign = this.relayAssign[player.id];
      if (assign) {
        this.emitTo(player, "dd_relay_turn", {
          turn: this.relayTurn,
          totalTurns: this.relayTotalTurns(),
          action: assign.action,
          seconds:
            assign.action === "draw" ? this.settings.drawSeconds : DEFAULTS.guessSeconds,
          word: assign.word || null,
          image: assign.image || null,
          already: !this.relayPending.has(player.id),
        });
      }
    } else if (this.status === "reveal" && this.roundResult) {
      this.emitTo(player, "dd_reveal", this.roundResult);
    } else if (this.status === "relaybooks" && this.relayReveal) {
      this.emitTo(player, "dd_relay_reveal", { reveal: this.relayReveal, result: this.result });
    }
  }
}

// ---------------------------------------------------------------------------
// Socket wiring — its own namespace, thin like SUDOKU/WORDS.
// ---------------------------------------------------------------------------
export function attachDrawIO(io, serverUrl) {
  ioNsp = io.of("/draw");

  const ack = (fn, payload) => {
    if (typeof fn === "function") fn(payload);
  };

  function ctx(socket) {
    const code = socket.data.code;
    const room = code ? getDrawRoom(code) : null;
    const player = room ? room.getPlayer(socket.data.playerId) : null;
    return { room, player };
  }

  function bind(socket, room, player, lang) {
    socket.data.code = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    player.socketId = socket.id;
    player.connected = true;
    if (lang && ["en", "fr", "ar"].includes(lang)) player.lang = lang;
  }

  function linkAccount(player, token) {
    const user = userFromToken(token);
    if (user) player.userId = user.id;
  }

  function handle(socket, fn) {
    try {
      const { room, player } = ctx(socket);
      if (!room || !player) {
        socket.emit("dd_notice", { type: "error", message: "dd_err_no_room" });
        return;
      }
      const res = fn(room, player) || {};
      if (res.error) socket.emit("dd_notice", { type: "error", message: res.error });
      room.broadcast();
    } catch (err) {
      console.error("draw handler error:", err);
      socket.emit("dd_notice", { type: "error", message: "dd_err_glitch" });
    }
  }

  ioNsp.on("connection", (socket) => {
    socket.emit("dd_config", { colors: AVATAR_COLORS, serverUrl });

    socket.on("dd_create", (payload = {}, cb) => {
      try {
        const { room, player } = createDrawRoom(payload.name, payload.color);
        bind(socket, room, player, payload.lang);
        linkAccount(player, payload.token);
        ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
        room.broadcast();
      } catch (err) {
        console.error(err);
        ack(cb, { error: "dd_err_create" });
      }
    });

    socket.on("dd_join", (payload = {}, cb) => {
      try {
        const room = getDrawRoom(payload.code);
        if (!room) return ack(cb, { error: "dd_err_no_code" });

        if (payload.playerId) {
          const existing = room.getPlayer(payload.playerId);
          if (existing) {
            bind(socket, room, existing, payload.lang);
            linkAccount(existing, payload.token);
            ack(cb, { ok: true, code: room.code, playerId: existing.id, state: room.toState() });
            room.resync(existing);
            room.broadcast();
            return;
          }
        }

        if (room.status !== "lobby") return ack(cb, { error: "dd_err_started" });
        const player = room.addPlayer(payload.name, payload.color);
        bind(socket, room, player, payload.lang);
        linkAccount(player, payload.token);
        ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
        room.broadcast();
      } catch (err) {
        console.error(err);
        ack(cb, { error: "dd_err_join" });
      }
    });

    socket.on("dd_join_team", ({ team } = {}) =>
      handle(socket, (room, player) => room.joinTeam(player.id, team))
    );
    socket.on("dd_settings", (patch = {}) =>
      handle(socket, (room, player) => room.updateSettings(player.id, patch))
    );
    socket.on("dd_start", () =>
      handle(socket, (room, player) => room.startGame(player.id))
    );

    // Canvas push (autosave / on Done). Resolves via ack for a quiet response.
    socket.on("dd_art", ({ dataUrl, done } = {}, cb) => {
      const { room, player } = ctx(socket);
      if (!room || !player) return ack(cb, { error: "dd_err_no_room" });
      ack(cb, room.submitArt(player.id, dataUrl, done));
    });

    // Live team drawing.
    socket.on("dd_stroke", (seg = {}) => {
      const { room, player } = ctx(socket);
      if (room && player) room.relayStroke(player.id, seg);
    });
    socket.on("dd_clear", () => {
      const { room, player } = ctx(socket);
      if (room && player) room.relayClear(player.id);
    });

    socket.on("dd_vote", ({ unitId } = {}) =>
      handle(socket, (room, player) => room.castVote(player.id, unitId))
    );

    // Relay page submit (draw or guess).
    socket.on("dd_relay_submit", (payload = {}, cb) => {
      const { room, player } = ctx(socket);
      if (!room || !player) return ack(cb, { error: "dd_err_no_room" });
      ack(cb, room.submitRelay(player.id, payload));
    });

    socket.on("dd_next", () =>
      handle(socket, (room, player) => room.nextRound(player.id))
    );
    socket.on("dd_end_phase", () =>
      handle(socket, (room, player) => room.endPhaseEarly(player.id))
    );
    socket.on("dd_end", () =>
      handle(socket, (room, player) => room.endByHost(player.id))
    );
    socket.on("dd_again", () =>
      handle(socket, (room, player) => room.playAgain(player.id))
    );

    socket.on("dd_leave", () => {
      const { room, player } = ctx(socket);
      if (room && player) {
        room.removePlayer(player.id);
        socket.leave(room.code);
        room.broadcast();
      }
      socket.data.code = null;
      socket.data.playerId = null;
    });

    socket.on("disconnect", () => {
      const { room, player } = ctx(socket);
      if (!room || !player) return;
      player.connected = false;
      player.socketId = null;
      if (room.hostId === player.id) {
        const next = room.connectedPlayers()[0];
        if (next) room.hostId = next.id;
      }
      room.broadcast();
    });
  });
}
