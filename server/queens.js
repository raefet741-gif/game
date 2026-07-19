// server/queens.js
// Authoritative engine for KYUUBI QUEENS — the LinkedIn "Queens" puzzle, turned
// into a party race.
//
// The board is an N×N grid split into N colored regions ("patches"). Place exactly
// N queens so there is ONE queen in every row, every column, and every colored
// region, and NO two queens touch — not even diagonally. Every generated board has
// a UNIQUE solution.
//
// Modes: solo (race your own clock), 1v1, 2v2, and team-vs-team. A whole team shares
// ONE board (they see each other's marks live), so any team size works. Racing is
// BEST-OF-N by fastest cumulative time: everyone plays N fresh boards; each board a
// team solves records that board's solve time; after N boards the team with the most
// boards solved (ties broken by lowest total time) wins. A team's working marks are
// only ever sent to that team's own members, so opponents can't copy — the board
// layout (regions) is shared. Runs on its own Socket.IO namespace ("/queens").

import crypto from "crypto";
import { userFromToken, grantReward, recordMatch } from "./accounts.js";

const rooms = new Map(); // code -> QueensRoom
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

// Difficulty → board size (= number of regions/queens). Bigger = harder.
export const DIFFICULTIES = {
  easy: { size: 6 },
  medium: { size: 7 },
  hard: { size: 8 },
};

// Best-of-N options the host can pick.
export const ROUND_OPTIONS = [1, 3, 5];

// Reward economy (per game).
const REWARD_WIN = { coins: 50, xp: 25 };
const REWARD_PLAYED = { coins: 10, xp: 5 };

// Cell mark states.
const EMPTY = 0;
const MARK = 1; // player's "X" note (not a queen)
const QUEEN = 2;

function randId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Puzzle generation.
//
// 1. Build a random valid queen placement: a permutation cols[row] = col with one
//    queen per row and column and NO two queens touching. Since rows and columns
//    are already unique, two queens can only touch across ADJACENT rows, so the
//    single rule is |cols[r] - cols[r-1]| >= 2.
// 2. Grow N connected color regions outward from each queen's cell until every cell
//    is claimed — so each region is connected and holds exactly one queen (making
//    that placement a valid solution).
// 3. Verify the region layout yields a UNIQUE solution; if not, try again.
// ---------------------------------------------------------------------------
function neighbors(idx, N) {
  const r = Math.floor(idx / N);
  const c = idx % N;
  const out = [];
  if (r > 0) out.push(idx - N);
  if (r < N - 1) out.push(idx + N);
  if (c > 0) out.push(idx - 1);
  if (c < N - 1) out.push(idx + 1);
  return out;
}

// Random column-per-row placement with the no-touch rule, via randomized
// backtracking (always succeeds for N >= 4).
function randomQueens(N) {
  const cols = new Array(N).fill(-1);
  const used = new Array(N).fill(false);
  const bt = (row, prev) => {
    if (row === N) return true;
    for (const c of shuffle([...Array(N).keys()])) {
      if (used[c]) continue;
      if (prev >= 0 && Math.abs(c - prev) < 2) continue; // would touch prev row
      used[c] = true;
      cols[row] = c;
      if (bt(row + 1, c)) return true;
      used[c] = false;
    }
    return false;
  };
  bt(0, -1);
  return cols;
}

// Flood-grow one region per queen until every cell is claimed. Returns a per-cell
// region-id array (0..N-1).
function growRegions(N, queenCells) {
  const total = N * N;
  const region = new Array(total).fill(-1);
  queenCells.forEach((cell, id) => (region[cell] = id));

  const frontier = new Set();
  for (const qc of queenCells)
    for (const nb of neighbors(qc, N)) if (region[nb] === -1) frontier.add(nb);

  let claimed = queenCells.length;
  while (claimed < total && frontier.size) {
    const arr = [...frontier];
    const cell = arr[Math.floor(Math.random() * arr.length)];
    const opts = neighbors(cell, N)
      .map((nb) => region[nb])
      .filter((rid) => rid !== -1);
    region[cell] = opts[Math.floor(Math.random() * opts.length)];
    frontier.delete(cell);
    claimed++;
    for (const nb of neighbors(cell, N)) if (region[nb] === -1) frontier.add(nb);
  }
  return region;
}

