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
    level: levelFromXp(xp),
    intoLevel: xp % XP_PER_LEVEL,
    levelSpan: XP_PER_LEVEL,
    stats: user.stats || { gamesPlayed: 0, wins: 0, biggestRoom: 0 },
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
    stats: { gamesPlayed: 0, wins: 0, biggestRoom: 0 },
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
