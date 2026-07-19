// server/accounts.js
// Account system: register/login (scrypt-hashed passwords), opaque session tokens,
// lifetime XP + levels, and achievements. No external dependencies.

import crypto from "crypto";
import { getDB, saveStore } from "./store.js";

// Achievement catalog — metadata only; display names/blurbs live in the client i18n.
export const ACHIEVEMENTS = [
  { id: "welcome", icon: "🦊" },       // create an account
  { id: "first_spill", icon: "🍸" },   // finish your first game
  { id: "champion", icon: "👑" },       // win a game
  { id: "hat_trick", icon: "🎩" },      // win 3 games
  { id: "unstoppable", icon: "🔥" },    // win 10 games
  { id: "socialite", icon: "🎉" },      // play with 4+ people
  { id: "veteran", icon: "🎖️" },       // play 10 games
  { id: "rising_star", icon: "⭐" },    // reach level 5
];
const ACH_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));

const COLORS = [
  "#FF3D77", "#22E0D6", "#FFC53D", "#8B5CF6",
  "#4ADE80", "#FB923C", "#38BDF8", "#F472B6",
];
const XP_PER_LEVEL = 100;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function levelFromXp(xp) {
  return Math.floor((xp || 0) / XP_PER_LEVEL) + 1;
}

// ---- Ranked ladder (Valorant-style) --------------------------------------
// A cosmetic competitive rank derived purely from lifetime XP — there is no
// stored rank state, so every existing account gets one for free and the whole
// ladder can be retuned just by editing this table. Eight tiers of three
// divisions each, then a single capstone tier (Radiant, no divisions).
export const RANK_TIERS = [
  { id: "iron",      icon: "🔩", color: "#7c8591" },
  { id: "bronze",    icon: "🥉", color: "#b3763f" },
  { id: "silver",    icon: "🥈", color: "#c2cad6" },
  { id: "gold",      icon: "🥇", color: "#f4c430" },
  { id: "platinum",  icon: "💠", color: "#3fd0c9" },
  { id: "diamond",   icon: "💎", color: "#9b7bff" },
  { id: "ascendant", icon: "🛡️", color: "#31c46b" },
  { id: "immortal",  icon: "👹", color: "#e0416a" },
  { id: "radiant",   icon: "🌟", color: "#fff2a8" },
];

// Flatten tiers into divisions with cumulative XP floors. Each division inside
// tier T costs (T+1)*100 XP, so the climb gets steeper the higher you go:
// Iron divisions are 100 XP apart, Immortal divisions 800 XP apart. Radiant is
// a single rank sitting above Immortal 3.
const RANK_LADDER = (() => {
  const out = [];
  let floor = 0;
  RANK_TIERS.forEach((tier, ti) => {
    if (tier.id === "radiant") {
      out.push({ tier: tier.id, division: 0, icon: tier.icon, color: tier.color, minXp: floor });
      return;
    }
    const step = (ti + 1) * 100;
    for (let d = 1; d <= 3; d++) {
      out.push({ tier: tier.id, division: d, icon: tier.icon, color: tier.color, minXp: floor });
      floor += step;
    }
  });
  return out;
})();

// Resolve lifetime XP to a rank: tier + division (1–3, or 0 for Radiant), the
// tier icon/color, a global index for sorting, and progress toward the next
// division (spanXp/nextXp are null at Radiant, the top of the ladder).
export function rankFromXp(xp) {
  const x = Math.max(0, Math.floor(xp || 0));
  let idx = 0;
  for (let i = 0; i < RANK_LADDER.length; i++) {
    if (x >= RANK_LADDER[i].minXp) idx = i;
    else break;
  }
  const cur = RANK_LADDER[idx];
  const next = RANK_LADDER[idx + 1] || null;
  return {
    tier: cur.tier,
    division: cur.division,
    icon: cur.icon,
    color: cur.color,
    index: idx,
    minXp: cur.minXp,
    nextXp: next ? next.minXp : null,
    intoXp: x - cur.minXp,
    spanXp: next ? next.minXp - cur.minXp : null,
  };
}

