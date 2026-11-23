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

/* ---------- إرسال الأفعال: محرك محلي أو خادم ---------- */
const LOCAL = {
  roll: () => doRoll(), buy: () => buy(), end: () => endTurn(),
  declinebuy: () => { if (G.phase === 'buy') startAuction(cp().pos); },
  payjail: () => payJail(), usecard: () => useJailCard(),
  taxflat: () => payTax('flat'), taxpct: () => payTax('pct'), cardok: () => applyCard(),
  settle: () => settleDebt(), bankrupt: () => declareBankruptcy(),
  bid: n => auctionBid(n), pass: () => auctionPass(),
  build: i => build(i), sellhouse: i => sellHouse(i), mortgage: i => mortgage(i), unmortgage: i => unmortgage(i),
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
  $('#name-inputs').innerHTML = Array.from({ length: UI.count }, (_, i) =>
    `<div class="name-row"><span class="tk" style="background:${TOKENS[i].color}">${TOKENS[i].icon}</span>
     <input class="pname" maxlength="14" value="${esc(old[i] || 'لاعب ' + (i + 1))}"></div>`).join('');
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
function holdingsHTML(pid) {
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

function renderCenter() {
  const p = cp(), ph = G.phase;
  const dice = UI.faces || G.dice;
  let info = '', btns = '';
  if (G.over) {
    info = `🏆 فاز ${esc(G.winner.name)}!`;
    btns = btn('لعبة جديدة', 'newgame', undefined, 'red');
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
    btns = btn(`اشترِ بـ ${s.price} ${CUR}`, 'buy', undefined, 'green', p.cash < s.price) + btn('مزاد', 'declinebuy', undefined, 'ghost') + (p.cash < s.price ? btn('ارهن عقاراتك', 'manage', undefined, 'ghost') : '');
  } else if (ph === 'card' && G.card) {
    info = `${G.card.kind === 'chance' ? '❓ حظ' : '🎁 صندوق الجماعة'}: ${esc(G.card.card.text)}`;
    btns = btn('حسنًا', 'cardok');
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
    info = G.rolling ? '...' : `⏳ دور <b style="color:${p.color}">${esc(p.name)}</b>${UI.conn && UI.conn[p.id] === false ? ' 📴 منقطع' : ''}`;
  }
  if (UI.hud && !G.over && isMyTurn() && ph === 'roll') btns = btn('🎲 ارمِ النرد', 'roll', undefined, '', G.rolling) + btns;
  if (!UI.hud && !G.over && uiManage()) btns += btn('🏠 ممتلكاتي', 'manage', undefined, 'ghost');
  $('#center').innerHTML = `
    <div class="title">عقارات تونس</div>
    <div class="turn" style="color:${p.color}">${p.icon} ${esc(p.name)} — ${p.cash} ${CUR}</div>
    <div class="tray"><div id="dice" class="${G.rolling ? 'rolling' : ''}${canThrow() ? ' throwable' : ''}"${G.rolling && UI.fling ? ` style="--dx:${UI.fling.dx}px;--dy:${UI.fling.dy}px;--rot:${UI.fling.rot}deg"` : ''}>${diceHTML(dice)}</div></div>
    <div class="total">المجموع <b>${dice[0] + dice[1]}</b></div>
    <div class="info">${info}</div>
    <div class="btns">${btns}</div>`;
}

/* ---------- رمي النرد بالسحب ---------- */
const canThrow = () => !G.over && isMyTurn() && G.phase === 'roll' && !G.rolling && !UI.manage && UI.deed === null;
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
  const s = SPACES[i], o = G.owner[i];
  const ownerTxt = o === null ? 'غير مملوك' : `المالك: ${esc(G.players[o].name)}${G.mortgaged[i] ? ' (مرهون)' : ''}`;
  let head = `<div class="head" style="background:${s.group ? GROUPS[s.group].color : '#ddd'}">${esc(s.name)}</div>`;
  let rows = '';
  const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  if (s.type === 'prop') {
    rows = row('الإيجار', s.rent[0] + ' ' + CUR) + row('بمجموعة كاملة', s.rent[0] * 2 + ' ' + CUR) +
      [1, 2, 3, 4].map(n => row(`مع ${n} ${n === 1 ? 'بيت' : 'بيوت'}`, s.rent[n] + ' ' + CUR)).join('') +
      row('مع فندق', s.rent[5] + ' ' + CUR) + row('سعر البيت / الفندق', houseCost(i) + ' ' + CUR) +
      row('قيمة الرهن', s.price / 2 + ' ' + CUR);
  } else if (s.type === 'station') {
    rows = row('محطة واحدة', '25') + row('محطتان', '50') + row('3 محطات', '100') + row('4 محطات', '200') + row('قيمة الرهن', s.price / 2 + ' ' + CUR);
  } else if (s.type === 'util') {
    rows = row('شركة واحدة', '4 × النرد') + row('الشركتان', '10 × النرد') + row('قيمة الرهن', s.price / 2 + ' ' + CUR);
  } else {
    rows = row('', esc(s.name));
  }
  const price = s.price ? `<p>السعر: <b>${s.price} ${CUR}</b> — ${ownerTxt}</p>` : '';
  return `<div class="box deed">${ribbon('صك الملكية')}${head}${price}<table>${rows}</table><div class="acts"><button class="btn" data-act="closeDeed">إغلاق</button></div></div>`;
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
  const mine = viewerId() === p.id;
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
        <div class="acts">${btn('اشترِ', 'buy', undefined, 'green', poor)}${btn('تخطَّ (مزاد)', 'declinebuy', undefined, 'ghost')}${poor ? btn('ارهن عقاراتك', 'manage', undefined, 'ghost') : ''}</div>
      </div></div></div>`;
}

function renderModal() {
  const m = $('#modal');
  let h = '', blocking = true;
  if (G.over) {
    h = `<div class="box card-modal">${ribbon('النهاية')}<h2>🏆</h2><div class="txt">فاز <b>${esc(G.winner.name)}</b> بكل شيء!</div>
      <div class="acts">${btn('لعبة جديدة', 'newgame', undefined, 'red')}</div></div>`;
  } else if (G.phase === 'card' && G.card && !UI.hud) {
    const k = G.card.kind;
    h = `<div class="box card-modal ${k}">${ribbon(k === 'chance' ? 'حظ' : 'صندوق الجماعة')}<div class="kind">${k === 'chance' ? '❓' : '🎁'}</div>
      <div class="txt">${esc(G.card.card.text)}</div><div class="acts">${isMyTurn() ? btn('حسنًا', 'cardok') : ''}</div></div>`;
  } else if (G.phase === 'tax' && isMyTurn()) {
    h = `<div class="box card-modal">${ribbon('ضريبة الدخل')}<div class="kind">💸</div><div class="txt">اختر قبل أن تحسب ثروتك:</div>
      <div class="acts">${btn('ادفع 200 ' + CUR, 'taxflat')}${btn('ادفع 10% من ثروتي', 'taxpct', undefined, 'ghost')}</div></div>`;
  } else if (G.phase === 'auction' && G.auction) {
    h = auctionHTML();
  } else if (G.phase === 'buy' && isMyTurn() && !UI.buyClosed && !UI.manage && !UI.hud) {
    h = buyHTML();
  } else if (UI.manage && uiManage()) {
    h = manageHTML();
  } else if (UI.deed !== null) {
    h = deedHTML(UI.deed); blocking = false;
  } else if (UI.pview !== null && G.players[UI.pview]) {
    h = `<div class="box pview">${holdingsHTML(UI.pview)}<div class="acts"><button class="btn" data-act="closepview">إغلاق</button></div></div>`;
  }
  if (blocking) UI.deed = null;
  if (G.over) UI.pview = null;
  m.innerHTML = h;
  m.classList.toggle('hidden', !h);
}

/* ---------- واجهة وضع 3D: لاعبون، دور، سجل، خريطة مصغّرة ---------- */
const clockText = () => { const t = Math.floor((Date.now() - UI.t0) / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
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
  const tl = Math.max(0, Math.min((G.turnMs || 20000) / 1000, (G.deadline - Date.now()) / 1000));   // يُرسم الشريط بعرضه الصحيح فورًا (لا يعود إلى 100% عند كل تحديث)
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
        <span class="chip2"><b class="coin"></b>${p.cash}</span></span>
      <span class="body">
        <span class="rib"><b>${esc(p.name)}</b>${me ? '<small>أنت</small>' : ''}</span>
        <span class="plate">${p.bankrupt ? '<span class="bk">أفلس</span>' : `<span class="st" title="عقارات">${IC.land}<b>${n}</b></span><span class="st" title="مبانٍ">${IC.house}<b>${bld}</b></span>${flags}`}</span>
        ${now ? `<span class="tbar"><i id="tbarfill" class="${tl <= 5 || G.grace ? 'low' : ''}" style="width:${(tl / (G.turnMs || 20000) * 1000 * 100).toFixed(1)}%"></i></span>` : ''}
      </span>
      ${canSkip(p) ? `<div class="skiprow"><button class="btn sm red" data-act="skip" data-arg="${p.id}">⏭ إخراج ${esc(p.name)} (منقطع)</button></div>` : ''}</div>`;
  }).join('');

  const p = cp(), t = SPACES[p.pos];
  $('#hudturn').innerHTML = G.over
    ? `<div class="turnpill"><span class="tx"><b>انتهت اللعبة</b><small>فاز ${esc(G.winner.name)}</small></span></div>`
    : `<div class="turnpill"><span class="tx"><b>${NET.on && isMyTurn() ? 'دورك' : 'دور ' + esc(p.name)}</b><small>${G.grace ? '⚠️ فرصة أخيرة قبل الطرد' : esc(t.name) + ' · ' + (PHASE_TXT[G.phase] || '')}</small></span>
        <span class="clk" id="tleft" title="الوقت المتبقي للدور"></span><span class="clk" id="clk" title="مدة اللعبة">${clockText()}</span></div>`;

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

