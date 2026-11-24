'use strict';
/* ==========================================================
   اللعب أونلاين: اتصال WebSocket + الردهة + استقبال الحالة.
   الخادم هو مصدر الحقيقة؛ هنا نملأ G بنسخته ثم نستدعي render().
   ========================================================== */

const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

// هوية اللاعب: لكل تبويب هوية (تُحفظ عند التحديث، وتسمح باختبار لاعبين في تبويبين)
NET.token = store.get('aqToken') || randomToken();
store.set('aqToken', NET.token);
NET.code = store.get('aqRoom');
NET.ws = null; NET.you = null; NET.built = false; NET.lastPhase = null; NET.flick = null;

const show = (id, on) => $(id).classList.toggle('hidden', !on);
const setErr = m => { $('#neterr').textContent = m || ''; $('#lobbyMsg').textContent = m || ''; };

NET.send = m => { if (NET.ws && NET.ws.readyState === 1) NET.ws.send(JSON.stringify(m)); };

function connect(onOpen) {
  if (location.protocol === 'file:') { setErr('شغّل الخادم (npm start) وافتح الرابط من المتصفح.'); return; }
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  NET.ws = ws;
  ws.onopen = () => onOpen && onOpen();
  ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  ws.onclose = () => {
    if (NET.ws !== ws) return;
    NET.ws = null;
    if (NET.code) setTimeout(() => connect(rejoin), 1500);    // إعادة اتصال تلقائية
  };
}
const myName = () => ($('#onName').value.trim() || store.get('aqName') || '');
function rejoin() { NET.send({ t: 'join', code: NET.code, name: myName(), token: NET.token }); }

function onMsg(m) {
  if (m.t === 'err') {
    if (m.code === 'no-room' || m.code === 'started') leaveRoom(false);
    setErr(m.m);
    return;
  }
  if (m.t === 'lobby') {
    setErr('');
    NET.on = true; NET.code = m.code; NET.you = m.you; store.set('aqRoom', m.code);
    NET.lobby = m;
    renderLobby(m);
    return;
  }
  if (m.t === 'state') onState(m);
}

function renderLobby(m) {
  show('#setup', false); show('#game', false); show('#lobby', true);
  $('#roomCode').textContent = m.code;
  $('#roomLink').value = `${location.origin}/?room=${m.code}`;
  $('#lobby-players').innerHTML = m.players.map((p, i) =>
    `<div class="name-row ${p.conn ? '' : 'off'}">${i === m.you ? charButton(i, p.color, p.icon) : `<span class="tk" style="background:${p.color}">${p.icon}</span>`}
     <b>${esc(p.name)}</b><span class="tag">${i === 0 ? '👑 المضيف' : ''}${i === m.you ? ' (أنت) — اضغط الأيقونة لتغيير شخصيتك' : ''}${p.conn ? '' : ' — غير متصل'}</span></div>${i === m.you && NET.pick ? charPicker(p.char, p.color, m.players.filter((_, k) => k !== i).map(q => q.color)) : ''}`).join('');
  const host = m.you === 0;
  const st = document.querySelector('[data-act="startonline"]');
  st.classList.toggle('hidden', !host);
  st.disabled = m.players.length < 2;
  if (!host) $('#lobbyMsg').textContent = '⏳ بانتظار المضيف ليبدأ اللعبة...';
}

