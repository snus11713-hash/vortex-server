const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT || 10000;
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'r3xd';
const ADMIN_PASS = process.env.ADMIN_PASS || 'snus2012';
const DOWNLOAD_URL = process.env.DOWNLOAD_URL || 'https://' + '://github.com';

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const PLAN_PRICES = {
  'Базовый': 299,
  'Стандарт': 549,
  'Премиум': 899
};

let db = {
  users: {},
  sessions: {},
  adminSessions: {},
  tickets: new Array(),
  orders: new Array(),
  keys: new Array()
};

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db = Object.assign({
        users: {},
        sessions: {},
        adminSessions: {},
        tickets: new Array(),
        orders: new Array(),
        keys: new Array()
      }, parsed);
    }
  } catch (e) { console.error('load error', e); }
}

function save() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) { console.error('save error', e); }
}
load();

function hash(pass, salt) {
  return crypto.scryptSync(pass, salt, 64).toString('hex');
}
function newToken() {
  return crypto.randomBytes(24).toString('hex');
}
function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const nick = db.sessions.hasOwnProperty(t) ? db.sessions[t] : null;
  if (!nick) return res.status(401).json({ error: 'unauthorized' });
  req.nick = nick;
  next();
}
function adminAuth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!db.adminSessions.hasOwnProperty(t)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

function hasSubscription(nick) {
  const u = db.users.hasOwnProperty(nick) ? db.users[nick] : null;
  if (u && u.plan) return true;
  return db.orders.some(function (o) {
    return o.nick === nick && o.status === 'paid';
  });
}

// ===== Публичные =====
app.get('/', function (req, res) {
  res.json({ ok: true, service: 'vortex-api' });
});

app.post('/api/register', function (req, res) {
  const nick = String(req.body.nick || '').trim();
  const pass = String(req.body.pass || '');
  if (!nick || !pass) return res.status(400).json({ error: 'nick and pass required' });
  if (db.users.hasOwnProperty(nick)) return res.status(409).json({ error: 'nick taken' });
  const salt = crypto.randomBytes(16).toString('hex');
  db.users[nick] = { pass: hash(pass, salt), salt: salt, balance: 0, plan: '', created: new Date().toISOString() };
  const t = newToken();
  db.sessions[t] = nick;
  save();
  res.json({ token: t, nick: nick, balance: 0, hasSub: false });
});

app.post('/api/login', function (req, res) {
  const nick = String(req.body.nick || '').trim();
  const pass = String(req.body.pass || '');
  const u = db.users.hasOwnProperty(nick) ? db.users[nick] : null;
  if (!u || u.pass !== hash(pass, u.salt)) return res.status(401).json({ error: 'invalid credentials' });
  const t = newToken();
  db.sessions[t] = nick;
  save();
  res.json({ token: t, nick: nick, balance: u.balance, hasSub: hasSubscription(nick) });
});

// ===== Юзер =====
app.get('/api/me', auth, function (req, res) {
  const u = db.users[req.nick];
  res.json({ nick: req.nick, balance: u.balance, plan: u.plan || '', hasSub: hasSubscription(req.nick), created: u.created });
});

app.post('/api/orders', auth, function (req, res) {
  const plan = String(req.body.plan || '');
  const price = String(req.body.price || '');
  const order = { id: newToken().slice(0, 12), nick: req.nick, plan: plan, price: price, time: new Date().toISOString(), status: 'pending' };
  db.orders.unshift(order);
  save();
  res.json(order);
});

app.get('/api/orders', auth, function (req, res) {
  res.json(db.orders.filter(function (o) { return o.nick === req.nick; }));
});

// Покупка с баланса -> сразу активирует подписку и открывает скачивание
app.post('/api/buy-balance', auth, function (req, res) {
  const plan = String(req.body.plan || '').trim();
  const cost = PLAN_PRICES.hasOwnProperty(plan) ? PLAN_PRICES[plan] : 0;
  if (!cost) return res.status(400).json({ error: 'unknown plan' });

  const u = db.users[req.nick];
  if (!u || (u.balance || 0) < cost) {
    return res.status(400).json({ error: 'insufficient balance' });
  }

  u.balance -= cost;
  u.plan = plan;

  const freeKey = db.keys.find(function (k) { return k.plan === plan && !k.usedBy; });
  let issuedKey = '';
  if (freeKey) {
    freeKey.usedBy = req.nick;
    freeKey.usedAt = new Date().toISOString();
    issuedKey = freeKey.code;
  }

  db.orders.unshift({
    id: newToken().slice(0, 12),
    nick: req.nick,
    plan: plan,
    price: cost + ' ₽ (баланс)',
    time: new Date().toISOString(),
    status: 'paid'
  });

  save();
  res.json({ ok: true, balance: u.balance, plan: plan, key: issuedKey, downloadUrl: DOWNLOAD_URL });
});

