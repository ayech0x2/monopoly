'use strict';
/* ==========================================================
   خادم «عقارات تونس»: ملفات ثابتة + WebSocket + غرف.
   الخادم هو صاحب الحالة والنرد؛ العميل يرسل أفعالًا فقط.
   ========================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { WebSocketServer } = require('ws');

const ROOT = path.join(__dirname, '..');
const PORT = +process.env.PORT || 3100;
const MAX_PLAYERS = 6, MIN_PLAYERS = 2;
const LOBBY_GRACE_MS = 60_000;          // مقعد منقطع في الردهة يُحذف بعد دقيقة
const ROOM_TTL_MS = 30 * 60_000;        // غرفة بلا متصلين تُحذف بعد 30 دقيقة

/* ---------- ملفات ثابتة (قائمة بيضاء حتى لا يُكشف كود الخادم) ---------- */
const FILES = ['index.html', 'style.css', 'data.js', 'game.js', 'ui.js', 'sfx.js', 'net.js', 'scene3d.js', 'vendor/three.module.js', 'vendor/three.core.js', 'vendor/OrbitControls.js', 'vendor/RoomEnvironment.js', 'vendor/RoundedBoxGeometry.js',
  'vendor/loaders/GLTFLoader.js', 'vendor/utils/BufferGeometryUtils.js', 'vendor/utils/SkeletonUtils.js',
  ...['tree', 'tree-high', 'rocks-low', 'rocks-high', 'stones', 'plant', 'patch-grass', 'patch-dirt', 'tent', 'flag', 'target', 'fence', 'building-structure', 'building-roof'].map(f => `models/scene/${f}.glb`), 'models/scene/Textures/colormap.png',
  ...['Cow.glb', 'Cat.glb', 'Mouse.glb', 'Bear.glb', 'Rabbit.glb', 'Pig.glb', 'Wolf.glb', 'Monkey.glb', 'Cheetah.glb', 'Panda.glb', 'Lion.glb'].map(f => `models/${f}`)];
const TYPES = { '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const name = p === '/' ? 'index.html' : p.slice(1);
  if (!FILES.includes(name)) { res.writeHead(404); res.end('not found'); return; }
  fs.readFile(path.join(ROOT, name), (err, buf) => {
    if (err) { res.writeHead(500); res.end('error'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)], 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

/* ---------- المحرك: نسخة معزولة من data.js + game.js لكل غرفة ---------- */
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC = { data: src('data.js'), game: src('game.js'), apply: src('server/apply.js') };

const { TOKENS, CHARS, PALETTE } = (() => {
  const c = vm.createContext({});
  vm.runInContext(SRC.data, c);
  return JSON.parse(vm.runInContext('JSON.stringify({ TOKENS, CHARS, PALETTE })', c));
})();

function makeEngine(onChange) {
  let queued = false;
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout,
    // يستدعيه المحرك بعد كل تغيير؛ ندمج الاستدعاءات المتتالية في بث واحد
    render() { if (!queued) { queued = true; queueMicrotask(() => { queued = false; onChange(); }); } },
  });
  vm.runInContext(SRC.data, ctx, { filename: 'data.js' });
  // يحاكي تأخير حركة النرد عند العميل؛ النتيجة يقرّرها الخادم
  vm.runInContext('const UI = { animateDice: () => sleep(600) };', ctx);
  vm.runInContext(SRC.game, ctx, { filename: 'game.js' });
  vm.runInContext(SRC.apply, ctx, { filename: 'apply.js' });
  return {
    snapshot: () => vm.runInContext('snapshot()', ctx),
    startGame(names, chars, colors) { ctx.__names = names; ctx.__chars = chars; ctx.__colors = colors; vm.runInContext('startGame(__names, __chars, __colors)', ctx); },
    skip(pid) { ctx.__pid = pid; return vm.runInContext('skipPlayer(__pid)', ctx); },
    pause(pid, act, conn) { ctx.__pid = pid; ctx.__act = act; ctx.__conn = conn; return vm.runInContext('pauseAction(__pid, __act, __conn)', ctx); },
    pauseRecheck(conn) { ctx.__conn = conn; vm.runInContext('pauseRecheck(__conn)', ctx); },
    apply(pid, m) { ctx.__pid = pid; ctx.__m = m; return vm.runInContext('applyAction(__pid, JSON.parse(__m))', ctx); },
  };
}

/* ---------- الغرف ---------- */
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
function newCode() {
  for (;;) {
    const c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    if (!rooms.has(c)) return c;
  }
}
const cleanName = (s, fallback) => (typeof s === 'string' && s.trim().slice(0, 14)) || fallback;
const validToken = t => typeof t === 'string' && /^[a-f0-9]{16,64}$/.test(t);
const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(typeof o === 'string' ? o : JSON.stringify(o)); };