function onState(m) {
  // سكربت المشهد ثلاثي الأبعاد وحدة مؤجّلة؛ عند إعادة الاتصال بعد تحديث الصفحة قد تصل الحالة قبل جاهزيته فتُبنى اللوحة المسطّحة بالخطأ
  if (!window.S3D && !NET.built && !(NET.wait3d > 40)) {
    NET.wait3d = (NET.wait3d || 0) + 1; NET.pending = m;
    if (!NET.waiting) { NET.waiting = true; const t = setInterval(() => { if (window.S3D || NET.wait3d > 40) { clearInterval(t); NET.waiting = false; const p = NET.pending; NET.pending = null; onState(p); } else NET.wait3d++; }, 100); }
    return;
  }
  if (NET.pending) { NET.pending = null; }
  const prev = { cur: G.cur, phase: NET.lastPhase };
  Object.assign(G, JSON.parse(m.g));
  NET.on = true; NET.you = m.you; NET.lastPhase = G.phase;
  UI.viewer = m.you; UI.conn = m.conn;
  show('#setup', false); show('#lobby', false); show('#game', true);
  if (!NET.built) { buildBoard(); NET.built = true; }

  // نافذة الممتلكات: تُفتح تلقائيًا للمدين وتُغلق عند تغيّر الدور
  if (G.cur !== prev.cur && !G.debt) UI.manage = false;
  if (G.phase === 'debt' && G.debt && G.debt.pid === m.you) UI.manage = true;
  if (G.phase !== 'debt' && prev.phase === 'debt') UI.manage = false;

  // حركة النرد (بصرية فقط): تدور الأوجه إلى أن تصل النتيجة من الخادم
  if (G.rolling && !NET.flick) {
    NET.flick = setInterval(() => {
      UI.faces = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      setDice(UI.faces);
    }, 70);
  }
  if (!G.rolling && NET.flick) { clearInterval(NET.flick); NET.flick = null; UI.faces = null; UI.fling = null; }
  render();
}

function leaveRoom(notify = true) {
  if (notify) NET.send({ t: 'leave' });
  NET.code = null; NET.on = false; store.del('aqRoom');
  if (NET.ws) { const w = NET.ws; NET.ws = null; w.close(); }
}

/* ---------- أزرار الواجهة ---------- */
const needName = () => {
  const n = $('#onName').value.trim();
  if (!n) { setErr('اكتب اسمك أولًا'); $('#onName').focus(); return null; }
  store.set('aqName', n);
  return n;
};
Object.assign(ACTIONS, {
  create() {
    const name = needName(); if (!name) return;
    setErr('');
    leaveRoom(false);
    connect(() => NET.send({ t: 'create', name, token: NET.token }));
  },
  join() {
    const name = needName(); if (!name) return;
    const code = $('#onCode').value.trim().toUpperCase();
    if (code.length !== 4) { setErr('أدخل رمز الغرفة (4 أحرف)'); return; }
    setErr('');
    leaveRoom(false);
    NET.code = code;
    connect(() => NET.send({ t: 'join', code, name, token: NET.token }));
  },
  skip(id) {
    const p = G.players[+id];
    if (p && confirm(`إخراج ${p.name} من اللعبة؟ ستعود عقاراته إلى البنك ولا يمكن التراجع.`)) NET.send({ t: 'skip', seat: +id });
  },
  startonline() { NET.send({ t: 'start' }); },
  // في الردهة يغيّر كل لاعب شخصيته هو فقط؛ خارجها يبقى سلوك شاشة الإعداد المحلية
  pickchar: (local => i => {
    if (!NET.on) return local(i);
    NET.pick = !NET.pick; renderLobby(NET.lobby);
  })(ACTIONS.pickchar),
  setchar: (local => k => {
    if (!NET.on) return local(k);
    NET.pick = false; NET.send({ t: 'char', c: +k });
  })(ACTIONS.setchar),
  setcolor: (local => c => {
    if (!NET.on) return local(c);
    NET.send({ t: 'color', c });
  })(ACTIONS.setcolor),
  leave() { leaveRoom(); location.reload(); },
  copylink(_, el) { el.select(); try { navigator.clipboard.writeText(el.value); } catch { /* ignore */ } },
  newgame() { if (NET.on) leaveRoom(); location.reload(); },
});

/* ---------- عند فتح الصفحة ---------- */
(function init() {
  $('#onName').value = store.get('aqName') || '';
  const q = new URLSearchParams(location.search).get('room');
  if (q) $('#onCode').value = q.toUpperCase().slice(0, 4);
  if (NET.code) connect(rejoin);          // تحديث الصفحة أثناء غرفة: ارجع إلى مقعدك
})();
