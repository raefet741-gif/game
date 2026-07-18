// server/store.js
// Tiny persistent JSON store for accounts (zero dependencies). Fine for local dev
// and small scale. In production, swap for a hosted DB (Neon/Turso/Postgres) — the
// account functions in accounts.js are the only thing that touches this.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "kyuubi.json");

let db = { users: {}, byName: {}, sessions: {} };
let saveTimer = null;

export function loadStore() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      db = {
        users: parsed.users || {},
        byName: parsed.byName || {},
        sessions: parsed.sessions || {},
      };
      pruneSessions();
    }
  } catch (e) {
    console.error("store: load failed, starting fresh —", e.message);
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

// Debounced atomic write.
export function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DB_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, DB_FILE);
    } catch (e) {
      console.error("store: save failed —", e.message);
    }
  }, 250);
}
