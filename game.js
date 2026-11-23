'use strict';
/* ==========================================================
   محرّك اللعبة (بدون أي كود واجهة). يعتمد على:
   - data.js   (SPACES, GROUPS, CHANCE, CHEST, CUR)
   - render()  و UI  (يُعرَّفان في ui.js)
   ========================================================== */

const G = {};
const START_CASH = 1500;
const GO_SALARY = 200;
const JAIL_FINE = 50;
const JAIL_POS = 10;
const MOVE_STEP_MS = 650;   // مدة عبور كل بلاطة (ملّي ثانية): كلما زادت صارت الحركة أبطأ — scene3d.js يضبط سرعة خطوات الشخصية عليها

const sleep = ms => (G.fast ? Promise.resolve() : new Promise(r => setTimeout(r, ms)));
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newGame(configs) {
  Object.assign(G, {
    players: configs.map((c, i) => ({
      id: i, name: c.name, color: c.color, icon: c.icon,
      pos: 0, cash: START_CASH, jail: false, jailTurns: 0, jailCards: [], bankrupt: false, played: false,
    })),
    cur: 0, phase: 'roll', dice: [1, 1], rolling: false, extra: false, doubles: 0,
    owner: Array(40).fill(null), houses: Array(40).fill(0), mortgaged: Array(40).fill(false),
    houseBank: 32, hotelBank: 12,
    decks: { chance: shuffle(CHANCE.map((_, i) => i)), chest: shuffle(CHEST.map((_, i) => i)) },
    log: [], debt: null, auction: null, card: null, special: null,
    over: false, winner: null, deadline: 0, turnMs: 20000, acted: false, grace: false,
  });
  log(`بدأت اللعبة! الدور الأول: ${cp().name}`);
  startTurnTimer();
}

const cp = () => G.players[G.cur];
function log(m) { G.log.unshift(m); if (G.log.length > 80) G.log.pop(); }
const R = () => { if (typeof render === 'function') render(); };

/* ---------- أدوات ---------- */
const groupIdx = g => SPACES.reduce((a, s, i) => (s.group === g ? (a.push(i), a) : a), []);
const hasMonopoly = (g, pid) => groupIdx(g).every(i => G.owner[i] === pid);
const ownedCount = (type, pid) =>
  SPACES.reduce((n, s, i) => n + (s.type === type && G.owner[i] === pid ? 1 : 0), 0);
const alivePlayers = () => G.players.filter(p => !p.bankrupt);
const houseCost = i => GROUPS[SPACES[i].group].house;

function rentFor(i, diceSum) {
  const s = SPACES[i], o = G.owner[i];
  if (s.type === 'prop') {
    const h = G.houses[i];
    if (h > 0) return s.rent[h];
    return s.rent[0] * (hasMonopoly(s.group, o) ? 2 : 1);
  }
  if (s.type === 'station') return 25 * Math.pow(2, ownedCount('station', o) - 1);
  if (s.type === 'util') return (ownedCount('util', o) === 2 ? 10 : 4) * diceSum;
  return 0;
}

function totalWorth(p) {
  let w = p.cash;
  SPACES.forEach((s, i) => {
    if (G.owner[i] !== p.id) return;
    w += s.price;
    if (s.type === 'prop') w += G.houses[i] * houseCost(i);
  });
  return w;
}

/* ---------- الدفع والديون ---------- */
// يدفع p مبلغًا إلى creditor (null = البنك). إن لم يكفِ رصيده تبدأ حالة «دين».
function pay(p, amount, creditor, cont) {
  if (amount <= 0) { cont && cont(); return; }
  if (p.cash >= amount) {
    p.cash -= amount;
    if (creditor !== null && creditor !== undefined) G.players[creditor].cash += amount;
    cont && cont();
    R();
    return;
  }
  G.debt = { pid: p.id, amount, creditor: creditor === undefined ? null : creditor, cont };
  G.phase = 'debt';
  log(`${p.name} لا يملك ${amount} ${CUR}! عليه رهن عقاراته أو بيع مبانيه أو إعلان الإفلاس.`);
  if (typeof UI !== 'undefined') UI.manage = true;
  R();
}

