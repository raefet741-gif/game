// server/puzzle.js
// Authoritative engine for PICTURE PUZZLE — a drag-the-pieces jigsaw.
//
// An image is sliced into a cols×rows grid of pieces and scrambled. Players
// drag pieces around the board to swap them until the picture is rebuilt.
//   • Solo is handled client-side; this module powers the MULTIPLAYER race.
//   • Multiplayer = free-for-all: everyone races their OWN copy of the SAME
//     scramble; the FIRST player to rebuild the image wins the coins & XP.
// Runs on its own Socket.IO namespace ("/puzzle").
//
// It also exposes the Gemini image helper used by the REST endpoint in
// index.js to turn an uploaded photo / selfie into an AI puzzle image (with a
// graceful fallback to the original photo when no key / the call fails).

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { userFromToken, grantReward, recordMatch } from "./accounts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUZZLE_DIR = path.join(__dirname, "..", "public", "puzzle");

const rooms = new Map(); // code -> PuzzleRoom
let ioNsp = null;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const AVATAR_COLORS = [
  "#FF3D77", "#22E0D6", "#FFC53D", "#8B5CF6",
  "#4ADE80", "#FB923C", "#38BDF8", "#F472B6",
  "#A3E635", "#E879F9", "#2DD4BF", "#FBBF24",
  "#60A5FA", "#F87171", "#C084FC", "#34D399",
];

// Difficulty → grid (cols × rows). Portrait-friendly (more rows than cols).
// Easy 12 pieces · Medium 24 · Hard 48.
export const DIFFICULTIES = {
  easy: { cols: 3, rows: 4 },
  medium: { cols: 4, rows: 6 },
  hard: { cols: 6, rows: 8 },
};

// Reward economy (per multiplayer game).
const REWARD_WIN = { coins: 45, xp: 22 };
const REWARD_PLAYED = { coins: 8, xp: 4 };

// ---- image catalog -------------------------------------------------------
// Built-in puzzle pictures live in public/puzzle/p*.jpg. Custom (uploaded or
// AI-generated) images are kept in memory and served via /api/puzzle/img/:id.
export function builtinImages() {
  let files = [];
  try {
    files = fs
      .readdirSync(PUZZLE_DIR)
      .filter((f) => /^p\d+\.(jpe?g|png|webp)$/i.test(f))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)[0], 10);
        const nb = parseInt(b.match(/\d+/)[0], 10);
        return na - nb;
      });
  } catch {
    files = [];
  }
  return files.map((f) => ({ id: `builtin:${f}`, url: `/puzzle/${f}` }));
}

const customImages = new Map(); // id -> { buf, mime, at }
const CUSTOM_MAX = 60;

export function storeCustomImage(buf, mime) {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  customImages.set(id, { buf, mime: mime || "image/jpeg", at: Date.now() });
  // Trim oldest if we exceed the cap.
  if (customImages.size > CUSTOM_MAX) {
    const oldest = [...customImages.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) customImages.delete(oldest[0]);
  }
  return { id, url: `/api/puzzle/img/${id}` };
}

export function getCustomImage(id) {
  return customImages.get(id) || null;
}

// Resolve a stored imageId to a URL the client can load.
function imageUrlFor(imageId) {
  if (!imageId) return null;
  if (imageId.startsWith("builtin:")) return `/puzzle/${imageId.slice(8)}`;
  if (customImages.has(imageId)) return `/api/puzzle/img/${imageId}`;
  return null;
}

