// server/store.js
// Persistence for accounts. Two interchangeable backends, chosen at boot:
//
//   • FILE (default, local dev) — one JSON file under server/data/. Simple, but
//     WIPED on every deploy/restart on ephemeral hosts (Render/Koyeb/Fly free).
//   • POSTGRES (set DATABASE_URL — Neon, Supabase, …) — real, queryable tables
//     that survive deploys:
//        kyuubi_users     one row per account (readable columns + full profile)
//        kyuubi_sessions  active login tokens
//        kyuubi_leaderboard  a VIEW ranking users by XP (for easy dashboards)
//
// The in-memory `db` object stays the single source of truth at runtime, so
// every getDB()/saveStore() caller in accounts.js stays synchronous. The backend
// is only touched on boot (load) and via a debounced save that mirrors the whole
// in-memory state into the tables. NOTE: the games' live rooms are deliberately
// NOT persisted — they're transient sessions held in RAM.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_KEY = "kyuubi"; // old single-blob kv row, migrated on first load

// Resolved at loadStore() time, NOT module-eval: ESM imports are hoisted and run
// before index.js calls loadEnv(), so reading process.env here would miss .env.
let DATA_DIR = "";
let DB_FILE = "";
let PG_URL = "";
let backend = "file";

function resolveConfig() {
  DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
  DB_FILE = path.join(DATA_DIR, "kyuubi.json");
  PG_URL = process.env.DATABASE_URL || "";
  backend = PG_URL ? "pg" : "file";
}

let db = { users: {}, byName: {}, sessions: {} };
let saveTimer = null;
let pool = null; // lazy pg pool

function normalize(parsed) {
  return {
    users: (parsed && parsed.users) || {},
    byName: (parsed && parsed.byName) || {},
    sessions: (parsed && parsed.sessions) || {},
  };
}
// Rebuild the lowercase-username → id index from the users map (it isn't stored;
// it's pure derived state).
function rebuildByName() {
  db.byName = {};
  for (const u of Object.values(db.users)) {
    const key = u.key || (u.name || "").toLowerCase();
    if (key) db.byName[key] = u.id;
  }
}
const levelOf = (xp) => Math.floor((xp || 0) / 100) + 1;

