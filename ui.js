'use strict';
/* ==========================================================
   الواجهة (مسودة): رسم اللوحة واللاعبين والنوافذ من حالة G
   ========================================================== */

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieHTML = v => `<span class="die">${Array.from({ length: 9 }, (_, k) => `<i${PIPS[v].includes(k) ? ' class="on"' : ''}></i>`).join('')}</span>`;
const diceHTML = f => dieHTML(f[0]) + dieHTML(f[1]);
const setDice = f => { const d = $('#dice'); if (d) d.innerHTML = diceHTML(f); };
const NET = { on: false, send() {} };   // يملؤه net.js عند اللعب أونلاين
const UI = { conn: null, viewer: null, fling: null, manage: false, deed: null, pview: null, faces: null, count: 2, animateDice: null,
  hud: false, buyClosed: false, logOpen: false, lastCur: null, t0: 0 };

/* ---------- من يحق له التصرف؟ ----------
   محليًا: المشاهد هو صاحب الدور دائمًا. أونلاين: UI.viewer = مقعدي. */
const isMyTurn = () => !!G.players && viewerId() === G.cur;
const uiManage = () => manageAllowed() && isMyTurn();
const canTradeUI = () => !G.over && G.phase !== 'auction' && !G.trade && !G.players[viewerId()].bankrupt;

/* ---------- إرسال الأفعال: محرك محلي أو خادم ---------- */
const LOCAL = {
  roll: () => doRoll(), buy: () => buy(), end: () => endTurn(),
  declinebuy: () => { if (G.phase === 'buy') startAuction(cp().pos); }, passbuy: () => passBuy(),
  payjail: () => payJail(), usecard: () => useJailCard(),
  taxflat: () => payTax('flat'), taxpct: () => payTax('pct'), cardok: () => applyCard(),
  settle: () => settleDebt(), bankrupt: () => declareBankruptcy(),
  bid: n => auctionBid(n), pass: () => auctionPass(),
  build: i => build(i), sellhouse: i => sellHouse(i), mortgage: i => mortgage(i), unmortgage: i => unmortgage(viewerId(), i),
  trade: a => proposeTrade(viewerId(), a.to, a.give, a.take, a.cash), tradeyes: () => answerTrade(true), tradeno: () => answerTrade(false), tradecancel: () => cancelTrade(),
};
function dispatch(t, a) {
  if (NET.on) NET.send({ t: 'act', m: { t, a } });
  else { if (t !== 'bid' && t !== 'pass') playerActed(); LOCAL[t](a); }
}

/* ---------- موقع الخانة على الشبكة 11×11 ---------- */
function coord(i) {
  if (i <= 10) return [11, 11 - i];
  if (i <= 19) return [11 - (i - 10), 1];
  if (i <= 30) return [1, 1 + (i - 20)];
  return [1 + (i - 30), 11];
}

/* ---------- شاشة الإعداد ---------- */
function renderSetup() {
  $('#count-picker').innerHTML = [2, 3, 4, 5, 6].map(n =>
    `<button class="chip ${n === UI.count ? 'on' : ''}" data-act="count" data-arg="${n}">${n}</button>`).join('');
  const old = [...document.querySelectorAll('.pname')].map(i => i.value);
  $('#name-inputs').innerHTML = Array.from({ length: UI.count }, (_, i) => {
    const cols = localColors(), t = tokenFor(i, UI.chars[i], cols[i]);
    return `<div class="name-row">${charButton(i, t.color, t.icon)}
     <input class="pname" maxlength="14" value="${esc(old[i] || 'لاعب ' + (i + 1))}"></div>${UI.pick === i ? charPicker(t.char, t.color, cols.filter((_, k) => k !== i)) : ''}`;
  }).join('');
}
/* اختيار الشخصية: زرّ الأيقونة يفتح صفّ الشخصيات تحت اللاعب */
UI.chars = []; UI.pick = null;
const charButton = (i, color, icon) =>
  `<button class="tk pick" style="background:${color}" data-act="pickchar" data-arg="${i}" title="غيّر الشخصية">${icon}</button>`;
const charPicker = (cur, curColor, taken = []) => `<div class="char-picker">${CHARS.map((c, k) =>
  `<button class="char ${k === cur ? 'on' : ''}" data-act="setchar" data-arg="${k}" title="${c.name}">${c.icon}</button>`).join('')}</div>
  <div class="char-picker colors">${PALETTE.map(c =>
  `<button class="swatch ${c === curColor ? 'on' : ''}" style="background:${c}" data-act="setcolor" data-arg="${c}" ${taken.includes(c) ? 'disabled' : ''} title="اللون"></button>`).join('')}</div>`;
// ألوان اللاعبين محليًا: المختار يُحترم، والبقية تأخذ أول لون حرّ
UI.colors = [];
function localColors() {
  const out = Array(UI.count).fill(null);
  const used = new Set();
  for (let i = 0; i < UI.count; i++) if (UI.colors[i] && PALETTE.includes(UI.colors[i]) && !used.has(UI.colors[i])) { out[i] = UI.colors[i]; used.add(out[i]); }
  for (let i = 0; i < UI.count; i++) if (!out[i]) { out[i] = PALETTE.find(c => !used.has(c)); used.add(out[i]); }
  return out;
}

/* ---------- اللوحة ---------- */
function buildBoard() {
  const b = $('#board');
  b.innerHTML = '';
  SPACES.forEach((s, i) => {
    const [r, c] = coord(i);
    const el = document.createElement('div');
    el.className = `cell ${s.type}${i % 10 === 0 ? ' corner' : ''}`;
    el.style.gridRow = r; el.style.gridColumn = c; el.dataset.i = i;
    el.dataset.act = 'deed'; el.dataset.arg = i;
    let h = '';
    if (s.type === 'prop') h += `<div class="band" style="background:${GROUPS[s.group].color}"></div>`;
    else h += `<div class="ic">${s.icon}</div>`;
    h += `<div class="nm">${esc(s.name)}</div>`;
    if (s.price) h += `<div class="pr">${s.price} ${CUR}</div>`;
    else if (s.type === 'tax' && s.amount) h += `<div class="pr">${s.amount} ${CUR}</div>`;
    else if (s.type === 'go') h += `<div class="pr">اقبض ${GO_SALARY} ${CUR}</div>`;
    if (s.type === 'parking') h += `<div class="pr pot2"></div>`;
    h += `<div class="own"></div><div class="toks"></div>`;
    el.innerHTML = h;
    b.appendChild(el);
  });
  const ctr = document.createElement('div');
  ctr.id = 'center';
  // المشهد ثلاثي الأبعاد إن توفّر WebGL والشاشة عريضة؛ وإلا تبقى اللوحة المسطّحة
  const narrow = matchMedia('(max-width: 1000px), (max-aspect-ratio: 5/4)').matches;
  if (!narrow && window.S3D && S3D.init($('#gl'))) {
    $('#game').classList.add('is3d');
    document.body.classList.add('light');
    UI.hud = true; UI.t0 = Date.now();
    $('#hudwrap').appendChild(ctr);
    setInterval(() => { const c = $('#clk'); if (c) c.textContent = clockText(); }, 1000);
  } else {
    b.appendChild(ctr);
  }
}

function renderBoard() {
  document.querySelectorAll('.cell').forEach(el => {
    const i = +el.dataset.i, s = SPACES[i];
    const o = G.owner[i];
    el.querySelector('.own').style.background = o === null ? 'transparent' : G.players[o].color;
    el.classList.toggle('mort', !!G.mortgaged[i]);
    const pp = el.querySelector('.pot2'); if (pp) pp.textContent = `${G.pot || 0} ${CUR}`;
    if (s.type === 'prop') {
      const n = G.houses[i];
      el.querySelector('.band').innerHTML = n === 5 ? '<i class="H"></i>' : '<i class="h"></i>'.repeat(n);
    }
    el.querySelector('.toks').innerHTML = G.players
      .filter(p => !p.bankrupt && p.pos === i)
      .map(p => `<span class="tk ${p.id === G.cur ? 'now' : ''}" style="background:${p.color}">${p.icon}</span>`).join('');
  });
}

/* ---------- الشريط الجانبي ---------- */
// يظهر زر الإخراج للاعب المخوَّل (أول متصل) تجاه لاعب منقطع
function canSkip(p) {
  if (!NET.on || !UI.conn || p.bankrupt || UI.conn[p.id] !== false || G.over) return false;
  return UI.conn.findIndex(c => c) === viewerId();
}