// Per-mode stats let us rank players two ways: "versus" (games against other
// people) and "solo" (playing alone against the clock). Every account carries
// both buckets; older accounts are upgraded lazily by ensureModes().
function emptyBucket() {
  return { games: 0, wins: 0, xp: 0 };
}
function emptyModes() {
  return { versus: emptyBucket(), solo: emptyBucket() };
}
function ensureModes(user) {
  if (!user.modes) {
    // Upgrading a legacy account: all play before the solo/versus split was
    // effectively "versus" (SPILL, team Sudoku, the puzzle race), so seed the
    // versus bucket from lifetime totals. Solo starts empty. This keeps existing
    // players on the competitive board instead of erasing their history.
    const st = user.stats || {};
    user.modes = {
      versus: { games: st.gamesPlayed || 0, wins: st.wins || 0, xp: user.xp || 0 },
      solo: emptyBucket(),
    };
  }
  if (!user.modes.versus) user.modes.versus = emptyBucket();
  if (!user.modes.solo) user.modes.solo = emptyBucket();
  return user.modes;
}
// Normalize a mode string to one of our two buckets ("versus" is the default).
function modeKey(mode) {
  return mode === "solo" ? "solo" : "versus";
}

// ---- Per-game ranked ladder ------------------------------------------------
// Every competitive game keeps its OWN leaderboard, scored with a zero-sum
// point system: when sides play against each other the winning side gains
// RANKED_DELTA points and the losing side loses the same amount (floored at 0
// so nobody goes negative). A Sudoku ace and a Draw ace are ranked separately.
// Solo play never touches these boards — there's no opponent to win from.
export const RANKED_GAMES = [
  "spill", "memory", "sudoku", "puzzle", "words", "draw", "zip", "queens",
];
const RANKED_SET = new Set(RANKED_GAMES);
export const RANKED_DELTA = 18; // points won by the winner / lost by the loser

function emptyRankedBucket() {
  return { points: 0, wins: 0, losses: 0, games: 0 };
}
// Lazily ensure the per-game map exists (older accounts predate it).
function ensureRanked(user) {
  if (!user.ranked || typeof user.ranked !== "object") user.ranked = {};
  return user.ranked;
}
function rankedBucket(user, game) {
  const r = ensureRanked(user);
  if (!r[game]) r[game] = emptyRankedBucket();
  return r[game];
}
// Apply one game result to a game's ranked board. Winner +delta, loser -delta.
function applyRanked(user, game, won) {
  if (!game || !RANKED_SET.has(game)) return;
  const b = rankedBucket(user, game);
  b.games += 1;
  if (won) {
    b.wins += 1;
    b.points += RANKED_DELTA;
  } else {
    b.losses += 1;
    b.points = Math.max(0, b.points - RANKED_DELTA);
  }
}

// ---- Match history ---------------------------------------------------------
// Each finished head-to-head game appends one entry to every logged-in player's
// history: did they win, who they were up against, and when. Solo play isn't
// recorded (there's no opponent). We keep the most recent HISTORY_CAP matches.
const HISTORY_CAP = 60;

// roster: [{ userId, name, team, won }]. `team` is a number for team games or
// null for free-for-all (each player is their own side). Opponents are everyone
// not on your side; teammates are the rest of your side. Entries with no
// opponent (e.g. a lone player) are skipped — there's nothing to record.
export function recordMatch(game, roster = []) {
  if (!RANKED_SET.has(game)) return;
  const db = getDB();
  const at = Date.now();
  const clean = roster.map((r) => ({
    userId: r.userId || null,
    name: (r.name || "?").toString().slice(0, 20),
    team: r.team == null ? null : r.team,
    won: !!r.won,
  }));
  const sameSide = (a, b) => a.team != null && b.team != null && a.team === b.team;

  for (const me of clean) {
    if (!me.userId) continue;
    const user = db.users[me.userId];
    if (!user) continue;
    const opponents = clean.filter((o) => o !== me && !sameSide(o, me)).map((o) => o.name);
    if (!opponents.length) continue; // no real opponent → nothing to log
    const teammates = clean.filter((o) => o !== me && sameSide(o, me)).map((o) => o.name);
    if (!Array.isArray(user.history)) user.history = [];
    user.history.push({ game, at, won: me.won, opponents, teammates });
    if (user.history.length > HISTORY_CAP) {
      user.history.splice(0, user.history.length - HISTORY_CAP);
    }
  }
  saveStore();
}

