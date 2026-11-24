'use strict';
/* ==========================================================
   الحساب: دخول/تسجيل، ملف شخصي بسيط وسجلّ المباريات (أونلاين فقط).
   الحساب اختياري: يمكن اللعب كضيف كما قبل.
   ========================================================== */
const ACCT = { token: null, user: null, mode: 'login', err: '' };
try { ACCT.token = localStorage.getItem('aqAuth'); } catch { /* ignore */ }
const acctStore = t => { ACCT.token = t; try { t ? localStorage.setItem('aqAuth', t) : localStorage.removeItem('aqAuth'); } catch { /* ignore */ } };

async function acctApi(path, body) {
  try {
    const r = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(ACCT.token ? { Authorization: 'Bearer ' + ACCT.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return await r.json();
  } catch { return { err: 'تعذّر الاتصال بالخادم' }; }
}

// الخادم يربط المقعد بالحساب عبر رمز الجلسة المرسل مع إنشاء الغرفة/الانضمام
{
  const send = NET.send;
  NET.send = m => { if (ACCT.token && (m.t === 'create' || m.t === 'join')) m = { ...m, auth: ACCT.token }; send(m); };
}

function acctSetUser(u) {
  ACCT.user = u;
  const inp = $('#onName');
  if (u && inp && !inp.value.trim()) inp.value = u.display;
  acctBar();
}
function acctBar() {
  const el = $('#acctbar'); if (!el) return;
  const u = ACCT.user;
  el.innerHTML = u
    ? `<button class="btn ghost sm" data-act="acctprofile">👤 ${esc(u.display)} · 🏆 ${u.stats.wins}/${u.stats.games}</button>`
    : `<button class="btn ghost sm" data-act="acctopen">👤 تسجيل الدخول / حساب جديد</button>`;
}
function acctClose() { const m = $('#acct'); m.classList.add('hidden'); m.innerHTML = ''; ACCT.err = ''; }
function acctShow(html) { const m = $('#acct'); m.innerHTML = html; m.classList.remove('hidden'); }

function acctFormHTML() {
  const reg = ACCT.mode === 'register';
  return `<div class="box acct"><h2>${reg ? 'حساب جديد' : 'تسجيل الدخول'}</h2>
    <p class="sub">الحساب اختياري — يحفظ ملفك وسجلّ مبارياتك الأونلاين.</p>
    <input id="acU" dir="ltr" maxlength="20" placeholder="اسم المستخدم" autocomplete="username" autocapitalize="off">
    ${reg ? '<input id="acD" maxlength="14" placeholder="الاسم الظاهر في اللعبة">' : ''}
    <input id="acP" type="password" dir="ltr" maxlength="100" placeholder="كلمة المرور (6 أحرف على الأقل)" autocomplete="${reg ? 'new-password' : 'current-password'}">
    <p class="terr" id="acErr">${esc(ACCT.err)}</p>
    <div class="acts"><button class="btn green" data-act="${reg ? 'acctregister' : 'acctlogin'}">${reg ? 'إنشاء الحساب' : 'دخول'}</button>
      <button class="btn ghost" data-act="acctmode">${reg ? 'لدي حساب' : 'حساب جديد'}</button>
      <button class="btn ghost" data-act="acctclose">إغلاق</button></div></div>`;
}
function acctProfileHTML() {
  const u = ACCT.user;
  const rows = u.history.length ? u.history.map(g => {
    const d = new Date(g.at).toLocaleDateString('ar', { day: 'numeric', month: 'short' });
    return `<div class="hrow ${g.won ? 'won' : ''}"><span class="hres">${g.won ? '🏆 فوز' : g.bankrupt ? '💥 إفلاس' : '✖ خسارة'}</span>
      <span class="hpl">${g.players.map(p => esc(p.icon)).join(' ')} <small>الفائز: ${esc(g.winner || '—')}</small></span>
      <span class="hdt">${g.props} عقار · ${g.cash} ${CUR}<br><small>${d}</small></span></div>`;
  }).join('') : '<p class="sub">لا مباريات مسجَّلة بعد — أكمل مباراة أونلاين لتظهر هنا.</p>';
  const pct = u.stats.games ? Math.round(u.stats.wins * 100 / u.stats.games) : 0;
  return `<div class="box acct"><h2>👤 ${esc(u.display)}</h2><p class="sub" dir="ltr">@${esc(u.username)}</p>
    <div class="astats"><div><b>${u.stats.games}</b><small>مباريات</small></div><div><b>${u.stats.wins}</b><small>انتصارات</small></div><div><b>${pct}%</b><small>نسبة الفوز</small></div></div>
    <label class="sub">الاسم الظاهر</label>
    <input id="acD" maxlength="14" value="${esc(u.display)}">
    <p class="terr" id="acErr">${esc(ACCT.err)}</p>
    <h3>آخر المباريات</h3><div class="hist">${rows}</div>
    <div class="acts"><button class="btn green" data-act="acctsave">حفظ</button><button class="btn red" data-act="acctlogout">تسجيل الخروج</button><button class="btn ghost" data-act="acctclose">إغلاق</button></div></div>`;
}

async function acctSubmit(path, body) {
  const r = await acctApi(path, body);
  if (r.err) { ACCT.err = r.err; const e = $('#acErr'); if (e) e.textContent = r.err; return; }
  acctStore(r.token); acctSetUser(r.user); acctClose();
}
Object.assign(ACTIONS, {
  acctopen() { ACCT.mode = 'login'; ACCT.err = ''; acctShow(acctFormHTML()); },
  acctmode() { ACCT.mode = ACCT.mode === 'login' ? 'register' : 'login'; ACCT.err = ''; acctShow(acctFormHTML()); },
  acctclose() { acctClose(); },
  acctlogin() { acctSubmit('/api/login', { username: $('#acU').value, password: $('#acP').value }); },
  acctregister() { acctSubmit('/api/register', { username: $('#acU').value, password: $('#acP').value, display: $('#acD').value }); },
  async acctprofile() { const r = await acctApi('/api/me'); if (r.user) acctSetUser(r.user); ACCT.err = ''; acctShow(acctProfileHTML()); },
  async acctsave() {
    const r = await acctApi('/api/profile', { display: $('#acD').value });
    if (r.err) { ACCT.err = r.err; $('#acErr').textContent = r.err; return; }
    acctSetUser(r.user); acctShow(acctProfileHTML());
  },
  async acctlogout() { await acctApi('/api/logout', {}); acctStore(null); acctSetUser(null); acctClose(); },
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || $('#acct').classList.contains('hidden') || !e.target.closest('#acct')) return;
  ACTIONS[ACCT.user ? 'acctsave' : ACCT.mode === 'register' ? 'acctregister' : 'acctlogin']();
});

acctBar();
if (ACCT.token) acctApi('/api/me').then(r => { if (r.user) acctSetUser(r.user); else acctStore(null); });