// ---------------------------------------------------------------------------
export async function loadStore() {
  resolveConfig();
  if (backend === "pg") {
    try {
      await pgInit();
      await loadFromPg();
      console.log(
        `store: accounts loaded from Postgres (persistent) — ${Object.keys(db.users).length} users.`
      );
      return;
    } catch (e) {
      console.error("store: Postgres load failed, using file fallback —", e.message);
      backend = "file";
    }
  }
  try {
    if (fs.existsSync(DB_FILE)) {
      db = normalize(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
      rebuildByName();
      pruneSessions();
    }
    if (PG_URL) console.warn("store: DATABASE_URL set but Postgres unavailable — on the ephemeral file store.");
  } catch (e) {
    console.error("store: load failed, starting fresh —", e.message);
  }
}

async function pgInit() {
  if (pool) return;
  const { default: pg } = await import("pg");
  pool = new pg.Pool({
    connectionString: PG_URL,
    ssl: process.env.DATABASE_SSL === "off" ? false : { rejectUnauthorized: false },
    max: 4,
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kyuubi_users (
      id            text PRIMARY KEY,
      username      text NOT NULL,
      color         text,
      xp            integer NOT NULL DEFAULT 0,
      coins         integer NOT NULL DEFAULT 0,
      level         integer NOT NULL DEFAULT 1,
      games_played  integer NOT NULL DEFAULT 0,
      wins          integer NOT NULL DEFAULT 0,
      achievements  jsonb   NOT NULL DEFAULT '[]'::jsonb,
      profile       jsonb   NOT NULL,
      created_at    timestamptz DEFAULT now(),
      updated_at    timestamptz DEFAULT now()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kyuubi_sessions (
      token    text PRIMARY KEY,
      user_id  text NOT NULL,
      exp      bigint NOT NULL
    )`);
  await pool.query(`
    CREATE OR REPLACE VIEW kyuubi_leaderboard AS
      SELECT row_number() OVER (ORDER BY xp DESC, wins DESC) AS rank,
             username, xp, coins, level, wins, games_played, updated_at
      FROM kyuubi_users`);
}

async function loadFromPg() {
  const users = await pool.query("SELECT profile FROM kyuubi_users");
  db = { users: {}, byName: {}, sessions: {} };
  for (const row of users.rows) {
    const u = row.profile;
    if (u && u.id) db.users[u.id] = u;
  }
  const sess = await pool.query("SELECT token, user_id, exp FROM kyuubi_sessions");
  for (const row of sess.rows) {
    db.sessions[row.token] = { userId: row.user_id, exp: Number(row.exp) };
  }
  rebuildByName();
  pruneSessions();

  // One-time migration: if the tables are empty but an old single-blob kv row
  // exists (from the earlier store version), import it, then persist into tables.
  if (Object.keys(db.users).length === 0) {
    try {
      const legacy = await pool.query("SELECT val FROM kv WHERE key = $1", [LEGACY_KEY]);
      if (legacy.rows[0] && legacy.rows[0].val) {
        db = normalize(legacy.rows[0].val);
        rebuildByName();
        pruneSessions();
        if (Object.keys(db.users).length) {
          console.log("store: migrated legacy kv blob → tables.");
          await flush();
        }
      }
    } catch {
      // no kv table — nothing to migrate.
    }
  }
}

export function getDB() {
  return db;
}

function pruneSessions() {
  const now = Date.now();
  for (const [token, s] of Object.entries(db.sessions)) {
    if (!s || s.exp < now) delete db.sessions[token];
  }
}

// Debounced write — coalesces bursts of account changes into one persist.
export function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    flush().catch((e) => console.error("store: save failed —", e.message));
  }, 250);
}

async function flush() {
  if (backend === "pg") return flushPg();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

// Mirror the whole in-memory state into the tables in one transaction: upsert
// every user, and replace the session set (sessions come and go on login/logout).
async function flushPg() {
  await pgInit();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const u of Object.values(db.users)) {
      await client.query(
        `INSERT INTO kyuubi_users
           (id, username, color, xp, coins, level, games_played, wins, achievements, profile, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb, to_timestamp($11/1000.0), now())
         ON CONFLICT (id) DO UPDATE SET
           username=EXCLUDED.username, color=EXCLUDED.color, xp=EXCLUDED.xp, coins=EXCLUDED.coins,
           level=EXCLUDED.level, games_played=EXCLUDED.games_played, wins=EXCLUDED.wins,
           achievements=EXCLUDED.achievements, profile=EXCLUDED.profile, updated_at=now()`,
        [
          u.id,
          u.name || "",
          u.color || null,
          u.xp || 0,
          u.coins || 0,
          levelOf(u.xp),
          (u.stats && u.stats.gamesPlayed) || 0,
          (u.stats && u.stats.wins) || 0,
          JSON.stringify(u.achievements || []),
          JSON.stringify(u),
          u.createdAt || Date.now(),
        ]
      );
    }
    // Replace sessions (small set; simplest correct way to reflect logouts/prune).
    await client.query("DELETE FROM kyuubi_sessions");
    for (const [token, s] of Object.entries(db.sessions)) {
      if (!s) continue;
      await client.query(
        "INSERT INTO kyuubi_sessions (token, user_id, exp) VALUES ($1,$2,$3)",
        [token, s.userId, s.exp]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

// Flush any pending write immediately (graceful shutdown before a deploy).
export async function flushNow() {
  clearTimeout(saveTimer);
  try {
    await flush();
  } catch (e) {
    console.error("store: final flush failed —", e.message);
  }
}
