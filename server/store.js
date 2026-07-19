// server/store.js
// Persistent JSON store for accounts. Two interchangeable backends, chosen at
// boot from the environment — accounts.js never has to know which is active:
//
//   • FILE (default) — a single JSON file under server/data/. Perfect for local
//     dev, BUT on an ephemeral host (Render/Koyeb/Fly free tiers) that folder is
//     WIPED on every deploy/restart, so accounts would reset each push.
//   • POSTGRES — set DATABASE_URL (Neon, Supabase, Render Postgres, …) and the
//     whole DB is stored as one JSONB blob that survives deploys. This is what
//     you want in production so players keep their XP / coins / logins.
//
// The in-memory `db` object stays the single source of truth at runtime; the
// backend is only touched on boot (load) and via a debounced save, so every
// getDB()/saveStore() caller stays synchronous exactly as before.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "kyuubi.json");
const PG_URL = process.env.DATABASE_URL || "";
const PG_KEY = "kyuubi"; // single-row key holding the whole DB blob

let db = { users: {}, byName: {}, sessions: {} };
let saveTimer = null;
let pool = null; // lazy pg pool
let backend = PG_URL ? "pg" : "file";

function normalize(parsed) {
  return {
    users: (parsed && parsed.users) || {},
    byName: (parsed && parsed.byName) || {},
    sessions: (parsed && parsed.sessions) || {},
  };
}

// Load the DB once at startup. Async so the Postgres backend can await its query;
// index.js should `await loadStore()` before serving.
export async function loadStore() {
  if (backend === "pg") {
    try {
      await pgInit();
      const { rows } = await pool.query("SELECT val FROM kv WHERE key = $1", [PG_KEY]);
      if (rows[0] && rows[0].val) db = normalize(rows[0].val);
      pruneSessions();
      console.log("store: accounts loaded from Postgres (persistent).");
      return;
    } catch (e) {
      // Never crash the server over storage — fall back to the file so the app
      // still runs (data just won't persist until the DB is reachable again).
      console.error("store: Postgres load failed, using file fallback —", e.message);
      backend = "file";
    }
  }
  try {
    if (fs.existsSync(DB_FILE)) {
      db = normalize(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
      pruneSessions();
    }
    if (PG_URL) console.warn("store: DATABASE_URL set but Postgres unavailable — running on the ephemeral file store.");
  } catch (e) {
    console.error("store: load failed, starting fresh —", e.message);
  }
}

async function pgInit() {
  if (pool) return;
  const { default: pg } = await import("pg");
  pool = new pg.Pool({
    connectionString: PG_URL,
    // Hosted Postgres (Neon/Supabase/Render) requires SSL; set DATABASE_SSL=off
    // for a plain local Postgres.
    ssl: process.env.DATABASE_SSL === "off" ? false : { rejectUnauthorized: false },
    max: 3,
  });
  await pool.query(
    "CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, val jsonb NOT NULL, updated_at timestamptz DEFAULT now())"
  );
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

// Debounced write. Coalesces bursts of account changes into one persist.
export function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    flush().catch((e) => console.error("store: save failed —", e.message));
  }, 250);
}

async function flush() {
  if (backend === "pg") {
    await pgInit();
    await pool.query(
      "INSERT INTO kv (key, val, updated_at) VALUES ($1, $2::jsonb, now()) " +
        "ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val, updated_at = now()",
      [PG_KEY, JSON.stringify(db)]
    );
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

// Flush any pending write immediately (called on graceful shutdown so the last
// change before a deploy isn't lost to the debounce window).
export async function flushNow() {
  clearTimeout(saveTimer);
  try {
    await flush();
  } catch (e) {
    console.error("store: final flush failed —", e.message);
  }
}
