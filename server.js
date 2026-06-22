const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { load, save } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const APP_PASSWORD = process.env.APP_PASSWORD;
if (!APP_PASSWORD) {
  console.warn(
    'WARNING: APP_PASSWORD is not set. Falling back to the default password "changeme". ' +
    'Set APP_PASSWORD in your environment before exposing this beyond your own machine.'
  );
}
const EFFECTIVE_PASSWORD = APP_PASSWORD || 'changeme';

const sessions = new Map();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return cookies;
}

function isAuthed(req) {
  const token = parseCookies(req).session;
  if (!token) return false;
  const expiry = sessions.get(token);
  if (!expiry || expiry < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function requirePageAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.redirect('/login');
}

function requireApiAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Not logged in.' });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || !safeCompare(password, EFFECTIVE_PASSWORD)) {
    return res.status(401).json({ error: 'Wrong password.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  res.setHeader(
    'Set-Cookie',
    `session=${token}; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}; Path=/`
  );
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  const token = parseCookies(req).session;
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/');
  res.json({ ok: true });
});

app.get('/', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'menu.html'));
});

app.get('/campaign/:id', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'campaign.html'));
});

function genId() {
  return crypto.randomBytes(5).toString('hex');
}

function isValidTime(t) {
  return typeof t === 'string' && /^([01]\d|2[0-3]):(00|30)$/.test(t);
}

function isValidDateKey(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function fullDaySlots(slotMinutes) {
  const out = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += slotMinutes) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
}

function weekDays(weekStart) {
  const [y, mo, d] = weekStart.split('-').map(Number);
  const base = new Date(Date.UTC(y, mo - 1, d));
  const out = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(base);
    dt.setUTCDate(base.getUTCDate() + i);
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

function cleanRosterList(roster) {
  if (!Array.isArray(roster)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of roster) {
    const n = String(raw).trim().slice(0, 60);
    const key = n.toLowerCase();
    if (!n || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
    if (out.length >= 30) break;
  }
  return out;
}

app.get('/api/campaigns', requireApiAuth, (req, res) => {
  const db = load();
  const list = Object.values(db.campaigns)
    .map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      rosterCount: c.roster.length,
      createdAt: c.createdAt
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(list);
});

app.post('/api/campaigns', requireApiAuth, (req, res) => {
  const { name, description, roster, timeStart, timeEnd, slotMinutes } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'A campaign name is required.' });
  }
  const start = isValidTime(timeStart) ? timeStart : '00:00';
  const end = isValidTime(timeEnd) ? timeEnd : '23:59';
  if (start >= end) {
    return res.status(400).json({ error: 'Start time must be before end time.' });
  }

  const db = load();
  let id = genId();
  while (db.campaigns[id]) id = genId();

  db.campaigns[id] = {
    id,
    name: name.trim().slice(0, 120),
    description: (description || '').trim().slice(0, 500),
    roster: cleanRosterList(roster),
    timeStart: start,
    timeEnd: end,
    slotMinutes: Number(slotMinutes) === 60 ? 60 : 30,
    selectedWeek: null,
    createdAt: new Date().toISOString(),
    weeks: {}
  };

  save();
  res.json({ id });
});

app.get('/api/campaigns/:id', requireApiAuth, (req, res) => {
  const db = load();
  const c = db.campaigns[req.params.id];
  if (!c) return res.status(404).json({ error: 'Campaign not found.' });
  res.json(c);
});

app.patch('/api/campaigns/:id', requireApiAuth, (req, res) => {
  const db = load();
  const c = db.campaigns[req.params.id];
  if (!c) return res.status(404).json({ error: 'Campaign not found.' });

  const { name, description, roster, timeStart, timeEnd, slotMinutes } = req.body || {};
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'Name cannot be empty.' });
    c.name = String(name).trim().slice(0, 120);
  }
  if (description !== undefined) c.description = String(description).trim().slice(0, 500);
  if (roster !== undefined) c.roster = cleanRosterList(roster);
  if (isValidTime(timeStart)) c.timeStart = timeStart;
  if (isValidTime(timeEnd)) c.timeEnd = timeEnd;
  if (c.timeStart >= c.timeEnd) {
    return res.status(400).json({ error: 'Start time must be before end time.' });
  }
  if (slotMinutes !== undefined) c.slotMinutes = Number(slotMinutes) === 60 ? 60 : 30;

  save();
  res.json(c);
});

app.delete('/api/campaigns/:id', requireApiAuth, (req, res) => {
  const db = load();
  if (!db.campaigns[req.params.id]) return res.status(404).json({ error: 'Campaign not found.' });
  delete db.campaigns[req.params.id];
  save();
  res.json({ ok: true });
});

app.post('/api/campaigns/:id/select-week', requireApiAuth, (req, res) => {
  const db = load();
  const c = db.campaigns[req.params.id];
  if (!c) return res.status(404).json({ error: 'Campaign not found.' });

  const { weekStart } = req.body || {};
  if (!isValidDateKey(weekStart)) return res.status(400).json({ error: 'Invalid week.' });

  c.selectedWeek = weekStart;
  if (!c.weeks[weekStart]) c.weeks[weekStart] = { responses: {} };
  save();
  res.json({ ok: true, selectedWeek: c.selectedWeek });
});

app.post('/api/campaigns/:id/weeks/:weekStart/availability', requireApiAuth, (req, res) => {
  const db = load();
  const c = db.campaigns[req.params.id];
  if (!c) return res.status(404).json({ error: 'Campaign not found.' });

  const weekStart = req.params.weekStart;
  if (!isValidDateKey(weekStart)) return res.status(400).json({ error: 'Invalid week.' });

  const { name, slots, note, states } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Pick your name first.' });
  }
  const rosterMatch = c.roster.find(r => r.toLowerCase() === name.trim().toLowerCase());
  if (!rosterMatch) {
    return res.status(400).json({ error: 'That name is not on this campaign\'s roster.' });
  }
  if (!Array.isArray(slots)) return res.status(400).json({ error: 'Slots must be a list.' });

  const validDays = new Set(weekDays(weekStart));
  const validTimes = new Set(fullDaySlots(c.slotMinutes));
  const cleanSlots = slots.filter(s => {
    const [d, t] = String(s).split('|');
    return validDays.has(d) && validTimes.has(t);
  });

  if (!c.weeks[weekStart]) c.weeks[weekStart] = { responses: {} };
  const key = rosterMatch.toLowerCase();
  
  const responseData = {
    name: rosterMatch,
    slots: cleanSlots,
    note: String(note || '').trim().slice(0, 300),
    updatedAt: new Date().toISOString()
  };
  
  if (states && typeof states === 'object') {
    responseData.states = states;
  }
  
  c.weeks[weekStart].responses[key] = responseData;

  save();
  res.json({ ok: true, response: c.weeks[weekStart].responses[key] });
});

app.get('/healthz', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Scheduler listening on port ${PORT}`);
});