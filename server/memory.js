// server/memory.js
// Authoritative engine for MEMORY MATCH — a team-vs-team memory race.
//
// Every player gets their OWN independent board, but within a round all players
// share the SAME emoji layout so the race is fair (only memory & speed differ).
// A team's round is complete when all its connected members have cleared their
// board; the FIRST team to complete the round wins it. Across rounds the grid
// grows (4x4 → up to the host's chosen max) and the team that wins the most
// rounds wins the game (ties broken by total winning time).
//
// Runs on its own Socket.IO namespace ("/memory") so it never touches SPILL.

import crypto from "crypto";
import { userFromToken, grantReward, recordMatch } from "./accounts.js";

const rooms = new Map(); // code -> MemoryRoom
let ioNsp = null;

// Coins + XP handed out once per game (MEMORY is always team-vs-team → versus).
const REWARD_WIN = { coins: 12, xp: 10 };
const REWARD_PLAYED = { coins: 4, xp: 3 };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

export const AVATAR_COLORS = [
  "#FF3D77", "#22E0D6", "#FFC53D", "#8B5CF6",
  "#4ADE80", "#FB923C", "#38BDF8", "#F472B6",
  "#A3E635", "#E879F9", "#2DD4BF", "#FBBF24",
  "#60A5FA", "#F87171", "#C084FC", "#34D399",
];

