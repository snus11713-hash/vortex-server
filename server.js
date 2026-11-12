const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'r3xd';
const ADMIN_PASS = process.env.ADMIN_PASS || 'snus2012';

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// ===== Хранилище (JSON-файл) =====
// ВНИМАНИЕ: на бесплатном Render файловая система сбрасывается при передеплое.
// Для продакшена нужна БД (Postgres/Supabase) — подключим отдельно.
let db = { users: {}, sessions: {}, adminSessions: {}, tickets: [], orders: [] };

function load() {
  try {
    if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) { console.error('load error', e); }
}
function save() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) { console.error('save error', e); }
}
load();

// ===== Утилиты =====
function hash(pass, salt) {
  return crypto.scryptSync(pass, salt, 64).toString('hex');
}
function newToken() {
  return crypto.randomBytes(24).toString('hex');
}
function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const nick = db.sessions[t];
  if (!nick) return res.status(401).json({ error: 'unauthorized' });
  req.nick = nick;
  next();
}
function adminAuth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!db.adminSessions[t]) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// ===== Публичные =====
app.get('/', (req, res) => res.json({ ok: true, service: 'vortex-api' }));

app.post('/api/register', (req, res) => {
  const nick = String(req.body.nick || '').trim();
  const pass = String(req.body.pass || '');
  if (!nick || !pass) return res.status(400).json({ error: 'nick and pass required' });
  if (db.users[nick]) return res.status(409).json({ error: 'nick taken' });
  const salt = crypto.randomBytes(16).toString('hex');
  db.users[nick] = { pass: hash(pass, salt), salt, balance: 0, created: new Date().toISOString() };
  const t = newToken();
  db.sessions[t] = nick;
  save();
  res.json({ token: t, nick, balance: 0 });
});

app.post('/api/login', (req, res) => {
  const nick = String(req.body.nick || '').trim();
  const pass = String(req.body.pass || '');
  const u = db.users[nick];
  if (!u || u.pass !== hash(pass, u.salt)) return res.status(401).json({ error: 'invalid credentials' });
  const t = newToken();
  db.sessions[t] = nick;
  save();
  res.json({ token: t, nick, balance: u.balance });
});

// ===== Юзер (нужен токен) =====
app.get('/api/me', auth, (req, res) => {
  const u = db.users[req.nick];
  res.json({ nick: req.nick, balance: u.balance, created: u.created });
});

app.post('/api/orders', auth, (req, res) => {
  const plan = String(req.body.plan || '');
  const price = String(req.body.price || '');
  const order = { id: newToken().slice(0, 12), nick: req.nick, plan, price, time: new Date().toISOString(), status: 'pending' };
  db.orders.unshift(order);
  save();
  res.json(order);
});

app.get('/api/orders', auth, (req, res) => {
  res.json(db.orders.filter((o) => o.nick === req.nick));
});

app.get('/api/tickets', auth, (req, res) => {
  res.json(db.tickets.filter((t) => t.nick === req.nick));
});

app.post('/api/tickets', auth, (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'message required' });
  const t = { id: newToken().slice(0, 12), nick: req.nick, message, time: new Date().toISOString(), status: 'open', reply: '' };
  db.tickets.unshift(t);
  save();
  res.json(t);
});

// ===== Вебхук оплаты (CryptoCloud / Trybit) =====
app.post('/api/webhook/cryptocloud', (req, res) => {
  const b = req.body || {};
  console.log('webhook:', JSON.stringify(b));
  const orderId = b.order_id || b.invoice_id || b.merchant_order_id;
  const status = String(b.status || '').toLowerCase();
  if (status === 'success' || status === 'paid' || status === '1') {
    const o = db.orders.find((x) => x.id === orderId);
    if (o && o.status !== 'paid') {
      o.status = 'paid';
      const u = db.users[o.nick];
      if (u) u.balance = (u.balance || 0) + (parseFloat(o.price) || 0);
      save();
    }
  }
  res.json({ ok: true });
});

// ===== Админ =====
app.post('/api/admin/login', (req, res) => {
  const login = String(req.body.login || '');
  const pass = String(req.body.pass || '');
  if (login !== ADMIN_LOGIN || pass !== ADMIN_PASS) return res.status(401).json({ error: 'invalid admin credentials' });
  const t = newToken();
  db.adminSessions[t] = true;
  save();
  res.json({ token: t });
});

app.get('/api/admin/users', adminAuth, (req, res) => {
  res.json(Object.keys(db.users).map((n) => ({ nick: n, balance: db.users[n].balance, created: db.users[n].created })));
});

app.post('/api/admin/topup', adminAuth, (req, res) => {
  const nick = String(req.body.nick || '').trim();
  const amount = parseFloat(req.body.amount);
  const u = db.users[nick];
  if (!u) return res.status(404).json({ error: 'user not found' });
  if (!(amount > 0)) return res.status(400).json({ error: 'invalid amount' });
  u.balance = (u.balance || 0) + amount;
  save();
  res.json({ nick, balance: u.balance });
});

app.get('/api/admin/tickets', adminAuth, (req, res) => res.json(db.tickets));

app.post('/api/admin/tickets/:id/reply', adminAuth, (req, res) => {
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  t.reply = String(req.body.reply || '');
  t.status = 'answered';
  save();
  res.json(t);
});

app.get('/api/admin/orders', adminAuth, (req, res) => res.json(db.orders));

app.listen(PORT, () => console.log('vortex-api listening on port ' + PORT));