function broadcastLobby(room) {
  room.seats.forEach((seat, i) => send(seat.ws, {
    t: 'lobby', code: room.code, you: i,
    players: room.seats.map((s, j) => ({ name: s.name, char: s.char, icon: CHARS[s.char].icon, color: s.color, conn: !!s.ws })),
  }));
}
function broadcastState(room) {
  const g = room.engine.snapshot();
  const conn = JSON.stringify(room.seats.map(s => !!s.ws));
  room.seats.forEach((seat, i) => send(seat.ws, `{"t":"state","you":${i},"conn":${conn},"g":${JSON.stringify(g)}}`));
}
// شخصية افتراضية للمقعد الجديد: أول شخصية لم يخترها أحد في الغرفة
const freeColor = room => PALETTE.find(c => !room.seats.some(s => s.color === c)) || PALETTE[0];
const freeChar = room => { const i = CHARS.findIndex((_, k) => !room.seats.some(s => s.char === k)); return i < 0 ? 0 : i; };
const refresh = room => (room.started ? broadcastState(room) : broadcastLobby(room));

function attach(ws, room, idx) {
  const seat = room.seats[idx];
  if (seat.ws && seat.ws !== ws) { seat.ws.room = null; seat.ws.close(); }   // نفس اللاعب من تبويب آخر
  clearTimeout(seat.grace);
  seat.ws = ws; ws.room = room; ws.token = seat.token;
  room.lastActive = Date.now();
  refresh(room);
}

function seatIndex(ws) { return ws.room ? ws.room.seats.findIndex(s => s.token === ws.token) : -1; }

function detach(ws) {
  const room = ws.room; if (!room) return;
  const idx = seatIndex(ws);
  ws.room = null;
  if (idx < 0 || room.seats[idx].ws !== ws) return;
  const seat = room.seats[idx];
  seat.ws = null; room.lastActive = Date.now();
  if (room.started && room.engine) room.engine.pauseRecheck(room.seats.map(s => !!s.ws));   // غياب لاعب لا يعطّل طلب إيقاف قائم
  if (!room.started) {
    seat.grace = setTimeout(() => removeSeat(room, seat.token), LOBBY_GRACE_MS);
  }
  refresh(room);
}

function removeSeat(room, token) {
  const i = room.seats.findIndex(s => s.token === token);
  if (i < 0 || room.started) return;
  clearTimeout(room.seats[i].grace);
  room.seats.splice(i, 1);
  if (!room.seats.length) { rooms.delete(room.code); return; }
  broadcastLobby(room);
}