function payEach(p, amt, ids, cont) {
  if (!ids.length) { cont(); return; }
  const [head, ...rest] = ids;
  pay(p, amt, head, () => payEach(p, amt, rest, cont));
}

function settleDebt() {
  const d = G.debt;
  if (!d) return;
  const p = G.players[d.pid];
  if (p.cash < d.amount) return;
  p.cash -= d.amount;
  if (d.creditor !== null) G.players[d.creditor].cash += d.amount;
  G.debt = null;
  G.phase = 'resolving';
  if (typeof UI !== 'undefined') UI.manage = false;
  d.cont && d.cont();
  R();
}

function declareBankruptcy() {
  const d = G.debt;
  if (!d) return;
  const p = G.players[d.pid], cred = d.creditor;
  log(`💥 ${p.name} أعلن إفلاسه!`);
  let cash = p.cash;
  SPACES.forEach((s, i) => {
    if (G.owner[i] !== p.id || !(G.houses[i] > 0)) return;
    const n = G.houses[i];
    cash += Math.floor((n * houseCost(i)) / 2);
    if (n === 5) G.hotelBank++; else G.houseBank += n;
    G.houses[i] = 0;
  });
  p.cash = 0;
  if (cred !== null) {
    const c = G.players[cred];
    c.cash += cash;
    c.jailCards.push(...p.jailCards);
    SPACES.forEach((s, i) => {
      if (G.owner[i] !== p.id) return;
      G.owner[i] = cred;
      if (G.mortgaged[i]) c.cash -= Math.min(c.cash, Math.ceil(s.price * 0.05)); // فائدة 10% من قيمة الرهن
    });
  } else {
    p.jailCards.forEach(k => G.decks[k].push(CARDS_OF(k).findIndex(c => c.t === 'jailfree')));
    SPACES.forEach((s, i) => {
      if (G.owner[i] === p.id) { G.owner[i] = null; G.mortgaged[i] = false; }
    });
  }
  p.jailCards = [];
  p.bankrupt = true;
  G.debt = null;
  if (typeof UI !== 'undefined') UI.manage = false;
  const alive = alivePlayers();
  if (alive.length === 1) {
    G.over = true; G.winner = alive[0]; G.phase = 'over';
    log(`🏆 فاز ${G.winner.name}!`);
    R();
  } else {
    endTurn(true);
  }
}

const CARDS_OF = k => (k === 'chance' ? CHANCE : CHEST);

// إخراج لاعب منقطع: تعود عقاراته للبنك، ثم تستمر اللعبة بدونه (يُستدعى من الخادم فقط)
function forfeitPlayer(pid) {
  const p = G.players[pid];
  if (!p || p.bankrupt || G.over) return;
  log(`⛔ أُخرج ${p.name} من اللعبة (منقطع).`);
  SPACES.forEach((s, i) => {
    if (G.owner[i] !== pid) return;
    const n = G.houses[i];
    if (n > 0) { if (n === 5) G.hotelBank++; else G.houseBank += n; G.houses[i] = 0; }
    G.owner[i] = null; G.mortgaged[i] = false;
  });
  p.jailCards.forEach(k => G.decks[k].push(CARDS_OF(k).findIndex(c => c.t === 'jailfree')));
  p.jailCards = [];
  p.cash = 0; p.bankrupt = true;
  if (G.debt) {
    if (G.debt.pid === pid) G.debt = null;
    else if (G.debt.creditor === pid) G.debt.creditor = null;
  }
  const a = G.auction;
  if (a) {
    const k = a.order.indexOf(pid);
    if (k >= 0) {
      a.order.splice(k, 1);
      if (k < a.idx) a.idx--;
      if (a.idx >= a.order.length) a.idx = 0;
      if (a.bidder === pid) { a.bid = 0; a.bidder = null; }
      checkAuction();
    }
  }
  const alive = alivePlayers();
  if (alive.length === 1) {
    G.over = true; G.winner = alive[0]; G.phase = 'over'; G.auction = null; G.debt = null; G.card = null;
    log(`🏆 فاز ${G.winner.name}!`);
  } else if (G.cur === pid && !G.auction) {
    G.card = null; G.special = null; G.debt = null;
    endTurn(true);
  }
  R();
}

