'use strict';
/* ==========================================================
   يُنفَّذ داخل سياق vm الخاص بكل غرفة، بعد data.js و game.js.
   هنا فقط يُسمح بتغيير الحالة G، وبعد التحقق من هوية المرسل.
   ========================================================== */

const isIdx = v => Number.isInteger(v) && v >= 0 && v < 40;

// نسخة نصية من الحالة تُرسَل للعملاء (بلا أوراق الحظ ولا دوال المتابعة)
function snapshot() {
  return JSON.stringify(G, (k, v) => (k === 'decks' || k === 'cont' || k === 'fast' ? undefined : v));
}

function startGame(names, chars, colors) {
  newGame(names.map((name, i) => ({ name, ...tokenFor(i, chars[i], colors && colors[i]) })));
}

// يرجع null عند النجاح أو نص الخطأ
function applyAction(pid, m) {
  if (!G.players) return 'اللعبة لم تبدأ';
  if (G.over) return 'انتهت اللعبة';
  if (G.paused) return 'اللعبة متوقفة مؤقتًا';
  if (!m || typeof m.t !== 'string') return 'طلب غير صالح';
  const T = m.t, a = m.a;

  // المزاد: الدور لصاحب العرض الحالي، لا لصاحب الدور
  if (T === 'bid' || T === 'pass') {
    const au = G.auction;
    if (!au || G.phase !== 'auction') return 'لا يوجد مزاد';
    if (au.order[au.idx] !== pid) return 'ليس دورك في المزاد';
    if (T === 'pass') { auctionPass(); return null; }
    return auctionBid(a) ? null : 'عرض غير صالح';
  }

  // البيع/التبادل: الردّ للاعب الذي وُجِّه إليه العرض، لا لصاحب الدور
  if (T === 'tradeyes' || T === 'tradeno') {
    if (!G.trade || G.trade.to !== pid) return 'لا يوجد عرض موجَّه إليك';
    answerTrade(T === 'tradeyes');
    return null;
  }

  // عرض البيع متاح لأي لاعب في أي وقت (لا يلزم دوره)
  if (T === 'trade') {
    if (G.players[pid].bankrupt) return 'غير مسموح';
    if (!a || typeof a !== 'object' || !Array.isArray(a.give) || !Array.isArray(a.take) || a.give.length > 40 || a.take.length > 40 || !a.give.every(isIdx) || !a.take.every(isIdx) || !Number.isInteger(a.to) || !Number.isInteger(a.cash)) return 'عرض غير صالح';
    return proposeTrade(pid, a.to, a.give, a.take, a.cash);
  }
  if (T === 'unmortgage') {
    if (!isIdx(a)) return 'خانة غير صالحة';
    const e = canUnmortgage(a, pid); if (e) return e;
    unmortgage(pid, a); return null;
  }
  if (T === 'tradecancel') {
    if (!G.trade || G.trade.from !== pid) return 'لا يوجد عرض منك';
    cancelTrade(); return null;
  }

  if (pid !== G.cur) return 'ليس دورك';
  if (G.rolling) return 'انتظر';
  if (G.trade) return 'بانتظار الردّ على عرضك';

  playerActed();
  switch (T) {
    case 'roll': Promise.resolve(doRoll()).catch(e => console.error(e)); break;
    case 'buy': buy(); break;
    case 'declinebuy': if (G.phase === 'buy') startAuction(cp().pos); break;
    case 'passbuy': passBuy(); break;
    case 'end': endTurn(); break;
    case 'payjail': payJail(); break;
    case 'usecard': useJailCard(); break;
    case 'taxflat': payTax('flat'); break;
    case 'taxpct': payTax('pct'); break;
    case 'cardok': applyCard(); break;
    case 'settle': settleDebt(); break;
    case 'bankrupt': declareBankruptcy(); break;
    case 'build': if (!isIdx(a)) return 'خانة غير صالحة'; build(a); break;
    case 'sellhouse': if (!isIdx(a)) return 'خانة غير صالحة'; sellHouse(a); break;
    case 'mortgage': if (!isIdx(a)) return 'خانة غير صالحة'; mortgage(a); break;
    default: return 'فعل غير معروف';
  }
  return null;
}

// إخراج لاعب منقطع (الخادم يتحقق من أنه منقطع ومن صلاحية الطالب)
function skipPlayer(pid) {
  if (!G.players || G.over) return 'انتهت اللعبة';
  const p = G.players[pid];
  if (!p || p.bankrupt) return 'اللاعب خارج اللعبة';
  if (G.rolling || G.phase === 'moving' || G.phase === 'resolving') return 'انتظر لحظة ثم أعد المحاولة';
  if (G.trade && (G.trade.from === pid || G.trade.to === pid)) G.trade = null;
  forfeitPlayer(pid);
  return null;
}

/* ---------- الإيقاف المؤقت بالتراضي ----------
   G.pause = { by, acks } أثناء الطلب؛ G.paused = true بعد موافقة كل اللاعبين المتصلين الآخرين.
   conn: مصفوفة اتصال المقاعد (الخادم يعرفها لا المحرك). */
let pauseTimer = null;
const PAUSE_REQ_MS = 20000;
function pauseCheck(conn) {
  if (!G.pause || G.paused) return;
  const need = G.players.filter(p => p.id !== G.pause.by && !p.bankrupt && conn[p.id]).map(p => p.id);
  if (need.every(id => G.pause.acks.includes(id))) {
    clearTimeout(pauseTimer);
    pauseGame();
    log(`⏸ توقّفت اللعبة مؤقتًا (بطلب ${G.players[G.pause.by].name}).`);
  }
}
function pauseRecheck(conn) { if (G.players && G.pause && !G.paused) { pauseCheck(conn); R(); } }
function pauseAction(pid, act, conn) {
  if (!G.players || G.over) return 'انتهت اللعبة';
  const me = G.players[pid];
  if (!me || me.bankrupt) return 'غير مسموح';
  if (act === 'request') {
    if (G.paused) return 'اللعبة متوقفة بالفعل';
    if (G.pause) return 'هناك طلب إيقاف قائم';
    G.pause = { by: pid, acks: [] };
    log(`⏸ ${me.name} يطلب إيقاف اللعبة مؤقتًا.`);
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => { if (G.pause && !G.paused) { G.pause = null; log('⏸ انتهت مهلة طلب الإيقاف.'); R(); } }, PAUSE_REQ_MS);
    G.pause.until = Date.now() + PAUSE_REQ_MS;
    pauseCheck(conn); R(); return null;
  }
  if (act === 'resume') {
    if (!G.paused) return 'اللعبة غير متوقفة';
    G.pause = null; resumeGame(); log(`▶️ ${me.name} استأنف اللعبة.`); R(); return null;
  }
  if (!G.pause || G.paused) return 'لا يوجد طلب إيقاف';
  if (act === 'cancel') {
    if (G.pause.by !== pid) return 'غير مسموح';
    clearTimeout(pauseTimer); G.pause = null; log(`${me.name} ألغى طلب الإيقاف.`); R(); return null;
  }
  if (pid === G.pause.by) return 'أنت صاحب الطلب';
  if (act === 'accept') {
    if (!G.pause.acks.includes(pid)) G.pause.acks.push(pid);
    pauseCheck(conn); R(); return null;
  }
  if (act === 'decline') {
    clearTimeout(pauseTimer); G.pause = null; log(`⏸ ${me.name} رفض طلب الإيقاف.`); R(); return null;
  }
  return 'طلب غير صالح';
}
