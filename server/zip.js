// server/zip.js
// Authoritative engine for ZIP RACE — a competitive LinkedIn-style path puzzle.
//
// Every team races the SAME board. Draw ONE continuous path that starts at cell
// "1", passes every numbered cell in ascending order (1 → 2 → 3 → …), and fills
// EVERY cell on the grid exactly once. Walls block some edges. All members of a
// team collaborate on ONE shared path (they see each other's line live), so solo,
// 1v1, 2v2 and larger team-vs-team all work. The FIRST team to complete a valid
// path wins — i.e. the team that finishes in the least time. Winning members (and,
// more modestly, everyone who played) earn coins + XP on their accounts.
//
// A team's working path is only ever sent to that team's own members, so opponents
// can't copy it. The puzzle itself (numbers + walls) is shared — everyone races the
// same board. Runs on its own Socket.IO namespace ("/zip").

import crypto from "crypto";
import { userFromToken, grantReward, recordMatch } from "./accounts.js";

const rooms = new Map(); // code -> ZipRoom
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

// Difficulty → grid size, how many numbered checkpoints, and how densely we drop
// walls on non-solution edges. Bigger + more walls = harder.
export const DIFFICULTIES = {
  easy: { size: 6, checkpoints: 5, wallDensity: 0.1 },
  medium: { size: 7, checkpoints: 6, wallDensity: 0.16 },
  hard: { size: 8, checkpoints: 8, wallDensity: 0.22 },
};

// Reward economy (per game).
const REWARD_WIN = { coins: 50, xp: 25 };
const REWARD_PLAYED = { coins: 10, xp: 5 };

function randId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// ---------------------------------------------------------------------------
// Puzzle generation.
//
// Boards are square (size×size). Index = r*size + c. We first build a random
// Hamiltonian path that covers every cell (guaranteeing the puzzle is solvable),
// drop numbered checkpoints along it in order, then scatter walls on edges the
// solution never uses (so alternative solutions get pruned but the intended one
// always survives).
// ---------------------------------------------------------------------------
function neighbors(idx, size) {
  const r = Math.floor(idx / size);
  const c = idx % size;
  const out = [];
  if (r > 0) out.push(idx - size);
  if (r < size - 1) out.push(idx + size);
  if (c > 0) out.push(idx - 1);
  if (c < size - 1) out.push(idx + 1);
  return out;
}

// A boustrophedon ("snake") path is a trivial Hamiltonian path on any grid — our
// starting point before randomization.
function snakePath(size) {
  const path = [];
  for (let r = 0; r < size; r++) {
    if (r % 2 === 0) for (let c = 0; c < size; c++) path.push(r * size + c);
    else for (let c = size - 1; c >= 0; c--) path.push(r * size + c);
  }
  return path;
}

// The "backbite" move: pick an endpoint, join it to a random grid-neighbour, and
// snip the edge that closed the resulting loop. The result is always another
// Hamiltonian path — repeating it many times gives a well-shuffled random one.
function backbite(path, size, iters) {
  const n = path.length;
  const posOf = new Array(n);
  for (let i = 0; i < n; i++) posOf[path[i]] = i;
  const reverse = (lo, hi) => {
    while (lo < hi) {
      const a = path[lo];
      const b = path[hi];
      path[lo] = b;
      path[hi] = a;
      posOf[b] = lo;
      posOf[a] = hi;
      lo++;
      hi--;
    }
  };
  for (let it = 0; it < iters; it++) {
    if (Math.random() < 0.5) {
      // Operate on the tail.
      const tail = path[n - 1];
      const nbrs = neighbors(tail, size);
      const v = nbrs[Math.floor(Math.random() * nbrs.length)];
      const j = posOf[v];
      if (j >= n - 2) continue; // already the path-neighbour (or the tail itself)
      reverse(j + 1, n - 1);
    } else {
      // Operate on the head (mirror image).
      const head = path[0];
      const nbrs = neighbors(head, size);
      const v = nbrs[Math.floor(Math.random() * nbrs.length)];
      const j = posOf[v];
      if (j <= 1) continue;
      reverse(0, j - 1);
    }
  }
  return path;
}

