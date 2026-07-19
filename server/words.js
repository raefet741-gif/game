// server/words.js
// Authoritative engine for WORD WONDERS — a Words-of-Wonders-style word race.
//
// Each ROUND, the server picks a base word (6–7 letters), finds every dictionary
// word spellable from its letters, and lays a subset into an interlocking
// crossword. Everyone in the room races the SAME puzzle. You swipe the letter
// wheel to form words; forming a crossword word reveals it, forming any other
// real word earns bonus coins.
//
// Three modes (host picks in the lobby):
//   • solo    — play alone across N rounds (time attack / practice).
//   • versus  — every player has their own board; the FIRST to complete the
//               crossword wins the round.
//   • teams   — teammates share one board (more hands = faster); the first TEAM
//               to complete wins the round.
// Across N rounds, most round-wins = champion. Winners earn coins + XP.
//
// The answers NEVER leave the server — clients only get slot positions/lengths
// and the letters that they themselves have already found. Runs on its own
// Socket.IO namespace ("/words").

import crypto from "crypto";
import { userFromToken, grantReward, spendCoins } from "./accounts.js";
import { WORD_LIST } from "./words-data.js";

// The dictionary is English. Exposed to clients (in state) so the board can show
// players which language the puzzle words are in — change this if the word list
// is ever swapped for another language.
export const PUZZLE_LANG = "en";

// Solo-only power-up cards, paid for with coins:
//   • hint   — reveals a single hidden letter of a word (a small clue).
//   • reveal — solves one whole word for you.
export const POWERUPS = {
  hint: { cost: 8 },
  reveal: { cost: 20 },
};

const rooms = new Map(); // code -> WordsRoom
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

export const MODES = ["solo", "versus", "teams"];

// Difficulty → base word length + how many crossword words to aim for + grid cap.
export const DIFFICULTIES = {
  easy: { baseLen: 6, minWords: 4, maxWords: 6, maxGrid: 9 },
  medium: { baseLen: 7, minWords: 5, maxWords: 8, maxGrid: 10 },
  hard: { baseLen: 7, minWords: 6, maxWords: 10, maxGrid: 11 },
};

// Reward economy (per whole game).
const REWARD_WIN = { coins: 50, xp: 25 };
const REWARD_PLAYED = { coins: 10, xp: 5 };

// ---------------------------------------------------------------------------
// Dictionary — clean, de-duplicated, length 3–7, indexed by base length.
// ---------------------------------------------------------------------------
const DICT = new Set(
  WORD_LIST.filter((w) => /^[a-z]+$/.test(w) && w.length >= 3 && w.length <= 7)
);
const DICT_ARR = [...DICT];
const BASES = {}; // len -> array of candidate base words
for (const w of DICT_ARR) {
  (BASES[w.length] = BASES[w.length] || []).push(w);
}

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

// Can `word` be spelled using the multiset of letters in `pool`?
function canForm(word, counts) {
  const c = { ...counts };
  for (const ch of word) {
    if (!c[ch]) return false;
    c[ch]--;
  }
  return true;
}
function letterCounts(word) {
  const c = {};
  for (const ch of word) c[ch] = (c[ch] || 0) + 1;
  return c;
}

// The "r,c" grid keys every cell of a placed slot occupies.
function slotCells(slot) {
  const dr = slot.dir === "V" ? 1 : 0;
  const dc = slot.dir === "H" ? 1 : 0;
  const out = [];
  for (let i = 0; i < slot.word.length; i++) {
    out.push(`${slot.row + dr * i},${slot.col + dc * i}`);
  }
  return out;
}

// Every dictionary word (len 3..base.length) spellable from base's letters,
// longest first, base word guaranteed at the front.
function formableWords(base) {
  const counts = letterCounts(base);
  const out = [];
  for (const w of DICT_ARR) {
    if (w.length < 3 || w.length > base.length) continue;
    if (w === base) continue;
    if (canForm(w, counts)) out.push(w);
  }
  out.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  return [base, ...out];
}

