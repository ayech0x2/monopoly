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

function startGame(names, chars) {
  newGame(names.map((name, i) => ({ name, ...tokenFor(i, chars[i]) })));
}

// يرجع null عند النجاح أو نص الخطأ
function applyAction(pid, m) {
  if (!G.players) return 'اللعبة لم تبدأ';
  if (G.over) return 'انتهت اللعبة';
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

  if (pid !== G.cur) return 'ليس دورك';
  if (G.rolling) return 'انتظر';
  if (T === 'tradecancel') { cancelTrade(); return null; }
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
    case 'trade': {
      if (!a || typeof a !== 'object' || !isIdx(a.give) || !Number.isInteger(a.to) || !Number.isInteger(a.cash) || !(a.take === null || isIdx(a.take))) return 'عرض غير صالح';
      const e = proposeTrade(a.to, a.give, a.take, a.cash);
      if (e) return e;
      break;
    }
    case 'build': if (!isIdx(a)) return 'خانة غير صالحة'; build(a); break;
    case 'sellhouse': if (!isIdx(a)) return 'خانة غير صالحة'; sellHouse(a); break;
    case 'mortgage': if (!isIdx(a)) return 'خانة غير صالحة'; mortgage(a); break;
    case 'unmortgage': if (!isIdx(a)) return 'خانة غير صالحة'; unmortgage(a); break;
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