// Проверка подписки перед скачиванием
app.get('/api/download', auth, function (req, res) {
  if (!hasSubscription(req.nick)) {
    return res.status(403).json({ error: 'no active subscription' });
  }
  res.json({ url: DOWNLOAD_URL });
});

app.get('/api/my-keys', auth, function (req, res) {
  res.json(db.keys.filter(function (k) { return k.usedBy === req.nick; }));
});

app.get('/api/tickets', auth, function (req, res) {
  res.json(db.tickets.filter(function (t) { return t.nick === req.nick; }));
});

app.post('/api/tickets', auth, function (req, res) {
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'message required' });
  const t = { id: newToken().slice(0, 12), nick: req.nick, message: message, time: new Date().toISOString(), status: 'open', reply: '' };
  db.tickets.unshift(t);
  save();
  res.json(t);
});

// ===== Вебхук оплаты =====
app.post('/api/webhook/cryptocloud', function (req, res) {
  const b = req.body || {};
  const orderId = b.order_id || b.invoice_id || b.merchant_order_id;
  const status = String(b.status || '').toLowerCase();
  if (status === 'success' || status === 'paid' || status === '1') {
    const o = db.orders.find(function (x) { return x.id === orderId; });
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
app.post('/api/admin/login', function (req, res) {
  const login = String(req.body.login || '');
  const pass = String(req.body.pass || '');
  if (login !== ADMIN_LOGIN || pass !== ADMIN_PASS) return res.status(401).json({ error: 'invalid admin credentials' });
  const t = newToken();
  db.adminSessions[t] = true;
  save();
  res.json({ token: t });
});

app.get('/api/admin/users', adminAuth, function (req, res) {
  res.json(Object.keys(db.users).map(function (n) {
    return { nick: n, balance: db.users[n].balance, plan: db.users[n].plan || '', created: db.users[n].created };
  }));
});

app.post('/api/admin/topup', adminAuth, function (req, res) {
  const nick = String(req.body.nick || '').trim();
  const amount = parseFloat(req.body.amount);
  const u = db.users.hasOwnProperty(nick) ? db.users[nick] : null;
  if (!u) return res.status(404).json({ error: 'user not found' });
  if (!(amount > 0)) return res.status(400).json({ error: 'invalid amount' });
  u.balance = (u.balance || 0) + amount;
  save();
  res.json({ nick: nick, balance: u.balance });
});

app.get('/api/admin/keys', adminAuth, function (req, res) {
  res.json(db.keys);
});

app.post('/api/admin/keys', adminAuth, function (req, res) {
  const plan = String(req.body.plan || '').trim();
  const codes = Array.isArray(req.body.codes) ? req.body.codes : new Array();
  if (!PLAN_PRICES.hasOwnProperty(plan)) return res.status(400).json({ error: 'invalid plan' });
  let added = 0;
  for (const raw of codes) {
    const code = String(raw || '').trim();
    if (code && !db.keys.some(function (k) { return k.code === code; })) {
      db.keys.unshift({ id: newToken().slice(0, 10), plan: plan, code: code, usedBy: null, usedAt: null });
      added++;
    }
  }
  save();
  res.json({ ok: true, added: added });
});

app.get('/api/admin/backup', adminAuth, function (req, res) {
  res.json({ users: db.users, tickets: db.tickets, orders: db.orders, keys: db.keys });
});

app.post('/api/admin/restore', adminAuth, function (req, res) {
  const b = req.body || {};
  if (b.users) db.users = b.users;
  if (Array.isArray(b.tickets)) db.tickets = b.tickets;
  if (Array.isArray(b.orders)) db.orders = b.orders;
  if (Array.isArray(b.keys)) db.keys = b.keys;
  save();
  res.json({ ok: true });
});

app.get('/api/admin/tickets', adminAuth, function (req, res) {
  res.json(db.tickets);
});

app.post('/api/admin/tickets/:id/reply', adminAuth, function (req, res) {
  const t = db.tickets.find(function (x) { return x.id === req.params.id; });
  if (!t) return res.status(404).json({ error: 'not found' });
  t.reply = String(req.body.reply || '');
  t.status = 'answered';
  save();
  res.json(t);
});

app.get('/api/admin/orders', adminAuth, function (req, res) {
  res.json(db.orders);
});

app.listen(PORT, function () {
  console.log('vortex-api listening on port ' + PORT);
});