// ---------------------------------------------------------------------------
// Crossword builder. Greedy interlocking placement: the longest word goes down
// first, then each next word is placed crossing an existing letter, with clean
// spacing rules so no unintended adjacent words appear. Returns a normalized
// { rows, cols, slots:[{id,row,col,dir,word}] }.
// ---------------------------------------------------------------------------
function buildCrossword(words, maxWords) {
  const placed = [];
  const cells = new Map(); // "r,c" -> letter
  const K = (r, c) => r + "," + c;

  // Returns number of crossings if placement is legal, else -1.
  function fits(word, row, col, dir) {
    const dr = dir === "V" ? 1 : 0;
    const dc = dir === "H" ? 1 : 0;
    let crossings = 0;
    // Cells immediately before the start / after the end must be empty.
    if (cells.has(K(row - dr, col - dc))) return -1;
    if (cells.has(K(row + dr * word.length, col + dc * word.length))) return -1;
    for (let i = 0; i < word.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const existing = cells.get(K(r, c));
      if (existing !== undefined) {
        if (existing !== word[i]) return -1;
        crossings++;
      } else {
        // Non-crossing cell: perpendicular neighbours must be empty.
        const p1 = dir === "H" ? K(r - 1, c) : K(r, c - 1);
        const p2 = dir === "H" ? K(r + 1, c) : K(r, c + 1);
        if (cells.has(p1) || cells.has(p2)) return -1;
      }
    }
    return crossings;
  }

  function put(word, row, col, dir) {
    const dr = dir === "V" ? 1 : 0;
    const dc = dir === "H" ? 1 : 0;
    for (let i = 0; i < word.length; i++) {
      cells.set(K(row + dr * i, col + dc * i), word[i]);
    }
    placed.push({ word, row, col, dir });
  }

  put(words[0], 0, 0, "H");

  for (let wi = 1; wi < words.length && placed.length < maxWords; wi++) {
    const w = words[wi];
    let best = null;
    let bestScore = -1;
    for (const pl of placed) {
      for (let ci = 0; ci < pl.word.length; ci++) {
        const letter = pl.word[ci];
        const pr = pl.row + (pl.dir === "V" ? ci : 0);
        const pc = pl.col + (pl.dir === "H" ? ci : 0);
        const dir = pl.dir === "H" ? "V" : "H";
        for (let li = 0; li < w.length; li++) {
          if (w[li] !== letter) continue;
          const row = dir === "V" ? pr - li : pr;
          const col = dir === "H" ? pc - li : pc;
          const cross = fits(w, row, col, dir);
          if (cross > bestScore) {
            bestScore = cross;
            best = { word: w, row, col, dir };
          }
        }
      }
    }
    if (best) put(best.word, best.row, best.col, best.dir);
  }

  // Normalize coordinates so the grid starts at (0,0).
  let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  for (const k of cells.keys()) {
    const [r, c] = k.split(",").map(Number);
    minR = Math.min(minR, r);
    minC = Math.min(minC, c);
    maxR = Math.max(maxR, r);
    maxC = Math.max(maxC, c);
  }
  const slots = placed.map((p, i) => ({
    id: i,
    row: p.row - minR,
    col: p.col - minC,
    dir: p.dir,
    word: p.word,
  }));
  return { rows: maxR - minR + 1, cols: maxC - minC + 1, slots };
}