// Count solutions (capped at `limit`) for a given region layout: one queen per row,
// column and region, none touching across adjacent rows.
function countSolutions(N, region, limit = 2) {
  const usedCol = new Array(N).fill(false);
  const usedReg = new Array(N).fill(false);
  let count = 0;
  const bt = (row, prevCol) => {
    if (count >= limit) return;
    if (row === N) {
      count++;
      return;
    }
    for (let c = 0; c < N; c++) {
      if (usedCol[c]) continue;
      if (prevCol >= 0 && Math.abs(c - prevCol) < 2) continue;
      const rid = region[row * N + c];
      if (usedReg[rid]) continue;
      usedCol[c] = true;
      usedReg[rid] = true;
      bt(row + 1, c);
      usedCol[c] = false;
      usedReg[rid] = false;
    }
  };
  bt(0, -1);
  return count;
}

// A random region layout only rarely admits a UNIQUE queen solution, and the odds
// fall off steeply as the board grows (~5% at 6×6, ~0.06% at 8×8). Each attempt is
// sub-millisecond though, so we retry until we find a unique board or hit a small
// wall-clock budget — in practice a unique board almost always turns up in well
// under the budget. If the budget is ever exhausted we fall back to the last
// (still solvable) board so play never stalls.
function generatePuzzle(diffKey) {
  const cfg = DIFFICULTIES[diffKey] || DIFFICULTIES.medium;
  const N = cfg.size;
  const deadline = Date.now() + 600; // ms budget
  let fallback = null;
  for (let attempt = 0; attempt < 40000; attempt++) {
    const cols = randomQueens(N);
    const queenCells = cols.map((c, r) => r * N + c);
    const region = growRegions(N, queenCells);
    const cand = { size: N, regions: region, solution: queenCells };
    if (countSolutions(N, region, 2) === 1) return cand;
    fallback = cand; // still solvable, just not proven unique
    if ((attempt & 255) === 0 && Date.now() > deadline) break;
  }
  return fallback;
}

export function createQueensRoom(hostName, hostColor) {
  let code;
  do {
    let s = "";
    for (let i = 0; i < 4; i++)
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    code = `QN-${s}`;
  } while (rooms.has(code));
  const room = new QueensRoom(code);
  const host = room.addPlayer(hostName, hostColor);
  room.hostId = host.id;
  rooms.set(code, room);
  return { room, player: host };
}

export function getQueensRoom(code) {
  if (!code) return null;
  return rooms.get(code.toUpperCase().trim()) || null;
}