// ---- Gemini image generation --------------------------------------------
// Turn an input photo (base64) into a puzzle image. Returns { buf, mime, ai }.
// Falls back to the ORIGINAL image whenever a key is missing or the call fails,
// so the feature always produces a usable puzzle.
export async function generatePuzzleImage(inputBase64, inputMime, stylePrompt) {
  const original = { buf: Buffer.from(inputBase64, "base64"), mime: inputMime || "image/jpeg", ai: false };
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ...original, note: "no_key" };

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const prompt =
    (stylePrompt && String(stylePrompt).slice(0, 300)) ||
    "Recreate this photo as a vivid, colorful, high-detail illustration suitable for a jigsaw puzzle. Keep the main subject clearly recognizable, add rich background detail and painterly texture. Portrait orientation, no text or watermarks.";

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: inputMime || "image/jpeg", data: inputBase64 } },
          ],
        },
      ],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    };
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 45000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[puzzle] Gemini ${res.status}: ${errText.slice(0, 300)}`);
      return { ...original, note: `api_${res.status}` };
    }
    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p) => p.inline_data?.data || p.inlineData?.data);
    const data = imgPart?.inline_data?.data || imgPart?.inlineData?.data;
    const mime = imgPart?.inline_data?.mime_type || imgPart?.inlineData?.mimeType || "image/png";
    if (!data) {
      console.warn("[puzzle] Gemini returned no image part");
      return { ...original, note: "no_image" };
    }
    return { buf: Buffer.from(data, "base64"), mime, ai: true };
  } catch (err) {
    console.warn("[puzzle] Gemini call failed:", err?.message || err);
    return { ...original, note: "exception" };
  }
}

// ---- helpers -------------------------------------------------------------
function randId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}
function clampStr(v, allowed, fallback) {
  return allowed.includes(v) ? v : fallback;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// A scramble that is guaranteed NOT already solved (for grids of >= 2 cells).
function scrambledOrder(n) {
  if (n < 2) return [...Array(n).keys()];
  let order;
  do {
    order = shuffle([...Array(n).keys()]);
  } while (order.every((v, i) => v === i));
  return order;
}

export function createPuzzleRoom(hostName, hostColor) {
  let code;
  do {
    let s = "";
    for (let i = 0; i < 4; i++)
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    code = `PZL-${s}`;
  } while (rooms.has(code));
  const room = new PuzzleRoom(code);
  const host = room.addPlayer(hostName, hostColor);
  room.hostId = host.id;
  rooms.set(code, room);
  return { room, player: host };
}

export function getPuzzleRoom(code) {
  if (!code) return null;
  return rooms.get(code.toUpperCase().trim()) || null;
}

export function sweepPuzzleRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyConnected = room.players.some((p) => p.connected);
    if (anyConnected) room.emptySince = null;
    else {
      room.emptySince = room.emptySince || now;
      if (now - room.emptySince > 20 * 60 * 1000) rooms.delete(code);
    }
  }
}

class PuzzleRoom {
  constructor(code) {
    this.code = code;
    this.hostId = null;
    this.status = "lobby"; // lobby | playing | finished
    this.settings = {
      difficulty: "easy",
      imageId: null, // chosen in lobby; defaults to first built-in on create
    };
    this.players = [];

    this.scramble = null; // shared initial arrangement (array: slot -> pieceId)
    this.grid = null; // { cols, rows, count }
    this.startMs = null;
    this.finishCounter = 0;
    this.winnerId = null;

    this.emptySince = null;

    const first = builtinImages()[0];
    if (first) this.settings.imageId = first.id;
  }

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
      connected: true,
      socketId: null,
      userId: null,
      joinedAt: Date.now(),
      prog: null,
    };
    this.players.push(player);
    return player;
  }

  getPlayer(id) { return this.players.find((p) => p.id === id) || null; }
  connectedPlayers() { return this.players.filter((p) => p.connected); }

  removePlayer(id) {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx === -1) return;
    this.players.splice(idx, 1);
    if (this.hostId === id) {
      const next = this.players.find((p) => p.connected) || this.players[0];
      this.hostId = next ? next.id : null;
    }
  }

  updateSettings(playerId, patch = {}) {
    if (playerId !== this.hostId) return { error: "pz_err_host_only" };
    if (this.status !== "lobby") return { error: "pz_err_locked" };
    if ("difficulty" in patch)
      this.settings.difficulty = clampStr(patch.difficulty, ["easy", "medium", "hard"], "easy");
    if ("imageId" in patch && imageUrlFor(patch.imageId))
      this.settings.imageId = patch.imageId;
    return { ok: true };
  }

  currentImageUrl() { return imageUrlFor(this.settings.imageId); }

  startGame(playerId) {
    if (playerId !== this.hostId) return { error: "pz_err_host_only" };
    if (this.status !== "lobby") return { error: "pz_err_locked" };
    if (this.connectedPlayers().length < 2) return { error: "pz_err_need_players" };
    if (!this.currentImageUrl()) return { error: "pz_err_no_image" };

    const d = DIFFICULTIES[this.settings.difficulty];
    const count = d.cols * d.rows;
    this.grid = { cols: d.cols, rows: d.rows, count };
    this.scramble = scrambledOrder(count);
    this.startMs = Date.now();
    this.finishCounter = 0;
    this.winnerId = null;
    this.status = "playing";
    for (const p of this.players) this.resetProgress(p);
    return { ok: true };
  }

  resetProgress(p) {
    p.prog = {
      arrangement: this.scramble ? this.scramble.slice() : [],
      moves: 0,
      solved: false,
      solveMs: null,
      solveOrder: null,
    };
  }

  correctCount(prog) {
    let c = 0;
    for (let i = 0; i < prog.arrangement.length; i++)
      if (prog.arrangement[i] === i) c++;
    return c;
  }

  swap(playerId, a, b) {
    if (this.status !== "playing") return;
    const p = this.getPlayer(playerId);
    if (!p || !p.connected || !p.prog || p.prog.solved) return;
    const arr = p.prog.arrangement;
    a = Number(a); b = Number(b);
    if (!Number.isInteger(a) || !Number.isInteger(b)) return;
    if (a < 0 || b < 0 || a >= arr.length || b >= arr.length || a === b) return;
    [arr[a], arr[b]] = [arr[b], arr[a]];
    p.prog.moves += 1;

    if (this.correctCount(p.prog) === arr.length) {
      p.prog.solved = true;
      p.prog.solveMs = Date.now() - this.startMs;
      p.prog.solveOrder = ++this.finishCounter;
      if (this.winnerId === null) {
        this.winnerId = p.id;
        this.finishGame();
        return;
      }
    }
    this.broadcast();
  }

  finishGame() {
    this.status = "finished";
    // Rewards: winner gets the win bonus, everyone who played gets a little.
    for (const p of this.players) {
      if (!p.userId) continue;
      const won = p.id === this.winnerId;
      const r = grantReward(p.userId, {
        coinGain: won ? REWARD_WIN.coins : REWARD_PLAYED.coins,
        xpGain: won ? REWARD_WIN.xp : REWARD_PLAYED.xp,
        won,
        played: true,
        mode: "versus", // the puzzle race is always against other people
        game: "puzzle",
      });
      if (r && p.socketId && ioNsp) {
        ioNsp.to(p.socketId).emit("pz_reward", {
          coins: won ? REWARD_WIN.coins : REWARD_PLAYED.coins,
          xp: won ? REWARD_WIN.xp : REWARD_PLAYED.xp,
          won,
          profile: r.profile,
        });
      }
    }
    // The puzzle race is free-for-all — each player is their own side.
    recordMatch("puzzle", this.players.map((p) => ({
      userId: p.userId,
      name: p.name,
      team: null,
      won: p.id === this.winnerId,
    })));
    this.emitRoom("pz_gameover", { winnerId: this.winnerId });
    this.broadcast(); // push the "finished" state (the swap path returns early)
  }

  endByHost(playerId) {
    if (playerId !== this.hostId) return { error: "pz_err_host_only" };
    if (this.status !== "playing") return;
    if (this.winnerId === null) {
      // No solver yet — winner is whoever has the most pieces in place.
      let best = null, bestC = -1;
      for (const p of this.connectedPlayers()) {
        const c = p.prog ? this.correctCount(p.prog) : 0;
        if (c > bestC) { bestC = c; best = p; }
      }
      this.winnerId = best ? best.id : null;
    }
    this.finishGame();
  }

  playAgain(playerId) {
    if (playerId !== this.hostId) return { error: "pz_err_host_only" };
    this.status = "lobby";
    this.scramble = null;
    this.grid = null;
    this.startMs = null;
    this.winnerId = null;
    for (const p of this.players) p.prog = null;
    return { ok: true };
  }

  publicPlayer(p) {
    const prog = p.prog;
    const total = this.grid ? this.grid.count : 0;
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      connected: p.connected,
      isHost: p.id === this.hostId,
      correct: prog ? this.correctCount(prog) : 0,
      total,
      moves: prog ? prog.moves : 0,
      solved: prog ? prog.solved : false,
      solveMs: prog ? prog.solveMs : null,
    };
  }

  toState() {
    return {
      code: this.code,
      hostId: this.hostId,
      status: this.status,
      settings: this.settings,
      imageUrl: this.currentImageUrl(),
      grid: this.grid,
      // Shared starting arrangement — not secret (everyone races the same one).
      // Clients init their local board from it once at round start.
      scramble: this.status === "playing" ? this.scramble : null,
      players: this.players.map((p) => this.publicPlayer(p)),
      winnerId: this.winnerId,
      difficulties: Object.fromEntries(
        Object.entries(DIFFICULTIES).map(([k, v]) => [k, { cols: v.cols, rows: v.rows, count: v.cols * v.rows }])
      ),
    };
  }

  // For reconnects — hand this player their own current arrangement.
  privateBoard(p) {
    if (!p.prog || !this.grid) return null;
    return { arrangement: p.prog.arrangement.slice(), moves: p.prog.moves, solved: p.prog.solved };
  }

  broadcast() { if (ioNsp) ioNsp.to(this.code).emit("pz_state", this.toState()); }
  emitRoom(ev, data) { if (ioNsp) ioNsp.to(this.code).emit(ev, data); }
}

// ---------------------------------------------------------------------------
// Socket wiring — own namespace, thin style like the other games.
// ---------------------------------------------------------------------------
export function attachPuzzleIO(io, serverUrl) {
  ioNsp = io.of("/puzzle");

  const ack = (fn, payload) => { if (typeof fn === "function") fn(payload); };

  function ctx(socket) {
    const code = socket.data.code;
    const room = code ? getPuzzleRoom(code) : null;
    const player = room ? room.getPlayer(socket.data.playerId) : null;
    return { room, player };
  }
  function bind(socket, room, player, token) {
    socket.data.code = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    player.socketId = socket.id;
    player.connected = true;
    const user = userFromToken(token);
    if (user) {
      player.userId = user.id;
      // The profile name is authoritative — players carry their account name into
      // every game rather than typing a fresh one each time.
      player.name = user.name;
    }
  }
  function handle(socket, fn) {
    try {
      const { room, player } = ctx(socket);
      if (!room || !player) {
        socket.emit("pz_notice", { type: "error", message: "pz_err_no_room" });
        return;
      }
      const res = fn(room, player) || {};
      if (res.error) socket.emit("pz_notice", { type: "error", message: res.error });
      room.broadcast();
    } catch (err) {
      console.error("puzzle handler error:", err);
      socket.emit("pz_notice", { type: "error", message: "pz_err_glitch" });
    }
  }

  ioNsp.on("connection", (socket) => {
    socket.emit("pz_config", { colors: AVATAR_COLORS, serverUrl, images: builtinImages() });

    socket.on("pz_create", (payload = {}, cb) => {
      try {
        if (!userFromToken(payload.token)) return ack(cb, { error: "pz_err_login" });
        const { room, player } = createPuzzleRoom(payload.name, payload.color);
        bind(socket, room, player, payload.token);
        ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
        room.broadcast();
      } catch (err) {
        console.error(err);
        ack(cb, { error: "pz_err_create" });
      }
    });

    socket.on("pz_join", (payload = {}, cb) => {
      try {
        if (!userFromToken(payload.token)) return ack(cb, { error: "pz_err_login" });
        const room = getPuzzleRoom(payload.code);
        if (!room) return ack(cb, { error: "pz_err_no_code" });
        if (payload.playerId) {
          const existing = room.getPlayer(payload.playerId);
          if (existing) {
            bind(socket, room, existing, payload.token);
            ack(cb, {
              ok: true, code: room.code, playerId: existing.id,
              state: room.toState(), board: room.privateBoard(existing),
            });
            room.broadcast();
            return;
          }
        }
        if (room.status !== "lobby") return ack(cb, { error: "pz_err_started" });
        const player = room.addPlayer(payload.name, payload.color);
        bind(socket, room, player, payload.token);
        ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
        room.broadcast();
      } catch (err) {
        console.error(err);
        ack(cb, { error: "pz_err_join" });
      }
    });

    socket.on("pz_settings", (patch = {}) =>
      handle(socket, (room, player) => room.updateSettings(player.id, patch))
    );
    socket.on("pz_start", () =>
      handle(socket, (room, player) => room.startGame(player.id))
    );
    socket.on("pz_swap", ({ a, b } = {}) => {
      const { room, player } = ctx(socket);
      if (room && player) room.swap(player.id, a, b);
    });
    socket.on("pz_next", () =>
      handle(socket, (room, player) => room.playAgain(player.id))
    );
    socket.on("pz_end", () =>
      handle(socket, (room, player) => room.endByHost(player.id))
    );
    socket.on("pz_leave", () => {
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