function renderHand() {
  const el = $('#hudhand'), pid = viewerId();
  const order = [...Object.keys(GROUPS).flatMap(g => groupIdx(g)),
    ...SPACES.map((s, i) => i).filter(i => SPACES[i].type === 'station'),
    ...SPACES.map((s, i) => i).filter(i => SPACES[i].type === 'util')];
  const mine = order.filter(i => G.owner[i] === pid);
  const n = mine.length;
  $('#hud').classList.toggle('hashand', n > 0);
  // صف أفقي مستقيم: تتقلّص المسافة (تتداخل البطاقات) كلما زاد العدد حتى يتسع الصف للشاشة
  const sp = n > 1 ? Math.min(140, (window.innerWidth * 0.9 - 132) / (n - 1)) : 0;
  const html = mine.map((i, k) => {
    const x = (k - (n - 1) / 2) * -sp; // RTL: أول بطاقة على اليمين
    return handCardHTML(i).replace('style="', `style="--x:${x.toFixed(1)}px;--z:${k};`);
  }).join('') + (n ? `<div class="hcount">عقاراتي · ${n}</div>` : '');
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
  maybeFsPrompt();
  try { sfxSync(); } catch (e) { console.warn(e); }
  if (window.S3D && S3D.on) S3D.sync();
}