function renderPlayers() {
  $('#players').innerHTML = G.players.map(p => {
    const n = SPACES.reduce((k, s, i) => k + (G.owner[i] === p.id ? 1 : 0), 0);
    const off = UI.conn && UI.conn[p.id] === false;
    const sub = p.bankrupt ? 'أفلس' : p.id === G.cur && !G.over ? 'يلعب الآن' : `${n} عقار`;
    const flags = `${off ? ' 📴' : ''}${p.jail ? ' ⛓️' : ''}${p.jailCards.length ? ' 🔓×' + p.jailCards.length : ''}`;
    return `<div class="pcard ${p.id === G.cur && !G.over ? 'now' : ''} ${p.bankrupt ? 'out' : ''}" style="border-inline-start-color:${p.color}" data-act="pview" data-arg="${p.id}">
      <span class="tk" style="background:${p.color}">${p.icon}</span>
      <span class="who"><span class="nm">${esc(p.name)}${flags}</span><span class="sub">${sub}</span></span>
      <span class="cash"><b>${p.cash}</b><small>${CUR}</small></span>
      ${canSkip(p) ? `<div class="skiprow"><button class="btn sm red" data-act="skip" data-arg="${p.id}">⏭ إخراج ${esc(p.name)} (منقطع)</button></div>` : ''}</div>`;
  }).join('');
}

/* ---------- عقاراتي (لوحة خاصة بكل لاعب) ----------
   viewerId(): في اللعب المحلي = صاحب الدور الحالي.
   في اللعب عبر الإنترنت: اضبط UI.viewer = معرّف اللاعب المحلي فتعرض كل شاشة عقارات صاحبها فقط. */
const viewerId = () => (UI.viewer !== null ? UI.viewer : G.cur);

function renderMine() { $('#mine').innerHTML = holdingsHTML(viewerId()); }
function holdingsHTML(pid, rich) {
  const p = G.players[pid];
  const owned = SPACES.map((s, i) => i).filter(i => G.owner[i] === pid);
  const propVal = owned.reduce((n, i) => n + (G.mortgaged[i] ? SPACES[i].price / 2 : SPACES[i].price) +
    (SPACES[i].type === 'prop' ? G.houses[i] * houseCost(i) : 0), 0);
  const sets = [
    ...Object.keys(GROUPS).map(g => ({ key: g, name: GROUPS[g].name, color: GROUPS[g].color, all: groupIdx(g) })),
    { key: 'station', name: 'المحطات', color: '#444', all: SPACES.map((s, i) => i).filter(i => SPACES[i].type === 'station') },
    { key: 'util', name: 'الشركات', color: '#888', all: SPACES.map((s, i) => i).filter(i => SPACES[i].type === 'util') },
  ];
  const groups = sets.map(g => {
    const mine = g.all.filter(i => G.owner[i] === pid);
    if (!mine.length) return '';
    const full = mine.length === g.all.length;
    const cards = mine.map(i => {
      const s = SPACES[i], n = G.houses[i];
      const bld = s.type === 'prop' ? (n === 5 ? '🏨' : '🏠'.repeat(n)) : '';
      return `<div class="rcard ${G.mortgaged[i] ? 'mort' : ''}" data-act="deed" data-arg="${i}">
        <span class="nm">${esc(s.name)}</span>
        <span class="bl">${G.mortgaged[i] ? 'مرهون' : bld || ''}</span>
        <span class="rt">${G.mortgaged[i] ? '—' : s.type === 'util' ? `${ownedCount('util', pid) === 2 ? 10 : 4}× النرد` : rentFor(i, 0) + ' ' + CUR}</span></div>`;
    }).join('');
    return `<div class="rset" style="border-color:${g.color}">
      <div class="rh" style="background:${g.color}"><span>${g.name}</span><span>${mine.length}/${g.all.length}${full ? ' ★' : ''}</span></div>${cards}</div>`;
  }).join('');
  if (rich) {
    const bld = owned.reduce((k, i) => k + (SPACES[i].type === 'prop' ? G.houses[i] : 0), 0);
    const tags = [p.id === G.cur && !G.over ? '<em class="t now">دوره الآن</em>' : '', p.bankrupt ? '<em class="t bad">مفلس</em>' : '', p.jail ? '<em class="t bad">في السجن</em>' : '',
      p.jailCards.length ? `<em class="t">🔑 ×${p.jailCards.length}</em>` : '', p.id === viewerId() ? '<em class="t me">أنت</em>' : ''].join('');
    return `<div class="pv-head" style="--pc:${p.color}"><span class="pv-face">${p.icon}</span>
        <span class="pv-name"><b>${esc(p.name)}</b><span class="pv-tags">${tags}</span></span></div>
      <div class="pv-stats">
        <div><small>النقد</small><b>💰 ${p.cash}</b></div>
        <div><small>العقارات</small><b>🏠 ${owned.length}${bld ? ` · ${bld}🏗️` : ''}</b></div>
        <div class="tot"><small>الثروة الكلية</small><b>${p.cash + propVal} ${CUR}</b></div>
      </div>
      <div class="pv-list">${groups || '<p class="none">لا يملك أي عقار بعد.</p>'}</div>`;
  }
  return `<div class="mh"><b>🏠 عقارات ${esc(p.name)}</b>
      <span>${owned.length} عقار</span></div>
    <div class="mstat"><span>💰 ${p.cash}</span><span>🏘️ ${propVal}</span><span>= ${p.cash + propVal} ${CUR}</span></div>
    ${groups || '<p class="none">لا تملك أي عقار بعد.</p>'}`;
}

function renderLog() {
  $('#log').innerHTML = G.log.slice(0, 14).map(l => `<div>${esc(l)}</div>`).join('');
}

/* ---------- وسط اللوحة ---------- */
const btn = (label, act, arg, cls = '', dis = false) =>
  `<button class="btn ${cls}" data-act="${act}" ${arg !== undefined ? `data-arg="${arg}"` : ''} ${dis ? 'disabled' : ''}>${label}</button>`;

const buyButtons = (p, s) => btn(`اشترِ بـ ${s.price} ${CUR}`, 'buy', undefined, 'green', p.cash < s.price) + btn('تخطَّ', 'passbuy', undefined, 'ghost') + (p.cash < s.price ? btn('مزاد', 'declinebuy', undefined, 'ghost') + btn('ارهن عقاراتك', 'manage', undefined, 'ghost') : '');   // المزاد فقط لمن لا يملك الثمن
/* أزرار البطاقة المعروضة وسط الشاشة في وضع 3D (صك الشراء، أو بطاقة حظ/صندوق الجماعة)؛
   scene3d.js يضعها تحت البطاقة ويُظهرها عند وصولها */
function renderBuyBar() {
  const mine = UI.hud && !G.over && isMyTurn();
  const html = !mine ? '' : G.phase === 'buy' ? buyButtons(cp(), SPACES[cp().pos]) : G.phase === 'card' && G.card ? btn('حسنًا', 'cardok', undefined, 'green') : '';
  const on = html !== '';
  const el = $('#buybar');
  if (el.innerHTML !== html) el.innerHTML = html;
  if (!on) el.classList.remove('show');
}

function orderInfo() {
  const rows = (G.orderPool || []).map(id => { const q = G.players[id]; return `<span style="color:${q.color}">${q.icon} ${esc(q.name)}: <b>${G.orderRolls[id] !== undefined ? G.orderRolls[id] : (id === G.cur ? '🎲' : '…')}</b></span>`; }).join(' · ');
  return `<b>🎲 من يبدأ؟</b> كل لاعب يرمي النرد — الأعلى يبدأ<br>${rows}`;
}
function renderCenter() {
  const p = cp(), ph = G.phase;
  const dice = UI.faces || G.dice;
  let info = '', btns = '';
  if (G.over) {
    info = `🏆 فاز ${esc(G.winner.name)}!`;
    btns = btn('لعبة جديدة', 'newgame', undefined, 'red');
  } else if (ph === 'order') {
    info = orderInfo();
  } else if (ph === 'roll') {
    if (p.jail) {
      info = `${esc(p.name)} في السجن (محاولة ${p.jailTurns + 1}/3) — اسحب النرد وارمِه لتحصل على زوج، أو ادفع ${JAIL_FINE} ${CUR}`;
      btns = btn(`ادفع ${JAIL_FINE} ${CUR}`, 'payjail', undefined, 'ghost', p.cash < JAIL_FINE || G.rolling) +
        (p.jailCards.length ? btn('استعمل بطاقة الخروج', 'usecard', undefined, 'green') : '');
    } else {
      info = G.rolling ? '...' : 'حان دورك — اسحب النرد وارمِه 👆';
    }
  } else if (ph === 'buy') {
    const s = SPACES[p.pos];
    info = `${esc(s.name)} غير مملوك — السعر ${s.price} ${CUR}`;
    btns = UI.hud ? '' : buyButtons(p, s);                      // في وضع 3D الأزرار تحت بطاقة الصك وسط الشاشة (renderBuyBar)
  } else if (ph === 'card' && G.card) {
    info = `${G.card.kind === 'chance' ? '❓ حظ' : '🎁 صندوق الجماعة'}: ${esc(G.card.card.text)}`;
    btns = UI.hud ? '' : btn('حسنًا', 'cardok');                // في وضع 3D الزر تحت البطاقة (renderBuyBar)
  } else if (ph === 'end') {
    info = 'يمكنك البناء أو الرهن قبل إنهاء دورك';
    btns = btn('إنهاء الدور ⏭', 'end', undefined, 'red');
  } else if (ph === 'debt') {
    info = `<span class="warn">عليك دين ${G.debt.amount} ${CUR}</span>`;
    btns = btn('ادفع الدين', 'settle', undefined, 'green', p.cash < G.debt.amount) + btn('إفلاس', 'bankrupt', undefined, 'red');
  } else {
    info = '...';
  }
  if (!G.over && !isMyTurn()) {
    btns = '';
    info = G.rolling ? '...' : ph === 'order' ? orderInfo() : `⏳ دور <b style="color:${p.color}">${esc(p.name)}</b>${UI.conn && UI.conn[p.id] === false ? ' 📴 منقطع' : ''}`;
  }
  if (UI.hud && !G.over && isMyTurn() && (ph === 'roll' || ph === 'order')) btns = btn('🎲 ارمِ النرد', 'roll', undefined, '', G.rolling) + btns;
  if (!UI.hud && !G.over && uiManage()) btns += btn('🏠 ممتلكاتي', 'manage', undefined, 'ghost');
  $('#center').innerHTML = `
    <div class="title">عقارات تونس</div>
    <div class="turn" style="color:${p.color}">${p.icon} ${esc(p.name)} — ${p.cash} ${CUR}</div>
    <div class="tray"><div id="dice" class="${G.rolling ? 'rolling' : ''}${canThrow() ? ' throwable' : ''}"${G.rolling && UI.fling ? ` style="--dx:${UI.fling.dx}px;--dy:${UI.fling.dy}px;--rot:${UI.fling.rot}deg"` : ''}>${diceHTML(dice)}</div></div>
    <div class="pot" title="تُجمع الضرائب هنا ويأخذها من يقف على «استراحة مجانية»">☕ جائزة الاستراحة <b>${G.pot || 0} ${CUR}</b></div>
    <div class="total">المجموع <b>${dice[0] + dice[1]}</b></div>
    <div class="info">${info}</div>
    <div class="btns">${btns}</div>`;
}

