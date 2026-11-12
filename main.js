const API_URL = 'https://' + 'vortex-server-pqop' + '.onrender.com';

async function api(path, options, isAdmin) {
  const opts = options || {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  const token = sessionStorage.getItem(isAdmin ? 'vortex_admin_token' : 'vortex_token');
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API_URL + path, Object.assign({}, opts, { headers: headers }));
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
  return data;
}

const canvas = document.getElementById('bg');
const ctx = canvas.getContext('2d');
let w, h, particles = new Array();
const COLORS = new Array('124, 58, 237', '192, 132, 252', '124, 58, 237');

function resize() { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
resize();
window.addEventListener('resize', resize);

function init() {
  const count = Math.min(140, Math.floor((w * h) / 15000));
  particles = new Array();
  for (let i = 0; i < count; i++) {
    particles.push({
      angle: Math.random() * Math.PI * 2,
      radius: Math.random() * Math.max(w, h) * 0.55 + 40,
      speed: 0.0003 + Math.random() * 0.001,
      size: 0.5 + Math.random() * 1.8,
      color: COLORS.at(i % COLORS.length),
      alpha: 0.15 + Math.random() * 0.45
    });
  }
}
init();
window.addEventListener('resize', init);

let t = 0;
function loop() {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  for (const p of particles) {
    p.angle += p.speed;
    const r = p.radius + Math.sin(t * 0.4 + p.radius * 0.01) * 24;
    const x = cx + Math.cos(p.angle) * r;
    const y = cy + Math.sin(p.angle) * r * 0.65;
    ctx.beginPath();
    ctx.arc(x, y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(' + p.color + ', ' + p.alpha + ')';
    ctx.fill();
  }
  t += 0.01;
  requestAnimationFrame(loop);
}
loop();

const auth = document.getElementById('auth');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authMsg = document.getElementById('authMsg');
function currentUser() { return sessionStorage.getItem('vortex_user'); }

function revealHero() {
  if (typeof anime === 'undefined') return;
  const fade = new Array(0, 1);
  new Array(
    { s: '.badge', p: { translateY: new Array(-16, 0), opacity: fade } },
    { s: '.hero h1', p: { translateY: new Array(28, 0), opacity: fade } },
    { s: '.hero .lead', p: { translateY: new Array(22, 0), opacity: fade } },
    { s: '.hero-actions', p: { translateY: new Array(18, 0), opacity: fade } },
    { s: '.hero-stats', p: { translateY: new Array(18, 0), opacity: fade } }
  ).forEach(function (step, i) {
    anime(Object.assign({ targets: step.s, duration: 900, delay: i * 110, easing: 'easeOutExpo' }, step.p));
  });
}

function setupReveal() {
  if (typeof anime === 'undefined') return new Array();
  const els = document.querySelectorAll('.card, .price-card, .status-card, .contact-card, .step, .faq-item, .section-title');
  els.forEach(function (el) { el.style.opacity = '0'; el.style.transform = 'translateY(24px)'; });
  return Array.from(els);
}

function revealOnScroll(els) {
  if (!els || !els.length) return;
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        anime({ targets: entry.target, translateY: new Array(24, 0), opacity: new Array(0, 1), duration: 650, easing: 'easeOutCubic' });
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(function (el) { io.observe(el); });
}

async function enter(initialBalance) {
  auth.classList.add('hidden');
  revealHero();
  revealOnScroll(revealEls);
  showToast('Привет, ' + (currentUser() || '') + '!');
  if (typeof initialBalance === 'number') renderBalance(initialBalance);
  else await updateBalance();
}

document.querySelectorAll('.auth-tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.auth-tab').forEach(function (t) { t.classList.remove('active'); });
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    loginForm.classList.toggle('hidden', !isLogin);
    registerForm.classList.toggle('hidden', isLogin);
    authMsg.textContent = '';
  });
});

loginForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  const nick = document.getElementById('loginNick').value.trim();
  const pass = document.getElementById('loginPass').value;
  authMsg.textContent = 'Входим...';
  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ nick: nick, pass: pass }) });
    sessionStorage.setItem('vortex_token', data.token);
    sessionStorage.setItem('vortex_user', data.nick);
    authMsg.textContent = '';
    enter(data.balance);
  } catch (err) {
    authMsg.textContent = err.message === 'invalid credentials' ? 'Неверный ник или пароль' : 'Ошибка соединения с сервером';
  }
});

registerForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  const nick = document.getElementById('regNick').value.trim();
  const pass = document.getElementById('regPass').value;
  if (!nick || !pass) { authMsg.textContent = 'Заполни все поля'; return; }
  authMsg.textContent = 'Создаём аккаунт...';
  try {
    const data = await api('/api/register', { method: 'POST', body: JSON.stringify({ nick: nick, pass: pass }) });
    sessionStorage.setItem('vortex_token', data.token);
    sessionStorage.setItem('vortex_user', data.nick);
    authMsg.textContent = '';
    enter(data.balance);
  } catch (err) {
    authMsg.textContent = err.message === 'nick taken' ? 'Такой ник уже занят' : 'Ошибка регистрации';
  }
});

document.getElementById('logout').addEventListener('click', function () {
  sessionStorage.removeItem('vortex_user');
  sessionStorage.removeItem('vortex_token');
  location.reload();
});

const burger = document.getElementById('burger');
const navLinks = document.getElementById('navLinks');
burger.addEventListener('click', function () { navLinks.classList.toggle('open'); });
navLinks.querySelectorAll('a').forEach(function (link) { link.addEventListener('click', function () { navLinks.classList.remove('open'); }); });

const sections = document.querySelectorAll('section[id]');
const links = document.querySelectorAll('.nav-links a');
window.addEventListener('scroll', function () {
  let current = '';
  sections.forEach(function (sec) { if (window.scrollY >= sec.offsetTop - 100) current = sec.id; });
  links.forEach(function (link) { link.style.color = link.getAttribute('href') === '#' + current ? 'var(--text)' : ''; });
});

const revealEls = setupReveal();
if (sessionStorage.getItem('vortex_token') && currentUser()) enter();
else auth.classList.remove('hidden');