const handlers = {
  create(ws, m) {
    if (ws.room) return;
    if (!validToken(m.token)) return send(ws, { t: 'err', m: 'هوية غير صالحة' });
    const room = { code: newCode(), seats: [], started: false, engine: null, lastActive: Date.now() };
    rooms.set(room.code, room);
    room.seats.push({ token: m.token, name: cleanName(m.name, 'لاعب 1'), char: freeChar(room), color: freeColor(room), ws: null });
    attach(ws, room, 0);
  },
  join(ws, m) {
    if (ws.room) return;
    if (!validToken(m.token)) return send(ws, { t: 'err', m: 'هوية غير صالحة' });
    const room = rooms.get(String(m.code || '').toUpperCase());
    if (!room) return send(ws, { t: 'err', code: 'no-room', m: 'الغرفة غير موجودة' });
    let idx = room.seats.findIndex(s => s.token === m.token);
    if (idx < 0) {
      if (room.started) return send(ws, { t: 'err', code: 'started', m: 'اللعبة بدأت بالفعل' });
      if (room.seats.length >= MAX_PLAYERS) return send(ws, { t: 'err', m: 'الغرفة ممتلئة' });
      idx = room.seats.push({ token: m.token, name: cleanName(m.name, 'لاعب ' + (room.seats.length + 1)), char: freeChar(room), color: freeColor(room), ws: null }) - 1;
    }
    attach(ws, room, idx);
  },
  start(ws) {
    const room = ws.room; if (!room || room.started) return;
    if (seatIndex(ws) !== 0) return send(ws, { t: 'err', m: 'المضيف فقط يبدأ اللعبة' });
    if (room.seats.length < MIN_PLAYERS) return send(ws, { t: 'err', m: 'يلزم لاعبان على الأقل' });
    room.engine = makeEngine(() => broadcastState(room));
    room.engine.startGame(room.seats.map(s => s.name), room.seats.map(s => s.char), room.seats.map(s => s.color));
    room.started = true;
    broadcastState(room);
  },
  char(ws, m) {                              // اللاعب يغيّر شخصيته في الردهة
    const room = ws.room; if (!room || room.started) return;
    const idx = seatIndex(ws); if (idx < 0 || !Number.isInteger(m.c) || !CHARS[m.c]) return;
    room.seats[idx].char = m.c;
    broadcastLobby(room);
  },
  act(ws, m) {
    const room = ws.room; if (!room || !room.started) return;
    const idx = seatIndex(ws); if (idx < 0) return;
    room.lastActive = Date.now();
    const err = room.engine.apply(idx, JSON.stringify(m.m));
    if (err) send(ws, { t: 'err', m: err });
  },
  color(ws, m) {                             // اللاعب يغيّر لونه في الردهة (لا يتكرر لون)
    const room = ws.room; if (!room || room.started) return;
    const idx = seatIndex(ws); if (idx < 0 || !PALETTE.includes(m.c)) return;
    if (room.seats.some((s, k) => k !== idx && s.color === m.c)) return send(ws, { t: 'err', m: 'هذا اللون مأخوذ' });
    room.seats[idx].color = m.c;
    broadcastLobby(room);
  },
  pause(ws, m) {
    const room = ws.room; if (!room || !room.started) return;
    const idx = seatIndex(ws); if (idx < 0 || !['request', 'accept', 'decline', 'cancel', 'resume'].includes(m.a)) return;
    room.lastActive = Date.now();
    const err = room.engine.pause(idx, m.a, room.seats.map(s => !!s.ws));
    if (err) send(ws, { t: 'err', m: err });
  },
  skip(ws, m) {
    const room = ws.room; if (!room || !room.started) return;
    const me = seatIndex(ws), target = m.seat;
    // المخوَّل: أول لاعب متصل حسب الترتيب (المضيف عادةً)
    if (me < 0 || me !== room.seats.findIndex(s => s.ws)) return send(ws, { t: 'err', m: 'المضيف فقط يستطيع ذلك' });
    if (!Number.isInteger(target) || !room.seats[target]) return;
    if (room.seats[target].ws) return send(ws, { t: 'err', m: 'اللاعب متصل' });
    const err = room.engine.skip(target);
    if (err) send(ws, { t: 'err', m: err });
  },
  leave(ws) {
    const room = ws.room; if (!room) return;
    const token = ws.token;
    if (room.started) { detach(ws); return; }
    ws.room = null;
    removeSeat(room, token);
  },
};

/* ---------- WebSocket ---------- */
const wss = new WebSocketServer({ server, maxPayload: 2048 });
wss.on('connection', ws => {
  ws.isAlive = true; ws.room = null; ws.token = null;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string' || !Object.hasOwn(handlers, m.t)) return;
    try { handlers[m.t](ws, m); } catch (e) { console.error(e); send(ws, { t: 'err', m: 'خطأ في الخادم' }); }
  });
  ws.on('close', () => detach(ws));
});

setInterval(() => {                           // كشف الاتصالات الميتة
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false; ws.ping();
  });
}, 30_000);
setInterval(() => {                           // تنظيف الغرف المهجورة
  for (const [code, room] of rooms) {
    if (room.seats.every(s => !s.ws) && Date.now() - room.lastActive > ROOM_TTL_MS) rooms.delete(code);
  }
}, 5 * 60_000);

server.listen(PORT, () => console.log(`عقارات تونس: http://localhost:${PORT}`));