/* ---------- الدور ---------- */
function afterAction() {
  if (G.over) { R(); return; }
  const p = cp();
  if (p.bankrupt) { endTurn(true); return; }
  if (G.extra && !p.jail) {
    G.phase = 'roll';
    log(`${p.name} رمى زوجًا — يرمي مرة أخرى.`);
  } else {
    G.phase = 'end';
  }
  R();
}

function endTurn(force) {
  if (G.over) return;
  if (!force && G.phase !== 'end') return;
  let n = G.cur;
  do { n = (n + 1) % G.players.length; } while (G.players[n].bankrupt);
  cp().played = true;   // أنهى دورته الأولى → يحق له الشراء بعدها
  G.cur = n; G.doubles = 0; G.extra = false; G.phase = 'roll'; G.special = null;
  log(`— دور ${cp().name} —`);
  startTurnTimer();
  R();
}

/* ---------- مهلة الدور ----------
   20 ثانية لكل دور. إن لم يلعب اللاعب أي فعل خلالها تُفتح له مهلة أخيرة مدتها دقيقة؛ فإن انتهت دون لعب يُطرد.
   وإن كان قد لعب (رمى مثلًا) ولم يُنهِ دوره، ينتهي دوره تلقائيًا عند انتهاء المهلة. */
const TURN_MS = 20000, GRACE_MS = 60000;
let turnTimer = null;
function armTurnTimer(ms, fn) {
  clearTimeout(turnTimer);
  G.deadline = Date.now() + ms; G.turnMs = ms;
  const turn = G.cur;
  turnTimer = setTimeout(() => fn(turn), ms);
}
function startTurnTimer() {
  G.acted = false; G.grace = false;
  armTurnTimer(TURN_MS, turnTimeout);
}
// يُستدعى عند أي فعل من صاحب الدور
function playerActed() {
  if (G.over || !G.players) return;
  G.acted = true;
  if (G.grace) {                       // لعب خلال المهلة الأخيرة: تعود مهلة عادية
    G.grace = false;
    log(`${cp().name} عاد إلى اللعب.`);
    armTurnTimer(TURN_MS, turnTimeout);
  }
}
function turnTimeout(turn) {
  if (G.over || G.cur !== turn) return;
  if (G.rolling || ['moving', 'resolving', 'card', 'auction', 'debt'].includes(G.phase)) {
    turnTimer = setTimeout(() => turnTimeout(turn), 2000); return;
  }
  if (!G.acted) {
    G.grace = true;
    log(`⏱ ${cp().name} لم يلعب — أمامه دقيقة أخيرة وإلا سيُطرد!`);
    armTurnTimer(GRACE_MS, graceTimeout);
    R(); return;
  }
  log(`⏱ انتهت مهلة ${cp().name} — انتهى دوره.`);
  endTurn(true);
}
function graceTimeout(turn) {
  if (G.over || G.cur !== turn) return;
  if (G.acted || !G.grace) return;
  log(`⛔ طُرد ${cp().name} لعدم اللعب.`);
  forfeitPlayer(turn);
}

