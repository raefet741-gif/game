// server/sudoku.js
// Authoritative engine for SUDOKU RACE — a competitive team-vs-team Sudoku.
//
// Every team races the SAME puzzle. All members of a team collaborate on ONE
// shared grid (they see each other's entries live), so 1v1, 2v2, 3v3 and larger
// team-vs-team all work: more hands can mean more speed. The FIRST team to fill
// its grid completely and correctly wins — i.e. the team that finishes in the
// least time. Winning members (and, more modestly, everyone who played) earn
// coins + XP on their accounts.
//
// A team's grid is only ever sent to that team's own members, so opponents can't
// copy answers. Runs on its own Socket.IO namespace ("/sudoku").

import crypto from "crypto";
import { userFromToken, grantReward } from "./accounts.js";

const rooms = new Map(); // code -> SudokuRoom
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

// Difficulty → how many of the 81 cells are given as clues. Fewer clues = harder.
export const DIFFICULTIES = {
  easy: { clues: 42 },
  medium: { clues: 34 },
  hard: { clues: 28 },
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

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Sudoku generation. Grids are flat 81-length arrays (0 = empty). Index = r*9+c.
// ---------------------------------------------------------------------------
function canPlace(grid, idx, val) {
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  for (let i = 0; i < 9; i++) {
    if (grid[r * 9 + i] === val) return false; // row
    if (grid[i * 9 + c] === val) return false; // col
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++)
    for (let dc = 0; dc < 3; dc++)
      if (grid[(br + dr) * 9 + (bc + dc)] === val) return false; // box
  return true;
}

// Fill an empty grid with a random complete valid solution (backtracking).
function fillSolution(grid, pos = 0) {
  if (pos === 81) return true;
  if (grid[pos] !== 0) return fillSolution(grid, pos + 1);
  for (const val of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (canPlace(grid, pos, val)) {
      grid[pos] = val;
      if (fillSolution(grid, pos + 1)) return true;
      grid[pos] = 0;
    }
  }
  return false;
}

// Generate a puzzle: full solution + a `given` mask keeping `clues` cells.
// Clues are removed symmetrically (mirror pairs) which reads more like a real
// Sudoku. Win is validated by Sudoku rules, so alternate solutions are fine.
function generatePuzzle(clues) {
  const solution = new Array(81).fill(0);
  fillSolution(solution);

  const given = new Array(81).fill(true);
  let remaining = 81;
  const order = shuffle([...Array(81).keys()]);
  for (const idx of order) {
    if (remaining <= clues) break;
    if (!given[idx]) continue;
    const mirror = 80 - idx;
    given[idx] = false;
    remaining--;
    if (mirror !== idx && given[mirror] && remaining > clues) {
      given[mirror] = false;
      remaining--;
    }
  }

  const puzzle = solution.map((v, i) => (given[i] ? v : 0));
  return { puzzle, given };
}

// Is a filled grid (all 81 non-zero) a valid Sudoku solution?
function isSolved(grid) {
  for (let i = 0; i < 81; i++) if (!grid[i]) return false;
  for (let u = 0; u < 9; u++) {
    const row = new Set();
    const col = new Set();
    const box = new Set();
    for (let k = 0; k < 9; k++) {
      row.add(grid[u * 9 + k]);
      col.add(grid[k * 9 + u]);
      const br = Math.floor(u / 3) * 3 + Math.floor(k / 3);
      const bc = (u % 3) * 3 + (k % 3);
      box.add(grid[br * 9 + bc]);
    }
    if (row.size !== 9 || col.size !== 9 || box.size !== 9) return false;
  }
  return true;
}

export function createSudokuRoom(hostName, hostColor) {
  let code;
  do {
    let s = "";
    for (let i = 0; i < 4; i++)
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    code = `SDK-${s}`;
  } while (rooms.has(code));
  const room = new SudokuRoom(code);
  const host = room.addPlayer(hostName, hostColor);
  room.hostId = host.id;
  rooms.set(code, room);
  return { room, player: host };
}

export function getSudokuRoom(code) {
  if (!code) return null;
  return rooms.get(code.toUpperCase().trim()) || null;
}

export function sweepSudokuRooms() {
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

class SudokuRoom {
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
    this.puzzle = null; // 81 (0 = blank, else given clue)
    this.given = null; // 81 booleans
    this.teamGrids = {}; // teamIndex -> 81 numbers (working grid)
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
    if (this.status !== "lobby") return { error: "sdk_err_locked" };
    const t = clampInt(team, 0, this.settings.numTeams - 1);
    const p = this.getPlayer(playerId);
    if (!p) return;
    p.team = t;
  }

  // ---------- settings ----------
  updateSettings(playerId, patch = {}) {
    if (playerId !== this.hostId) return { error: "sdk_err_host_only" };
    if (this.status !== "lobby") return { error: "sdk_err_locked" };
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
    if (playerId !== this.hostId) return { error: "sdk_err_host_only" };
    if (this.status !== "lobby") return { error: "sdk_err_locked" };
    const solo = !!opts.solo;
    if (solo) {
      if (this.connectedPlayers().length < 1)
        return { error: "sdk_err_need_players" };
    } else {
      if (this.connectedPlayers().length < 2)
        return { error: "sdk_err_need_players" };
      if (this.filledTeams().length < 2) return { error: "sdk_err_need_teams" };
    }
    this.solo = solo;

    const clues = DIFFICULTIES[this.settings.difficulty].clues;
    const { puzzle, given } = generatePuzzle(clues);
    this.puzzle = puzzle;
    this.given = given;
    this.teamGrids = {};
    this.teamFinish = {};
    for (const t of this.filledTeams()) this.teamGrids[t] = puzzle.slice();
    this.startMs = Date.now();
    this.winnerTeam = null;
    this.result = null;
    this.rewarded = false;
    this.status = "playing";
    // Send each team its fresh grid.
    for (const t of this.filledTeams()) this.emitTeamGrid(t);
    return { ok: true };
  }

  // A player writes `val` (0 clears, 1-9 fills) into cell `idx` of their team grid.
  setCell(playerId, idx, val) {
    if (this.status !== "playing") return;
    const p = this.getPlayer(playerId);
    if (!p || !p.connected) return;
    idx = Number(idx);
    val = Number(val);
    if (!Number.isInteger(idx) || idx < 0 || idx > 80) return;
    if (!Number.isInteger(val) || val < 0 || val > 9) return;
    if (this.given[idx]) return; // clue cell — immutable
    const grid = this.teamGrids[p.team];
    if (!grid) return;
    if (grid[idx] === val) return;

    grid[idx] = val;
    this.emitTeamGrid(p.team, { by: p.id, idx });

    if (isSolved(grid)) {
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
        // Finished teams first (by time), then by cells filled.
        const af = a.finishMs != null;
        const bf = b.finishMs != null;
        if (af !== bf) return af ? -1 : 1;
        if (af && bf) return a.finishMs - b.finishMs;
        return b.filled - a.filled;
      });

    this.result = { winnerTeam: this.winnerTeam, standings };
    this.awardRewards();
    this.emitRoom("sdk_gameover", { winnerTeam: this.winnerTeam });
  }

  // Host can end early — the leading team (most cells filled) is credited.
  endByHost(playerId) {
    if (playerId !== this.hostId) return { error: "sdk_err_host_only" };
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
      });
      if (res && p.socketId && ioNsp) {
        ioNsp.to(p.socketId).emit("sdk_reward", {
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
    if (playerId !== this.hostId) return { error: "sdk_err_host_only" };
    this.status = "lobby";
    this.puzzle = null;
    this.given = null;
    this.teamGrids = {};
    this.teamFinish = {};
    this.startMs = null;
    this.winnerTeam = null;
    this.result = null;
    this.rewarded = false;
    this.solo = false;
  }

  // ---------- helpers ----------
  countFilled(team) {
    const grid = this.teamGrids[team];
    if (!grid) return 0;
    let n = 0;
    for (let i = 0; i < 81; i++) if (grid[i]) n++;
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
    const out = [];
    for (let t = 0; t < this.settings.numTeams; t++) {
      const def = TEAM_DEFS[t];
      out.push({
        index: t,
        color: def.color,
        name: def.name,
        members: this.teamMembers(t).map((p) => p.id),
        filled: this.status === "lobby" ? 0 : this.countFilled(t),
        finished: this.teamFinish[t] != null,
        finishMs: this.teamFinish[t] ?? null,
      });
    }
    return out;
  }

  // Public state — safe to broadcast to the whole room (no team grids here).
  toState() {
    return {
      code: this.code,
      hostId: this.hostId,
      status: this.status,
      solo: this.solo,
      settings: this.settings,
      difficulty: this.settings.difficulty,
      given: this.status === "lobby" ? null : this.given,
      puzzle: this.status === "lobby" ? null : this.puzzle,
      teams: this.teamsState(),
      players: this.players.map((p) => this.publicPlayer(p)),
      startMs: this.startMs,
      cellsTotal: 81,
      winnerTeam: this.winnerTeam,
      result: this.result,
    };
  }

  // ---------- emit ----------
  broadcast() {
    if (ioNsp) ioNsp.to(this.code).emit("sdk_state", this.toState());
  }
  emitRoom(ev, data) {
    if (ioNsp) ioNsp.to(this.code).emit(ev, data);
  }
  // Send a team's working grid to its own connected members only.
  emitTeamGrid(team, meta = {}) {
    if (!ioNsp) return;
    const grid = this.teamGrids[team];
    if (!grid) return;
    const payload = { team, grid, ...meta };
    for (const p of this.teamMembers(team, true)) {
      if (p.socketId) ioNsp.to(p.socketId).emit("sdk_grid", payload);
    }
    this.broadcast(); // progress bars for everyone
  }
  gridFor(player) {
    if (!player || this.status === "lobby") return null;
    const grid = this.teamGrids[player.team];
    return grid ? grid.slice() : null;
  }
}

// ---------------------------------------------------------------------------
// Socket wiring — its own namespace, mirrors the SPILL/MEMORY thin style.
// ---------------------------------------------------------------------------
export function attachSudokuIO(io, serverUrl) {
  ioNsp = io.of("/sudoku");

  const ack = (fn, payload) => {
    if (typeof fn === "function") fn(payload);
  };

  function ctx(socket) {
    const code = socket.data.code;
    const room = code ? getSudokuRoom(code) : null;
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

  // Link a socket/player to a logged-in account (guests can still play, but
  // only accounts earn coins + XP).
  function linkAccount(player, token) {
    const user = userFromToken(token);
    if (user) player.userId = user.id;
  }

  function handle(socket, fn) {
    try {
      const { room, player } = ctx(socket);
      if (!room || !player) {
        socket.emit("sdk_notice", { type: "error", message: "sdk_err_no_room" });
        return;
      }
      const res = fn(room, player) || {};
      if (res.error) socket.emit("sdk_notice", { type: "error", message: res.error });
      room.broadcast();
    } catch (err) {
      console.error("sudoku handler error:", err);
      socket.emit("sdk_notice", { type: "error", message: "sdk_err_glitch" });
    }
  }

  ioNsp.on("connection", (socket) => {
    socket.emit("sdk_config", { colors: AVATAR_COLORS, serverUrl });

    socket.on("sdk_create", (payload = {}, cb) => {
      try {
        const { room, player } = createSudokuRoom(payload.name, payload.color);
        bind(socket, room, player);
        linkAccount(player, payload.token);
        ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
        room.broadcast();
      } catch (err) {
        console.error(err);
        ack(cb, { error: "sdk_err_create" });
      }
    });

    socket.on("sdk_join", (payload = {}, cb) => {
      try {
        const room = getSudokuRoom(payload.code);
        if (!room) return ack(cb, { error: "sdk_err_no_code" });

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
              grid: room.gridFor(existing),
            });
            room.broadcast();
            return;
          }
        }

        if (room.status !== "lobby") return ack(cb, { error: "sdk_err_started" });
        const player = room.addPlayer(payload.name, payload.color);
        bind(socket, room, player);
        linkAccount(player, payload.token);
        ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
        room.broadcast();
      } catch (err) {
        console.error(err);
        ack(cb, { error: "sdk_err_join" });
      }
    });

    socket.on("sdk_join_team", ({ team } = {}) =>
      handle(socket, (room, player) => room.joinTeam(player.id, team))
    );
    socket.on("sdk_settings", (patch = {}) =>
      handle(socket, (room, player) => room.updateSettings(player.id, patch))
    );
    socket.on("sdk_start", (opts = {}) =>
      handle(socket, (room, player) => room.startGame(player.id, opts))
    );
    socket.on("sdk_set", ({ idx, val } = {}) => {
      // setCell resolves its own targeted grid emit + broadcast.
      const { room, player } = ctx(socket);
      if (room && player) room.setCell(player.id, idx, val);
    });
    socket.on("sdk_end", () =>
      handle(socket, (room, player) => room.endByHost(player.id))
    );
    socket.on("sdk_again", () =>
      handle(socket, (room, player) => room.playAgain(player.id))
    );

    socket.on("sdk_leave", () => {
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