// A player's match history, newest first.
export function historyFor(userId, limit = HISTORY_CAP) {
  const db = getDB();
  const user = db.users[userId];
  if (!user || !Array.isArray(user.history)) return [];
  return user.history.slice().reverse().slice(0, limit);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function pickColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function newSession(userId) {
  const db = getDB();
  const token = crypto.randomBytes(24).toString("hex");
  db.sessions[token] = { userId, exp: Date.now() + SESSION_MS };
  saveStore();
  return token;
}

function unlock(user, id) {
  if (ACH_IDS.has(id) && !user.achievements.includes(id)) {
    user.achievements.push(id);
    return true;
  }
  return false;
}

export function publicProfile(user) {
  if (!user) return null;
  const xp = user.xp || 0;
  // The competitive rank (Iron → Radiant) is earned ONLY by playing against
  // other people — solo play grows your level/XP but never your rank.
  const versusXp = ensureModes(user).versus.xp || 0;
  return {
    id: user.id,
    name: user.name,
    color: user.color,
    xp,
    coins: user.coins || 0,
    level: levelFromXp(xp),
    rank: rankFromXp(versusXp),
    rankXp: versusXp,
    intoLevel: xp % XP_PER_LEVEL,
    levelSpan: XP_PER_LEVEL,
    stats: user.stats || { gamesPlayed: 0, wins: 0, biggestRoom: 0 },
    modes: ensureModes(user),
    ranked: ensureRanked(user),
    achievements: user.achievements || [],
  };
}

export function register(username, password) {
  const name = String(username || "").trim();
  if (name.length < 2 || name.length > 20) return { error: "bad_username" };
  if (!/^[\p{L}\p{N} ._-]+$/u.test(name)) return { error: "bad_username" };
  if (String(password || "").length < 4) return { error: "bad_password" };

  const db = getDB();
  const key = name.toLowerCase();
  if (db.byName[key]) return { error: "name_taken" };

  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString("hex");
  const user = {
    id,
    name,
    key,
    salt,
    hash: hashPassword(password, salt),
    color: pickColor(),
    xp: 0,
    coins: 0,
    stats: { gamesPlayed: 0, wins: 0, biggestRoom: 0 },
    modes: emptyModes(),
    achievements: [],
    createdAt: Date.now(),
  };
  db.users[id] = user;
  db.byName[key] = id;
  unlock(user, "welcome");
  saveStore();
  return { ok: true, token: newSession(id), profile: publicProfile(user) };
}

export function login(username, password) {
  const db = getDB();
  const id = db.byName[String(username || "").trim().toLowerCase()];
  const user = id && db.users[id];
  if (!user) return { error: "bad_login" };
  const h = hashPassword(password, user.salt);
  const a = Buffer.from(h);
  const b = Buffer.from(user.hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { error: "bad_login" };
  return { ok: true, token: newSession(id), profile: publicProfile(user) };
}

export function logout(token) {
  const db = getDB();
  if (token && db.sessions[token]) {
    delete db.sessions[token];
    saveStore();
  }
}

export function userFromToken(token) {
  if (!token) return null;
  const db = getDB();
  const s = db.sessions[token];
  if (!s || s.exp < Date.now()) return null;
  return db.users[s.userId] || null;
}

export function profileFromToken(token) {
  return publicProfile(userFromToken(token));
}

// Leaderboards. `mode` selects which ranking to build:
//   "versus"  — accounts ranked by XP earned playing against other people
//   "solo"    — accounts ranked by XP earned playing alone against the clock
//   "overall" — every account by lifetime XP (both modes combined)
// A mode board only lists players who have actually played that mode.
export function leaderboard(mode = "overall", limit = 100) {
  const db = getDB();
  const key = mode === "solo" || mode === "versus" ? mode : "overall";

  const rows = Object.values(db.users).map((u) => {
    const b = ensureModes(u)[key === "overall" ? "versus" : key];
    if (key === "overall") {
      return {
        u,
        xp: u.xp || 0,
        wins: (u.stats && u.stats.wins) || 0,
        games: (u.stats && u.stats.gamesPlayed) || 0,
      };
    }
    return { u, xp: b.xp || 0, wins: b.wins || 0, games: b.games || 0 };
  });

  return rows
    .filter((r) => key === "overall" || r.games > 0 || r.xp > 0)
    .sort((a, b) => b.xp - a.xp || b.wins - a.wins || b.games - a.games)
    .slice(0, limit)
    .map((r, i) => ({
      rank: i + 1,
      name: r.u.name,
      color: r.u.color,
      xp: r.xp,
      coins: r.u.coins || 0,
      level: levelFromXp(r.u.xp || 0),
      rank: rankFromXp(ensureModes(r.u).versus.xp || 0), // rank = versus play only
      wins: r.wins,
      gamesPlayed: r.games,
    }));
}

// Per-game leaderboard: rank everyone who has played `game` by that game's
// ranked points (then wins, then fewest losses). Each game has its own board.
export function gameLeaderboard(game, limit = 100) {
  if (!RANKED_SET.has(game)) return [];
  const db = getDB();
  return Object.values(db.users)
    .map((u) => ({ u, b: ensureRanked(u)[game] }))
    .filter((x) => x.b && (x.b.games > 0 || x.b.points > 0))
    .sort(
      (a, b) =>
        b.b.points - a.b.points ||
        b.b.wins - a.b.wins ||
        a.b.losses - b.b.losses
    )
    .slice(0, limit)
    .map((x, i) => ({
      rank: i + 1,
      name: x.u.name,
      color: x.u.color,
      points: x.b.points,
      wins: x.b.wins,
      losses: x.b.losses,
      games: x.b.games,
      level: levelFromXp(x.u.xp || 0),
      tier: rankFromXp(ensureModes(x.u).versus.xp || 0), // rank = versus play only
    }));
}

// Grant XP + coins to a single logged-in user (used by team games like Sudoku).
// Updates lifetime stats and re-checks shared achievements. Returns the reward
// summary + fresh profile so the caller can notify that player's socket.
export function grantReward(userId, { xpGain = 0, coinGain = 0, won = false, played = true, mode = "versus", game = null } = {}) {
  const db = getDB();
  const user = db.users[userId];
  if (!user) return null;

  user.stats = user.stats || { gamesPlayed: 0, wins: 0, biggestRoom: 0 };
  if (played) user.stats.gamesPlayed += 1;
  if (won) user.stats.wins += 1;
  user.coins = (user.coins || 0) + Math.max(0, Math.round(coinGain));
  const xpAdd = Math.max(0, Math.round(xpGain));
  user.xp = (user.xp || 0) + xpAdd;

  // Per-mode bucket (versus vs solo) for mode-specific leaderboards.
  const bucket = ensureModes(user)[modeKey(mode)];
  if (played) bucket.games += 1;
  if (won) bucket.wins += 1;
  bucket.xp += xpAdd;

  // Per-game ranked points — only for versus play (a real opponent to win from).
  if (played && modeKey(mode) === "versus") applyRanked(user, game, won);

  const unlocked = [];
  const check = (id, cond) => { if (cond && unlock(user, id)) unlocked.push(id); };
  check("first_spill", user.stats.gamesPlayed >= 1);
  check("champion", user.stats.wins >= 1);
  check("hat_trick", user.stats.wins >= 3);
  check("unstoppable", user.stats.wins >= 10);
  check("veteran", user.stats.gamesPlayed >= 10);
  check("rising_star", levelFromXp(user.xp) >= 5);

  saveStore();
  return { xpGain, coinGain, won, unlocked, profile: publicProfile(user) };
}

// Spend coins from a logged-in user (used by in-game shops like the WORD WONDERS
// solo power-up cards). Returns {ok, coins, profile} on success, or {error} if the
// user is unknown or can't afford it — the caller decides what to do on failure.
export function spendCoins(userId, amount) {
  const db = getDB();
  const user = db.users[userId];
  if (!user) return { error: "no_user" };
  const cost = Math.max(0, Math.round(amount));
  if ((user.coins || 0) < cost) return { error: "insufficient" };
  user.coins -= cost;
  saveStore();
  return { ok: true, coins: user.coins, profile: publicProfile(user) };
}

// Called when a game ends — award XP + achievements to any logged-in players.
// Returns per-player results so the caller can notify each socket.
export function awardGameResults(room) {
  const db = getDB();
  const results = [];
  const connectedCount = room.players.filter((p) => p.connected).length;

  for (const p of room.players) {
    if (!p.userId) continue;
    const user = db.users[p.userId];
    if (!user) continue;

    user.stats = user.stats || { gamesPlayed: 0, wins: 0, biggestRoom: 0 };
    const won = p.id === room.winnerId;
    user.stats.gamesPlayed += 1;
    if (won) user.stats.wins += 1;
    user.stats.biggestRoom = Math.max(user.stats.biggestRoom, connectedCount);

    const gain = Math.max(1, p.score || 0) + (won ? 10 : 0);
    user.xp = (user.xp || 0) + gain;

    // SPILL is always played against other people → "versus" leaderboard bucket.
    const bucket = ensureModes(user).versus;
    bucket.games += 1;
    if (won) bucket.wins += 1;
    bucket.xp += gain;

    // SPILL's own ranked board: winner +18, everyone else -18.
    applyRanked(user, "spill", won);

    const unlocked = [];
    const check = (id, cond) => { if (cond && unlock(user, id)) unlocked.push(id); };
    check("first_spill", user.stats.gamesPlayed >= 1);
    check("champion", user.stats.wins >= 1);
    check("hat_trick", user.stats.wins >= 3);
    check("unstoppable", user.stats.wins >= 10);
    check("socialite", user.stats.biggestRoom >= 4);
    check("veteran", user.stats.gamesPlayed >= 10);
    check("rising_star", levelFromXp(user.xp) >= 5);

    results.push({
      userId: user.id,
      socketId: p.socketId,
      gain,
      won,
      unlocked,
      profile: publicProfile(user),
    });
  }
  // SPILL is free-for-all — everyone is on their own side (team: null).
  recordMatch("spill", room.players.map((p) => ({
    userId: p.userId,
    name: p.name,
    team: null,
    won: p.id === room.winnerId,
  })));
  saveStore();
  return results;
}

// Fixed reward for a completed SOLO game (client-side games like the picture
// puzzle's solo mode call this via REST). The server sets the amount from a
// table so a client can't mint arbitrary XP. Always counts as a solo "win"
// (finishing a solo puzzle is the win) and feeds the solo leaderboard.
const SOLO_REWARDS = {
  easy: { coins: 5, xp: 3 },
  medium: { coins: 8, xp: 5 },
  hard: { coins: 12, xp: 8 },
};
export function recordSoloWin(userId, difficulty = "easy") {
  const r = SOLO_REWARDS[difficulty] || SOLO_REWARDS.easy;
  return grantReward(userId, {
    xpGain: r.xp,
    coinGain: r.coins,
    won: true,
    played: true,
    mode: "solo",
  });
}