// Drop `checkpoints` numbered cells along the path: 1 on the first cell, the top
// number on the last cell, and the rest spread across the interior (lightly
// jittered so boards vary). Returns a per-cell `numbers` array (0 = unnumbered).
function placeCheckpoints(path, checkpoints) {
  const n = path.length;
  const K = Math.max(2, Math.min(checkpoints, n));
  const idxs = [0];
  let last = 0;
  for (let m = 1; m < K - 1; m++) {
    const base = Math.round((m * (n - 1)) / (K - 1));
    const span = Math.max(1, Math.floor((n - 1) / (K - 1) / 3));
    let p = base + (Math.floor(Math.random() * (2 * span + 1)) - span);
    p = Math.max(last + 1, Math.min(n - 2, p));
    idxs.push(p);
    last = p;
  }
  idxs.push(n - 1);
  const numbers = new Array(n).fill(0);
  idxs.forEach((pi, m) => {
    numbers[path[pi]] = m + 1;
  });
  return { numbers, count: K };
}

function edgeKey(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

// Walls live on the RIGHT edge (vWall[idx] = between idx and idx+1) and the BOTTOM
// edge (hWall[idx] = between idx and idx+size) of a cell. We only wall edges the
// solution path never crosses, so the intended solution always stays reachable.
function placeWalls(path, size, density) {
  const n = size * size;
  const solEdges = new Set();
  for (let i = 0; i + 1 < path.length; i++) solEdges.add(edgeKey(path[i], path[i + 1]));
  const vWall = new Array(n).fill(false);
  const hWall = new Array(n).fill(false);
  for (let idx = 0; idx < n; idx++) {
    const r = Math.floor(idx / size);
    const c = idx % size;
    if (c < size - 1 && !solEdges.has(edgeKey(idx, idx + 1)) && Math.random() < density) {
      vWall[idx] = true;
    }
    if (r < size - 1 && !solEdges.has(edgeKey(idx, idx + size)) && Math.random() < density) {
      hWall[idx] = true;
    }
  }
  return { vWall, hWall };
}

// Build a puzzle plus the guaranteed solution path that produced it. The public
// generatePuzzle() strips `solution` so it is never held on a room or serialized.
function buildPuzzle(diffKey) {
  const cfg = DIFFICULTIES[diffKey] || DIFFICULTIES.medium;
  const size = cfg.size;
  const path = snakePath(size);
  backbite(path, size, size * size * 30);
  const { numbers, count } = placeCheckpoints(path, cfg.checkpoints);
  const { vWall, hWall } = placeWalls(path, size, cfg.wallDensity);
  return { size, numbers, vWall, hWall, checkpointCount: count, solution: path.slice() };
}

function generatePuzzle(diffKey) {
  const { solution, ...pub } = buildPuzzle(diffKey);
  return pub;
}

// Can the path step directly between grid-adjacent cells a and b (no wall)?
function edgeOpen(a, b, size, vWall, hWall) {
  const ra = Math.floor(a / size);
  const ca = a % size;
  const rb = Math.floor(b / size);
  const cb = b % size;
  if (ra === rb && Math.abs(ca - cb) === 1) return !vWall[Math.min(a, b)];
  if (ca === cb && Math.abs(ra - rb) === 1) return !hWall[Math.min(a, b)];
  return false;
}

// Exposed for tests only — lets a harness verify generated boards are solvable
// (buildPuzzle returns the construction's guaranteed solution path).
export const __test = { generatePuzzle, buildPuzzle, edgeOpen };

export function createZipRoom(hostName, hostColor) {
  let code;
  do {
    let s = "";
    for (let i = 0; i < 4; i++)
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    code = `ZIP-${s}`;
  } while (rooms.has(code));
  const room = new ZipRoom(code);
  const host = room.addPlayer(hostName, hostColor);
  room.hostId = host.id;
  rooms.set(code, room);
  return { room, player: host };
}

export function getZipRoom(code) {
  if (!code) return null;
  return rooms.get(code.toUpperCase().trim()) || null;
}

export function sweepZipRooms() {
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

class ZipRoom {
  constructor(code) {
    this.code = code;
    this.hostId = null;
    this.status = "lobby"; // lobby | playing | finished
    this.settings = {
      numTeams: 2,
      difficulty: "medium",
    };
    this.players = [];

    this.solo = false; // true when a single player is racing only the clock
    this.puzzle = null; // { size, numbers, vWall, hWall, checkpointCount }
    this.teamPaths = {}; // teamIndex -> array of cell indices (working path)
    this.teamFinish = {}; // teamIndex -> finishMs
    this.startMs = null;
    this.winnerTeam = null;
    this.result = null; // snapshot at finish
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
    if (this.status !== "lobby") return { error: "zip_err_locked" };
    const t = clampInt(team, 0, this.settings.numTeams - 1);
    const p = this.getPlayer(playerId);
    if (!p) return;
    p.team = t;
  }

  // ---------- settings ----------
  updateSettings(playerId, patch = {}) {
    if (playerId !== this.hostId) return { error: "zip_err_host_only" };
    if (this.status !== "lobby") return { error: "zip_err_locked" };
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
  }

  // ---------- game flow ----------
  // opts.solo lets a single player start alone (race the clock, no opponents).
  startGame(playerId, opts = {}) {
    if (playerId !== this.hostId) return { error: "zip_err_host_only" };
    if (this.status !== "lobby") return { error: "zip_err_locked" };
    const solo = !!opts.solo;
    if (solo) {
      if (this.connectedPlayers().length < 1)
        return { error: "zip_err_need_players" };
    } else {
      if (this.connectedPlayers().length < 2)
        return { error: "zip_err_need_players" };
      if (this.filledTeams().length < 2) return { error: "zip_err_need_teams" };
    }
    this.solo = solo;

    this.puzzle = generatePuzzle(this.settings.difficulty);
    this.teamPaths = {};
    this.teamFinish = {};
    for (const t of this.filledTeams()) this.teamPaths[t] = [];
    this.startMs = Date.now();
    this.winnerTeam = null;
    this.result = null;
    this.rewarded = false;
    this.status = "playing";
    for (const t of this.filledTeams()) this.emitTeamPath(t);
    return { ok: true };
  }

  // Validate a proposed full path against the puzzle rules. Returns
  // { ok, complete }. A path is legal if: cells are unique, it starts on the
  // "1" cell, every step crosses an open edge, and numbered cells are entered in
  // strict ascending order (you can't reach 3 before 2). It is complete when it
  // additionally covers every cell and has collected the final number.
  validatePath(path) {
    const pz = this.puzzle;
    if (!pz) return { ok: false, complete: false };
    if (!Array.isArray(path)) return { ok: false, complete: false };
    const n = pz.size * pz.size;
    if (path.length === 0) return { ok: true, complete: false }; // empty = reset
    if (path.length > n) return { ok: false, complete: false };
    // The line must start on checkpoint "1" (matches the client + real Zip rule).
    if (pz.numbers[path[0]] !== 1) return { ok: false, complete: false };

    const seen = new Set();
    let expectNum = 1; // next numbered checkpoint we're allowed to enter
    for (let i = 0; i < path.length; i++) {
      const cell = path[i];
      if (!Number.isInteger(cell) || cell < 0 || cell >= n) return { ok: false, complete: false };
      if (seen.has(cell)) return { ok: false, complete: false };
      seen.add(cell);
      const num = pz.numbers[cell];
      if (num > 0) {
        if (num !== expectNum) return { ok: false, complete: false };
        expectNum++;
      }
      if (i > 0 && !edgeOpen(path[i - 1], cell, pz.size, pz.vWall, pz.hWall))
        return { ok: false, complete: false };
    }
    const complete = path.length === n && expectNum - 1 === pz.checkpointCount;
    return { ok: true, complete };
  }

  // A player commits their team's working path. Illegal paths are ignored.
  setPath(playerId, path) {
    if (this.status !== "playing") return;
    const p = this.getPlayer(playerId);
    if (!p || !p.connected) return;
    const { ok, complete } = this.validatePath(path);
    if (!ok) return;
    this.teamPaths[p.team] = path.slice();
    this.emitTeamPath(p.team, { by: p.id });
    if (complete) {
      this.teamFinish[p.team] = Date.now() - this.startMs;
      this.finishGame(p.team);
    }
  }

  finishGame(winnerTeam) {
    this.status = "finished";
    this.winnerTeam = winnerTeam ?? null;

    const standings = this.filledTeams()
      .map((t) => ({
        team: t,
        color: TEAM_DEFS[t].color,
        name: TEAM_DEFS[t].name,
        filled: this.countFilled(t),
        finishMs: this.teamFinish[t] ?? null,
        members: this.teamMembers(t).map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
        })),
      }))
      .sort((a, b) => {
        const af = a.finishMs != null;
        const bf = b.finishMs != null;
        if (af !== bf) return af ? -1 : 1;
        if (af && bf) return a.finishMs - b.finishMs;
        return b.filled - a.filled;
      });

    this.result = { winnerTeam: this.winnerTeam, standings };
    this.awardRewards();
    this.emitRoom("zip_gameover", { winnerTeam: this.winnerTeam });
  }

  // Host can end early — the leading team (most cells covered) is credited.
  endByHost(playerId) {
    if (playerId !== this.hostId) return { error: "zip_err_host_only" };
    if (this.status !== "playing") return;
    let best = null;
    let bestFilled = -1;
    for (const t of this.filledTeams()) {
      const f = this.countFilled(t);
      if (f > bestFilled) {
        bestFilled = f;
        best = t;
      }
    }
    this.finishGame(best);
  }

  // Grant coins + XP to logged-in players once per game.
  awardRewards() {
    if (this.rewarded) return;
    this.rewarded = true;
    for (const p of this.players) {
      if (!p.userId) continue;
      const won = p.team === this.winnerTeam;
      const r = won ? REWARD_WIN : REWARD_PLAYED;
      const res = grantReward(p.userId, {
        coinGain: r.coins,
        xpGain: r.xp,
        won,
        played: true,
        mode: this.solo ? "solo" : "versus",
        game: "zip",
      });
      if (res && p.socketId && ioNsp) {
        ioNsp.to(p.socketId).emit("zip_reward", {
          coins: r.coins,
          xp: r.xp,
          won,
          profile: res.profile,
          unlocked: res.unlocked,
        });
      }
    }
    if (!this.solo) {
      recordMatch("zip", this.players.map((p) => ({
        userId: p.userId,
        name: p.name,
        team: p.team,
        won: p.team === this.winnerTeam,
      })));
    }
  }

  playAgain(playerId) {
    if (playerId !== this.hostId) return { error: "zip_err_host_only" };
    this.status = "lobby";
    this.puzzle = null;
    this.teamPaths = {};
    this.teamFinish = {};
    this.startMs = null;
    this.winnerTeam = null;
    this.result = null;
    this.rewarded = false;
    this.solo = false;
  }

  // ---------- helpers ----------
  countFilled(team) {
    const path = this.teamPaths[team];
    return path ? path.length : 0;
  }

  cellsTotal() {
    return this.puzzle ? this.puzzle.size * this.puzzle.size : 0;
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
    const total = this.cellsTotal();
    const out = [];
    for (let t = 0; t < this.settings.numTeams; t++) {
      const def = TEAM_DEFS[t];
      out.push({
        index: t,
        color: def.color,
        name: def.name,
        members: this.teamMembers(t).map((p) => p.id),
        filled: this.status === "lobby" ? 0 : this.countFilled(t),
        total,
        finished: this.teamFinish[t] != null,
        finishMs: this.teamFinish[t] ?? null,
      });
    }
    return out;
  }

  // Public state — safe to broadcast to the whole room. The puzzle (numbers +
  // walls) is shared; only working paths stay private (sent per-team).
  toState() {
    const pz = this.puzzle;
    const showPuzzle = this.status !== "lobby" && pz;
    return {
      code: this.code,
      hostId: this.hostId,
      status: this.status,
      solo: this.solo,
      settings: this.settings,
      difficulty: this.settings.difficulty,
      size: showPuzzle ? pz.size : null,
      numbers: showPuzzle ? pz.numbers : null,
      vWall: showPuzzle ? pz.vWall : null,
      hWall: showPuzzle ? pz.hWall : null,
      checkpointCount: showPuzzle ? pz.checkpointCount : null,
      cellsTotal: showPuzzle ? pz.size * pz.size : 0,
      teams: this.teamsState(),
      players: this.players.map((p) => this.publicPlayer(p)),
      startMs: this.startMs,
      winnerTeam: this.winnerTeam,
      result: this.result,
    };
  }

  // ---------- emit ----------
  broadcast() {
    if (ioNsp) ioNsp.to(this.code).emit("zip_state", this.toState());
  }
  emitRoom(ev, data) {
    if (ioNsp) ioNsp.to(this.code).emit(ev, data);
  }
  // Send a team's working path to its own connected members only.
  emitTeamPath(team, meta = {}) {
    if (!ioNsp) return;
    const path = this.teamPaths[team];
    if (!path) return;
    const payload = { team, path, ...meta };
    for (const p of this.teamMembers(team, true)) {
      if (p.socketId) ioNsp.to(p.socketId).emit("zip_path", payload);
    }
    this.broadcast(); // progress bars for everyone
  }
  pathFor(player) {
    if (!player || this.status === "lobby") return null;
    const path = this.teamPaths[player.team];
    return path ? path.slice() : [];
  }
}