// Grid progression. Rounds walk this list from index 0 up to the host's max.
// Every grid has an even card count (whole number of pairs).
export const GRIDS = [
  { cols: 4, rows: 4 }, // 8 pairs
  { cols: 4, rows: 6 }, // 12 pairs
  { cols: 6, rows: 6 }, // 18 pairs
  { cols: 6, rows: 8 }, // 24 pairs
  { cols: 8, rows: 8 }, // 32 pairs
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

// Enough distinct faces for the biggest grid (8x8 = 32 pairs).
const EMOJI = [
  "🍕", "🎸", "🚀", "🐙", "🌮", "🎈", "🍩", "👻", "🐳", "🦊",
  "🌵", "⚽", "🎧", "🍔", "🦄", "🍉", "🐝", "🎩", "🔥", "🌈",
  "🍄", "🎲", "🐢", "🍭", "🦖", "🛸", "🧩", "🍒", "🐬", "🌻",
  "🎯", "🧸", "🍿", "🐧", "🥑", "🎁", "🪐", "🦋", "🍋", "🐸",
  "⭐", "🌙", "🎃", "🦉",
];

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

export function createMemoryRoom(hostName, hostColor) {
  let code;
  do {
    let s = "";
    for (let i = 0; i < 4; i++)
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    code = `MEM-${s}`;
  } while (rooms.has(code));
  const room = new MemoryRoom(code);
  const host = room.addPlayer(hostName, hostColor);
  room.hostId = host.id;
  rooms.set(code, room);
  return { room, player: host };
}

export function getMemoryRoom(code) {
  if (!code) return null;
  return rooms.get(code.toUpperCase().trim()) || null;
}

export function sweepMemoryRooms() {
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

class MemoryRoom {
  constructor(code) {
    this.code = code;
    this.hostId = null;
    this.status = "lobby"; // lobby | playing | roundover | finished
    this.settings = {
      numTeams: 2,
      maxGridIndex: 2, // default: rounds 4x4, 4x6, 6x6
    };
    this.players = [];

    this.round = 0; // index into GRIDS
    this.board = null; // { cards:[{emoji}], cols, rows }
    this.roundStartMs = null;
    this.finishCounter = 0;
    this.roundWinnerTeam = null;
    this.roundResults = []; // history, one per finished round
    this.roundWins = {}; // teamIndex -> wins
    this.roundTimeTotals = {}; // teamIndex -> summed winning time (tiebreak)
    this.overallWinnerTeam = null;
    this.rewarded = false; // guard so a game only pays out once

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
      userId: null, // set when a logged-in account plays
      joinedAt: Date.now(),
      prog: null, // per-round board progress
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
    if (this.status !== "lobby") return { error: "mem_err_locked" };
    const t = clampInt(team, 0, this.settings.numTeams - 1);
    const p = this.getPlayer(playerId);
    if (!p) return;
    p.team = t;
  }

  // ---------- settings ----------
  updateSettings(playerId, patch = {}) {
    if (playerId !== this.hostId) return { error: "mem_err_host_only" };
    if (this.status !== "lobby") return { error: "mem_err_locked" };
    const s = this.settings;
    if ("numTeams" in patch) {
      s.numTeams = clampInt(patch.numTeams, 2, TEAM_DEFS.length);
      // Pull anyone stranded on a now-removed team back into range.
      for (const p of this.players) {
        if (p.team >= s.numTeams) p.team = this.smallestTeam();
      }
    }
    if ("maxGridIndex" in patch)
      s.maxGridIndex = clampInt(patch.maxGridIndex, 0, GRIDS.length - 1);
  }

  // ---------- game flow ----------
  startGame(playerId) {
    if (playerId !== this.hostId) return { error: "mem_err_host_only" };
    if (this.status !== "lobby") return { error: "mem_err_locked" };
    if (this.connectedPlayers().length < 2)
      return { error: "mem_err_need_players" };
    const filled = this.filledTeams();
    if (filled.length < 2) return { error: "mem_err_need_teams" };

    this.round = 0;
    this.roundResults = [];
    this.roundWins = {};
    this.roundTimeTotals = {};
    this.overallWinnerTeam = null;
    this.rewarded = false;
    this.startRound();
    return { ok: true };
  }

  filledTeams() {
    const set = new Set();
    for (const p of this.connectedPlayers()) set.add(p.team);
    return [...set].filter((t) => t < this.settings.numTeams);
  }

  startRound() {
    const g = GRIDS[this.round];
    const pairs = (g.cols * g.rows) / 2;
    const faces = shuffle(EMOJI).slice(0, pairs);
    const cards = shuffle(faces.concat(faces)).map((emoji) => ({ emoji }));
    this.board = { cards, cols: g.cols, rows: g.rows };
    this.roundStartMs = Date.now();
    this.finishCounter = 0;
    this.roundWinnerTeam = null;
    this.status = "playing";
    for (const p of this.players) this.resetProgress(p);
  }

  resetProgress(p) {
    const n = this.board ? this.board.cards.length : 0;
    p.prog = {
      matched: new Array(n).fill(false),
      up: [], // indices currently face-up & unmatched (server truth: 0 or 1)
      matchedPairs: 0,
      moves: 0,
      finished: false,
      finishMs: null,
      finishOrder: null,
    };
  }

  // Player flips card `index` on their own board.
  flip(playerId, index) {
    if (this.status !== "playing") return;
    const p = this.getPlayer(playerId);
    if (!p || !p.connected || !p.prog) return;
    const prog = p.prog;
    if (prog.finished) return;
    const n = this.board.cards.length;
    index = Number(index);
    if (!Number.isInteger(index) || index < 0 || index >= n) return;
    if (prog.matched[index]) return;
    if (prog.up.includes(index)) return;
    if (prog.up.length >= 2) return; // a pair is already pending (shouldn't happen)

    const emoji = this.board.cards[index].emoji;
    // Reveal only to this player.
    this.emitPlayer(playerId, "mem_reveal", { index, emoji });

    if (prog.up.length === 0) {
      prog.up = [index];
      return; // first of a pair — wait for the second
    }

    // Second of a pair.
    const a = prog.up[0];
    const b = index;
    prog.up = [];
    prog.moves += 1;
    const match = this.board.cards[a].emoji === this.board.cards[b].emoji;
    if (match) {
      prog.matched[a] = true;
      prog.matched[b] = true;
      prog.matchedPairs += 1;
      this.emitPlayer(playerId, "mem_pair", { a, b, match: true });
      if (prog.matchedPairs === n / 2) {
        prog.finished = true;
        prog.finishMs = Date.now() - this.roundStartMs;
        prog.finishOrder = ++this.finishCounter;
        this.checkRoundEnd();
      }
    } else {
      // Client shows both briefly, then flips them back (purely visual).
      this.emitPlayer(playerId, "mem_pair", { a, b, match: false });
    }
    this.broadcast();
  }

  checkRoundEnd() {
    if (this.roundWinnerTeam !== null) return;
    let winner = null;
    let winnerTime = Infinity;
    for (const t of this.filledTeams()) {
      const members = this.teamMembers(t, true);
      if (members.length === 0) continue;
      if (members.every((m) => m.prog && m.prog.finished)) {
        const teamTime = Math.max(...members.map((m) => m.prog.finishMs));
        if (teamTime < winnerTime) {
          winnerTime = teamTime;
          winner = t;
        }
      }
    }
    if (winner === null) return;

    this.roundWinnerTeam = winner;
    this.roundWins[winner] = (this.roundWins[winner] || 0) + 1;
    this.roundTimeTotals[winner] = (this.roundTimeTotals[winner] || 0) + winnerTime;
    this.status = "roundover";

    const g = GRIDS[this.round];
    this.roundResults.push({
      round: this.round,
      cols: g.cols,
      rows: g.rows,
      winnerTeam: winner,
      winnerTime,
      standings: this.players
        .filter((p) => p.prog)
        .map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          team: p.team,
          finished: p.prog.finished,
          finishMs: p.prog.finishMs,
          moves: p.prog.moves,
          matchedPairs: p.prog.matchedPairs,
        })),
    });
    this.emitRoom("mem_roundover", { winnerTeam: winner });
  }

  nextRound(playerId) {
    if (playerId !== this.hostId) return { error: "mem_err_host_only" };
    if (this.status !== "roundover") return;
    if (this.round >= this.settings.maxGridIndex) {
      this.finishGame();
      return { ok: true };
    }
    this.round += 1;
    this.startRound();
    return { ok: true };
  }

  finishGame() {
    this.status = "finished";
    const ranked = this.filledTeams().sort((a, b) => {
      const wa = this.roundWins[a] || 0;
      const wb = this.roundWins[b] || 0;
      if (wb !== wa) return wb - wa;
      // Fewer total winning-time wins the tiebreak.
      return (this.roundTimeTotals[a] || Infinity) - (this.roundTimeTotals[b] || Infinity);
    });
    this.overallWinnerTeam = ranked.length ? ranked[0] : null;
    this.awardRewards();
    this.emitRoom("mem_gameover", { winnerTeam: this.overallWinnerTeam });
  }

  // Grant coins + XP + ranked points to logged-in players, once per game.
  awardRewards() {
    if (this.rewarded) return;
    this.rewarded = true;
    for (const p of this.players) {
      if (!p.userId) continue;
      const won =
        this.overallWinnerTeam != null && p.team === this.overallWinnerTeam;
      const r = won ? REWARD_WIN : REWARD_PLAYED;
      const res = grantReward(p.userId, {
        coinGain: r.coins,
        xpGain: r.xp,
        won,
        played: true,
        mode: "versus", // MEMORY is always team-vs-team
        game: "memory",
      });
      if (res && p.socketId && ioNsp) {
        ioNsp.to(p.socketId).emit("mem_reward", {
          coins: r.coins,
          xp: r.xp,
          won,
          profile: res.profile,
          unlocked: res.unlocked,
        });
      }
    }
    recordMatch("memory", this.players.map((p) => ({
      userId: p.userId,
      name: p.name,
      team: p.team,
      won: this.overallWinnerTeam != null && p.team === this.overallWinnerTeam,
    })));
  }

  endByHost(playerId) {
    if (playerId !== this.hostId) return { error: "mem_err_host_only" };
    if (this.status !== "playing" && this.status !== "roundover") return;
    this.finishGame();
  }

  playAgain(playerId) {
    if (playerId !== this.hostId) return { error: "mem_err_host_only" };
    this.status = "lobby";
    this.round = 0;
    this.board = null;
    this.roundStartMs = null;
    this.roundWinnerTeam = null;
    this.roundResults = [];
    this.roundWins = {};
    this.roundTimeTotals = {};
    this.overallWinnerTeam = null;
    for (const p of this.players) p.prog = null;
  }

  // ---------- serialization ----------
  publicPlayer(p) {
    const prog = p.prog;
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      team: p.team,
      connected: p.connected,
      isHost: p.id === this.hostId,
      matchedPairs: prog ? prog.matchedPairs : 0,
      moves: prog ? prog.moves : 0,
      finished: prog ? prog.finished : false,
      finishMs: prog ? prog.finishMs : null,
      finishOrder: prog ? prog.finishOrder : null,
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
        wins: this.roundWins[t] || 0,
      });
    }
    return out;
  }

  toState() {
    const g = GRIDS[this.round] || GRIDS[0];
    const pairs = (g.cols * g.rows) / 2;
    return {
      code: this.code,
      hostId: this.hostId,
      status: this.status,
      settings: this.settings,
      maxGridIndex: this.settings.maxGridIndex,
      totalRounds: this.settings.maxGridIndex + 1,
      round: this.round,
      grid: { cols: g.cols, rows: g.rows, pairs },
      teams: this.teamsState(),
      players: this.players.map((p) => this.publicPlayer(p)),
      roundWinnerTeam: this.roundWinnerTeam,
      lastRoundResult:
        this.status === "roundover" || this.status === "finished"
          ? this.roundResults[this.roundResults.length - 1] || null
          : null,
      roundWins: this.roundWins,
      overallWinnerTeam: this.overallWinnerTeam,
    };
  }

  // What this player has revealed on their own board (for reconnects).
  privateBoard(p) {
    if (!p.prog || !this.board) return null;
    const matched = [];
    for (let i = 0; i < p.prog.matched.length; i++) {
      if (p.prog.matched[i]) matched.push({ index: i, emoji: this.board.cards[i].emoji });
    }
    const up = p.prog.up.map((i) => ({ index: i, emoji: this.board.cards[i].emoji }));
    return { matched, up };
  }

  // ---------- emit ----------
  broadcast() {
    if (ioNsp) ioNsp.to(this.code).emit("mem_state", this.toState());
  }
  emitRoom(ev, data) {
    if (ioNsp) ioNsp.to(this.code).emit(ev, data);
  }
  emitPlayer(playerId, ev, data) {
    const p = this.getPlayer(playerId);
    if (ioNsp && p && p.socketId) ioNsp.to(p.socketId).emit(ev, data);
  }
}