/* ---------- رمي النرد بالسحب ---------- */
const canThrow = () => !G.over && isMyTurn() && (G.phase === 'roll' || G.phase === 'order') && !G.rolling && !UI.manage && UI.deed === null;
let drag = null;
document.addEventListener('pointerdown', e => {
  const d = e.target.closest('#dice');
  if (!d || !canThrow()) return;
  drag = { x: e.clientX, y: e.clientY, pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }], el: d };
  d.setPointerCapture(e.pointerId);
  d.classList.add('dragging');
  e.preventDefault();
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.el.style.transform = `translate(${dx}px,${dy}px) rotate(${dx * 0.6}deg)`;
  drag.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  if (drag.pts.length > 8) drag.pts.shift();
});
const endDrag = e => {
  if (!drag) return;
  const { el, pts } = drag; drag = null;
  el.classList.remove('dragging');
  const a = pts[0], b = pts[pts.length - 1];
  const dt = Math.max(16, b.t - a.t);
  const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;   // px/ms
  const speed = Math.hypot(vx, vy);
  if (e.type === 'pointerup' && speed > 0.6 && performance.now() - b.t < 120 && canThrow()) {
    const k = Math.min(speed, 3) * 120;
    const n = speed || 1;
    UI.fling = { dx: Math.round(-vx / n * k), dy: Math.round(-vy / n * k), rot: Math.round(360 + speed * 200) };
    el.style.transform = '';
    dispatch('roll');
  } else {
    el.style.transform = '';   // يرجع النرد إلى مكانه
  }
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

UI.animateDice = async () => {
  for (let k = 0; k < 8; k++) {
    UI.faces = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    setDice(UI.faces);
    await new Promise(r => setTimeout(r, 70));
  }
  UI.faces = null; UI.fling = null;
};

/* ---------- النوافذ ---------- */
const ribbon = t => `<div class="ribbon">${t}</div>`;

function deedHTML(i) {
  const s = SPACES[i], o = G.owner[i], mort = !!G.mortgaged[i];
  const col = s.group ? GROUPS[s.group].color : '#c9a24a';
  const icon = s.type === 'station' ? '🚆' : s.type === 'util' ? '💡' : s.type === 'prop' ? '🏠' : '★';
  const kind = s.type === 'station' ? 'محطة' : s.type === 'util' ? 'شركة خدمات' : s.type === 'prop' ? 'عقار' : '';
  const cur = G.houses[i] || 0, cnt = o !== null ? ownedCount(s.type, o) : 0;
  const row = (a, b, on, ic) => `<div class="drow${on ? ' on' : ''}"><span class="dl">${ic ? `<i>${ic}</i>` : ''}${a}</span><span class="dv">${b}</span>${on ? '<em>الحالي</em>' : ''}</div>`;
  let rows = '';
  if (s.type === 'prop') {
    const full = o !== null && hasMonopoly(s.group, o);
    rows = row('الإيجار', s.rent[0] + ' ' + CUR, o !== null && cur === 0 && !full, '🏷️') +
      row('بمجموعة كاملة', s.rent[0] * 2 + ' ' + CUR, o !== null && cur === 0 && full, '🔗') +
      [1, 2, 3, 4].map(n => row(`مع ${n} ${n === 1 ? 'بيت' : 'بيوت'}`, s.rent[n] + ' ' + CUR, cur === n, '🏠')).join('') +
      row('مع فندق', s.rent[5] + ' ' + CUR, cur === 5, '🏨');
  } else if (s.type === 'station') {
    rows = [[1, 'محطة واحدة', 25], [2, 'محطتان', 50], [3, '3 محطات', 100], [4, '4 محطات', 200]].map(([n, t, v]) => row(t, v + ' ' + CUR, cnt === n, '🚆')).join('');
  } else if (s.type === 'util') {
    rows = row('شركة واحدة', '4 × النرد', cnt === 1, '🎲') + row('الشركتان', '10 × النرد', cnt === 2, '🎲');
  }
  const foot = [];
  if (s.type === 'prop') foot.push(['سعر البيت / الفندق', houseCost(i) + ' ' + CUR]);
  if (s.price) foot.push(['قيمة الرهن', s.price / 2 + ' ' + CUR]);
  const status = o === null ? '<span class="dbadge free">غير مملوك</span>'
    : `<span class="dbadge own"><i style="background:${G.players[o].color}"></i>${esc(G.players[o].name)}${mort ? ' · مرهون' : ''}</span>`;
  const sell = o !== null && o === viewerId() && canTradeUI() && !tradableErr(i, o) ? btn('بيع / تبادل', 'tradeopen', i, 'green') : '';
  const unm = mort && o === viewerId() && !G.over && !canUnmortgage(i, o) ? btn(`فكّ الرهن −${unmortgageCost(i)}`, 'unmortgage', i, 'green') : '';
  return `<div class="box deed">${ribbon('صك الملكية')}
    <div class="dhead" style="--dc:${col}"><span class="dic">${icon}</span><div><small>${kind}</small><b>${esc(s.name)}</b></div></div>
    ${s.price ? `<div class="dmeta"><span class="dprice">${s.price} ${CUR}</span>${status}</div>` : ''}
    <div class="drows">${rows}</div>
    ${foot.length ? `<div class="dfoot">${foot.map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('')}</div>` : ''}
    <div class="acts">${unm}${sell}<button class="btn" data-act="closeDeed">إغلاق</button></div></div>`;
}

/* ---------- البيع والتبادل ---------- */
const propChip = i => `<span class="tprop"><i style="background:${SPACES[i].group ? GROUPS[SPACES[i].group].color : '#888'}"></i>${esc(SPACES[i].name)}${G.mortgaged[i] ? ' <small>(مرهون)</small>' : ''}</span>`;
// ---- نافذة البيع / التبادل: عمودان «تعطي» و«تحصل على»، بطاقات عقارات، ملخّص حيّ وتحقّق فوري ----
const tGroupColor = i => (SPACES[i].group ? GROUPS[SPACES[i].group].color : '#8a9a95');
const tValue = i => (G.mortgaged[i] ? SPACES[i].price / 2 : SPACES[i].price);
function tcard(i, o = {}) {
  const tag = o.act ? 'button' : 'div';
  return `<${tag} class="tcard${o.on ? ' on' : ''}${G.mortgaged[i] ? ' mort' : ''}"${o.act ? ` type="button" data-act="${o.act}" data-arg="${i}"` : ''}>
    <span class="tcb" style="background:${tGroupColor(i)}"></span><b>${esc(SPACES[i].name)}</b>
    <small>${SPACES[i].price} ${CUR}${G.mortgaged[i] ? ' · مرهون' : ''}</small>${o.on ? '<em>✓</em>' : ''}</${tag}>`;
}
const tcash = n => `<div class="tcashv"><b class="coin"></b><span>${n} ${CUR}</span></div>`;
const tplayer = p => `<span class="tpl" style="--pc:${p.color}"><span class="pav">${p.icon}</span><b>${esc(p.name)}</b></span>`;
function tmoney(id, label, val, max) {
  return `<div class="tmoney"><label for="${id}">${label}</label>
    <div class="tmrow"><input id="${id}" type="number" inputmode="numeric" min="0" max="${max}" placeholder="0" value="${esc(val)}"><span class="cur">${CUR}</span></div>
    <div class="tq">${[50, 100, 200].map(n => `<button type="button" class="qchip" data-act="tradeq" data-arg="${id}:${n}">+${n}</button>`).join('')}<button type="button" class="qchip" data-act="tradeq" data-arg="${id}:0">صفر</button></div></div>`;
}
function tradeCalc() {
  const d = UI.trade, me = G.players[viewerId()];
  const ask = Math.max(0, Math.floor(+d.ask || 0)), add = Math.max(0, Math.floor(+d.add || 0));
  const t = { from: me.id, to: d.to, give: d.give, take: d.take, cash: ask - add };
  const err = d.to === null ? 'اختر اللاعب' : tradeErr(t);
  return { ask, add, t, err, giveV: d.give.reduce((n, i) => n + tValue(i), 0) + add, getV: d.take.reduce((n, i) => n + tValue(i), 0) + ask };
}
// يحدّث الملخّص وزر الإرسال دون إعادة رسم النافذة (حتى لا يضيع التركيز أثناء الكتابة)
function tradePatch() {
  if (!UI.trade || !$('#tradeSum')) return;
  const c = tradeCalc(), d = UI.trade;
  const giveTxt = [...d.give.map(propName), c.add ? `${c.add} ${CUR}` : ''].filter(Boolean).join(' + ');
  const getTxt = [...d.take.map(propName), c.ask ? `${c.ask} ${CUR}` : ''].filter(Boolean).join(' + ') || '—';
  $('#tradeSum').innerHTML = `تعطي <b>${giveTxt}</b> وتحصل على <b>${getTxt}</b>`;
  $('#tvGive').textContent = `${c.giveV} ${CUR}`; $('#tvGet').textContent = `${c.getV} ${CUR}`;
  const fair = $('#tradeFair');
  fair.className = 'tfair ' + (c.getV > c.giveV ? 'up' : c.getV < c.giveV ? 'down' : 'eq');
  fair.textContent = c.err ? '' : c.getV > c.giveV ? 'العرض في صالحك' : c.getV < c.giveV ? 'العرض في صالح الطرف الآخر' : 'عرض متوازن';
  $('#tradeErr').textContent = c.err && !(c.err === 'اختر اللاعب') ? c.err : (d.err || '');
  const s = document.querySelector('[data-act="tradesend"]'); if (s) s.disabled = !!c.err;
}
const propName = i => esc(SPACES[i].name);

function tradeHTML() {
  const d = UI.trade, me = G.players[viewerId()];
  const others = G.players.filter(p => !p.bankrupt && p.id !== me.id);
  if (d.to === null || !others.some(p => p.id === d.to)) d.to = others.length ? others[0].id : null;
  const to = d.to === null ? null : G.players[d.to];
  const theirs = to ? SPACES.map((s, i) => i).filter(i => G.owner[i] === to.id && !tradableErr(i, to.id)) : [];
  d.take = d.take.filter(i => theirs.includes(i));
  const mine = SPACES.map((s, i) => i).filter(i => G.owner[i] === me.id && !tradableErr(i, me.id));
  const picker = others.map(p => `<button type="button" class="pbtn${p.id === d.to ? ' on' : ''}" style="--pc:${p.color}" data-act="tradeto" data-arg="${p.id}">
      <span class="pav">${p.icon}</span><b>${esc(p.name)}</b><small>${p.cash} ${CUR}</small></button>`).join('') || '<p>لا يوجد لاعبون آخرون</p>';
  return `<div class="box trade">${ribbon('بيع / تبادل')}
    <div class="tstep">١ · مع من تتبادل؟</div><div class="tpicker">${picker}</div>
    <div class="tcols">
      <section class="tcol give"><h4>⬆ تعطي</h4>
        <div class="tgrid">${mine.map(i => tcard(i, { act: 'tradegive', on: d.give.includes(i) })).join('')}</div>
        ${tmoney('tradeAdd', 'أضف مالًا من عندك (اختياري)', d.add, me.cash)}
        <div class="tval">القيمة: <b id="tvGive"></b></div></section>
      <section class="tcol get"><h4>⬇ تحصل على${to ? ' من ' + esc(to.name) : ''}</h4>
        ${tmoney('tradeAsk', 'مال يدفعه لك', d.ask, to ? to.cash : 0)}
        <div class="tlabel">عقار من عقاراته (اختياري):</div>
        <div class="tgrid">${theirs.length ? theirs.map(i => tcard(i, { act: 'tradetake', on: d.take.includes(i) })).join('') : '<p class="tnone">لا عقارات قابلة للتبادل</p>'}</div>
        <div class="tval">القيمة: <b id="tvGet"></b></div></section>
    </div>
    <div id="tradeSum" class="tsum"></div><div id="tradeFair" class="tfair"></div>
    <p id="tradeErr" class="terr"></p>
    <div class="acts">${btn('أرسل العرض', 'tradesend', undefined, 'green', true)}${btn('إلغاء', 'tradeclose', undefined, 'ghost')}</div></div>`;
}
// العرض المعلّق: يراه الجميع، ويردّ عليه من وُجِّه إليه (محليًا: من يجلس أمام الجهاز)
function tradeOfferHTML() {
  const t = G.trade, a = G.players[t.from], b = G.players[t.to];
  const local = UI.viewer === null, mineToAnswer = local || UI.viewer === t.to, mineToCancel = !local && UI.viewer === t.from;
  const aGives = t.give.map(i => tcard(i)).join('') + (t.cash < 0 ? tcash(-t.cash) : '');
  const bGives = t.take.map(i => tcard(i)).join('') + (t.cash > 0 ? tcash(t.cash) : '') || '<p class="tnone">لا شيء</p>';
  return `<div class="box trade offer">${ribbon('عرض بيع / تبادل')}
    <div class="toffer-h">${tplayer(a)}<span class="tarrow">⇄</span>${tplayer(b)}</div>
    <div class="tcols">
      <section class="tcol"><h4>${esc(a.name)} يعطي</h4>${aGives}</section>
      <section class="tcol"><h4>${esc(b.name)} يعطي</h4>${bGives}</section>
    </div>
    ${mineToAnswer ? `<p class="tq2">هل تقبل هذا العرض يا ${esc(b.name)}؟</p><div class="acts">${btn('✓ أقبل', 'tradeyes', undefined, 'green')}${btn('✕ أرفض', 'tradeno', undefined, 'red')}</div>`
      : `<p class="tq2">⏳ بانتظار ردّ ${esc(b.name)}...</p>${mineToCancel ? `<div class="acts">${btn('اسحب العرض', 'tradecancel', undefined, 'ghost')}</div>` : ''}`}</div>`;
}

function manageHTML() {
  const p = cp();
  let h = `${ribbon('أوراقي')}<p>${esc(p.name)} — الرصيد: <b>${p.cash} ${CUR}</b></p>`;
  if (G.debt) {
    h += `<p class="warn" style="color:#b00020;font-weight:800">عليك دين ${G.debt.amount} ${CUR}. اجمع المال برهن العقارات أو بيع المباني.</p>
      <div class="acts">${btn('ادفع الدين', 'settle', undefined, 'green', p.cash < G.debt.amount)}${btn('إفلاس', 'bankrupt', undefined, 'red')}</div>`;
  }
  const owned = SPACES.map((s, i) => i).filter(i => G.owner[i] === p.id);
  if (!owned.length) h += '<p>لا تملك أي عقار بعد.</p>';
  h += '<div class="prows">';
  owned.forEach(i => {
    const s = SPACES[i];
    const col = s.group ? GROUPS[s.group].color : '#999';
    const n = G.houses[i];
    const st = G.mortgaged[i] ? 'مرهون' : n === 5 ? 'فندق' : n > 0 ? `${n} بيوت` : '';
    let b = '';
    const tip = e => (e ? `title="${e}"` : '');
    if (s.type === 'prop') {
      const eb = canBuild(i, p.id), es = canSellHouse(i, p.id);
      b += `<button class="btn sm green" data-act="build" data-arg="${i}" ${eb ? 'disabled' : ''} ${tip(eb)}>بناء −${houseCost(i)}</button>`;
      b += `<button class="btn sm ghost" data-act="sellhouse" data-arg="${i}" ${es ? 'disabled' : ''} ${tip(es)}>بيع مبنى +${Math.floor(houseCost(i) / 2)}</button>`;
    }
    if (G.mortgaged[i]) {
      const eu = canUnmortgage(i, p.id);
      b += `<button class="btn sm" data-act="unmortgage" data-arg="${i}" ${eu ? 'disabled' : ''} ${tip(eu)}>فكّ الرهن −${unmortgageCost(i)}</button>`;
    } else {
      const em = canMortgage(i, p.id);
      b += `<button class="btn sm red" data-act="mortgage" data-arg="${i}" ${em ? 'disabled' : ''} ${tip(em)}>رهن +${s.price / 2}</button>`;
    }
    const et = G.trade ? 'يوجد عرض معلّق' : tradableErr(i, p.id);
    b += `<button class="btn sm" data-act="tradeopen" data-arg="${i}" ${et ? 'disabled' : ''} ${tip(et)}>بيع / تبادل</button>`;
    h += `<div class="prow"><i class="chip-c" style="background:${col}"></i>
      <div><b>${esc(s.name)}</b> <span class="st">${st}</span></div><div class="bt">${b}</div></div>`;
  });
  h += `</div><div class="acts"><button class="btn" data-act="closeManage">إغلاق</button></div>`;
  return `<div class="box">${h}</div>`;
}

function auctionHTML() {
  const a = G.auction, s = SPACES[a.i];
  const p = G.players[a.order[a.idx]];
  const top = a.bidder === null ? 'لا عروض بعد' : `${a.bid} ${CUR} من ${esc(G.players[a.bidder].name)}`;
  const mine = UI.viewer === null || UI.viewer === p.id;      // محليًا (جهاز واحد): صاحب الدور في المزاد هو من يعرض، لا صاحب دور اللعب
  const inc = [10, 50, 100].map(n =>
    btn(`+${n}`, 'bid', a.bid + n, '', a.bid + n > p.cash)).join('');
  return `<div class="box">${ribbon('مزاد')}<h2>${esc(s.name)}</h2>
    <div class="auc-info">السعر الأصلي: ${s.price} ${CUR}<br>أعلى عرض: <b>${top}</b><br>
    الدور على: <b style="color:${p.color}">${p.icon} ${esc(p.name)}</b> (رصيده ${p.cash} ${CUR})</div>
    ${mine ? `<div class="acts">${inc}${btn('انسحاب', 'pass', undefined, 'red')}</div>
    <div class="bidrow"><input id="bidInput" type="number" min="${a.bid + 1}" max="${p.cash}" placeholder="مبلغ آخر">
    ${btn('عرض', 'bidcustom')}</div>` : `<p>⏳ بانتظار عرض ${esc(p.name)}...</p>`}</div>`;
}

function buyHTML() {
  const p = cp(), s = SPACES[p.pos], g = s.group ? GROUPS[s.group] : null;
  const rent = s.type === 'prop' ? `${s.rent[0]} ${CUR}` : s.type === 'station' ? `25 ${CUR}` : '4 × النرد';
  const have = g ? groupIdx(s.group).filter(i => G.owner[i] === p.id).length : 0;
  const setInfo = g ? `<p>مجموعة ${g.name}: ${have} من ${groupIdx(s.group).length}</p>` : '';
  const poor = p.cash < s.price;
  return `<div class="box buy">${ribbon('شراء عقار')}<button class="x" data-act="closebuy" title="إخفاء">×</button>
    <div class="two">
      <div class="pc3"><div class="pb" style="background:${g ? g.color : '#9fb3a8'}"></div><b>${esc(s.name)}</b>
        <span class="em">${s.icon || '🏠'}</span><span class="pp">${s.price} ${CUR}</span></div>
      <div class="det"><small>عقار</small><h2>${esc(s.name)}</h2>
        <p>السعر ${s.price} ${CUR} · الإيجار ${rent}</p><p>رصيدك: <b>${p.cash} ${CUR}</b></p>${setInfo}
        <div class="acts">${btn('اشترِ', 'buy', undefined, 'green', poor)}${btn('تخطَّ', 'passbuy', undefined, 'ghost')}${poor ? btn('مزاد', 'declinebuy', undefined, 'ghost') + btn('ارهن عقاراتك', 'manage', undefined, 'ghost') : ''}</div>
      </div></div></div>`;
}

function renderModal() {
  const m = $('#modal');
  let h = '', blocking = true;
  if (G.over) {
    h = `<div class="box card-modal">${ribbon('النهاية')}<h2>🏆</h2><div class="txt">فاز <b>${esc(G.winner.name)}</b> بكل شيء!</div>
      <div class="acts">${btn('لعبة جديدة', 'newgame', undefined, 'red')}</div></div>`;
  } else if (G.trade) {
    UI.trade = null;
    h = tradeOfferHTML();
  } else if (UI.trade && canTradeUI()) {
    h = tradeHTML();
  } else if (G.phase === 'card' && G.card && !UI.hud) {
    const k = G.card.kind;
    h = `<div class="box card-modal ${k}">${ribbon(k === 'chance' ? 'حظ' : 'صندوق الجماعة')}<div class="kind">${k === 'chance' ? '❓' : '🎁'}</div>
      <div class="txt">${esc(G.card.card.text)}</div><div class="acts">${isMyTurn() ? btn('حسنًا', 'cardok') : ''}</div></div>`;
  } else if (G.phase === 'tax' && isMyTurn()) {
    h = `<div class="box card-modal">${ribbon('ضريبة الدخل')}<div class="kind">💸</div><div class="txt">ستدفع ضريبة ثابتة:</div>
      <div class="acts">${btn('ادفع 200 ' + CUR, 'taxflat')}</div></div>`;
  } else if (G.phase === 'auction' && G.auction) {
    h = auctionHTML();
  } else if (G.phase === 'buy' && isMyTurn() && !UI.buyClosed && !UI.manage && !UI.hud) {
    h = buyHTML();
  } else if (UI.manage && uiManage()) {
    h = manageHTML();
  } else if (UI.deed !== null) {
    h = deedHTML(UI.deed); blocking = false;
  } else if (UI.pview !== null && G.players[UI.pview]) {
    h = `<div class="box pview">${holdingsHTML(UI.pview, true)}<div class="acts"><button class="btn" data-act="closepview">إغلاق</button></div></div>`;
  }
  if (blocking) UI.deed = null;
  if (G.over) UI.pview = null;
  m.innerHTML = h;
  m.classList.toggle('hidden', !h);
  tradePatch();
}

/* ---------- واجهة وضع 3D: لاعبون، دور، سجل، خريطة مصغّرة ---------- */
const clockText = () => { const t = Math.floor(((UI.pAt || Date.now()) - UI.t0) / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const PHASE_TXT = { roll: 'ينتظر الرمي', moving: 'يتحرك', buy: 'يقرر الشراء', auction: 'في مزاد', card: 'يسحب بطاقة', tax: 'يدفع ضريبة', debt: 'عليه دين', end: 'يُنهي دوره', resolving: '...' };

function showBanner() {
  const b = $('#banner'), p = cp();
  b.innerHTML = `<span class="dot" style="background:${p.color}"></span>${NET.on && isMyTurn() ? 'دورك!' : 'دور ' + esc(p.name)}`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

const svg = p => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = {
  land: svg('<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/>'),
  house: svg('<path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5"/>'),
  key: svg('<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v4M15 12v3"/>'),
  jail: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>'),
  off: svg('<path d="M2 8c5-5 15-5 20 0M5 12c4-3.5 10-3.5 14 0M9 16c2-1.5 4-1.5 6 0M3 3l18 18"/>'),
};
function renderHud() {
  const tl = Math.max(0, Math.min((G.turnMs || 60000) / 1000, (G.deadline - Date.now()) / 1000));   // يُرسم الشريط بعرضه الصحيح فورًا (لا يعود إلى 100% عند كل تحديث)
  $('#hudplayers').innerHTML = G.players.map(p => {
    const n = SPACES.reduce((k, s, i) => k + (G.owner[i] === p.id ? 1 : 0), 0);
    const bld = SPACES.reduce((k, s, i) => k + (G.owner[i] === p.id ? G.houses[i] : 0), 0);
    const off = UI.conn && UI.conn[p.id] === false;
    const now = p.id === G.cur && !G.over;
    const me = p.id === viewerId();
    const flags = `${off ? `<span class="st" title="منقطع">${IC.off}</span>` : ''}${p.jail ? `<span class="st" title="في السجن">${IC.jail}</span>` : ''}${p.jailCards.length ? `<span class="st" title="بطاقة خروج">${IC.key}<b>${p.jailCards.length}</b></span>` : ''}`;
    return `<div class="hp ${now ? 'now' : ''} ${p.bankrupt ? 'out' : ''} ${me ? 'me' : ''}" style="--pc:${p.color}" data-act="pview" data-arg="${p.id}">
      ${now ? '<span class="ptr"></span>' : ''}
      <span class="portrait"><span class="face">${p.icon}</span>
        <span class="shield" title="عقارات">${n}</span>
        <span class="chip2"><b class="coin"></b><span class="amt">${shownCash(p)}</span><small>${CUR}</small></span></span>
      <span class="body">
        <span class="rib"><b>${esc(p.name)}</b>${me ? '<small>أنت</small>' : ''}</span>
        <span class="plate">${p.bankrupt ? '<span class="bk">أفلس</span>' : `<span class="st" title="عقارات">${IC.land}<b>${n}</b></span><span class="st" title="مبانٍ">${IC.house}<b>${bld}</b></span>${flags}`}</span>
        ${now ? `<span class="tbar"><i id="tbarfill" class="${tl <= 5 || G.grace ? 'low' : ''}" style="width:${(tl / (G.turnMs || 60000) * 1000 * 100).toFixed(1)}%"></i></span>` : ''}
      </span>
      ${canSkip(p) ? `<div class="skiprow"><button class="btn sm red" data-act="skip" data-arg="${p.id}">⏭ إخراج ${esc(p.name)} (منقطع)</button></div>` : ''}</div>`;
  }).join('');

  const p = cp(), t = SPACES[p.pos];
  $('#hudturn').innerHTML = G.over
    ? `<div class="turnpill"><span class="tx"><b>انتهت اللعبة</b><small>فاز ${esc(G.winner.name)}</small></span></div>`
    : `<div class="turnpill"><span id="hudbank" title="البنك">🏦</span><span class="tx"><b>${NET.on && isMyTurn() ? 'دورك' : 'دور ' + esc(p.name)}</b><small>${G.grace ? '⚠️ فرصة أخيرة قبل الطرد' : esc(t.name) + ' · ' + (PHASE_TXT[G.phase] || '')}</small></span></div>`;

  const log = $('#hudlog');
  log.innerHTML = G.log.slice(0, 40).reverse().map(l => `<div>${esc(l)}</div>`).join('');
  log.scrollTop = log.scrollHeight;
  $('#hudside').classList.toggle('closed', !UI.logOpen);
  $('#btnlog').classList.toggle('on', UI.logOpen);
  $('#hudcards').disabled = !uiManage();
  renderHand();
  $('#btnfollow').classList.toggle('on', !!(window.S3D && S3D.follow));
  if (UI.lastCur !== G.cur && !G.over) { UI.lastCur = G.cur; showBanner(); }
}

/* ---------- حركة النقود (وضع 3D) ----------
   عند كل تغيّر في الأرصدة تطير عملات من الدافع إلى القابض: بين لاعبَين (إيجار...) أو بين لاعب والبنك 🏦
   (شراء، ضريبة، راتب الانطلاق...)، ويظهر المبلغ ‎+/−‎ بجانب رصيد كل لاعب. */
let lastCash = null;
function coinFx() {
  if (!UI.hud || !G.players) { lastCash = null; return; }
  const cash = G.players.map(p => p.cash), prev = lastCash;
  lastCash = cash;
  if (!prev || prev.length !== cash.length) return;
  const d = cash.map((c, i) => c - prev[i]);
  if (!d.some(Boolean)) return;
  // من خسر يدفع لمن ربح في التحديث نفسه، والباقي من/إلى البنك
  const left = d.map(v => Math.max(0, v)), flows = [];
  d.forEach((v, from) => {
    let need = -v;
    for (let to = 0; need > 0 && to < d.length; to++) {
      const take = Math.min(need, left[to]);
      if (take > 0) { flows.push([from, to, take]); need -= take; left[to] -= take; }
    }
    if (need > 0) flows.push([from, 'bank', need]);
  });
  left.forEach((v, to) => { if (v > 0) flows.push(['bank', to, v]); });
  const spot = who => {
    const el = who === 'bank' ? $('#hudbank') : document.querySelector(`#hudplayers .hp[data-arg="${who}"] .chip2`);
    const r = el && el.getBoundingClientRect();
    return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  };
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // الأرقام تعدّ نحو قيمتها الجديدة: الدافع فورًا، والقابض عند وصول العملات
  d.forEach((v, i) => { if (v) { cashRoll[i] = { from: cashRoll[i] ? cashRoll[i].val : prev[i], to: cash[i], val: cashRoll[i] ? cashRoll[i].val : prev[i], t0: performance.now() + (v > 0 && !still ? 750 : 0) }; } });
  if (!cashTick) cashTick = requestAnimationFrame(rollCash);
  txFeed(flows);
  flows.forEach(([from, to, amt]) => {
    const a = spot(from), b = spot(to);
    if (!a || !b || still) return;
    const n = Math.max(4, Math.min(14, Math.ceil(amt / 30)));
    for (let k = 0; k < n; k++) {
      const c = document.createElement('i');
      c.className = 'coinfx';
      document.body.appendChild(c);
      const jx = (Math.random() - 0.5) * 26, jy = (Math.random() - 0.5) * 18;
      const mx = (a.x + b.x) / 2 + jx * 2, my = Math.max(a.y, b.y) + 45 + Math.random() * 45;   // قوس يتدلّى تحت الشريط العلوي ليُرى
      const at = (x, y, s, o) => ({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`, opacity: o });
      c.animate([at(a.x + jx, a.y + jy, 0.5, 0), { ...at(a.x + jx, a.y + jy, 1.1, 1), offset: 0.12 }, { ...at(mx, my, 1.15, 1), offset: 0.55 }, { ...at(b.x, b.y, 0.9, 1), offset: 0.92 }, at(b.x, b.y, 0.4, 0)],
        { duration: 1000, delay: k * 65, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'both' }).onfinish = () => c.remove();
    }
    setTimeout(() => { const e2 = to === 'bank' ? $('#hudbank') : document.querySelector(`#hudplayers .hp[data-arg="${to}"] .chip2`); if (e2) e2.animate([{ scale: 1, filter: 'brightness(1)' }, { scale: 1.3, filter: 'brightness(1.5)' }, { scale: 1, filter: 'brightness(1)' }], { duration: 420, iterations: 2 }); }, 900);
  });
  d.forEach((v, i) => {                                   // المبلغ يطفو بجانب رصيد اللاعب
    const s = v && spot(i);
    if (!s) return;
    const t = document.createElement('b');
    t.className = `cashpop ${v > 0 ? 'up' : 'down'}`; t.textContent = `${v > 0 ? '+' : '−'}${Math.abs(v)}`;
    t.style.left = `${s.x}px`; t.style.top = `${s.y + 22}px`;
    document.body.appendChild(t);
    t.animate([{ transform: 'translate(-50%, 0)', opacity: 0 }, { transform: 'translate(-50%, 8px)', opacity: 1, offset: 0.15 }, { transform: 'translate(-50%, 14px)', opacity: 1, offset: 0.75 }, { transform: 'translate(-50%, 26px)', opacity: 0 }],
      { duration: 2400, delay: v > 0 ? 750 : 0, easing: 'ease-out', fill: 'both' }).onfinish = () => t.remove();
  });
}
/* الرصيد المعروض يعدّ تصاعديًا/تنازليًا نحو الرصيد الحقيقي */
const cashRoll = {};
let cashTick = 0;
const shownCash = p => (cashRoll[p.id] ? Math.round(cashRoll[p.id].val) : p.cash);
function rollCash(now) {
  cashTick = 0;
  let busy = false;
  for (const id of Object.keys(cashRoll)) {
    const r = cashRoll[id], u = Math.max(0, Math.min(1, (now - r.t0) / 900));
    r.val = r.from + (r.to - r.from) * (1 - Math.pow(1 - u, 3));
    const el = document.querySelector(`#hudplayers .hp[data-arg="${id}"] .chip2`);
    if (el) {
      el.querySelector('.amt').textContent = Math.round(r.val);
      el.classList.toggle('up', u > 0 && u < 1 && r.to > r.from); el.classList.toggle('down', u > 0 && u < 1 && r.to < r.from);
    }
    if (u >= 1) delete cashRoll[id]; else busy = true;
  }
  if (busy) cashTick = requestAnimationFrame(rollCash);
}
/* شريط المعاملات تحت لوحة الدور: مَن دفع لمَن وكم */
function txFeed(flows) {
  const hud = $('#hud');
  if (!hud || !flows.length) return;
  let box = $('#txfeed');
  if (!box) { box = document.createElement('div'); box.id = 'txfeed'; hud.appendChild(box); }
  box.style.top = '124px';   // تحت صف اللاعبين (اللوحة الموحّدة صارت أسفل اليمين)
  const who = w => (w === 'bank' ? '<span class="who bank">🏦 البنك</span>' : `<span class="who" style="--pc:${G.players[w].color}">${G.players[w].icon} ${esc(G.players[w].name)}</span>`);
  flows.forEach(([from, to, amt]) => {
    const row = document.createElement('div');
    row.className = 'tx';
    row.innerHTML = `${who(from)}<span class="arrow"><b class="coin"></b><b>${amt} ${CUR}</b><i>←</i></span>${who(to)}`;
    box.appendChild(row);
    while (box.children.length > 4) box.firstChild.remove();
    row.animate([{ opacity: 0, transform: 'translateY(-8px) scale(.94)' }, { opacity: 1, transform: 'none', offset: 0.08 }, { opacity: 1, transform: 'none', offset: 0.88 }, { opacity: 0, transform: 'translateY(-6px)' }],
      { duration: 3600, easing: 'ease-out', fill: 'both' }).onfinish = () => row.remove();
  });
}

/* ---------- عقاراتي: يد من بطاقات الملكية (وضع 3D) ----------
   البطاقات مروحة في أسفل الشاشة كأنها في يد اللاعب؛ مرّر الفأرة لرفع بطاقة، وانقر لفتح الصك. */
function handCardHTML(i) {
  const s = SPACES[i], n = G.houses[i], c = CUR;
  const col = s.group ? GROUPS[s.group].color : s.type === 'station' ? '#3b3b3b' : '#7d7d7d';
  const r = (a, b) => `<li><span>${a}</span><b>${b}</b></li>`;
  let rows = '';
  if (s.type === 'prop') {
    rows = r('الإيجار', s.rent[0]) + [1, 2, 3, 4].map(k => r(`مع ${k} ${k === 1 ? 'بيت' : 'بيوت'}`, s.rent[k])).join('') + r('مع فندق', s.rent[5]);
  } else if (s.type === 'station') {
    rows = r('محطة واحدة', 25) + r('محطتان', 50) + r('3 محطات', 100) + r('4 محطات', 200);
  } else {
    rows = r('شركة واحدة', '4× النرد') + r('الشركتان', '10× النرد');
  }
  const bld = s.type === 'prop' && n ? `<i class="bld">${n === 5 ? '🏨' : '🏠'.repeat(n)}</i>` : '';
  const ico = s.type === 'station' ? '🚆 ' : s.type === 'util' ? '💡 ' : '';
  return `<div class="hcard ${G.mortgaged[i] ? 'mort' : ''}" data-act="deed" data-arg="${i}" style="--gc:${col}"><div class="hin">
    <div class="hh"><small>صك ملكية</small><b>${ico}${esc(s.name)}</b></div>
    <ul>${rows}</ul>
    <div class="hf"><span>السعر</span><b>${s.price} ${c}</b></div>${bld}
    ${G.mortgaged[i] ? '<div class="stamp">مرهون</div>' : ''}</div></div>`;
}

const handOrder = () => { try { return JSON.parse(localStorage.getItem('aqHand') || '[]'); } catch { return []; } };
/* سحب وإفلات: اسحب بطاقة وضعها في أي موضع لترتيب أوراقك (تُحفظ الترتيبات) */
(function handDrag() {
  let d = null;
  document.addEventListener('pointerdown', e => {
    const c = e.target.closest('#hudhand .hcard'); if (!c || e.button) return;
    d = { c, x0: e.clientX, y0: e.clientY, on: false, i: +c.dataset.arg, k: UI.handMine.indexOf(+c.dataset.arg), base: parseFloat(c.style.getPropertyValue('--x')) || 0 };
  });
  document.addEventListener('pointermove', e => {
    if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.on && Math.hypot(dx, dy) < 8) return;
    if (!d.on) { d.on = true; UI.dragCard = d.i; d.c.classList.add('drag'); }
    d.c.style.setProperty('--x', (d.base + dx) + 'px');
    d.c.style.setProperty('--dy', dy + 'px');
  });
  const end = e => {
    if (!d) return;
    const w = d; d = null;
    if (!w.on) return;
    const sp = UI.handSp, n = UI.handMine.length;
    if (sp > 0) {
      let k = Math.round((n - 1) / 2 - (w.base + e.clientX - w.x0) / sp);
      k = Math.max(0, Math.min(n - 1, k));
      const arr = UI.handMine.filter(i => i !== w.i); arr.splice(k, 0, w.i);
      try { localStorage.setItem('aqHand', JSON.stringify(arr)); } catch {}
    }
    UI.dragCard = null; UI.noClick = Date.now();
    const el = $('#hudhand'); el.dataset.h = ''; renderHand();
  };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
})();

function renderHand() {
  const el = $('#hudhand'), pid = viewerId();
  const order = [...Object.keys(GROUPS).flatMap(g => groupIdx(g)),
    ...SPACES.map((s, i) => i).filter(i => SPACES[i].type === 'station'),
    ...SPACES.map((s, i) => i).filter(i => SPACES[i].type === 'util')];
  let mine = order.filter(i => G.owner[i] === pid);
  const ho = handOrder();
  mine = mine.map((i, d) => [i, ho.indexOf(i) < 0 ? 1e6 + d : ho.indexOf(i)]).sort((a, b) => a[1] - b[1]).map(a => a[0]);
  UI.handMine = mine;
  const n = mine.length;
  $('#hud').classList.toggle('hashand', n > 0);
  // صف أفقي مستقيم: تتقلّص المسافة (تتداخل البطاقات) كلما زاد العدد حتى يتسع الصف للشاشة
  const sp = n > 1 ? Math.min(140, (window.innerWidth * 0.9 - 132) / (n - 1)) : 0;
  const html = mine.map((i, k) => {
    const x = (k - (n - 1) / 2) * -sp; // RTL: أول بطاقة على اليمين
    return handCardHTML(i).replace('style="', `style="--x:${x.toFixed(1)}px;--z:${k};`);
  }).join('') + (n ? `<div class="hcount">عقاراتي · ${n}</div>` : '');
  UI.handSp = sp;
  if (UI.dragCard) return;
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
}

/* ---------- شارة الاتصال + ملء الشاشة ---------- */
function renderStatus() {
  const t = NET.on ? `● أونلاين · ${NET.code || ''}` : '● محلي';
  $('#netstat').textContent = t; $('#hudnet').textContent = t;
}
let fsAsked = false;
const fsSeen = v => { try { return v === undefined ? sessionStorage.getItem('aqFs') : sessionStorage.setItem('aqFs', v); } catch { return null; } };
function maybeFsPrompt() {
  if (fsAsked) return;
  fsAsked = true;
  if (!fsSeen() && document.fullscreenEnabled && !document.fullscreenElement) $('#fsprompt').classList.remove('hidden');
}
const toggleFullscreen = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
};

function render() {
  if (!G.players) return;
  if (G.phase !== 'buy') UI.buyClosed = false;
  renderBoard(); renderPlayers(); renderMine(); renderCenter(); renderLog(); renderModal(); renderStatus();
  if (UI.hud) renderHud();
  renderPause();
  renderBuyBar();
  coinFx();
  maybeFsPrompt();
  try { sfxSync(); } catch (e) { console.warn(e); }
  if (window.S3D && S3D.on) S3D.sync();
}

/* ---------- الإيقاف المؤقت (أونلاين فقط: يتطلب موافقة بقية اللاعبين) ---------- */
function renderPause() {
  const box = $('#hudpause'), btn = $('#btnpause');
  if (!box) return;
  const me = viewerId(), online = NET.on && !G.over;
  btn.classList.toggle('hidden', !online);
  // تجميد ساعة اللعبة أثناء الإيقاف
  if (G.paused && !UI.pAt) UI.pAt = Date.now();
  if (!G.paused && UI.pAt) { UI.t0 += Date.now() - UI.pAt; UI.pAt = 0; }
  document.body.classList.toggle('gpaused', !!G.paused);
  let h = '';
  const nm = i => esc(G.players[i].name);
  if (online && G.paused) {
    h = `<div class="pz big"><div class="pzi">⏸</div><b>اللعبة متوقفة مؤقتًا</b><small>بطلب ${nm(G.pause ? G.pause.by : me)}</small>
      <button class="btn" data-act="pauseres">▶ استئناف اللعبة</button></div>`;
  } else if (online && G.pause) {
    const by = G.pause.by;
    if (by === me) h = `<div class="pz"><b>⏸ طلبتَ إيقاف اللعبة</b><small>بانتظار موافقة اللاعبين الآخرين (${G.pause.acks.length})</small><div class="pzb"><button class="btn ghost sm" data-act="pausecancel">إلغاء الطلب</button></div></div>`;
    else if (!G.pause.acks.includes(me)) h = `<div class="pz ask"><b>⏸ ${nm(by)} يطلب إيقاف اللعبة مؤقتًا</b><small>هل توافق؟</small><div class="pzb"><button class="btn" data-act="pauseyes">موافق</button><button class="btn ghost" data-act="pauseno">رفض</button></div></div>`;
    else h = `<div class="pz"><b>⏸ ${nm(by)} يطلب إيقاف اللعبة</b><small>وافقتَ — بانتظار البقية</small></div>`;
  }
  if (box.innerHTML !== h) box.innerHTML = h;
  box.classList.toggle('show', h !== '');
}

/* ---------- الأحداث ---------- */
const ACTIONS = {
  pausereq() { if (NET.on && !G.paused && !G.pause) NET.send({ t: 'pause', a: 'request' }); },
  pauseyes() { NET.send({ t: 'pause', a: 'accept' }); },
  pauseno() { NET.send({ t: 'pause', a: 'decline' }); },
  pausecancel() { NET.send({ t: 'pause', a: 'cancel' }); },
  pauseres() { NET.send({ t: 'pause', a: 'resume' }); },
  count(n) { UI.count = +n; if (UI.pick >= UI.count) UI.pick = null; renderSetup(); },
  pickchar(i) { UI.pick = UI.pick === +i ? null : +i; renderSetup(); },
  setcolor(c) { if (UI.pick !== null && PALETTE.includes(c) && !localColors().some((x, k) => k !== UI.pick && x === c)) { UI.colors[UI.pick] = c; renderSetup(); } },
  setchar(k) { if (UI.pick !== null) UI.chars[UI.pick] = +k; UI.pick = null; renderSetup(); },
  start() {
    const names = [...document.querySelectorAll('.pname')].map((el, i) => el.value.trim() || 'لاعب ' + (i + 1));
    { const cols = localColors(); newGame(names.map((name, i) => ({ name, ...tokenFor(i, UI.chars[i], cols[i]) }))); }
    $('#setup').classList.add('hidden'); $('#game').classList.remove('hidden');
    buildBoard(); render();
  },
  newgame() { location.reload(); },
  roll() { dispatch('roll'); },
  buy() { dispatch('buy'); },
  declinebuy() { dispatch('declinebuy'); },
  passbuy() { dispatch('passbuy'); },
  end() { dispatch('end'); },
  payjail() { dispatch('payjail'); },
  usecard() { dispatch('usecard'); },
  taxflat() { dispatch('taxflat'); },
  taxpct() { dispatch('taxpct'); },
  cardok() { dispatch('cardok'); },
  settle() { dispatch('settle'); },
  bankrupt() { if (G.debt && confirm('هل تريد إعلان الإفلاس؟ ستخرج من اللعبة.')) dispatch('bankrupt'); },
  bid(n) { dispatch('bid', +n); },
  bidcustom() {
    const v = $('#bidInput'); if (!v) return;
    if (NET.on) { dispatch('bid', +v.value); return; }
    if (!auctionBid(v.value)) v.style.borderColor = '#e03131';
  },
  pass() { dispatch('pass'); },
  manage() { UI.manage = true; render(); },
  tradeopen(i) { UI.trade = { give: [+i], to: null, take: [], ask: '', add: '', err: '' }; UI.manage = false; UI.deed = null; render(); },
  tradeclose() { UI.trade = null; render(); },
  tradeto(pid) { if (UI.trade) { UI.trade.to = +pid; UI.trade.take = []; UI.trade.err = ''; render(); } },
  tradetake(i) { const d = UI.trade; if (d) { d.take = d.take.includes(+i) ? d.take.filter(k => k !== +i) : [...d.take, +i]; d.err = ''; render(); } },
  tradegive(i) { const d = UI.trade; if (d) { d.give = d.give.includes(+i) ? (d.give.length > 1 ? d.give.filter(k => k !== +i) : d.give) : [...d.give, +i]; d.err = ''; render(); } },
  tradesend() {
    const d = UI.trade; if (!d || d.to === null) return;
    const c = tradeCalc();
    d.err = c.err || '';
    if (c.err) { render(); return; }
    UI.trade = null;
    dispatch('trade', { to: c.t.to, give: c.t.give, take: c.t.take, cash: c.t.cash });
    render();
  },
  // أزرار المبالغ السريعة: +50 / +100 / +200 تُضاف إلى الحقل، «صفر» تفرّغه
  tradeq(arg) {
    const d = UI.trade; if (!d) return;
    const [id, n] = arg.split(':'), key = id === 'tradeAsk' ? 'ask' : 'add';
    const inp = $('#' + id), max = inp ? +inp.max : Infinity;
    d[key] = +n === 0 ? '' : String(Math.min(max, (Math.floor(+d[key]) || 0) + +n));
    if (inp) inp.value = d[key];
    d.err = ''; tradePatch();
  },
  tradeyes() { dispatch('tradeyes'); },
  tradeno() { dispatch('tradeno'); },
  tradecancel() { dispatch('tradecancel'); },
  closeManage() { UI.manage = false; render(); },
  build(i) { dispatch('build', +i); },
  sellhouse(i) { dispatch('sellhouse', +i); },
  mortgage(i) { dispatch('mortgage', +i); },
  unmortgage(i) { dispatch('unmortgage', +i); },
  fullscreen() { toggleFullscreen(); },
  mute() { SFX.on = !SFX.on; try { localStorage.setItem('aqMute', SFX.on ? '0' : '1'); } catch { /* ignore */ } $('#btnmute i').textContent = SFX.on ? '🔊' : '🔇'; },
  fsyes() { fsSeen('1'); $('#fsprompt').classList.add('hidden'); toggleFullscreen(); },
  fsno() { fsSeen('1'); $('#fsprompt').classList.add('hidden'); },
  leavegame() { if (confirm('هل تريد مغادرة اللعبة؟')) { if (ACTIONS.leave) ACTIONS.leave(); else location.reload(); } },
  resetview() { if (window.S3D && S3D.on) { S3D.setFollow(false); S3D.home(); } },
  followtoggle() { if (window.S3D && S3D.on) S3D.setFollow(!S3D.follow); },
  togglelog() { UI.logOpen = !UI.logOpen; $('#hudside').classList.toggle('closed', !UI.logOpen); },
  closebuy() { UI.buyClosed = true; render(); },
  deed(i) { UI.deed = +i; render(); },
  closeDeed() { UI.deed = null; render(); },
  pview(i) { UI.pview = +i; render(); },
  closepview() { UI.pview = null; render(); },
  closeOverlay(_, el, e) {
    if (e.target !== el) return;
    if (UI.deed !== null) { UI.deed = null; render(); }
    else if (UI.pview !== null) { UI.pview = null; render(); }
    else if (UI.manage && !G.debt) { UI.manage = false; render(); }
  },
};

// مبالغ نافذة البيع/التبادل تُحفظ أثناء الكتابة حتى لا تضيع عند إعادة الرسم
document.addEventListener('input', e => {
  if (!UI.trade) return;
  if (e.target.id === 'tradeAsk') UI.trade.ask = e.target.value;
  if (e.target.id === 'tradeAdd') UI.trade.add = e.target.value;
  UI.trade.err = ''; tradePatch();
});
document.addEventListener('click', e => {
  if (UI.noClick && Date.now() - UI.noClick < 300) return;
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  const f = ACTIONS[t.dataset.act];
  if (f) f(t.dataset.arg, t, e);
});

window.addEventListener('s3dfollow', () => { const b = $('#btnfollow'); if (b) b.classList.toggle('on', !!S3D.follow); });

renderSetup();

/* ---------- سيناريوهات تجربة (محليًا فقط): افتح الصفحة بـ ‎?test=jail أو ‎?test=board ----------
   تبدأ لعبة بلاعبَين، وبعد لحظة يُرسَل صاحب الدور إلى السجن لتجربة حركة القفص. اضغط J لسجن صاحب الدور مرة أخرى. */
(function testScenarios() {
  const test = new URLSearchParams(location.search).get('test');
  if (test === 'board') {                                    // ‎?test=board: عقارات مملوكة ببيوت وفنادق ورهن، لمعاينة اللوحة
    window.addEventListener('load', () => {
      UI.count = 3; renderSetup(); ACTIONS.start();
      [1, 3, 6, 8, 9, 11, 13, 14, 16, 18, 19, 5, 15, 12, 37, 39].forEach((i, k) => { G.owner[i] = k % 3; });
      Object.assign(G.houses, { 1: 1, 3: 2, 6: 3, 8: 4, 9: 5, 37: 5, 39: 2 });
      G.mortgaged[14] = G.mortgaged[15] = true;
      G.players.forEach(p => { p.played = true; });
      render();
    });
    return;
  }
  if (test !== 'jail') return;
  const jailNow = () => {
    if (!G.players || G.over || G.rolling || !['roll', 'end'].includes(G.phase)) return;
    sendToJail(cp()); afterAction();
  };
  window.addEventListener('load', () => {
    UI.count = 2; renderSetup(); ACTIONS.start();
    setTimeout(jailNow, 3000);                                // مهلة لتحميل النماذج ثلاثية الأبعاد
  });
  document.addEventListener('keydown', e => { if (e.key === 'j' || e.key === 'J') jailNow(); });
})();

/* عدّاد مهلة الدور */
setInterval(() => {
  const el = document.getElementById('tleft');
  if (!el || !G.deadline || G.over) return;
  const left = Math.max(0, (G.paused ? G.pauseLeft : G.deadline - Date.now()) / 1000);
  el.textContent = '⏱ ' + Math.ceil(left);
  el.classList.toggle('low', left <= 5);
  const f = document.getElementById('tbarfill'); if (f) { f.style.width = (left / ((G.turnMs || 60000) / 1000) * 100) + '%'; f.classList.toggle('low', left <= 5 || !!G.grace); }
}, 250);

/* إبراز بيدق اللاعب عند التمرير على بطاقته */
document.addEventListener('mouseover', e => {
  const t = e.target.closest && e.target.closest('[data-act="pview"]');
  if (window.S3D) S3D.hoverPawn = t ? +t.dataset.arg : -1;
});
if (!SFX.on) { const b = document.querySelector('#btnmute i'); if (b) b.textContent = '🔇'; }