// Build one full puzzle for a difficulty, or null if this attempt was poor.
function tryPuzzle(cfg) {
  const pool = BASES[cfg.baseLen];
  if (!pool || !pool.length) return null;
  const base = pool[Math.floor(Math.random() * pool.length)];
  const formable = formableWords(base);
  if (formable.length < cfg.minWords + 2) return null;

  // Shuffle everything after the base word so puzzles vary, but keep the base
  // (a longest word) first so it anchors the crossword.
  const candidates = [formable[0], ...shuffle(formable.slice(1)).sort(
    (a, b) => b.length - a.length
  )];
  const cw = buildCrossword(candidates, cfg.maxWords);
  if (cw.slots.length < cfg.minWords) return null;
  if (cw.rows > cfg.maxGrid || cw.cols > cfg.maxGrid) return null;

  const targetWords = new Set(cw.slots.map((s) => s.word));
  const bonusSet = new Set(formable.filter((w) => !targetWords.has(w)));
  return {
    base,
    wheel: shuffle(base.toUpperCase().split("")),
    layout: cw,
    targetSet: targetWords,
    bonusSet,
    total: cw.slots.length,
  };
}

function generatePuzzle(difficulty) {
  const order = [difficulty, "medium", "easy"];
  for (const diff of order) {
    const cfg = DIFFICULTIES[diff] || DIFFICULTIES.medium;
    for (let attempt = 0; attempt < 120; attempt++) {
      const p = tryPuzzle(cfg);
      if (p) return p;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------
export function createWordsRoom(hostName, hostColor) {
  let code;
  do {
    let s = "";
    for (let i = 0; i < 4; i++)
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    code = `WOW-${s}`;
  } while (rooms.has(code));
  const room = new WordsRoom(code);
  const host = room.addPlayer(hostName, hostColor);
  room.hostId = host.id;
  rooms.set(code, room);
  return { room, player: host };
}

export function getWordsRoom(code) {
  if (!code) return null;
  return rooms.get(code.toUpperCase().trim()) || null;
}

export function sweepWordsRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyConnected = room.players.some((p) => p.connected);
    if (anyConnected) {
      room.emptySince = null;
    } else {
      room.emptySince = room.emptySince || now;
      if (now - room.emptySince > 20 * 60 * 1000) rooms.delete(code);
    }
  }
}

class WordsRoom {
  constructor(code) {
    this.code = code;
    this.hostId = null;
    this.status = "lobby"; // lobby | playing | roundover | finished
    this.settings = {
      mode: "versus", // solo | versus | teams
      rounds: 3,
      numTeams: 2,
      difficulty: "medium",
    };
    this.players = [];

    this.round = 0;
    this.puzzle = null;
    this.roundStartMs = null;

    // Per-team round progress (teams mode).
    this.teamFound = {}; // team -> Set(slotId)
    this.teamFinish = {}; // team -> finishMs
    this.teamWins = {}; // team -> wins (cumulative)

    this.roundWinner = null; // {kind:'player'|'team', id}
    this.result = null; // final standings snapshot
    this.rewarded = false;

    this.emptySince = null;
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
      // per-round
      foundSlots: new Set(),
      bonusWords: new Set(),
      hintCells: new Map(), // "r,c" -> letter, revealed by the hint power-up
      finished: false,
      finishMs: null,
      // cumulative
      roundWins: 0,
      totalBonus: 0,
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
    return this.settings.mode === "teams";
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
    return [...set].filter((t) => t < this.settings.numTeams);
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
    if (this.status !== "lobby") return { error: "wow_err_locked" };
    const p = this.getPlayer(playerId);
    if (!p) return;
    p.team = clampInt(team, 0, this.settings.numTeams - 1);
  }

  // ---------- settings ----------
  updateSettings(playerId, patch = {}) {
    if (playerId !== this.hostId) return { error: "wow_err_host_only" };
    if (this.status !== "lobby") return { error: "wow_err_locked" };
    const s = this.settings;
    if ("mode" in patch && MODES.includes(patch.mode)) s.mode = patch.mode;
    if ("rounds" in patch) s.rounds = clampInt(patch.rounds, 1, 10);
    if ("numTeams" in patch) {
      s.numTeams = clampInt(patch.numTeams, 2, TEAM_DEFS.length);
      for (const p of this.players) {
        if (p.team >= s.numTeams) p.team = this.smallestTeam();
      }
    }
    if ("difficulty" in patch && DIFFICULTIES[patch.difficulty]) {
      s.difficulty = patch.difficulty;
    }
  }

  // ---------- game flow ----------
  startGame(playerId) {
    if (playerId !== this.hostId) return { error: "wow_err_host_only" };
    if (this.status !== "lobby") return { error: "wow_err_locked" };
    const n = this.connectedPlayers().length;
    if (this.settings.mode === "versus" && n < 1)
      return { error: "wow_err_need_players" };
    if (this.settings.mode === "teams") {
      if (n < 2) return { error: "wow_err_need_players" };
      if (this.filledTeams().length < 2) return { error: "wow_err_need_teams" };
    }
    // Reset cumulative scores.
    for (const p of this.players) {
      p.roundWins = 0;
      p.totalBonus = 0;
    }
    this.teamWins = {};
    this.round = 0;
    this.rewarded = false;
    this.result = null;
    return this.startRound();
  }

  startRound() {
    const puzzle = generatePuzzle(this.settings.difficulty);
    if (!puzzle) return { error: "wow_err_glitch" };
    this.puzzle = puzzle;
    this.roundStartMs = Date.now();
    this.roundWinner = null;
    this.teamFound = {};
    this.teamFinish = {};
    for (const p of this.players) {
      p.foundSlots = new Set();
      p.bonusWords = new Set();
      p.hintCells = new Map();
      p.finished = false;
      p.finishMs = null;
    }
    this.status = "playing";
    // Hand each connected player their fresh puzzle.
    for (const p of this.connectedPlayers()) this.emitPuzzle(p);
    return { ok: true };
  }

  // The Set of found slot ids for a player's "unit" (their team, or themselves).
  foundSetFor(player) {
    if (this.isTeams()) {
      if (!this.teamFound[player.team]) this.teamFound[player.team] = new Set();
      return this.teamFound[player.team];
    }
    return player.foundSlots;
  }
  unitFinished(player) {
    if (this.isTeams()) return this.teamFinish[player.team] != null;
    return player.finished;
  }
  anyUnitFinished() {
    if (this.isTeams()) return Object.keys(this.teamFinish).length > 0;
    return this.players.some((p) => p.finished);
  }

  // A player submits a word formed from the wheel.
  submitWord(playerId, raw) {
    if (this.status !== "playing") return { status: "none" };
    const p = this.getPlayer(playerId);
    if (!p || !p.connected) return { status: "none" };
    if (this.unitFinished(p)) return { status: "done" };

    const word = String(raw || "").toLowerCase().replace(/[^a-z]/g, "");
    if (word.length < 3) return { status: "short" };

    const found = this.foundSetFor(p);

    if (this.puzzle.targetSet.has(word)) {
      const slot = this.puzzle.layout.slots.find((s) => s.word === word);
      if (!slot) return { status: "none" };
      if (found.has(slot.id)) return { status: "dup" };
      found.add(slot.id);
      this.revealToUnit(p, slot);
      const done = found.size >= this.puzzle.total;
      if (done) this.markFinished(p);
      this.broadcast();
      if (done && !this.roundWinner) this.endRound(p);
      return {
        status: "target",
        slotId: slot.id,
        word: word.toUpperCase(),
        foundCount: found.size,
        total: this.puzzle.total,
        finished: done,
      };
    }

    if (this.puzzle.bonusSet.has(word)) {
      if (p.bonusWords.has(word)) return { status: "dup" };
      p.bonusWords.add(word);
      p.totalBonus += 1;
      this.broadcast();
      return {
        status: "bonus",
        word: word.toUpperCase(),
        bonusCount: p.bonusWords.size,
      };
    }

    return { status: "none" };
  }

  markFinished(player) {
    const ms = Date.now() - this.roundStartMs;
    if (this.isTeams()) {
      if (this.teamFinish[player.team] == null) this.teamFinish[player.team] = ms;
      for (const m of this.teamMembers(player.team)) {
        m.finished = true;
        m.finishMs = this.teamFinish[player.team];
      }
    } else {
      player.finished = true;
      player.finishMs = ms;
    }
  }

  endRound(winnerPlayer) {
    this.status = "roundover";
    if (this.isTeams()) {
      const team = winnerPlayer.team;
      this.teamWins[team] = (this.teamWins[team] || 0) + 1;
      this.roundWinner = { kind: "team", id: team };
    } else {
      winnerPlayer.roundWins += 1;
      this.roundWinner = { kind: "player", id: winnerPlayer.id };
    }
    // Reveal the full solution for the round-over screen.
    this.emitRoom("wow_roundover", {
      winner: this.roundWinner,
      answers: this.puzzle.layout.slots.map((s) => ({
        id: s.id,
        word: s.word.toUpperCase(),
      })),
    });
  }

  // Host advances to the next round (or the final results after the last one).
  nextRound(playerId) {
    if (playerId !== this.hostId) return { error: "wow_err_host_only" };
    if (this.status !== "roundover") return;
    if (this.round + 1 >= this.settings.rounds) return this.finishGame();
    this.round += 1;
    return this.startRound();
  }

  // Host ends the current round early — whoever has found the most words wins it.
  endRoundEarly(playerId) {
    if (playerId !== this.hostId) return { error: "wow_err_host_only" };
    if (this.status !== "playing") return;
    let winner = null;
    let best = -1;
    if (this.isTeams()) {
      for (const t of this.filledTeams()) {
        const c = (this.teamFound[t] || new Set()).size;
        if (c > best) {
          best = c;
          winner = this.teamMembers(t)[0] || null;
        }
      }
    } else {
      for (const p of this.connectedPlayers()) {
        if (p.foundSlots.size > best) {
          best = p.foundSlots.size;
          winner = p;
        }
      }
    }
    if (winner) {
      this.markFinished(winner);
      this.endRound(winner);
    }
  }

  // ---------- solo power-ups ----------
  // Decide what a power-up would reveal (without applying it), or null if there's
  // nothing left to reveal — so we never charge coins for a no-op.
  pickPowerupTarget(player, kind) {
    const slots = this.puzzle.layout.slots;
    const found = this.foundSetFor(player);

    if (kind === "reveal") {
      const remaining = slots.filter((s) => !found.has(s.id));
      if (!remaining.length) return null;
      const slot = remaining[Math.floor(Math.random() * remaining.length)];
      return { slot };
    }

    // hint: cells already on the board = every cell of a found word + prior hints.
    const visible = new Set(player.hintCells.keys());
    for (const s of slots) {
      if (!found.has(s.id)) continue;
      for (const c of slotCells(s)) visible.add(c);
    }
    // Prefer the unfound word with the fewest letters already shown, then reveal
    // its first still-hidden cell — a natural "starter" clue.
    let best = null;
    for (const s of slots) {
      if (found.has(s.id)) continue;
      const cells = slotCells(s);
      const hidden = cells.filter((c) => !visible.has(c));
      if (!hidden.length) continue;
      const shown = cells.length - hidden.length;
      if (!best || shown < best.shown) best = { shown, key: hidden[0], slot: s };
    }
    if (!best) return null;
    const s = best.slot;
    const [r, c] = best.key.split(",").map(Number);
    const i = s.dir === "V" ? r - s.row : c - s.col;
    return { key: best.key, letter: s.word[i].toUpperCase() };
  }

  // Spend coins to reveal a letter (hint) or a whole word (reveal). Solo only, so
  // it never affects a competitive race. Charges only after confirming the action
  // will do something and the player can afford it.
  usePowerup(playerId, kind) {
    if (this.settings.mode !== "solo") return { error: "wow_err_solo_only" };
    if (this.status !== "playing") return { error: "wow_err_not_playing" };
    const def = POWERUPS[kind];
    if (!def) return { error: "wow_err_glitch" };
    const p = this.getPlayer(playerId);
    if (!p || !p.connected) return { error: "wow_err_glitch" };
    if (!p.userId) return { error: "wow_err_login" };
    if (this.unitFinished(p)) return { error: "wow_err_done" };

    const target = this.pickPowerupTarget(p, kind);
    if (!target) return { error: "wow_err_nothing" };

    const spend = spendCoins(p.userId, def.cost);
    if (spend.error) return { error: "wow_err_coins" };

    if (kind === "reveal") {
      const slot = target.slot;
      const found = this.foundSetFor(p);
      found.add(slot.id);
      this.revealToUnit(p, slot);
      const done = found.size >= this.puzzle.total;
      if (done) this.markFinished(p);
      this.broadcast();
      if (done && !this.roundWinner) this.endRound(p);
      return {
        status: "ok", kind, cost: def.cost, coins: spend.coins,
        reveal: { slotId: slot.id, word: slot.word.toUpperCase() },
        finished: done,
      };
    }

    // hint
    p.hintCells.set(target.key, target.letter);
    const [row, col] = target.key.split(",").map(Number);
    if (p.socketId && ioNsp) {
      ioNsp.to(p.socketId).emit("wow_hint", { row, col, letter: target.letter });
    }
    this.broadcast();
    return {
      status: "ok", kind, cost: def.cost, coins: spend.coins,
      hint: { row, col, letter: target.letter },
    };
  }

  finishGame() {
    this.status = "finished";
    this.result = this.buildResult();
    this.awardRewards();
    this.emitRoom("wow_gameover", { winner: this.result.champion });
    this.broadcast();
    return { ok: true };
  }

  endByHost(playerId) {
    if (playerId !== this.hostId) return { error: "wow_err_host_only" };
    if (this.status === "lobby" || this.status === "finished") return;
    return this.finishGame();
  }

  buildResult() {
    if (this.isTeams()) {
      const standings = this.filledTeams()
        .map((t) => ({
          kind: "team",
          team: t,
          color: TEAM_DEFS[t].color,
          name: TEAM_DEFS[t].name,
          wins: this.teamWins[t] || 0,
          members: this.teamMembers(t).map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
          })),
        }))
        .sort((a, b) => b.wins - a.wins);
      return { mode: "teams", standings, champion: standings[0] || null };
    }
    const standings = this.players
      .map((p) => ({
        kind: "player",
        id: p.id,
        name: p.name,
        color: p.color,
        wins: p.roundWins,
        bonus: p.totalBonus,
      }))
      .sort((a, b) => b.wins - a.wins || b.bonus - a.bonus);
    return { mode: this.settings.mode, standings, champion: standings[0] || null };
  }

  // Grant coins + XP once per game: the champion (team/player) gets the win
  // reward, everyone else who played gets the participation reward.
  awardRewards() {
    if (this.rewarded) return;
    this.rewarded = true;
    const champ = this.result?.champion;
    const isWinner = (p) => {
      if (!champ) return false;
      return champ.kind === "team" ? p.team === champ.team : p.id === champ.id;
    };
    for (const p of this.players) {
      if (!p.userId) continue;
      const won = isWinner(p);
      const r = won ? REWARD_WIN : REWARD_PLAYED;
      const res = grantReward(p.userId, {
        coinGain: r.coins + p.totalBonus * 2, // bonus words pay a little extra
        xpGain: r.xp,
        won,
        played: true,
        mode: this.settings.mode === "solo" ? "solo" : "versus",
        game: "words",
      });
      if (res && p.socketId && ioNsp) {
        ioNsp.to(p.socketId).emit("wow_reward", {
          coins: r.coins + p.totalBonus * 2,
          xp: r.xp,
          won,
          profile: res.profile,
          unlocked: res.unlocked,
        });
      }
    }
  }

  playAgain(playerId) {
    if (playerId !== this.hostId) return { error: "wow_err_host_only" };
    this.status = "lobby";
    this.puzzle = null;
    this.round = 0;
    this.roundWinner = null;
    this.result = null;
    this.rewarded = false;
    this.teamFound = {};
    this.teamFinish = {};
    this.teamWins = {};
    for (const p of this.players) {
      p.foundSlots = new Set();
      p.bonusWords = new Set();
      p.hintCells = new Map();
      p.finished = false;
      p.finishMs = null;
      p.roundWins = 0;
      p.totalBonus = 0;
    }
  }

  // ---------- serialization ----------
  publicPlayer(p) {
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      team: p.team,
      connected: p.connected,
      isHost: p.id === this.hostId,
      foundCount: this.isTeams() ? 0 : p.foundSlots.size,
      finished: p.finished,
      finishMs: p.finishMs,
      bonusCount: p.bonusWords.size,
      roundWins: p.roundWins,
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
        foundCount: (this.teamFound[t] || new Set()).size,
        finished: this.teamFinish[t] != null,
        finishMs: this.teamFinish[t] ?? null,
        wins: this.teamWins[t] || 0,
      });
    }
    return out;
  }

  // Public layout: positions + lengths only, never the answer letters.
  publicLayout() {
    if (!this.puzzle || this.status === "lobby") return null;
    const { rows, cols, slots } = this.puzzle.layout;
    return {
      rows,
      cols,
      slots: slots.map((s) => ({
        id: s.id,
        row: s.row,
        col: s.col,
        dir: s.dir,
        len: s.word.length,
      })),
    };
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
      wheel: this.status === "lobby" ? null : this.puzzle?.wheel || null,
      layout: this.publicLayout(),
      total: this.puzzle?.total || 0,
      roundStartMs: this.roundStartMs,
      roundWinner: this.roundWinner,
      result: this.result,
      wordLang: PUZZLE_LANG,
      powerups: POWERUPS,
    };
  }

  // Individual letters this player revealed with the hint power-up — sent on round
  // start / reconnect so the clues survive a page reload.
  hintReveal(player) {
    return [...player.hintCells.entries()].map(([key, letter]) => {
      const [row, col] = key.split(",").map(Number);
      return { row, col, letter };
    });
  }

  // The slots (with letters) that a player's unit has already found — used to
  // fill the board on round start and on reconnect.
  foundReveal(player) {
    const found = this.isTeams()
      ? this.teamFound[player.team] || new Set()
      : player.foundSlots;
    return this.puzzle.layout.slots
      .filter((s) => found.has(s.id))
      .map((s) => ({ slotId: s.id, word: s.word.toUpperCase() }));
  }

  // ---------- emit ----------
  broadcast() {
    if (ioNsp) ioNsp.to(this.code).emit("wow_state", this.toState());
  }
  emitRoom(ev, data) {
    if (ioNsp) ioNsp.to(this.code).emit(ev, data);
  }
  emitPuzzle(player) {
    if (!ioNsp || !player.socketId || !this.puzzle) return;
    ioNsp.to(player.socketId).emit("wow_puzzle", {
      round: this.round,
      wheel: this.puzzle.wheel,
      layout: this.publicLayout(),
      total: this.puzzle.total,
      found: this.foundReveal(player),
      hints: this.hintReveal(player),
      bonus: [...player.bonusWords].map((w) => w.toUpperCase()),
    });
  }
  // Reveal a newly found slot to whoever should see it (self, or the whole team).
  revealToUnit(player, slot) {
    if (!ioNsp) return;
    const payload = { slotId: slot.id, word: slot.word.toUpperCase(), by: player.id };
    const audience = this.isTeams()
      ? this.teamMembers(player.team, true)
      : [player];
    for (const m of audience) {
      if (m.socketId) ioNsp.to(m.socketId).emit("wow_found", payload);
    }
  }
}

