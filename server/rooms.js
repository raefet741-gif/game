// server/rooms.js
// The authoritative game engine. One Room owns all state for one game; the server
// (index.js) is a thin layer that maps sockets to players and calls Room methods.
// After any change the Room broadcasts a full `state` snapshot — clients are pure
// renderers of that snapshot. Ephemeral/private things (timer ticks, the secret
// written answer, power animations) go out as small targeted events.

import crypto from "crypto";
import {
  QUESTION_BANK,
  intensityAllowed,
  ALL_CATEGORIES,
} from "./questions.js";
import { getPower } from "./powers.js";

let ioRef = null;
export function attachIO(io) {
  ioRef = io;
}

const rooms = new Map(); // code -> Room

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
export const AVATAR_COLORS = [
  "#FF3D77", "#22E0D6", "#FFC53D", "#8B5CF6",
  "#4ADE80", "#FB923C", "#38BDF8", "#F472B6",
  "#A3E635", "#E879F9", "#2DD4BF", "#FBBF24",
  "#60A5FA", "#F87171", "#C084FC", "#34D399",
];

function randId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function defaultSettings() {
  const categories = {};
  for (const c of ALL_CATEGORIES) categories[c] = true;
  categories.custom = true;
  return {
    turnTimer: 30, // seconds; 0 = off
    winType: "score", // 'score' | 'rounds' | 'endless'
    winValue: 30,
    tdRatio: "free", // 'free' | 'alternate' | 'random' | 'truth70'
    truthStyle: "bluff", // 'speak' | 'bluff' (write a truth + 2 lies, room guesses)
    categories,
    spice: "bold", // 'clean' | 'medium' | 'bold' (max intensity shown)
    powersEnabled: true,
    startingCoins: 5, // coins each player starts with (Power Shop currency)
    maxPlayers: 12,
    allowCustom: true,
    chickenPenalty: 1,
  };
}

export function createRoom(hostName, hostColor) {
  let code;
  do {
    let s = "";
    for (let i = 0; i < 4; i++)
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    code = `SPILL-${s}`;
  } while (rooms.has(code));
  const room = new Room(code);
  const host = room.addPlayer(hostName, hostColor);
  room.hostId = host.id;
  rooms.set(code, room);
  return { room, player: host };
}

export function getRoom(code) {
  if (!code) return null;
  return rooms.get(code.toUpperCase().trim()) || null;
}

export function sweepRooms() {
  // Delete rooms where nobody has been connected for a while.
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyConnected = room.players.some((p) => p.connected);
    if (anyConnected) {
      room.emptySince = null;
    } else {
      room.emptySince = room.emptySince || now;
      if (now - room.emptySince > 20 * 60 * 1000) {
        room.stopTimer();
        room.clearAutoAdvance();
        rooms.delete(code);
      }
    }
  }
}

class Room {
  constructor(code) {
    this.code = code;
    this.hostId = null;
    this.status = "lobby"; // lobby | playing | finished
    this.settings = defaultSettings();
    this.players = [];
    this.customQuestions = [];

    this.currentIndex = 0;
    this.respondingPlayerId = null;
    this.round = 1;
    this.turnPhase = "choosing"; // choosing | in_progress | voting | reveal
    this.currentType = null;
    this.currentPrompt = null;
    this.lastType = null;

    this.writtenAnswer = null; // private
    this.writtenSubmitted = false;
    this.revealedAnswer = null; // public once revealed

    this.votes = new Map(); // playerId -> 'done' | 'chicken'
    this.outcome = null;

    this.bluff = null; // { options:[{id,text}], realId, guesses:Map, submitted }
    this.bluffResult = null; // scoring breakdown, set at bluff_reveal

    this.usedIds = new Set();
    this.offensiveThisTurn = new Set();
    this.pendingForcedDare = null; // { questionId, byId }
    this.nextPlayerOverride = null; // playerId
    this.timerPenalty = new Map(); // playerId -> factor (<1)
    this.doubleDown = new Set(); // playerIds armed

    this.timer = null; // { remaining, total }
    this.timerHandle = null;
    this.autoAdvanceHandle = null;

    this.log = [];
    this.logSeq = 0;

    this.winnerId = null;
    this.privileges = null;

    this.emptySince = null;
  }

