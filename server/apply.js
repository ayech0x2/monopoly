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

function startGame(names) {
  newGame(names.map((name, i) => ({ name, color: TOKENS[i].color, icon: TOKENS[i].icon })));
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

  if (pid !== G.cur) return 'ليس دورك';
  if (G.rolling) return 'انتظر';

  playerActed();
  switch (T) {
    case 'roll': Promise.resolve(doRoll()).catch(e => console.error(e)); break;
    case 'buy': buy(); break;
    case 'declinebuy': if (G.phase === 'buy') startAuction(cp().pos); break;
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
  forfeitPlayer(pid);
  return null;
}