async function doRoll() {
  if (G.phase !== 'roll' || G.rolling) return;
  G.rolling = true; R();
  if (typeof UI !== 'undefined' && UI.animateDice) await UI.animateDice();
  const d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6);
  G.dice = [d1, d2]; G.rolling = false;
  const p = cp(), sum = d1 + d2, dbl = d1 === d2;
  log(`${p.name} رمى ${d1} + ${d2} = ${sum}`);
  G.phase = 'moving';
  if (p.jail) {
    if (dbl) {
      p.jail = false; p.jailTurns = 0; G.extra = false;
      log(`${p.name} رمى زوجًا وخرج من السجن.`);
      await moveBy(p, sum); return;
    }
    p.jailTurns++;
    if (p.jailTurns >= 3) {
      log(`${p.name} لم يرمِ زوجًا في 3 محاولات: يدفع ${JAIL_FINE} ${CUR} ويخرج.`);
      pay(p, JAIL_FINE, null, async () => {
        p.jail = false; p.jailTurns = 0; G.extra = false;
        await moveBy(p, sum);
      });
      return;
    }
    log(`${p.name} يبقى في السجن (محاولة ${p.jailTurns}/3).`);
    G.extra = false; afterAction(); return;
  }
  if (dbl) {
    G.doubles++;
    if (G.doubles === 3) {
      log('3 أزواج متتالية! مباشرةً إلى السجن.');
      sendToJail(p); afterAction(); return;
    }
    G.extra = true;
  } else {
    G.extra = false; G.doubles = 0;
  }
  await moveBy(p, sum);
}

async function moveBy(p, n) {
  G.phase = 'moving';
  const steps = Math.abs(n), dir = n >= 0 ? 1 : 39;
  for (let k = 0; k < steps; k++) {
    p.pos = (p.pos + dir) % 40;
    if (n > 0 && p.pos === 0) {
      p.cash += GO_SALARY;
      log(`${p.name} قبض ${GO_SALARY} ${CUR} عند «انطلق».`);
    }
    R();
    await sleep(MOVE_STEP_MS);
  }
  land(p);
}

function moveTo(p, to) { return moveBy(p, (to - p.pos + 40) % 40); }

function sendToJail(p) {
  p.pos = JAIL_POS; p.jail = true; p.jailTurns = 0;
  G.extra = false; G.doubles = 0;
  log(`⛓️ ${p.name} في السجن.`);
}

function payJail() {
  const p = cp();
  if (G.phase !== 'roll' || !p.jail || p.cash < JAIL_FINE) return;
  p.cash -= JAIL_FINE; p.jail = false; p.jailTurns = 0;
  log(`${p.name} دفع ${JAIL_FINE} ${CUR} وخرج من السجن.`);
  R();
}

function useJailCard() {
  const p = cp();
  if (G.phase !== 'roll' || !p.jail || !p.jailCards.length) return;
  const kind = p.jailCards.pop();
  G.decks[kind].push(CARDS_OF(kind).findIndex(c => c.t === 'jailfree'));
  p.jail = false; p.jailTurns = 0;
  log(`${p.name} استعمل بطاقة الخروج من السجن.`);
  R();
}

/* ---------- الهبوط على خانة ---------- */
function land(p) {
  const i = p.pos, s = SPACES[i];
  const sp = G.special; G.special = null;
  G.phase = 'resolving';
  switch (s.type) {
    case 'prop': case 'station': case 'util': {
      const o = G.owner[i];
      if (o === null) {
        if (!p.played) { log(`${p.name}: لا شراء في الدورة الأولى (${s.name}).`); afterAction(); return; }
        G.phase = 'buy'; R(); return;
      }
      if (o === p.id) { afterAction(); return; }
      if (G.mortgaged[i]) { log(`${s.name} مرهون — لا إيجار.`); afterAction(); return; }
      const sum = G.dice[0] + G.dice[1];
      let r = rentFor(i, sum);
      if (sp && s.type === 'station') r *= 2;
      if (sp && s.type === 'util') r = 10 * sum;
      log(`${p.name} يدفع إيجار ${r} ${CUR} إلى ${G.players[o].name} (${s.name}).`);
      pay(p, r, o, afterAction);
      return;
    }
    case 'tax':
      if (s.income) { G.phase = 'tax'; R(); return; }
      log(`${p.name} يدفع ${s.amount} ${CUR} (${s.name}).`);
      pay(p, s.amount, null, afterAction);
      return;
    case 'chance': case 'chest': drawCard(s.type); return;
    case 'gojail': sendToJail(p); afterAction(); return;
    default: afterAction();
  }
}