// ---------------------------------------------------------------------------
// Socket wiring — its own namespace, mirrors the SUDOKU/MEMORY thin style.
// ---------------------------------------------------------------------------
export function attachWordsIO(io, serverUrl) {
  ioNsp = io.of("/words");

  const ack = (fn, payload) => {
    if (typeof fn === "function") fn(payload);
  };

  function ctx(socket) {
    const code = socket.data.code;
    const room = code ? getWordsRoom(code) : null;
    const player = room ? room.getPlayer(socket.data.playerId) : null;
    return { room, player };
  }

  function bind(socket, room, player) {
    socket.data.code = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    player.socketId = socket.id;
    player.connected = true;
  }

  function linkAccount(player, token) {
    const user = userFromToken(token);
    if (user) player.userId = user.id;
  }

  function handle(socket, fn) {
    try {
      const { room, player } = ctx(socket);
      if (!room || !player) {
        socket.emit("wow_notice", { type: "error", message: "wow_err_no_room" });
        return;
      }
      const res = fn(room, player) || {};
      if (res.error) socket.emit("wow_notice", { type: "error", message: res.error });
      room.broadcast();
    } catch (err) {
      console.error("words handler error:", err);
      socket.emit("wow_notice", { type: "error", message: "wow_err_glitch" });
    }
  }

  ioNsp.on("connection", (socket) => {
    socket.emit("wow_config", { colors: AVATAR_COLORS, serverUrl });

    socket.on("wow_create", (payload = {}, cb) => {
      try {
        const { room, player } = createWordsRoom(payload.name, payload.color);
        bind(socket, room, player);
        linkAccount(player, payload.token);
        ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
        room.broadcast();
      } catch (err) {
        console.error(err);
        ack(cb, { error: "wow_err_create" });
      }
    });

    socket.on("wow_join", (payload = {}, cb) => {
      try {
        const room = getWordsRoom(payload.code);
        if (!room) return ack(cb, { error: "wow_err_no_code" });

        // Reconnect / reclaim a seat by playerId.
        if (payload.playerId) {
          const existing = room.getPlayer(payload.playerId);
          if (existing) {
            bind(socket, room, existing);
            linkAccount(existing, payload.token);
            ack(cb, {
              ok: true,
              code: room.code,
              playerId: existing.id,
              state: room.toState(),
            });
            if (room.status === "playing") room.emitPuzzle(existing);
            room.broadcast();
            return;
          }
        }

        if (room.status !== "lobby") return ack(cb, { error: "wow_err_started" });
        const player = room.addPlayer(payload.name, payload.color);
        bind(socket, room, player);
        linkAccount(player, payload.token);
        ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
        room.broadcast();
      } catch (err) {
        console.error(err);
        ack(cb, { error: "wow_err_join" });
      }
    });

    socket.on("wow_join_team", ({ team } = {}) =>
      handle(socket, (room, player) => room.joinTeam(player.id, team))
    );
    socket.on("wow_settings", (patch = {}) =>
      handle(socket, (room, player) => room.updateSettings(player.id, patch))
    );
    socket.on("wow_start", () =>
      handle(socket, (room, player) => room.startGame(player.id))
    );

    // Word submission resolves via ack (instant feedback) + its own broadcast.
    socket.on("wow_submit", ({ word } = {}, cb) => {
      const { room, player } = ctx(socket);
      if (!room || !player) return ack(cb, { status: "none" });
      ack(cb, room.submitWord(player.id, word));
    });

    // Solo power-up purchase resolves via ack (so the client learns the new coin
    // balance) and its own broadcast for the board reveal.
    socket.on("wow_powerup", ({ kind } = {}, cb) => {
      const { room, player } = ctx(socket);
      if (!room || !player) return ack(cb, { error: "wow_err_no_room" });
      const res = room.usePowerup(player.id, kind);
      ack(cb, res);
    });

    socket.on("wow_next", () =>
      handle(socket, (room, player) => room.nextRound(player.id))
    );
    socket.on("wow_end_round", () =>
      handle(socket, (room, player) => room.endRoundEarly(player.id))
    );
    socket.on("wow_end", () =>
      handle(socket, (room, player) => room.endByHost(player.id))
    );
    socket.on("wow_again", () =>
      handle(socket, (room, player) => room.playAgain(player.id))
    );

    socket.on("wow_leave", () => {
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
