// server/index.js
// Express serves the static client; Socket.IO carries all gameplay. The server is
// intentionally thin: it maps sockets to players and forwards to Room methods, then
// broadcasts the authoritative state. Socket.IO auto-serves its matching client at
// /socket.io/socket.io.js, so the whole game works offline on a LAN.

import http from "http";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { Server } from "socket.io";

import {
  attachIO,
  createRoom,
  getRoom,
  sweepRooms,
  AVATAR_COLORS,
} from "./rooms.js";
import { attachMemoryIO, sweepMemoryRooms } from "./memory.js";
import { POWERS } from "./powers.js";
import { CATEGORY_LABELS } from "./questions.js";
import { loadStore } from "./store.js";
import {
  register,
  login,
  logout,
  profileFromToken,
  userFromToken,
  ACHIEVEMENTS,
} from "./accounts.js";

loadStore();

let QRCode = null;
try {
  QRCode = (await import("qrcode")).default;
} catch {
  // QR is a nice-to-have; the game works fine without it.
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PORT = process.env.PORT || 3000;

function lanAddress() {
  const ifaces = os.networkInterfaces();
  const addrs = [];
  for (const list of Object.values(ifaces)) {
    for (const i of list || []) {
      if (i.family === "IPv4" && !i.internal) addrs.push(i.address);
    }
  }
  const pref = (p) => addrs.find((a) => a.startsWith(p));
  return pref("192.168.") || pref("10.") || pref("172.") || addrs[0] || "localhost";
}

const LAN_IP = lanAddress();
const SERVER_URL = `http://${LAN_IP}:${PORT}`;

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "8kb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---- accounts (REST) ----
function bearer(req) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  return req.query.token || null;
}
app.post("/api/register", (req, res) => {
  const { username, password } = req.body || {};
  const r = register(username, password);
  res.status(r.error ? 400 : 200).json(r);
});
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const r = login(username, password);
  res.status(r.error ? 401 : 200).json(r);
});
app.post("/api/logout", (req, res) => {
  logout(bearer(req));
  res.json({ ok: true });
});
app.get("/api/me", (req, res) => {
  const profile = profileFromToken(bearer(req));
  if (!profile) return res.status(401).json({ error: "no_session" });
  res.json({ ok: true, profile });
});
app.get("/api/achievements", (_req, res) => res.json({ achievements: ACHIEVEMENTS }));

// QR image for a given text (used by the client to render a scannable join code).
app.get("/api/qr", async (req, res) => {
  const text = String(req.query.text || SERVER_URL);
  if (!QRCode) return res.status(501).send("qr unavailable");
  try {
    const buf = await QRCode.toBuffer(text, {
      margin: 1,
      width: 320,
      color: { dark: "#0D0D22", light: "#ffffff" },
    });
    res.type("png").send(buf);
  } catch {
    res.status(500).send("qr error");
  }
});

// Game pages (clean URLs → their HTML shells).
app.get(["/spill", "/spill/"], (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "spill.html")));
app.get(["/memory", "/memory/"], (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "memory.html")));

app.use(express.static(PUBLIC_DIR));
// Everything else falls back to the arcade home.
app.get("*", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});
attachIO(io);
attachMemoryIO(io, SERVER_URL);

// ---- helpers ----
function ctx(socket) {
  const code = socket.data.code;
  const room = code ? getRoom(code) : null;
  const player = room ? room.getPlayer(socket.data.playerId) : null;
  return { room, player };
}

function ack(fn, payload) {
  if (typeof fn === "function") fn(payload);
}

function notice(socket, message, type = "error") {
  socket.emit("notice", { type, message });
}

function bindPlayerToRoom(socket, room, player) {
  socket.data.code = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);
  player.socketId = socket.id;
  player.connected = true;
}