// ---------------------------------------------------------------------------
// Socket wiring — its own namespace, mirrors the SPILL server's thin style.
// ---------------------------------------------------------------------------
export function attachMemoryIO(io, serverUrl) {
  ioNsp = io.of("/memory");

  const ack = (fn, payload) => {
    if (typeof fn === "function") fn(payload);
  };

  function ctx(socket) {
    const code = socket.data.code;
    const room = code ? getMemoryRoom(code) : null;
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

  // Link a player seat to a logged-in account (optional — guests can still play).
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

  // Run a mutating handler, surface {error}, then broadcast.
  function handle(socket, fn) {
    try {
      const { room, player } = ctx(socket);
      if (!room || !player) {
        socket.emit("mem_notice", { type: "error", message: "mem_err_no_room" });
        return;
      }
      const res = fn(room, player) || {};
      if (res.error) socket.emit("mem_notice", { type: "error", message: res.error });
      room.broadcast();
    } catch (err) {
      console.error("memory handler error:", err);
      socket.emit("mem_notice", { type: "error", message: "mem_err_glitch" });
    }
  }

  ioNsp.on("connection", (socket) => {
    socket.emit("mem_config", { colors: AVATAR_COLORS, serverUrl });

    socket.on("mem_create", (payload = {}, cb) => {
      try {
        if (!userFromToken(payload.token)) return ack(cb, { error: "mem_err_login" });
        const { room, player } = createMemoryRoom(payload.name, payload.color);
        bind(socket, room, player);
        linkAccount(player, payload.token);
        ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
        room.broadcast();
      } catch (err) {
        console.error(err);
        ack(cb, { error: "mem_err_create" });
      }
    });

    socket.on("mem_join", (payload = {}, cb) => {
      try {
        if (!userFromToken(payload.token)) return ack(cb, { error: "mem_err_login" });
        const room = getMemoryRoom(payload.code);
        if (!room) return ack(cb, { error: "mem_err_no_code" });

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
              board: room.privateBoard(existing),
            });
            room.broadcast();
            return;
          }
        }

        if (room.status !== "lobby")
          return ack(cb, { error: "mem_err_started" });
        const player = room.addPlayer(payload.name, payload.color);
        bind(socket, room, player);
        linkAccount(player, payload.token);
        ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
        room.broadcast();
      } catch (err) {
        console.error(err);
        ack(cb, { error: "mem_err_join" });
      }
    });

    socket.on("mem_join_team", ({ team } = {}) =>
      handle(socket, (room, player) => room.joinTeam(player.id, team))
    );
    socket.on("mem_settings", (patch = {}) =>
      handle(socket, (room, player) => room.updateSettings(player.id, patch))
    );
    socket.on("mem_start", () =>
      handle(socket, (room, player) => room.startGame(player.id))
    );
    socket.on("mem_flip", ({ index } = {}) => {
      // Flip resolves its own targeted reveals + broadcast; no generic wrap.
      const { room, player } = ctx(socket);
      if (room && player) room.flip(player.id, index);
    });
    socket.on("mem_next", () =>
      handle(socket, (room, player) => room.nextRound(player.id))
    );
    socket.on("mem_end", () =>
      handle(socket, (room, player) => room.endByHost(player.id))
    );
    socket.on("mem_again", () =>
      handle(socket, (room, player) => room.playAgain(player.id))
    );

    socket.on("mem_leave", () => {
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