(function initHero3D() {
  const c = document.getElementById('hero3d');
  if (!c || typeof THREE === 'undefined') return;
  const renderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 8;
  const group = new THREE.Group();
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.9, 0.45, 160, 24), new THREE.MeshBasicMaterial({ color: 0x7c3aed, wireframe: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(2.9, 1), new THREE.MeshBasicMaterial({ color: 0xc084fc, wireframe: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  group.add(knot, ico);
  scene.add(group);
  function resize3d() { const size = c.clientWidth || 560; renderer.setSize(size, size, false); camera.aspect = 1; camera.updateProjectionMatrix(); }
  resize3d();
  window.addEventListener('resize', resize3d);
  function tick() { requestAnimationFrame(tick); knot.rotation.x += 0.003; knot.rotation.y += 0.005; ico.rotation.y -= 0.0015; ico.rotation.x += 0.001; renderer.render(scene, camera); }
  tick();
})();

document.querySelectorAll('.faq-q').forEach(function (btn) {
  btn.addEventListener('click', function () {
    const item = btn.parentElement;
    const open = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(function (i) { i.classList.remove('open'); });
    if (!open) item.classList.add('open');
  });
});

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function () { toast.classList.remove('show'); }, 3500);
}

// ===== Проверка подписки при нажатии «Скачать» =====
document.querySelectorAll('.hero-actions a').forEach(function (btn) {
  if (btn.textContent.trim() === 'Скачать') {
    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      if (!sessionStorage.getItem('vortex_token')) {
        showToast('Сначала войди в аккаунт');
        return;
      }
      try {
        const res = await api('/api/download');
        if (res.url) {
          window.location.href = res.url;
          showToast('Скачивание Vortexcc.exe началось!');
        }
      } catch (err) {
        showToast('Сначала купи подписку в разделе «Цены»');
        const pr = document.getElementById('pricing');
        if (pr) pr.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }
});

// ===== Оплата с баланса и скачивание =====
const payModal = document.getElementById('payModal');
const modalPlan = document.getElementById('modalPlan');
const modalPrice = document.getElementById('modalPrice');const cryptoPayBtn = document.getElementById('cryptoPayBtn');
let selectedPlan = '';
const balanceBuyBtn = document.createElement('button');
balanceBuyBtn.type = 'button';
balanceBuyBtn.className = 'btn btn-primary';
balanceBuyBtn.style.cssText = 'width:100%;margin-bottom:10px;';
balanceBuyBtn.textContent = 'Оплатить с баланса';
cryptoPayBtn.classList.remove('btn-primary');
cryptoPayBtn.classList.add('btn-ghost');
cryptoPayBtn.style.cssText = 'width:100%;display:block;text-align:center;';
cryptoPayBtn.parentNode.insertBefore(balanceBuyBtn, cryptoPayBtn);
const issuedKeyBox = document.createElement('div');
issuedKeyBox.className = 'hidden';
issuedKeyBox.style.cssText = 'margin:12px 0;padding:12px;border-radius:10px;background:rgba(124,58,237,0.18);border:1px solid rgba(192,132,252,0.4);text-align:center;';
cryptoPayBtn.parentNode.insertBefore(issuedKeyBox, balanceBuyBtn);
balanceBuyBtn.addEventListener('click', async function () {
if (!sessionStorage.getItem('vortex_token')) { showToast('Сначала войди в аккаунт'); return; }
balanceBuyBtn.disabled = true;
balanceBuyBtn.textContent = 'Покупка...';
try {
const res = await api('/api/buy-balance', { method: 'POST', body: JSON.stringify({ plan: selectedPlan }) });
renderBalance(res.balance);
issuedKeyBox.textContent = 'Подписка «' + res.plan + '» активна! ' + (res.key ? 'Ключ: ' + res.key + ' · ' : '') + 'Скачивание запущено.';
issuedKeyBox.classList.remove('hidden');
showToast('Куплено! Начинаем скачивание Vortexcc.exe...');
if (res.downloadUrl) {
window.location.href = res.downloadUrl;
}
} catch (err) {
if (err.message === 'insufficient balance') showToast('Недостаточно средств на балансе');
else showToast('Ошибка покупки');
} finally {
balanceBuyBtn.disabled = false;
balanceBuyBtn.textContent = 'Оплатить с баланса';
}
});
document.querySelectorAll('.buy-btn').forEach(function (btn) {
btn.addEventListener('click', async function () {
selectedPlan = btn.dataset.plan || '';
const price = btn.dataset.price || '';
modalPlan.textContent = selectedPlan;
modalPrice.textContent = price;
issuedKeyBox.classList.add('hidden');
payModal.classList.remove('hidden');
if (sessionStorage.getItem('vortex_token')) {
try { await api('/api/orders', { method: 'POST', body: JSON.stringify({ plan: selectedPlan, price: price }) }); } catch (e) {}
}
});
});
payModal.querySelectorAll('[data-close]').forEach(function (el) { el.addEventListener('click', function () { payModal.classList.add('hidden'); }); });
const myKeysBtn = document.createElement('button');
myKeysBtn.type = 'button';
myKeysBtn.id = 'myKeysBtn';
myKeysBtn.className = 'btn btn-ghost hidden';
myKeysBtn.style.cssText = 'padding:6px 12px;font-size:13px;margin-left:8px;';
myKeysBtn.textContent = 'Мои ключи';
const balanceChipEl = document.getElementById('balanceChip');
if (balanceChipEl && balanceChipEl.parentNode) balanceChipEl.parentNode.insertBefore(myKeysBtn, balanceChipEl.nextSibling);
myKeysBtn.addEventListener('click', async function () {
try {
const list = await api('/api/my-keys');
if (list.length > 0) {
alert(list.map(function (k) { return k.plan + ': ' + k.code; }).join('\n'));
} else {
alert('У тебя пока нет привязанных ключей');
}
} catch (e) { showToast('Ошибка загрузки ключей'); }
});
function fmtDate(iso) { try { return new Date(iso).toLocaleString('ru-RU'); } catch (e) { return iso || '—'; } }
const adminLoginModal = document.getElementById('adminLoginModal');
const adminPanel = document.getElementById('adminPanel');
const adminForm = document.getElementById('adminLoginForm');
const adminMsg = document.getElementById('adminMsg');
function injectAdminTools() {
const host = adminPanel.querySelector('.modal-card') || adminPanel;
const tools = document.createElement('div');
tools.style.cssText = 'margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);display:flex;gap:8px;flex-wrap:wrap;';
const sel = document.createElement('select');
sel.style.cssText = 'padding:8px;border-radius:8px;background:#161324;color:#fff;border:1px solid rgba(255,255,255,0.15);';
new Array('Базовый', 'Стандарт', 'Премиум').forEach(function (p) {
const o = document.createElement('option');
o.value = p;
o.textContent = p;
sel.appendChild(o);
});
const inp = document.createElement('input');
inp.placeholder = 'Ключ (необязательно)';
inp.style.cssText = 'padding:8px;border-radius:8px;background:#161324;color:#fff;border:1px solid rgba(255,255,255,0.15);';
const btn = document.createElement('button');
btn.type = 'button';
btn.className = 'btn btn-primary';
btn.textContent = 'Добавить ключ';
btn.onclick = async function () {
if (!inp.value.trim()) return;
try {
const r = await api('/api/admin/keys', { method: 'POST', body: JSON.stringify({ plan: sel.value, codes: new Array(inp.value.trim()) }) }, true);
inp.value = '';
showToast('Добавлено ключей: ' + r.added);
} catch (e) { showToast('Ошибка добавления'); }
};
tools.append(sel, inp, btn);
host.appendChild(tools);
}
injectAdminTools();
async function renderAdmin() {
try {
const results = await Promise.all(new Array(
api('/api/admin/users', {}, true),
api('/api/admin/orders', {}, true),
api('/api/admin/tickets', {}, true)
));
const rows = results.at(0);
const orders = results.at(1);
const tickets = results.at(2);
document.getElementById('adminUsersCount').textContent = rows.length;
document.getElementById('adminOrdersCount').textContent = orders.length;
const ub = document.getElementById('adminUsersBody');
ub.innerHTML = '';
rows.forEach(function (u) {
const tr = ub.insertRow();
tr.insertCell().textContent = u.nick + (u.plan ? ' [' + u.plan + ']' : '');
tr.insertCell().textContent = (u.balance || 0) + ' ₽';
tr.insertCell().textContent = fmtDate(u.created);
});
const ob = document.getElementById('adminOrdersBody');
ob.innerHTML = '';
orders.forEach(function (o) {
const tr = ob.insertRow();
tr.insertCell().textContent = o.nick;
tr.insertCell().textContent = o.plan;
tr.insertCell().textContent = o.price;
tr.insertCell().textContent = o.status;
tr.insertCell().textContent = fmtDate(o.time);
});
const tb = document.getElementById('adminTicketsBody');
tb.innerHTML = '';
tickets.forEach(function (t) {
const tr = tb.insertRow();
tr.insertCell().textContent = t.nick;
tr.insertCell().textContent = t.message;
tr.insertCell().textContent = t.status === 'answered' ? 'отвечен' : 'открыт';
tr.insertCell().textContent = fmtDate(t.time);
const cell = tr.insertCell();
if (t.status !== 'answered') {
const b = document.createElement('button');
b.className = 'btn btn-ghost';
b.textContent = 'Ответить';
b.onclick = async function () {
const r = prompt('Ответ для ' + t.nick + ':', '');
if (r) {
await api('/api/admin/tickets/' + t.id + '/reply', { method: 'POST', body: JSON.stringify({ reply: r }) }, true);
showToast('Ответ отправлен');
renderAdmin();
}
};
cell.appendChild(b);
}
});
} catch (err) {
sessionStorage.removeItem('vortex_admin_token');
adminPanel.classList.add('hidden');
showToast('Сессия админа истекла, войди снова');
}
}
document.getElementById('openAdmin').addEventListener('click', function () {
if (sessionStorage.getItem('vortex_admin_token')) { renderAdmin(); adminPanel.classList.remove('hidden'); }
else adminLoginModal.classList.remove('hidden');
});
adminForm.addEventListener('submit', async function (e) {
e.preventDefault();
const login = document.getElementById('adminLogin').value.trim();
const pass = document.getElementById('adminPass').value;
adminMsg.textContent = 'Проверка...';
try {
const data = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ login: login, pass: pass }) });
sessionStorage.setItem('vortex_admin_token', data.token);
adminMsg.textContent = '';
adminLoginModal.classList.add('hidden');
renderAdmin();
adminPanel.classList.remove('hidden');
} catch (err) { adminMsg.textContent = 'Неверный логин или пароль'; }
});
adminLoginModal.querySelectorAll('[data-close]').forEach(function (el) { el.addEventListener('click', function () { adminLoginModal.classList.add('hidden'); }); });
adminPanel.querySelectorAll('[data-close]').forEach(function (el) { el.addEventListener('click', function () { adminPanel.classList.add('hidden'); }); });
document.getElementById('adminRefresh').addEventListener('click', renderAdmin);
document.getElementById('adminLogout').addEventListener('click', function () { sessionStorage.removeItem('vortex_admin_token'); adminPanel.classList.add('hidden'); });
function renderBalance(val) {
const chip = document.getElementById('balanceChip');
if (!chip) return;
chip.textContent = 'Баланс: ' + (val || 0) + ' ₽';
chip.classList.remove('hidden');
myKeysBtn.classList.remove('hidden');
}
async function updateBalance() {
const chip = document.getElementById('balanceChip');
if (!chip) return;
if (!sessionStorage.getItem('vortex_token')) { chip.classList.add('hidden'); myKeysBtn.classList.add('hidden'); return; }
try { const me = await api('/api/me'); renderBalance(me.balance); }
catch (err) { sessionStorage.removeItem('vortex_token'); sessionStorage.removeItem('vortex_user'); auth.classList.remove('hidden'); }
}
document.getElementById('topupBtn').addEventListener('click', async function () {
const nick = document.getElementById('topupNick').value.trim();
const amount = parseFloat(document.getElementById('topupAmount').value);
if (!nick || !(amount > 0)) { showToast('Укажи ник и сумму'); return; }
try {
await api('/api/admin/topup', { method: 'POST', body: JSON.stringify({ nick: nick, amount: amount }) }, true);
document.getElementById('topupNick').value = '';
document.getElementById('topupAmount').value = '';
renderAdmin();
if (nick === currentUser()) updateBalance();
showToast('Выдано ' + amount + ' ₽ пользователю ' + nick);
} catch (err) { showToast('Ошибка выдачи баланса'); }
});
const supportModal = document.getElementById('supportModal');
async function renderMyTickets() {
const box = document.getElementById('myTickets');
if (!sessionStorage.getItem('vortex_token')) { box.textContent = 'Войди в аккаунт'; return; }
try {
const mine = await api('/api/tickets');
box.innerHTML = '';
if (!mine.length) { box.textContent = 'Обращений пока нет'; return; }
mine.forEach(function (t) {
const d = document.createElement('div');
d.className = 'ticket';
d.textContent = t.message + (t.reply ? ' | Ответ: ' + t.reply : '');
box.appendChild(d);
});
} catch (e) { box.textContent = 'Ошибка загрузки'; }
}
document.getElementById('supportBtn').addEventListener('click', function () { supportModal.classList.remove('hidden'); renderMyTickets(); });
document.getElementById('supportForm').addEventListener('submit', async function (e) {
e.preventDefault();
const msg = document.getElementById('supportMsg').value.trim();
if (!msg) return;
try {
await api('/api/tickets', { method: 'POST', body: JSON.stringify({ message: msg }) });
document.getElementById('supportMsg').value = '';
toast('Отправлено');
renderMyTickets();
} catch (err) { showToast('Ошибка отправки'); }
});
supportModal.querySelectorAll('[data-close]').forEach(function (el) { el.addEventListener('click', function () { supportModal.classList.add('hidden'); }); });