function buy() {
  const p = cp(), i = p.pos, s = SPACES[i];
  if (G.phase !== 'buy' || p.cash < s.price) return;
  p.cash -= s.price; G.owner[i] = p.id;
  log(`${p.name} اشترى ${s.name} بـ ${s.price} ${CUR}.`);
  afterAction();
}

function payTax(choice) {
  if (G.phase !== 'tax') return;
  const p = cp();
  const amt = choice === 'pct' ? Math.floor(totalWorth(p) * 0.1) : 200;
  G.phase = 'resolving';
  log(`${p.name} يدفع ضريبة الدخل: ${amt} ${CUR}.`);
  pay(p, amt, null, afterAction);
}

/* ---------- البطاقات ---------- */
function drawCard(kind) {
  const deck = G.decks[kind];
  const idx = deck.shift();
  const card = CARDS_OF(kind)[idx];
  if (card.t !== 'jailfree') deck.push(idx);
  G.card = { kind, idx, card };
  G.phase = 'card';
  R();
}

function applyCard() {
  if (G.phase !== 'card' || !G.card) return;
  const { kind, card } = G.card;
  G.card = null;
  const p = cp();
  G.phase = 'resolving';
  log(`${kind === 'chance' ? 'حظ' : 'صندوق الجماعة'}: ${card.text}`);
  switch (card.t) {
    case 'money':
      if (card.amt >= 0) { p.cash += card.amt; afterAction(); }
      else pay(p, -card.amt, null, afterAction);
      break;
    case 'move': moveTo(p, card.to); break;
    case 'back3': moveBy(p, -3); break;
    case 'jail': sendToJail(p); afterAction(); break;
    case 'jailfree': p.jailCards.push(kind); afterAction(); break;
    case 'station': {
      const t = [5, 15, 25, 35].find(x => x > p.pos);
      G.special = true; moveTo(p, t === undefined ? 5 : t); break;
    }
    case 'util': {
      const t = [12, 28].find(x => x > p.pos);
      G.special = true; moveTo(p, t === undefined ? 12 : t); break;
    }
    case 'eachpay':
      payEach(p, card.amt, alivePlayers().filter(q => q.id !== p.id).map(q => q.id), afterAction);
      break;
    case 'eachget':
      alivePlayers().filter(q => q.id !== p.id).forEach(q => {
        const x = Math.min(q.cash, card.amt); q.cash -= x; p.cash += x;
      });
      afterAction();
      break;
    case 'repair': {
      let h = 0, ho = 0;
      SPACES.forEach((s, i) => {
        if (G.owner[i] !== p.id) return;
        if (G.houses[i] === 5) ho++; else h += G.houses[i];
      });
      pay(p, h * card.house + ho * card.hotel, null, afterAction);
      break;
    }
    default: afterAction();
  }
}

/* ---------- المزاد ---------- */
function startAuction(i) {
  const order = alivePlayers().map(p => p.id);
  const s = order.indexOf(G.cur);
  G.auction = { i, bid: 0, bidder: null, order: order.slice(s).concat(order.slice(0, s)), idx: 0 };
  G.phase = 'auction';
  log(`مزاد على ${SPACES[i].name}.`);
  R();
}

function auctionBid(amount) {
  const a = G.auction;
  if (!a) return false;
  const p = G.players[a.order[a.idx]];
  amount = Math.floor(Number(amount));
  if (!(amount > a.bid) || amount > p.cash) return false;
  a.bid = amount; a.bidder = p.id;
  log(`${p.name} يعرض ${amount} ${CUR}.`);
  a.idx = (a.idx + 1) % a.order.length;
  checkAuction();
  R();
  return true;
}

function auctionPass() {
  const a = G.auction;
  if (!a) return;
  const p = G.players[a.order[a.idx]];
  log(`${p.name} انسحب من المزاد.`);
  a.order.splice(a.idx, 1);
  if (a.idx >= a.order.length) a.idx = 0;
  checkAuction();
  R();
}