// Wrap a state-mutating handler: run it, surface any {error}, then broadcast.
function handle(socket, fn) {
  try {
    const { room, player } = ctx(socket);
    if (!room || !player) return notice(socket, "You're not in a room.");
    const result = fn(room, player) || {};
    if (result.error) notice(socket, result.error);
    room.broadcast();
  } catch (err) {
    console.error("handler error:", err);
    notice(socket, "Something glitched — try again.");
  }
}

// Link a socket/player to a logged-in account (optional — guests can still play).
function linkAccount(socket, player, token) {
  const user = userFromToken(token);
  if (user) {
    player.userId = user.id;
    socket.data.userId = user.id;
  }
}

io.on("connection", (socket) => {
  socket.emit("config", {
    powers: POWERS,
    categoryLabels: CATEGORY_LABELS,
    colors: AVATAR_COLORS,
    serverUrl: SERVER_URL,
  });

  // ---- room entry ----
  socket.on("create_room", (payload = {}, cb) => {
    try {
      if (!userFromToken(payload.token)) return ack(cb, { error: "login_required" });
      const { room, player } = createRoom(payload.name, payload.color);
      bindPlayerToRoom(socket, room, player);
      linkAccount(socket, player, payload.token);
      ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
      room.broadcast();
    } catch (err) {
      console.error(err);
      ack(cb, { error: "Could not create room." });
    }
  });

  socket.on("join_room", (payload = {}, cb) => {
    try {
      if (!userFromToken(payload.token)) return ack(cb, { error: "login_required" });
      const room = getRoom(payload.code);
      if (!room) return ack(cb, { error: "No room with that code." });

      // Reconnect / reclaim seat by playerId.
      if (payload.playerId) {
        const existing = room.getPlayer(payload.playerId);
        if (existing) {
          bindPlayerToRoom(socket, room, existing);
          linkAccount(socket, existing, payload.token);
          ack(cb, { ok: true, code: room.code, playerId: existing.id, state: room.toState() });
          room.broadcast();
          return;
        }
      }

      if (room.status !== "lobby")
        return ack(cb, { error: "That game has already started." });
      if (room.connectedPlayers().length >= room.settings.maxPlayers)
        return ack(cb, { error: "That room is full." });

      const player = room.addPlayer(payload.name, payload.color);
      bindPlayerToRoom(socket, room, player);
      linkAccount(socket, player, payload.token);
      ack(cb, { ok: true, code: room.code, playerId: player.id, state: room.toState() });
      room.pushLog("joined", { name: player.name });
      room.broadcast();
    } catch (err) {
      console.error(err);
      ack(cb, { error: "Could not join room." });
    }
  });

  // ---- lobby / settings ----
  socket.on("update_settings", (patch = {}) =>
    handle(socket, (room, player) => {
      if (room.hostId !== player.id) return { error: "Only the host can change settings." };
      room.updateSettings(patch);
    })
  );

  socket.on("add_custom", ({ type, text } = {}) =>
    handle(socket, (room) => {
      room.addCustomQuestion(type, text);
    })
  );

  socket.on("start_game", () =>
    handle(socket, (room, player) => {
      if (room.hostId !== player.id) return { error: "Only the host can start." };
      return room.startGame();
    })
  );

  socket.on("kick", ({ playerId } = {}) =>
    handle(socket, (room, player) => {
      if (room.hostId !== player.id) return { error: "Only the host can remove players." };
      if (playerId === room.hostId) return { error: "You can't remove yourself." };
      const target = room.getPlayer(playerId);
      if (target) {
        room.pushLog("kicked_log", { name: target.name });
        if (target.socketId) io.to(target.socketId).emit("kicked");
        room.removePlayer(playerId);
      }
    })
  );

  // ---- turn loop ----
  socket.on("choose_type", ({ type } = {}) =>
    handle(socket, (room, player) => room.chooseType(player.id, type))
  );

  socket.on("submit_written_answer", ({ text } = {}) =>
    handle(socket, (room, player) => room.submitWrittenAnswer(player.id, text))
  );

  socket.on("request_reveal", () =>
    handle(socket, (room, player) => room.requestReveal(player.id))
  );

  socket.on("submit_bluff", ({ real, fake1, fake2 } = {}) =>
    handle(socket, (room, player) => room.submitBluff(player.id, real, fake1, fake2))
  );

  socket.on("guess_bluff", ({ optionId } = {}) =>
    handle(socket, (room, player) => room.guessBluff(player.id, optionId))
  );

  socket.on("chicken_out", () =>
    handle(socket, (room, player) => room.chickenOut(player.id))
  );

  socket.on("cast_vote", ({ vote } = {}) =>
    handle(socket, (room, player) => room.castVote(player.id, vote))
  );

  socket.on("force_resolve", ({ result } = {}) =>
    handle(socket, (room, player) => room.forceResolve(player.id, result))
  );

  socket.on("next_turn", () =>
    handle(socket, (room, player) => room.nextTurn(player.id))
  );

  socket.on("end_game", () =>
    handle(socket, (room, player) => room.endByHost(player.id))
  );

  // ---- powers ----
  socket.on("buy_power", ({ powerId } = {}) =>
    handle(socket, (room, player) => room.buyPower(player.id, powerId))
  );

  socket.on("use_power", ({ powerId, targetId, questionId } = {}) =>
    handle(socket, (room, player) => room.usePower(player.id, powerId, { targetId, questionId }))
  );

  socket.on("sabotage_options", (_payload, cb) => {
    const { room } = ctx(socket);
    if (!room) return ack(cb, { dares: [] });
    ack(cb, { dares: room.sabotageOptions() });
  });

  // ---- winner's privileges ----
  socket.on("set_privilege_mode", ({ mode } = {}) =>
    handle(socket, (room, player) => room.setPrivilegeMode(player.id, mode))
  );

  socket.on("reshuffle_tasks", () =>
    handle(socket, (room, player) => room.reshuffleTasks(player.id))
  );

  socket.on("claim_wish", ({ text } = {}) =>
    handle(socket, (room, player) => room.claimWish(player.id, text))
  );

  socket.on("play_again", () =>
    handle(socket, (room, player) => room.playAgain(player.id))
  );

  // ---- reactions (ephemeral) ----
  socket.on("reaction", ({ emoji } = {}) => {
    const { room, player } = ctx(socket);
    if (!room || !player) return;
    const safe = String(emoji || "🎉").slice(0, 4);
    io.to(room.code).emit("reaction", {
      emoji: safe,
      byId: player.id,
      byName: player.name,
      byColor: player.color,
    });
  });

  socket.on("leave_room", () => {
    const { room, player } = ctx(socket);
    if (room && player) {
      room.pushLog("left", { name: player.name });
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
    room.pushLog("disconnected_log", { name: player.name });
    // Hand the host role to someone still connected so controls keep working.
    if (room.hostId === player.id) {
      const next = room.connectedPlayers()[0];
      if (next) room.hostId = next.id;
    }
    room.broadcast();
  });
});

// Periodic cleanup of abandoned rooms.
setInterval(() => {
  sweepRooms();
  sweepMemoryRooms();
}, 60 * 1000);

server.listen(PORT, "0.0.0.0", () => {
  const line = "─".repeat(52);
  console.log(`\n${line}`);
  console.log("  🍸  SPILL is live!");
  console.log(line);
  console.log(`  On this PC:        http://localhost:${PORT}`);
  console.log(`  On the same WiFi:  ${SERVER_URL}`);
  console.log(`${line}`);
  console.log("  Share the WiFi link (or the QR in the lobby) with players.");
  console.log(`${line}\n`);
  if (QRCode) {
    QRCode.toString(SERVER_URL, { type: "terminal", small: true })
      .then((qr) => console.log(qr))
      .catch(() => {});
  }
});
