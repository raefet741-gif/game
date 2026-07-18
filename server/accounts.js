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
  return {
    id: user.id,
    name: user.name,
    color: user.color,
    xp,
    coins: user.coins || 0,
    level: levelFromXp(xp),
    intoLevel: xp % XP_PER_LEVEL,
    levelSpan: XP_PER_LEVEL,
    stats: user.stats || { gamesPlayed: 0, wins: 0, biggestRoom: 0 },
    modes: ensureModes(user),
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
      wins: r.wins,
      gamesPlayed: r.games,
    }));
}

// Grant XP + coins to a single logged-in user (used by team games like Sudoku).
// Updates lifetime stats and re-checks shared achievements. Returns the reward
// summary + fresh profile so the caller can notify that player's socket.
export function grantReward(userId, { xpGain = 0, coinGain = 0, won = false, played = true, mode = "versus" } = {}) {
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