/* ---------- الأحداث ---------- */
const ACTIONS = {
  count(n) { UI.count = +n; renderSetup(); },
  start() {
    const names = [...document.querySelectorAll('.pname')].map((el, i) => el.value.trim() || 'لاعب ' + (i + 1));
    newGame(names.map((name, i) => ({ name, color: TOKENS[i].color, icon: TOKENS[i].icon })));
    $('#setup').classList.add('hidden'); $('#game').classList.remove('hidden');
    buildBoard(); render();
  },
  newgame() { location.reload(); },
  roll() { dispatch('roll'); },
  buy() { dispatch('buy'); },
  declinebuy() { dispatch('declinebuy'); },
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

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  const f = ACTIONS[t.dataset.act];
  if (f) f(t.dataset.arg, t, e);
});

window.addEventListener('s3dfollow', () => { const b = $('#btnfollow'); if (b) b.classList.toggle('on', !!S3D.follow); });

renderSetup();

/* عدّاد مهلة الدور */
setInterval(() => {
  const el = document.getElementById('tleft');
  if (!el || !G.deadline || G.over) return;
  const left = Math.max(0, (G.deadline - Date.now()) / 1000);
  el.textContent = '⏱ ' + Math.ceil(left);
  el.classList.toggle('low', left <= 5);
  const f = document.getElementById('tbarfill'); if (f) { f.style.width = (left / ((G.turnMs || 20000) / 1000) * 100) + '%'; f.classList.toggle('low', left <= 5 || !!G.grace); }
}, 250);

/* إبراز بيدق اللاعب عند التمرير على بطاقته */
document.addEventListener('mouseover', e => {
  const t = e.target.closest && e.target.closest('[data-act="pview"]');
  if (window.S3D) S3D.hoverPawn = t ? +t.dataset.arg : -1;
});
if (!SFX.on) { const b = document.querySelector('#btnmute i'); if (b) b.textContent = '🔇'; }