function checkAuction() {
  const a = G.auction;
  if (a.order.length === 0) {
    log(`لم يشترِ أحد ${SPACES[a.i].name}.`);
    G.auction = null; afterAction(); return;
  }
  if (a.bidder !== null && a.order[a.idx] === a.bidder) {
    const w = G.players[a.bidder];
    w.cash -= a.bid; G.owner[a.i] = w.id;
    log(`${w.name} ربح المزاد على ${SPACES[a.i].name} بـ ${a.bid} ${CUR}.`);
    G.auction = null; afterAction();
  }
}

/* ---------- البناء والرهن ---------- */
const manageAllowed = () => ['roll', 'buy', 'end', 'debt'].includes(G.phase) && !G.rolling;

function canBuild(i, pid) {
  const s = SPACES[i];
  if (s.type !== 'prop' || G.owner[i] !== pid) return 'غير متاح';
  if (!hasMonopoly(s.group, pid)) return 'تحتاج كامل المجموعة';
  const gi = groupIdx(s.group);
  if (gi.some(j => G.mortgaged[j])) return 'في المجموعة عقار مرهون';
  const h = G.houses[i];
  if (h >= 5) return 'فيه فندق';
  if (h > Math.min(...gi.map(j => G.houses[j]))) return 'ابنِ بالتساوي';
  if (G.players[pid].cash < houseCost(i)) return 'الرصيد غير كافٍ';
  if (h < 4 && G.houseBank < 1) return 'لا بيوت متوفرة';
  if (h === 4 && G.hotelBank < 1) return 'لا فنادق متوفرة';
  return null;
}
function build(i) {
  if (!manageAllowed() || canBuild(i, G.cur)) return;
  const p = cp();
  p.cash -= houseCost(i);
  if (G.houses[i] === 4) { G.houseBank += 4; G.hotelBank--; } else G.houseBank--;
  G.houses[i]++;
  log(`${p.name} بنى ${G.houses[i] === 5 ? 'فندقًا' : 'بيتًا'} في ${SPACES[i].name}.`);
  R();
}

function canSellHouse(i, pid) {
  const s = SPACES[i];
  if (s.type !== 'prop' || G.owner[i] !== pid || !(G.houses[i] > 0)) return 'لا مبانٍ';
  const gi = groupIdx(s.group);
  if (G.houses[i] < Math.max(...gi.map(j => G.houses[j]))) return 'بِع بالتساوي';
  if (G.houses[i] === 5 && G.houseBank < 4) return 'لا بيوت كافية في البنك';
  return null;
}
function sellHouse(i) {
  if (!manageAllowed() || canSellHouse(i, G.cur)) return;
  const p = cp();
  p.cash += Math.floor(houseCost(i) / 2);
  if (G.houses[i] === 5) { G.hotelBank++; G.houseBank -= 4; } else G.houseBank++;
  G.houses[i]--;
  log(`${p.name} باع مبنى في ${SPACES[i].name}.`);
  R();
}

function canMortgage(i, pid) {
  const s = SPACES[i];
  if (G.owner[i] !== pid || G.mortgaged[i]) return 'غير متاح';
  if (s.type === 'prop' && groupIdx(s.group).some(j => G.houses[j] > 0)) return 'بِع المباني أولًا';
  return null;
}
function mortgage(i) {
  if (!manageAllowed() || canMortgage(i, G.cur)) return;
  const p = cp();
  G.mortgaged[i] = true; p.cash += SPACES[i].price / 2;
  log(`${p.name} رهن ${SPACES[i].name}.`);
  R();
}
const unmortgageCost = i => Math.ceil((SPACES[i].price / 2) * 1.1);
function canUnmortgage(i, pid) {
  if (G.owner[i] !== pid || !G.mortgaged[i]) return 'غير متاح';
  if (G.players[pid].cash < unmortgageCost(i)) return 'الرصيد غير كافٍ';
  return null;
}
function unmortgage(i) {
  if (!manageAllowed() || canUnmortgage(i, G.cur)) return;
  const p = cp();
  p.cash -= unmortgageCost(i); G.mortgaged[i] = false;
  log(`${p.name} فكّ رهن ${SPACES[i].name}.`);
  R();
}