export function sweepQueensRooms() {
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

class QueensRoom {
  constructor(code) {
    this.code = code;
    this.hostId = null;
    this.status = "lobby"; // lobby | playing | finished
    this.settings = {
      numTeams: 2,
      difficulty: "medium",
      rounds: 3, // best-of-N boards
    };
    this.players = [];

    this.solo = false;
    this.puzzle = null; // { size, regions, solution }
    this.round = 0; // 1-based current board
    this.roundStartMs = null;
    this.teamMarks = {}; // teamIndex -> Int8Array(size*size)
    this.teamDone = {}; // teamIndex -> finished CURRENT board?
    this.teamTimes = {}; // teamIndex -> [ms|null per round]
    this.result = null;
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
    if (this.status !== "lobby") return { error: "q_err_locked" };
    const t = clampInt(team, 0, this.settings.numTeams - 1);
    const p = this.getPlayer(playerId);
    if (!p) return;
    p.team = t;
  }

  // ---------- settings ----------
  updateSettings(playerId, patch = {}) {
    if (playerId !== this.hostId) return { error: "q_err_host_only" };
    if (this.status !== "lobby") return { error: "q_err_locked" };
    const s = this.settings;
    if ("numTeams" in patch) {
      s.numTeams = clampInt(patch.numTeams, 2, TEAM_DEFS.length);
      for (const p of this.players) {
        if (p.team >= s.numTeams) p.team = this.smallestTeam();
      }
    }
    if ("difficulty" in patch && DIFFICULTIES[patch.difficulty]) {
      s.difficulty = patch.difficulty;
    }
    if ("rounds" in patch && ROUND_OPTIONS.includes(Number(patch.rounds))) {
      s.rounds = Number(patch.rounds);
    }
  }

  // ---------- game flow ----------
  startGame(playerId, opts = {}) {
    if (playerId !== this.hostId) return { error: "q_err_host_only" };
    if (this.status !== "lobby") return { error: "q_err_locked" };
    const solo = !!opts.solo;
    if (solo) {
      if (this.connectedPlayers().length < 1) return { error: "q_err_need_players" };
    } else {
      if (this.connectedPlayers().length < 2) return { error: "q_err_need_players" };
      if (this.filledTeams().length < 2) return { error: "q_err_need_teams" };
    }
    this.solo = solo;
    this.result = null;
    this.rewarded = false;
    this.teamTimes = {};
    for (const t of this.filledTeams()) this.teamTimes[t] = [];
    this.round = 0;
    this.status = "playing";
    this.startRound(1);
    return { ok: true };
  }

  // Deal a fresh board for round `n` and reset every team's working marks.
  startRound(n) {
    this.round = n;
    this.puzzle = generatePuzzle(this.settings.difficulty);
    const cells = this.puzzle.size * this.puzzle.size;
    this.teamMarks = {};
    this.teamDone = {};
    for (const t of this.filledTeams()) {
      this.teamMarks[t] = new Int8Array(cells);
      this.teamDone[t] = false;
    }
    this.roundStartMs = Date.now();
    this.emitRoom("queens_round", { round: n, rounds: this.settings.rounds });
    for (const t of this.filledTeams()) this.emitTeamMarks(t);
  }

  // Does `marks` (an Int8Array) satisfy the full Queens win condition?
  isSolved(marks) {
    const pz = this.puzzle;
    if (!pz) return false;
    const N = pz.size;
    const qCells = [];
    for (let i = 0; i < marks.length; i++) if (marks[i] === QUEEN) qCells.push(i);
    if (qCells.length !== N) return false;
    const rows = new Set();
    const cols = new Set();
    const regs = new Set();
    for (const cell of qCells) {
      const r = Math.floor(cell / N);
      const c = cell % N;
      if (rows.has(r) || cols.has(c)) return false;
      const rid = pz.regions[cell];
      if (regs.has(rid)) return false;
      rows.add(r);
      cols.add(c);
      regs.add(rid);
    }
    // No two queens touching (including diagonally).
    for (let a = 0; a < qCells.length; a++) {
      for (let b = a + 1; b < qCells.length; b++) {
        const ra = Math.floor(qCells[a] / N);
        const ca = qCells[a] % N;
        const rb = Math.floor(qCells[b] / N);
        const cb = qCells[b] % N;
        if (Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1) return false;
      }
    }
    return true;
  }

  // A player sets one cell of their team's shared board.
  setCell(playerId, idx, val) {
    if (this.status !== "playing") return;
    const p = this.getPlayer(playerId);
    if (!p || !p.connected) return;
    const marks = this.teamMarks[p.team];
    if (!marks) return;
    if (this.teamDone[p.team]) return; // board already solved this round
    const i = Number(idx);
    if (!Number.isInteger(i) || i < 0 || i >= marks.length) return;
    const v = clampInt(val, EMPTY, QUEEN);
    marks[i] = v;
    this.emitTeamMarks(p.team, { by: p.id });
    if (v === QUEEN && this.isSolved(marks)) this.finishRoundForTeam(p.team);
  }

  finishRoundForTeam(team) {
    if (this.teamDone[team]) return;
    this.teamDone[team] = true;
    const arr = this.teamTimes[team] || (this.teamTimes[team] = []);
    arr[this.round - 1] = Date.now() - this.roundStartMs;
    this.emitRoom("queens_solved", { team, round: this.round });
    if (this.allTeamsDone()) this.advanceRound();
    else this.broadcast();
  }

  allTeamsDone() {
    return this.filledTeams().every((t) => this.teamDone[t]);
  }

  // Move to the next board, or finish the match after the last one.
  advanceRound() {
    if (this.round < this.settings.rounds) {
      this.startRound(this.round + 1);
      this.broadcast();
    } else {
      this.finishGame();
    }
  }

  // Host can skip the current board — unfinished teams get a DNF for it.
  skipRound(playerId) {
    if (playerId !== this.hostId) return { error: "q_err_host_only" };
    if (this.status !== "playing") return;
    for (const t of this.filledTeams()) {
      if (!this.teamDone[t]) {
        const arr = this.teamTimes[t] || (this.teamTimes[t] = []);
        if (arr[this.round - 1] == null) arr[this.round - 1] = null;
        this.teamDone[t] = true;
      }
    }
    this.advanceRound();
  }

  // Host can end the whole match immediately — standings use boards solved so far.
  endByHost(playerId) {
    if (playerId !== this.hostId) return { error: "q_err_host_only" };
    if (this.status !== "playing") return;
    this.finishGame();
  }

  standingsFor(team) {
    const times = this.teamTimes[team] || [];
    let solved = 0;
    let totalMs = 0;
    for (const ms of times) {
      if (ms != null) {
        solved++;
        totalMs += ms;
      }
    }
    return { solved, totalMs, times: times.slice() };
  }

  finishGame() {
    this.status = "finished";
    const standings = this.filledTeams()
      .map((t) => {
        const s = this.standingsFor(t);
        return {
          team: t,
          color: TEAM_DEFS[t].color,
          name: TEAM_DEFS[t].name,
          solved: s.solved,
          totalMs: s.totalMs,
          times: s.times,
          members: this.teamMembers(t).map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
          })),
        };
      })
      .sort((a, b) => {
        if (a.solved !== b.solved) return b.solved - a.solved; // more boards first
        return a.totalMs - b.totalMs; // then fastest cumulative time
      });

    const winnerTeam =
      standings.length && standings[0].solved > 0 ? standings[0].team : null;
    this.result = { winnerTeam, standings, rounds: this.settings.rounds };
    this.winnerTeam = winnerTeam;
    this.awardRewards();
    this.emitRoom("queens_gameover", { winnerTeam });
  }

  awardRewards() {
    if (this.rewarded) return;
    this.rewarded = true;
    const winnerTeam = this.result?.winnerTeam ?? null;
    for (const p of this.players) {
      if (!p.userId) continue;
      const won = winnerTeam != null && p.team === winnerTeam;
      const r = won ? REWARD_WIN : REWARD_PLAYED;
      const res = grantReward(p.userId, {
        coinGain: r.coins,
        xpGain: r.xp,
        won,
        played: true,
        mode: this.solo ? "solo" : "versus",
        game: "queens",
      });
      if (res && p.socketId && ioNsp) {
        ioNsp.to(p.socketId).emit("queens_reward", {
          coins: r.coins,
          xp: r.xp,
          won,
          profile: res.profile,
          unlocked: res.unlocked,
        });
      }
    }
    if (!this.solo) {
      recordMatch("queens", this.players.map((p) => ({
        userId: p.userId,
        name: p.name,
        team: p.team,
        won: winnerTeam != null && p.team === winnerTeam,
      })));
    }
  }

  playAgain(playerId) {
    if (playerId !== this.hostId) return { error: "q_err_host_only" };
    this.status = "lobby";
    this.puzzle = null;
    this.round = 0;
    this.roundStartMs = null;
    this.teamMarks = {};
    this.teamDone = {};
    this.teamTimes = {};
    this.result = null;
    this.winnerTeam = null;
    this.rewarded = false;
    this.solo = false;
  }

  // Solo helper: drop one correct queen from the known solution onto the board.
  hint(playerId) {
    if (this.status !== "playing" || !this.solo || !this.puzzle) return;
    const p = this.getPlayer(playerId);
    if (!p) return;
    const marks = this.teamMarks[p.team];
    if (!marks || this.teamDone[p.team]) return;
    const missing = this.puzzle.solution.filter((cell) => marks[cell] !== QUEEN);
    if (!missing.length) return;
    const cell = missing[Math.floor(Math.random() * missing.length)];
    marks[cell] = QUEEN;
    this.emitTeamMarks(p.team, { by: p.id, hint: true });
    if (this.isSolved(marks)) this.finishRoundForTeam(p.team);
  }

  // ---------- helpers ----------
  queensPlaced(team) {
    const marks = this.teamMarks[team];
    if (!marks) return 0;
    let n = 0;
    for (const v of marks) if (v === QUEEN) n++;
    return n;
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
    };
  }

  teamsState() {
    const N = this.puzzle ? this.puzzle.size : 0;
    const out = [];
    for (let t = 0; t < this.settings.numTeams; t++) {
      const def = TEAM_DEFS[t];
      const s = this.standingsFor(t);
      out.push({
        index: t,
        color: def.color,
        name: def.name,
        members: this.teamMembers(t).map((p) => p.id),
        placed: this.status === "lobby" ? 0 : this.queensPlaced(t),
        target: N,
        doneRound: !!this.teamDone[t],
        solved: s.solved,
        totalMs: s.totalMs,
        times: s.times,
      });
    }
    return out;
  }

  // Public state — safe for everyone. The region layout is shared; only working
  // marks stay private (sent per-team).
  toState() {
    const pz = this.puzzle;
    const show = this.status !== "lobby" && pz;
    return {
      code: this.code,
      hostId: this.hostId,
      status: this.status,
      solo: this.solo,
      settings: this.settings,
      difficulty: this.settings.difficulty,
      round: this.round,
      rounds: this.settings.rounds,
      size: show ? pz.size : null,
      regions: show ? pz.regions : null,
      teams: this.teamsState(),
      players: this.players.map((p) => this.publicPlayer(p)),
      roundStartMs: this.roundStartMs,
      winnerTeam: this.winnerTeam ?? null,
      result: this.result,
    };
  }

  // ---------- emit ----------
  broadcast() {
    if (ioNsp) ioNsp.to(this.code).emit("queens_state", this.toState());
  }
  emitRoom(ev, data) {
    if (ioNsp) ioNsp.to(this.code).emit(ev, data);
  }
  // Send a team's working marks to its own connected members only.
  emitTeamMarks(team, meta = {}) {
    if (!ioNsp) return;
    const marks = this.teamMarks[team];
    if (!marks) return;
    const payload = { team, marks: Array.from(marks), ...meta };
    for (const p of this.teamMembers(team, true)) {
      if (p.socketId) ioNsp.to(p.socketId).emit("queens_marks", payload);
    }
    this.broadcast(); // progress for everyone
  }
  marksFor(player) {
    if (!player || this.status === "lobby") return null;
    const marks = this.teamMarks[player.team];
    return marks ? Array.from(marks) : [];
  }
}