  // ---------- players ----------
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
      score: 0, // points = leaderboard / win condition
      coins: this.settings.startingCoins, // coins = Power Shop currency
      connected: true,
      socketId: null,
      powers: [], // active powers owned but not yet fired
      shielded: false,
      mirrored: false,
      skipsUsed: 0,
      joinedAt: Date.now(),
    };
    this.players.push(player);
    return player;
  }

  getPlayer(id) {
    return this.players.find((p) => p.id === id) || null;
  }

  currentPlayer() {
    return this.players[this.currentIndex] || null;
  }

  removePlayer(id) {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx === -1) return;
    this.players.splice(idx, 1);
    if (idx < this.currentIndex) this.currentIndex--;
    if (this.currentIndex >= this.players.length) this.currentIndex = 0;
    if (this.hostId === id) {
      const next = this.players.find((p) => p.connected) || this.players[0];
      this.hostId = next ? next.id : null;
    }
  }

  connectedPlayers() {
    return this.players.filter((p) => p.connected);
  }

  // ---------- settings ----------
  updateSettings(patch) {
    const s = this.settings;
    if ("turnTimer" in patch) s.turnTimer = clampInt(patch.turnTimer, 0, 300);
    if ("winType" in patch && ["score", "rounds", "endless"].includes(patch.winType))
      s.winType = patch.winType;
    if ("winValue" in patch) s.winValue = clampInt(patch.winValue, 1, 999);
    if ("tdRatio" in patch && ["free", "alternate", "random", "truth70"].includes(patch.tdRatio))
      s.tdRatio = patch.tdRatio;
    if ("truthStyle" in patch && ["speak", "bluff"].includes(patch.truthStyle))
      s.truthStyle = patch.truthStyle;
    if ("spice" in patch && ["clean", "medium", "bold"].includes(patch.spice))
      s.spice = patch.spice;
    if ("powersEnabled" in patch) s.powersEnabled = !!patch.powersEnabled;
    if ("startingCoins" in patch) s.startingCoins = clampInt(patch.startingCoins, 0, 50);
    if ("maxPlayers" in patch) s.maxPlayers = clampInt(patch.maxPlayers, 2, 16);
    if ("allowCustom" in patch) s.allowCustom = !!patch.allowCustom;
    if ("chickenPenalty" in patch) s.chickenPenalty = clampInt(patch.chickenPenalty, 0, 10);
    if (patch.categories && typeof patch.categories === "object") {
      for (const [k, v] of Object.entries(patch.categories)) {
        if (k in s.categories) s.categories[k] = !!v;
      }
    }
    // Keep lobby coin balances in sync with a changed starting-coins setting.
    if (this.status === "lobby" && "startingCoins" in patch) {
      for (const p of this.players) p.coins = s.startingCoins;
    }
  }

  addCustomQuestion(type, text) {
    if (!this.settings.allowCustom) return;
    const t = (text || "").toString().trim();
    if (!t) return;
    if (!["truth", "dare"].includes(type)) return;
    const id = `c${String(this.customQuestions.length + 1).padStart(3, "0")}`;
    const body = t.slice(0, 240);
    this.customQuestions.push({
      id,
      type,
      category: "custom",
      intensity: "medium",
      write: false,
      text: { en: body, fr: body, ar: body },
    });
    this.pushLog("custom_added");
  }

  // ---------- deck ----------
  allQuestions() {
    return [...QUESTION_BANK, ...this.customQuestions];
  }

  findQuestion(id) {
    return this.allQuestions().find((q) => q.id === id) || null;
  }

  eligiblePool(type) {
    return this.allQuestions().filter((q) => {
      if (q.type !== type) return false;
      if (this.usedIds.has(q.id)) return false;
      if (q.category === "custom") return true;
      if (!this.settings.categories[q.category]) return false;
      if (!intensityAllowed(q.intensity, this.settings.spice)) return false;
      return true;
    });
  }

  deckCount(type) {
    return this.eligiblePool(type).length;
  }

  // ---------- game flow ----------
  startGame() {
    if (this.connectedPlayers().length < 2) {
      return { error: "Need at least 2 players to start." };
    }
    if (this.deckCount("truth") + this.deckCount("dare") === 0) {
      return { error: "No cards match your settings — enable more categories or raise the spice." };
    }
    this.status = "playing";
    this.round = 1;
    this.currentIndex = 0;
    // Start on the first connected player.
    if (!this.currentPlayer()?.connected) {
      const i = this.players.findIndex((p) => p.connected);
      this.currentIndex = i === -1 ? 0 : i;
    }
    this.usedIds = new Set();
    this.lastType = null;
    this.winnerId = null;
    this.privileges = null;
    this.pendingForcedDare = null;
    this.nextPlayerOverride = null;
    this.timerPenalty = new Map();
    this.doubleDown = new Set();
    this.bluff = null;
    this.bluffResult = null;
    this.pushLog("game_on");
    this.beginTurn();
    return { ok: true };
  }

  nextConnectedIndex(from) {
    const n = this.players.length;
    if (n === 0) return -1;
    for (let step = 1; step <= n; step++) {
      const i = (from + step) % n;
      if (this.players[i].connected) return i;
    }
    return from;
  }

  beginTurn() {
    this.turnPhase = "choosing";
    this.currentType = null;
    this.currentPrompt = null;
    this.writtenAnswer = null;
    this.writtenSubmitted = false;
    this.revealedAnswer = null;
    this.votes = new Map();
    this.outcome = null;
    this.bluff = null;
    this.bluffResult = null;
    this.offensiveThisTurn = new Set();
    this.stopTimer();
    this.clearAutoAdvance();

    const p = this.currentPlayer();
    if (!p) {
      this.endGame();
      return;
    }
    this.respondingPlayerId = p.id;

    // A Sabotage was queued for this player — force the chosen dare.
    if (this.pendingForcedDare) {
      const q = this.findQuestion(this.pendingForcedDare.questionId);
      this.pendingForcedDare = null;
      if (q && !this.usedIds.has(q.id)) {
        this.currentType = "dare";
        this.setPrompt(q);
        this.pushLog("sabotaged_into", { name: p.name });
        this.enterInProgress();
        return;
      }
    }

    // Forced type by ratio?
    const ratio = this.settings.tdRatio;
    if (ratio !== "free") {
      let type;
      if (ratio === "alternate") type = this.lastType === "truth" ? "dare" : "truth";
      else if (ratio === "truth70") type = Math.random() < 0.7 ? "truth" : "dare";
      else type = Math.random() < 0.5 ? "truth" : "dare";
      this.autoDraw(type);
    }
    // 'free' => stay in choosing and wait for choose_type
  }

  chooseType(playerId, type) {
    if (this.turnPhase !== "choosing") return;
    if (playerId !== this.respondingPlayerId) return;
    if (this.settings.tdRatio !== "free") return;
    if (!["truth", "dare"].includes(type)) return;
    this.autoDraw(type);
  }

  setPrompt(q) {
    this.currentPrompt = q;
    this.usedIds.add(q.id);
    this.writtenAnswer = null;
    this.writtenSubmitted = false;
    this.revealedAnswer = null;
  }

  autoDraw(type) {
    let pool = this.eligiblePool(type);
    if (pool.length === 0) {
      const other = type === "truth" ? "dare" : "truth";
      const op = this.eligiblePool(other);
      if (op.length === 0) {
        this.pushLog("deck_empty");
        this.endGame();
        return;
      }
      this.pushLog("switch_type", { type, other });
      type = other;
      pool = op;
    }
    const q = pool[Math.floor(Math.random() * pool.length)];
    this.currentType = type;
    this.setPrompt(q);
    this.enterAfterDraw();
  }

  // Route a freshly-drawn prompt to the right flow.
  enterAfterDraw() {
    if (this.currentType === "truth" && this.settings.truthStyle === "bluff") {
      this.enterBluffWrite();
    } else {
      this.enterInProgress();
    }
  }

  // Turn timer for the current responder, applying (and consuming) any Time Bandit.
  effectiveTimer() {
    const rid = this.respondingPlayerId;
    let seconds = this.settings.turnTimer;
    const factor = this.timerPenalty.get(rid);
    if (factor) {
      seconds = Math.max(5, Math.floor((seconds || 30) * factor));
      this.timerPenalty.delete(rid);
      this.pushLog("time_bandit_hit");
    }
    return seconds;
  }

  enterInProgress() {
    this.turnPhase = "in_progress";
    this.lastType = this.currentType;
    this.startTimer(this.effectiveTimer());
  }

  // ---- Bluff mode (write a truth + 2 lies, the room guesses) ----
  enterBluffWrite() {
    this.turnPhase = "bluff_write";
    this.lastType = this.currentType;
    this.bluff = { options: [], realId: null, guesses: new Map(), submitted: false };
    this.bluffResult = null;
    const secs = this.effectiveTimer();
    this.startTimer(secs ? secs + 15 : 0); // extra time to invent two lies
  }

  submitBluff(playerId, real, fake1, fake2) {
    if (this.turnPhase !== "bluff_write") return;
    if (playerId !== this.respondingPlayerId) return;
    const clean = (s) => (s || "").toString().trim().slice(0, 160);
    const r = clean(real),
      a = clean(fake1),
      b = clean(fake2);
    if (!r || !a || !b) return { error: "Fill in your real answer and both bluffs." };
    const opts = [
      { id: "b0", text: r, real: true },
      { id: "b1", text: a, real: false },
      { id: "b2", text: b, real: false },
    ].sort(() => Math.random() - 0.5);
    this.bluff.options = opts.map((o) => ({ id: o.id, text: o.text }));
    this.bluff.realId = opts.find((o) => o.real).id;
    this.bluff.guesses = new Map();
    this.bluff.submitted = true;
    this.turnPhase = "bluff_guess";
    this.pushLog("bluff_written", { name: this.getPlayer(playerId)?.name });
    const voters = this.connectedPlayers().filter((x) => x.id !== this.respondingPlayerId);
    if (voters.length === 0) {
      this.resolveBluff();
      return { ok: true };
    }
    this.startTimer(this.settings.turnTimer);
    return { ok: true };
  }

  guessBluff(playerId, optionId) {
    if (this.turnPhase !== "bluff_guess") return;
    if (playerId === this.respondingPlayerId) return;
    const p = this.getPlayer(playerId);
    if (!p || !p.connected) return;
    if (!this.bluff?.options.some((o) => o.id === optionId)) return;
    this.bluff.guesses.set(playerId, optionId);
    const voters = this.connectedPlayers().filter((x) => x.id !== this.respondingPlayerId);
    if (this.bluff.guesses.size >= voters.length) this.resolveBluff();
  }

  resolveBluff() {
    if (this.turnPhase !== "bluff_guess") return;
    this.stopTimer();
    const host = this.getPlayer(this.respondingPlayerId);
    const realId = this.bluff.realId;
    const realText = this.bluff.options.find((o) => o.id === realId)?.text || "";
    const correctPids = [],
      fooledPids = [];
    for (const [pid, opt] of this.bluff.guesses) {
      const pl = this.getPlayer(pid);
      if (!pl) continue;
      if (opt === realId) {
        correctPids.push(pid);
        pl.score += 1;
        pl.coins += 1;
      } else {
        fooledPids.push(pid);
      }
    }
    let hostPoints = fooledPids.length;
    const bold = this.currentPrompt?.intensity === "bold";
    if (bold && hostPoints > 0) hostPoints += 1;
    let doubled = false;
    if (host && this.doubleDown.has(host.id) && hostPoints > 0) {
      hostPoints *= 2;
      doubled = true;
      this.doubleDown.delete(host.id);
    }
    if (host) {
      host.score += hostPoints;
      host.coins += hostPoints;
    }
    this.bluffResult = {
      realId,
      realText,
      guesses: Object.fromEntries(this.bluff.guesses),
      correctPids,
      fooledPids,
      hostId: host?.id || null,
      hostPoints,
    };
    this.outcome = {
      result: "bluff",
      playerId: host?.id || null,
      playerName: host?.name || "",
      points: hostPoints,
      type: "truth",
    };
    this.turnPhase = "bluff_reveal";
    if (fooledPids.length)
      this.pushLog("bluff_fooled", { name: host?.name, fooled: fooledPids.length, doubled, points: hostPoints, correct: correctPids.length });
    else
      this.pushLog("bluff_none", { name: host?.name, correct: correctPids.length });
    this.emitRoom("flash", { kind: hostPoints > 0 ? "done" : "chicken", playerId: host?.id, points: hostPoints });
    this.checkScoreWin();
    this.scheduleAutoAdvance(16000);
  }

  // Hot seat gives up during the bluff write phase — takes the chicken penalty.
  chickenOut(playerId) {
    if (this.turnPhase !== "bluff_write") return;
    if (playerId !== this.respondingPlayerId && playerId !== this.hostId) return;
    this.stopTimer();
    this.applyOutcome("chicken");
    this.turnPhase = "reveal";
    this.scheduleAutoAdvance(12000);
  }

  submitWrittenAnswer(playerId, text) {
    if (this.turnPhase !== "in_progress") return;
    if (playerId !== this.respondingPlayerId) return;
    if (!this.currentPrompt?.write) return;
    this.writtenAnswer = (text || "").toString().slice(0, 500);
    this.writtenSubmitted = true;
    this.pushLog("answer_locked", { name: this.getPlayer(playerId)?.name });
  }

  requestReveal(playerId) {
    if (playerId !== this.respondingPlayerId && playerId !== this.hostId) return;
    if (this.turnPhase === "in_progress") this.beginVoting();
    else if (this.turnPhase === "bluff_guess") this.resolveBluff();
  }

  beginVoting() {
    this.stopTimer();
    if (this.currentPrompt?.write) {
      this.revealedAnswer =
        this.writtenAnswer && this.writtenAnswer.trim()
          ? this.writtenAnswer
          : "(they didn't write anything…)";
    }
    this.turnPhase = "voting";
    this.votes = new Map();
    // If nobody is around to vote, auto-resolve as done.
    const voters = this.connectedPlayers().filter((p) => p.id !== this.respondingPlayerId);
    if (voters.length === 0) this.resolveVote("done");
  }

  castVote(playerId, vote) {
    if (this.turnPhase !== "voting") return;
    if (playerId === this.respondingPlayerId) return;
    const p = this.getPlayer(playerId);
    if (!p || !p.connected) return;
    if (!["done", "chicken"].includes(vote)) return;
    this.votes.set(playerId, vote);

    const voters = this.connectedPlayers().filter((x) => x.id !== this.respondingPlayerId);
    let done = 0,
      chicken = 0;
    for (const v of this.votes.values()) v === "done" ? done++ : chicken++;
    const total = voters.length;
    if (this.votes.size >= total) {
      this.resolveVote(chicken > done ? "chicken" : "done");
    } else if (done > total / 2) {
      this.resolveVote("done");
    } else if (chicken > total / 2) {
      this.resolveVote("chicken");
    }
  }

  resolveVote(result) {
    if (this.turnPhase !== "voting") return;
    this.applyOutcome(result);
    this.turnPhase = "reveal";
    this.scheduleAutoAdvance(14000);
  }

  forceResolve(playerId, result) {
    if (playerId !== this.hostId) return;
    if (this.turnPhase !== "voting") return;
    this.resolveVote(result === "chicken" ? "chicken" : "done");
  }

  applyOutcome(result) {
    const player = this.getPlayer(this.respondingPlayerId);
    if (!player) return;
    let points = 0;
    if (result === "done") {
      let base = this.currentType === "truth" ? 1 : 2;
      if (this.currentPrompt?.intensity === "bold") base += 1;
      let doubled = false;
      if (this.doubleDown.has(player.id)) {
        base *= 2;
        doubled = true;
        this.doubleDown.delete(player.id);
      }
      player.score += base;
      player.coins += base; // winning a round also fills your coin wallet
      points = base;
      this.pushLog("scored", { name: player.name, type: this.currentType, points: base, doubled });
    } else {
      const penalty = this.settings.chickenPenalty;
      const before = player.score;
      player.score = Math.max(0, player.score - penalty);
      points = -(before - player.score);
      this.pushLog("chickened", { name: player.name, points });
    }
    this.outcome = {
      result,
      points,
      playerId: player.id,
      playerName: player.name,
      type: this.currentType,
    };
    this.emitRoom("flash", { kind: result, playerId: player.id, points });
    this.checkScoreWin();
  }

  scheduleAutoAdvance(ms) {
    this.clearAutoAdvance();
    this.autoAdvanceHandle = setTimeout(() => {
      this.autoAdvanceHandle = null;
      if (this.status === "playing" && ["reveal", "bluff_reveal"].includes(this.turnPhase)) {
        this.nextTurn(null, true);
        this.broadcast();
      }
    }, ms);
  }

  clearAutoAdvance() {
    if (this.autoAdvanceHandle) {
      clearTimeout(this.autoAdvanceHandle);
      this.autoAdvanceHandle = null;
    }
  }

  nextTurn(playerId, auto = false) {
    if (this.status !== "playing") return;
    if (!auto) {
      // Only host, the responder, or the current hot-seat player may advance.
      if (
        playerId &&
        playerId !== this.hostId &&
        playerId !== this.respondingPlayerId &&
        playerId !== this.currentPlayer()?.id
      )
        return;
      if (!["reveal", "bluff_reveal", "choosing"].includes(this.turnPhase)) return;
    }
    this.clearAutoAdvance();

    if (this.nextPlayerOverride) {
      const i = this.players.findIndex((p) => p.id === this.nextPlayerOverride);
      this.nextPlayerOverride = null;
      if (i !== -1) {
        this.currentIndex = i;
        this.beginTurn();
        return;
      }
    }
    const next = this.nextConnectedIndex(this.currentIndex);
    if (next <= this.currentIndex) {
      this.round += 1;
      if (this.settings.winType === "rounds" && this.round > this.settings.winValue) {
        this.endGame();
        return;
      }
    }
    this.currentIndex = next;
    this.beginTurn();
  }

  checkScoreWin() {
    if (this.settings.winType !== "score") return;
    const top = this.players
      .filter((p) => p.score >= this.settings.winValue)
      .sort((a, b) => b.score - a.score)[0];
    if (top) this.endGame();
  }

  endGame() {
    this.stopTimer();
    this.clearAutoAdvance();
    this.status = "finished";
    this.turnPhase = "reveal";
    const ranked = [...this.players].sort((a, b) => b.score - a.score);
    this.winnerId = ranked[0]?.id || null;
    this.privileges = { mode: null, tasks: [], wish: null };
    const w = this.getPlayer(this.winnerId);
    if (w) this.pushLog("winner", { name: w.name, score: w.score });
    this.emitRoom("game_over", { winnerId: this.winnerId });
  }

  // ---------- winner's privileges ----------
  setPrivilegeMode(playerId, mode) {
    if (this.status !== "finished" || playerId !== this.winnerId) return;
    if (mode === "tasks") {
      this.privileges.mode = "tasks";
      this.dealWinnerTasks();
    } else if (mode === "wish") {
      this.privileges.mode = "wish";
    }
  }

  dealWinnerTasks() {
    const losers = this.players.filter((p) => p.id !== this.winnerId);
    const darePool = [...QUESTION_BANK, ...this.customQuestions].filter(
      (q) => q.type === "dare"
    );
    const shuffled = darePool.sort(() => Math.random() - 0.5);
    this.privileges.tasks = losers.map((l, i) => ({
      playerId: l.id,
      playerName: l.name,
      color: l.color,
      text: shuffled[i % shuffled.length]?.text || {
        en: "Take a bow for the winner.",
        fr: "Fais une révérence devant le gagnant.",
        ar: "انحنِ احترامًا للفائز.",
      },
    }));
  }

  reshuffleTasks(playerId) {
    if (this.status !== "finished" || playerId !== this.winnerId) return;
    if (this.privileges?.mode === "tasks") this.dealWinnerTasks();
  }

  claimWish(playerId, text) {
    if (this.status !== "finished" || playerId !== this.winnerId) return;
    this.privileges.mode = "wish";
    this.privileges.wish = (text || "").toString().slice(0, 240);
  }

  playAgain(playerId) {
    if (playerId !== this.hostId) return;
    this.status = "lobby";
    this.round = 1;
    this.currentIndex = 0;
    this.turnPhase = "choosing";
    this.currentPrompt = null;
    this.currentType = null;
    this.outcome = null;
    this.revealedAnswer = null;
    this.usedIds = new Set();
    this.winnerId = null;
    this.privileges = null;
    this.pendingForcedDare = null;
    this.nextPlayerOverride = null;
    this.timerPenalty = new Map();
    this.doubleDown = new Set();
    this.bluff = null;
    this.bluffResult = null;
    this.stopTimer();
    this.clearAutoAdvance();
    for (const p of this.players) {
      p.score = 0;
      p.coins = this.settings.startingCoins;
      p.powers = [];
      p.shielded = false;
      p.mirrored = false;
      p.skipsUsed = 0;
    }
    this.pushLog("play_again");
  }

  endByHost(playerId) {
    if (playerId !== this.hostId) return;
    if (this.status !== "playing") return;
    this.endGame();
  }

  // ---------- powers ----------
  buyPower(playerId, powerId) {
    if (!this.settings.powersEnabled) return { error: "Powers are turned off this game." };
    if (this.status !== "playing") return { error: "You can only buy powers during a game." };
    const player = this.getPlayer(playerId);
    const power = getPower(powerId);
    if (!player || !power) return { error: "Unknown power." };
    if (player.coins < power.cost) return { error: "Not enough coins." };
    if (power.id === "shield" && player.shielded)
      return { error: "Your shield is already up." };
    if (power.id === "mirror" && player.mirrored)
      return { error: "Your mirror is already up." };
    if (power.use === "active" && player.powers.length >= 6)
      return { error: "Your power tray is full." };

    player.coins -= power.cost;
    if (power.use === "passive") {
      if (power.id === "shield") player.shielded = true;
      if (power.id === "mirror") player.mirrored = true;
      this.pushLog("power_armed", { name: player.name, powerId: power.id });
    } else {
      player.powers.push(power.id);
      this.pushLog("power_bought", { name: player.name, powerId: power.id });
    }
    this.emitRoom("power", { kind: "buy", powerId: power.id, byId: player.id });
    return { ok: true };
  }

  consumeActive(player, powerId) {
    const i = player.powers.indexOf(powerId);
    if (i === -1) return false;
    player.powers.splice(i, 1);
    return true;
  }

  // Resolve an incoming steal/swap against a target's defenses.
  // Order: Mirror (bounce back to caster) resolves BEFORE Shield.
  resolveDefenses(target, caster) {
    if (target.mirrored) {
      target.mirrored = false;
      this.pushLog("mirror_bounce", { target: target.name, caster: caster.name });
      this.emitRoom("power", { kind: "mirror", byId: target.id, targetId: caster.id });
      // Bounced onto the caster — the caster's own shield may still save them.
      if (caster.shielded) {
        caster.shielded = false;
        this.pushLog("mirror_shield", { caster: caster.name });
        return { blocked: true, bounced: true };
      }
      return { blocked: false, bounced: true };
    }
    if (target.shielded) {
      target.shielded = false;
      this.pushLog("shield_block", { target: target.name });
      this.emitRoom("power", { kind: "shield", byId: target.id });
      return { blocked: true, bounced: false };
    }
    return { blocked: false, bounced: false };
  }

  markOffensive(playerId) {
    if (this.offensiveThisTurn.has(playerId)) return false;
    this.offensiveThisTurn.add(playerId);
    return true;
  }

  usePower(playerId, powerId, payload = {}) {
    if (this.status !== "playing") return { error: "Powers only work during a game." };
    const player = this.getPlayer(playerId);
    const power = getPower(powerId);
    if (!player || !power) return { error: "Unknown power." };
    if (power.use !== "active") return { error: "That power arms itself automatically." };
    if (!player.powers.includes(powerId)) return { error: "You don't own that power." };

    // Phase gating.
    if (power.phase === "my_turn" && playerId !== this.respondingPlayerId)
      return { error: "You can only use that on your own turn." };
    if (power.phase === "reveal") {
      const bluffReady = this.settings.truthStyle === "bluff" && this.bluff?.submitted;
      const writeReady = this.currentPrompt?.write && this.writtenSubmitted;
      if (!bluffReady && !writeReady)
        return { error: "Truth Serum needs a written or bluffed truth that's locked in." };
    }
    // Offensive cap.
    if (power.offensive && this.offensiveThisTurn.has(playerId))
      return { error: "One offensive power per turn — you've used yours." };

    const target = payload.targetId ? this.getPlayer(payload.targetId) : null;
    if (power.target === "player") {
      if (!target || !target.connected) return { error: "Pick a valid player." };
      if (target.id === playerId && power.id !== "spotlight")
        return { error: "You can't target yourself with that." };
    }

    // ---- effects ----
    switch (power.id) {
      case "truth_serum": {
        this.consumeActive(player, powerId);
        let answer = this.writtenAnswer || "";
        if (this.settings.truthStyle === "bluff" && this.bluff?.submitted) {
          answer = this.bluff.options.find((o) => o.id === this.bluff.realId)?.text || "";
        }
        this.emitPlayer(playerId, "serum", {
          answer,
          bluff: this.settings.truthStyle === "bluff" && this.bluff?.submitted,
          ofName: this.getPlayer(this.respondingPlayerId)?.name || "",
        });
        this.pushLog("serum_used", { name: player.name });
        this.emitRoom("power", { kind: "use", powerId, byId: playerId });
        break;
      }
      case "pickpocket": {
        this.markOffensive(playerId);
        this.consumeActive(player, powerId);
        const def = this.resolveDefenses(target, player);
        if (!def.blocked) {
          // On a bounce, the roles flip: the caster becomes the victim.
          const victim = def.bounced ? player : target;
          const beneficiary = def.bounced ? target : player;
          const before = victim.coins;
          victim.coins = Math.max(0, victim.coins - 1);
          const moved = before - victim.coins;
          beneficiary.coins += moved;
          this.pushLog("pickpocket", { beneficiary: beneficiary.name, victim: victim.name });
        }
        this.emitRoom("power", { kind: "use", powerId, byId: playerId, targetId: target.id });
        break;
      }
      case "time_bandit": {
        this.markOffensive(playerId);
        this.consumeActive(player, powerId);
        const def = this.resolveDefenses(target, player);
        if (!def.blocked) {
          const victim = def.bounced ? player : target;
          this.timerPenalty.set(victim.id, 0.5);
          this.pushLog("time_bandit_set", { victim: victim.name });
        }
        this.emitRoom("power", { kind: "use", powerId, byId: playerId, targetId: target.id });
        break;
      }
      case "spotlight": {
        this.markOffensive(playerId);
        this.consumeActive(player, powerId);
        this.nextPlayerOverride = target.id;
        this.pushLog("spotlight", { name: player.name, target: target.name });
        this.emitRoom("power", { kind: "use", powerId, byId: playerId, targetId: target.id });
        break;
      }
      case "sabotage": {
        this.markOffensive(playerId);
        let q = payload.questionId ? this.findQuestion(payload.questionId) : null;
        if (!q || q.type !== "dare" || this.usedIds.has(q.id)) {
          const pool = this.eligiblePool("dare");
          if (pool.length === 0) return { error: "No dares left to sabotage with." };
          q = pool[Math.floor(Math.random() * pool.length)];
        }
        this.consumeActive(player, powerId);
        this.pendingForcedDare = { questionId: q.id, byId: playerId };
        this.pushLog("sabotage_rig", { name: player.name });
        this.emitRoom("power", { kind: "use", powerId, byId: playerId });
        break;
      }
      case "boomerang": {
        if (this.turnPhase !== "in_progress")
          return { error: "You can only boomerang during your active turn." };
        this.markOffensive(playerId);
        this.consumeActive(player, powerId);
        const def = this.resolveDefenses(target, player);
        if (def.blocked || def.bounced) {
          this.pushLog("boomerang_back", { name: player.name });
        } else {
          this.respondingPlayerId = target.id;
          this.pushLog("boomerang_fling", { name: player.name, target: target.name });
          this.startTimer(this.settings.turnTimer);
        }
        this.emitRoom("power", { kind: "use", powerId, byId: playerId, targetId: target.id });
        break;
      }
      case "double_down": {
        this.consumeActive(player, powerId);
        this.doubleDown.add(playerId);
        this.pushLog("double_down", { name: player.name });
        this.emitRoom("power", { kind: "use", powerId, byId: playerId });
        break;
      }
      case "reroll": {
        if (!this.currentPrompt || !["in_progress", "choosing", "bluff_write"].includes(this.turnPhase))
          return { error: "Nothing to reroll right now." };
        this.consumeActive(player, powerId);
        this.pushLog("reroll", { name: player.name });
        this.autoDraw(this.currentType);
        this.emitRoom("power", { kind: "use", powerId, byId: playerId });
        break;
      }
      case "wildcard": {
        if (!this.currentPrompt)
          return { error: "Draw a prompt before flipping it." };
        this.consumeActive(player, powerId);
        const other = this.currentType === "truth" ? "dare" : "truth";
        this.pushLog("wildcard", { name: player.name, other });
        this.autoDraw(other);
        this.emitRoom("power", { kind: "use", powerId, byId: playerId });
        break;
      }
      case "skip": {
        if (playerId !== this.respondingPlayerId)
          return { error: "You can only skip your own turn." };
        if (player.skipsUsed >= 1) return { error: "You've already used your Skip." };
        this.consumeActive(player, powerId);
        player.skipsUsed += 1;
        this.pushLog("skip", { name: player.name });
        this.emitRoom("power", { kind: "use", powerId, byId: playerId });
        this.nextTurn(null, true);
        break;
      }
      default:
        return { error: "That power isn't wired up." };
    }
    return { ok: true };
  }

  // Candidate dares for the Sabotage picker (sent privately to the caster).
  sabotageOptions() {
    return this.eligiblePool("dare")
      .slice()
      .sort(() => Math.random() - 0.5)
      .slice(0, 8)
      .map((q) => ({ id: q.id, text: q.text, intensity: q.intensity }));
  }

  // ---------- timer ----------
  startTimer(seconds) {
    this.stopTimer();
    if (!seconds || seconds <= 0) {
      this.timer = null;
      return;
    }
    this.timer = { remaining: seconds, total: seconds };
    this.timerHandle = setInterval(() => {
      if (!this.timer) return;
      this.timer.remaining -= 1;
      this.emitRoom("timer", { remaining: this.timer.remaining, total: this.timer.total });
      if (this.timer.remaining <= 0) {
        this.stopTimer();
        this.onTimeUp();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    this.timer = null;
  }

  onTimeUp() {
    if (this.turnPhase === "in_progress") {
      this.beginVoting();
      this.broadcast();
    } else if (this.turnPhase === "bluff_write") {
      // Ran out of time to write — counts as a chicken.
      this.stopTimer();
      this.applyOutcome("chicken");
      this.turnPhase = "reveal";
      this.scheduleAutoAdvance(12000);
      this.broadcast();
    } else if (this.turnPhase === "bluff_guess") {
      this.resolveBluff();
      this.broadcast();
    }
  }

  // ---------- serialization + emit ----------
  toState() {
    let done = 0,
      chicken = 0;
    const voters = {};
    for (const [pid, v] of this.votes) {
      voters[pid] = v;
      v === "done" ? done++ : chicken++;
    }
    return {
      code: this.code,
      hostId: this.hostId,
      status: this.status,
      settings: this.settings,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        coins: p.coins,
        connected: p.connected,
        isHost: p.id === this.hostId,
        powers: p.powers,
        shielded: p.shielded,
        mirrored: p.mirrored,
        skipsUsed: p.skipsUsed,
      })),
      currentPlayerId: this.currentPlayer()?.id || null,
      respondingPlayerId: this.respondingPlayerId,
      round: this.round,
      turnPhase: this.turnPhase,
      currentType: this.currentType,
      currentPrompt: this.currentPrompt
        ? {
            id: this.currentPrompt.id,
            type: this.currentPrompt.type,
            category: this.currentPrompt.category,
            intensity: this.currentPrompt.intensity,
            text: this.currentPrompt.text,
            write: !!this.currentPrompt.write,
          }
        : null,
      writtenSubmitted: this.writtenSubmitted,
      revealedAnswer: this.revealedAnswer,
      votes: { done, chicken, voters },
      outcome: this.outcome,
      bluff: this.bluff
        ? {
            submitted: this.bluff.submitted,
            // option texts are public only once guessing starts; the real id stays
            // hidden until the reveal so nobody can peek without Truth Serum.
            options:
              this.turnPhase === "bluff_guess" || this.turnPhase === "bluff_reveal"
                ? this.bluff.options
                : [],
            guessedIds: [...this.bluff.guesses.keys()],
            realId: this.turnPhase === "bluff_reveal" ? this.bluff.realId : null,
            guesses: this.turnPhase === "bluff_reveal" ? Object.fromEntries(this.bluff.guesses) : {},
          }
        : null,
      bluffResult: this.turnPhase === "bluff_reveal" ? this.bluffResult : null,
      timer: this.timer ? { remaining: this.timer.remaining, total: this.timer.total } : null,
      deck: { truth: this.deckCount("truth"), dare: this.deckCount("dare") },
      log: this.log.slice(-14),
      winnerId: this.winnerId,
      privileges: this.privileges,
    };
  }

  // Log entries are structured {key, params} so each client renders them in its
  // own language (see the client i18n `tLog`). Player names in params are not translated.
  pushLog(key, params = {}) {
    this.logSeq += 1;
    this.log.push({ id: this.logSeq, key, params, t: Date.now() });
    if (this.log.length > 40) this.log.shift();
  }

  broadcast() {
    if (ioRef) ioRef.to(this.code).emit("state", this.toState());
  }

  emitRoom(ev, data) {
    if (ioRef) ioRef.to(this.code).emit(ev, data);
  }

  emitPlayer(playerId, ev, data) {
    const p = this.getPlayer(playerId);
    if (ioRef && p && p.socketId) ioRef.to(p.socketId).emit(ev, data);
  }
}

function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