// ---------------------------------------------------------------------------
// Socket wiring — its own namespace, mirrors the SUDOKU thin style.
// ---------------------------------------------------------------------------
export function attachZipIO(io, serverUrl) {
  ioNsp = io.of("/zip");

  const ack = (fn, payload) => {
    if (typeof fn === "function") fn(payload);
  };

  function ctx(socket) {
    const code = socket.data.code;
    const room = code ? getZipRoom(code) : null;
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

  // Link a socket/player to a logged-in account (guests can still play, but only
  // accounts earn coins + XP).
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
        socket.emit("zip_notice", { type: "error", message: "zip_err_no_room" });
        return;
      }
      const res = fn(room, player) || {};
      if (res.error) socket.emit("zip_notice", { type: "error", message: res.error });
      room.broadcast();
    } catch (err) {
      console.error("zip handler error:", err);
      socket.emit("zip_notice", { type: "error", message: "zip_err_glitch" });
    }
  }

  ioNsp.on("connection", (socket) => {
    socket.emit("zip_config", { colors: AVATAR_COLORS, serverUrl });

    socket.on("zip_create", (payload = {}, cb) => {
      try {
        if (!userFromToken(payload.token)) return ack(cb, { error: "zip_err_login" });
        const { room, player } = createZipRoom(payload.name, payload.color);
        bind(socket, room, player);
        linkAccount(player, payload.token);
        ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
        room.broadcast();
      } catch (err) {
        console.error(err);
        ack(cb, { error: "zip_err_create" });
      }
    });

    socket.on("zip_join", (payload = {}, cb) => {
      try {
        if (!userFromToken(payload.token)) return ack(cb, { error: "zip_err_login" });
        const room = getZipRoom(payload.code);
        if (!room) return ack(cb, { error: "zip_err_no_code" });

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
              path: room.pathFor(existing),
            });
            room.broadcast();
            return;
          }
        }

        if (room.status !== "lobby") return ack(cb, { error: "zip_err_started" });
        const player = room.addPlayer(payload.name, payload.color);
        bind(socket, room, player);
        linkAccount(player, payload.token);
        ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
        room.broadcast();
      } catch (err) {
        console.error(err);
        ack(cb, { error: "zip_err_join" });
      }
    });

    socket.on("zip_join_team", ({ team } = {}) =>
      handle(socket, (room, player) => room.joinTeam(player.id, team))
    );
    socket.on("zip_settings", (patch = {}) =>
      handle(socket, (room, player) => room.updateSettings(player.id, patch))
    );
    socket.on("zip_start", (opts = {}) =>
      handle(socket, (room, player) => room.startGame(player.id, opts))
    );
    socket.on("zip_draw", ({ path } = {}) => {
      // setPath resolves its own targeted path emit + broadcast.
      const { room, player } = ctx(socket);
      if (room && player) room.setPath(player.id, path);
    });
    socket.on("zip_end", () =>
      handle(socket, (room, player) => room.endByHost(player.id))
    );
    socket.on("zip_again", () =>
      handle(socket, (room, player) => room.playAgain(player.id))
    );

    socket.on("zip_leave", () => {
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