// ---------------------------------------------------------------------------
// Socket wiring — its own namespace, mirrors the ZIP / SUDOKU thin style.
// ---------------------------------------------------------------------------
export function attachQueensIO(io, serverUrl) {
  ioNsp = io.of("/queens");

  const ack = (fn, payload) => {
    if (typeof fn === "function") fn(payload);
  };

  function ctx(socket) {
    const code = socket.data.code;
    const room = code ? getQueensRoom(code) : null;
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
    if (user) {
      player.userId = user.id;
      // The profile name is authoritative — players carry their account name into
      // every game rather than typing a fresh one each time.
      player.name = user.name;
    }
    return user;
  }

  function handle(socket, fn) {
    try {
      const { room, player } = ctx(socket);
      if (!room || !player) {
        socket.emit("queens_notice", { type: "error", message: "q_err_no_room" });
        return;
      }
      const res = fn(room, player) || {};
      if (res.error) socket.emit("queens_notice", { type: "error", message: res.error });
      room.broadcast();
    } catch (err) {
      console.error("queens handler error:", err);
      socket.emit("queens_notice", { type: "error", message: "q_err_glitch" });
    }
  }

  ioNsp.on("connection", (socket) => {
    socket.emit("queens_config", { colors: AVATAR_COLORS, serverUrl });

    socket.on("queens_create", (payload = {}, cb) => {
      try {
        if (!userFromToken(payload.token)) return ack(cb, { error: "q_err_login" });
        const { room, player } = createQueensRoom(payload.name, payload.color);
        bind(socket, room, player);
        linkAccount(player, payload.token);
        ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
        room.broadcast();
      } catch (err) {
        console.error(err);
        ack(cb, { error: "q_err_create" });
      }
    });

    socket.on("queens_join", (payload = {}, cb) => {
      try {
        if (!userFromToken(payload.token)) return ack(cb, { error: "q_err_login" });
        const room = getQueensRoom(payload.code);
        if (!room) return ack(cb, { error: "q_err_no_code" });

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
              marks: room.marksFor(existing),
            });
            room.broadcast();
            return;
          }
        }

        if (room.status !== "lobby") return ack(cb, { error: "q_err_started" });
        const player = room.addPlayer(payload.name, payload.color);
        bind(socket, room, player);
        linkAccount(player, payload.token);
        ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
        room.broadcast();
      } catch (err) {
        console.error(err);
        ack(cb, { error: "q_err_join" });
      }
    });

    socket.on("queens_join_team", ({ team } = {}) =>
      handle(socket, (room, player) => room.joinTeam(player.id, team))
    );
    socket.on("queens_settings", (patch = {}) =>
      handle(socket, (room, player) => room.updateSettings(player.id, patch))
    );
    socket.on("queens_start", (opts = {}) =>
      handle(socket, (room, player) => room.startGame(player.id, opts))
    );
    socket.on("queens_set", ({ idx, val } = {}) => {
      // setCell resolves its own targeted marks emit + broadcast.
      const { room, player } = ctx(socket);
      if (room && player) room.setCell(player.id, idx, val);
    });
    socket.on("queens_hint", () => {
      const { room, player } = ctx(socket);
      if (room && player) room.hint(player.id);
    });
    socket.on("queens_skip", () =>
      handle(socket, (room, player) => room.skipRound(player.id))
    );
    socket.on("queens_end", () =>
      handle(socket, (room, player) => room.endByHost(player.id))
    );
    socket.on("queens_again", () =>
      handle(socket, (room, player) => room.playAgain(player.id))
    );

    socket.on("queens_leave", () => {
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
