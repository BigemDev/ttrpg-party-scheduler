// Tiny JSON-file "database". This app is meant for a handful of players
// checking a schedule, not high concurrency, so a flat file kept in memory
// and flushed to disk on every write is simpler and more portable than a
// real database (no native modules to compile, works on any architecture).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

let cache = null;

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ campaigns: {} }, null, 2));
  }
}

function load() {
  if (cache) return cache;
  ensureDb();
  cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  return cache;
}

function save() {
  if (!cache) return;
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(cache, null, 2));
  fs.renameSync(tmpPath, DB_PATH);
}

module.exports = { load, save };
