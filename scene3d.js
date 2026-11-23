import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
/* ==========================================================
   المشهد ثلاثي الأبعاد: لعبة طاولة حقيقية على سطح فاتح.
   - لوحة رقيقة مطبوعة، بيوت وفنادق بلاستيكية، بيادق، نردان حقيقيان،
     أوراق حظ وصندوق الجماعة، وصكوك ملكية على الطاولة.
   - تحكّم حر بالكاميرا (OrbitControls): تدوير، تقريب/تبعيد، تحريك.
   لا يغيّر منطق اللعبة: يقرأ G ويرسمها. يُستدعى من ui.js:
     S3D.init(canvas) → true/false  |  S3D.sync()  |  S3D.home()
   الإحداثيات: وحدة واحدة = بلاطة؛ اللوحة 12×12 وسطها (0,0)؛ اللاعب الأسفل ينظر من +z.
   ========================================================== */

const S = { on: false };
window.S3D = S;

const TOP = 74;                       // ارتفاع الشريط العلوي (px)
const BOTTOM = 170;                   // ارتفاع شريط النرد السفلي (px) — لتوسيط اللوحة بينهما
const HOME_ELEV = (47 * Math.PI) / 180;
const FOV = 32;
const T = 0.16;                       // سُمك اللوحة
const FRAME = 12.4;
const D_SIZE = 0.56;                  // حجم النرد

const INK = '#14221b';
const BOARD = '#a8cdbe';            // لون سطح اللوحة (مقاس من الصورة المرجعية)
const BOARD_HI = '#b2d4c6', BOARD_LO = '#9fc5b5', BOARD_EDGE = 0x8db3a2, BOARD_BASE = 0x7a9c8a;
const FONT = 'Tajawal, "Segoe UI", Tahoma, sans-serif';
const SERIF = 'Amiri, "Times New Roman", serif';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

// مركز الخلية على شبكة 11×11 (الزوايا 1.5 والبقية 1) بإحداثيات العالم
const angDiff = (a, b) => ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
const unit = c => (c === 1 ? 0.75 : c === 11 ? 11.25 : c);
const gw = c => unit(c) - 6;

let renderer, scene, camera, controls, canvas, raycaster;
const tiles = [], pawns = [], dice = [];
let centerTex = null, hover = -1, lastT = 0, started = false, userMoved = false;
let dstate = 'none', dT0 = 0, diceKey = '';

const ready = () => G.players && G.players.length;

/* ---------- أدوات الخامات ---------- */
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function canvasTex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function wrapLines(g, text, maxW, maxLines) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (!cur || g.measureText(t).width <= maxW) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

/* ---------- وجه البلاطة (يُرسم والشريط اللوني نحو مركز اللوحة، كاللوحات الحقيقية) ---------- */
function drawTile(t, i) {
  const s = SPACES[i], cv = t.cv, g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const corner = i % 10 === 0, odd = Math.abs(t.rot) === Math.PI / 2;
  const Wc = odd ? H : W, Hc = odd ? W : H;           // أبعاد الرسم قبل التدوير
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = INK; g.fillRect(0, 0, W, H);
  g.save();
  g.translate(W / 2, H / 2); g.rotate(t.rot); g.translate(-Wc / 2, -Hc / 2);

  const bg = g.createLinearGradient(0, 0, Wc, Hc);
  bg.addColorStop(0, BOARD_HI); bg.addColorStop(1, BOARD_LO);
  g.fillStyle = bg; g.fillRect(3, 3, Wc - 6, Hc - 6);
  g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';

  let top = 3;
  if (s.type === 'prop') {
    const bh = Hc * 0.24;
    g.fillStyle = GROUPS[s.group].color; g.fillRect(3, 3, Wc - 6, bh);
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(3, 3 + bh); g.lineTo(Wc - 3, 3 + bh); g.stroke();
    top = 3 + bh;
  } else {
    g.font = `${corner ? Hc * 0.34 : Hc * 0.22}px ${EMOJI}`; g.fillStyle = INK;
    g.fillText(s.icon, Wc / 2, Hc * (corner ? 0.3 : 0.2));
    top = Hc * (corner ? 0.5 : 0.34);
  }
  const price = s.price ? `${s.price} ${CUR}` : s.type === 'tax' && s.amount ? `${s.amount} ${CUR}` : s.type === 'go' ? `اقبض ${GO_SALARY}` : '';
  const priceH = price ? Hc * 0.14 : 0;
  const fs = corner ? Hc * 0.12 : Math.min(Wc, Hc) * 0.17;
  g.font = `800 ${fs}px ${FONT}`; g.fillStyle = INK;
  const lines = wrapLines(g, s.name, Wc - 20, 3), lh = fs * 1.2;
  const mid = (top + (Hc - priceH)) / 2;
  lines.forEach((ln, k) => g.fillText(ln, Wc / 2, mid + (k - (lines.length - 1) / 2) * lh));
  if (price) { g.font = `700 ${fs * 0.85}px ${FONT}`; g.fillText(price, Wc / 2, Hc - priceH * 0.55 - Hc * 0.045); }

  const o = G.owner[i];
  if (o !== null) { g.fillStyle = G.players[o].color; g.fillRect(3, Hc - Hc * 0.055 - 3, Wc - 6, Hc * 0.055); }
  if (G.mortgaged[i]) {
    g.fillStyle = 'rgba(40,40,40,.62)'; g.fillRect(3, 3, Wc - 6, Hc - 6);
    g.fillStyle = '#ffd0d5'; g.font = `800 ${fs * 1.05}px ${FONT}`; g.fillText('مرهون', Wc / 2, Hc * 0.62);
  }
  g.restore();
  t.tex.needsUpdate = true;
}

/* ---------- وسط اللوحة: زخرفة زليج + شريط العنوان ---------- */
function drawCenter(cv) {
  const N = cv.width, g = cv.getContext('2d');
  g.fillStyle = BOARD; g.fillRect(0, 0, N, N);
  g.strokeStyle = 'rgba(24,92,70,.16)'; g.lineWidth = 2;
  for (let x = 64; x < N; x += 128) for (let y = 64; y < N; y += 128) {   // نجوم ثمانية
    for (const a of [0, Math.PI / 4]) {
      g.save(); g.translate(x, y); g.rotate(a); g.strokeRect(-34, -34, 68, 68); g.restore();
    }
    g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.stroke();
  }
  g.strokeStyle = 'rgba(24,92,70,.35)'; g.lineWidth = 4; g.strokeRect(16, 16, N - 32, N - 32);

  // شريط العنوان
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(120, 446, 784, 170);
  g.fillStyle = '#d11a2a'; g.fillRect(112, 430, 800, 164);
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(128, 446, 768, 132);
  g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.font = `700 112px ${SERIF}`; g.fillText('عقارات تونس', N / 2, 496);
  g.font = `500 36px ${FONT}`; g.fillStyle = '#ffe9d6'; g.fillText('لعبة تداول العقارات', N / 2, 554);
  // ميدالية هلال ونجمة
  g.fillStyle = '#d11a2a'; g.beginPath(); g.arc(N / 2, 330, 64, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(N / 2, 330, 52, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d11a2a'; g.beginPath(); g.arc(N / 2 - 4, 330, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(N / 2 + 5, 330, 28, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d11a2a'; g.beginPath();
  for (let k = 0; k < 10; k++) { const r = k % 2 ? 7 : 17, a = -Math.PI / 2 + (k * Math.PI) / 5; g.lineTo(N / 2 + 8 + r * Math.cos(a), 330 + r * Math.sin(a)); }
  g.closePath(); g.fill();
  if (centerTex) centerTex.needsUpdate = true;
}

/* ---------- صكوك الملكية على الطاولة + أوراق الحظ ---------- */
function deedCanvas(i) {
  const s = SPACES[i], cv = mkCanvas(360, 520), g = cv.getContext('2d');
  g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, 360, 520);
  g.strokeStyle = INK; g.lineWidth = 4; g.strokeRect(10, 10, 340, 500);
  g.fillStyle = GROUPS[s.group].color; g.fillRect(10, 10, 340, 130);
  g.strokeRect(10, 10, 340, 130);
  g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK;
  g.font = `700 22px ${FONT}`; g.fillText('صك ملكية', 180, 40);
  g.font = `800 38px ${FONT}`;
  wrapLines(g, s.name, 300, 2).forEach((ln, k, a) => g.fillText(ln, 180, 90 + (k - (a.length - 1) / 2) * 42));
  const rows = [[`الإيجار`, s.rent[0]], ['مع بيت واحد', s.rent[1]], ['مع بيتين', s.rent[2]], ['مع 3 بيوت', s.rent[3]], ['مع 4 بيوت', s.rent[4]], ['مع فندق', s.rent[5]]];
  g.font = `600 26px ${FONT}`;
  rows.forEach(([a, b], k) => {
    const y = 190 + k * 46; g.textAlign = 'right'; g.fillText(a, 330, y); g.textAlign = 'left'; g.fillText(`${b} ${CUR}`, 30, y);
  });
  g.textAlign = 'center'; g.font = `600 24px ${FONT}`;
  g.fillText(`سعر البيت: ${GROUPS[s.group].house} ${CUR}`, 180, 480);
  return cv;
}
function cardTopCanvas(kind) {
  const cv = mkCanvas(450, 300), g = cv.getContext('2d');
  const chance = kind === 'chance';
  const gr = g.createLinearGradient(0, 0, 450, 300);
  gr.addColorStop(0, chance ? '#ffb347' : '#6db3f2'); gr.addColorStop(1, chance ? '#e8741c' : '#2e7bd0');
  g.fillStyle = gr; g.fillRect(0, 0, 450, 300);
  g.strokeStyle = '#fff'; g.lineWidth = 6; g.setLineDash([14, 10]); g.strokeRect(18, 18, 414, 264);
  g.setLineDash([]); g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.font = `800 150px ${SERIF}`; g.fillText(chance ? '؟' : '🎁', 225, 125);
  g.font = `800 48px ${FONT}`; g.fillText(chance ? 'حظ' : 'صندوق الجماعة', 225, 235);
  return cv;
}


/* ---------- بطاقة على الطاولة: تُسحب من الكومة، تطير وتنقلب، وتستقر على وسط اللوحة ليراها الجميع ---------- */
function wrapCardLines(g, text, maxW) {
  const out = []; let line = '';
  text.split(' ').forEach(w => { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; });
  if (line) out.push(line);
  return out;
}
function cardFrontCanvas(kind, text) {
  const chance = kind === 'chance', cv = mkCanvas(900, 600), g = cv.getContext('2d');
  const c1 = chance ? '#ffb347' : '#6db3f2', c2 = chance ? '#e8741c' : '#2e7bd0';
  g.fillStyle = '#fffaf0'; g.fillRect(0, 0, 900, 600);
  const gr = g.createLinearGradient(0, 0, 900, 0); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.fillRect(0, 0, 900, 150);
  g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.font = `800 84px ${FONT}`; g.fillText(chance ? 'حظ' : 'صندوق الجماعة', 450, 78);
  g.font = `90px ${EMOJI}`; g.fillText(chance ? '❓' : '🎁', 90, 78); g.fillText(chance ? '❓' : '🎁', 810, 78);
  g.strokeStyle = c2; g.lineWidth = 8; g.setLineDash([22, 14]); g.strokeRect(24, 24, 852, 552); g.setLineDash([]);
  g.fillStyle = '#2a2418'; g.font = `800 62px ${FONT}`;
  const lines = wrapCardLines(g, text, 760), lh = 82, y0 = 375 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, k) => g.fillText(l, 450, y0 + k * lh));
  return cv;
}
function simpleDeedCanvas(i) {
  const s = SPACES[i], cv = mkCanvas(360, 520), g = cv.getContext('2d');
  g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, 360, 520);
  g.strokeStyle = INK; g.lineWidth = 4; g.strokeRect(10, 10, 340, 500);
  g.fillStyle = s.type === 'station' ? '#2f3a40' : '#8a8f94'; g.fillRect(10, 10, 340, 130);
  g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.font = `800 40px ${FONT}`; g.fillText(s.name, 180, 95, 320);
  g.font = `70px ${EMOJI}`; g.fillText(s.type === 'station' ? '🚆' : '💡', 180, 60);
  g.fillStyle = INK; g.font = `700 32px ${FONT}`;
  const rows = s.type === 'station' ? [['محطة واحدة', '25'], ['محطتان', '50'], ['3 محطات', '100'], ['4 محطات', '200']] : [['شركة واحدة', '4× النرد'], ['الشركتان', '10× النرد']];
  rows.forEach(([a, b], k) => { g.textAlign = 'right'; g.fillText(a, 330, 200 + k * 56); g.textAlign = 'left'; g.fillText(b, 30, 200 + k * 56); });
  g.textAlign = 'center'; g.font = `800 38px ${FONT}`; g.fillText(`السعر ${s.price} ${CUR}`, 180, 470);
  return cv;
}
const TC_DUR = 1.25;
let tc = null;
const _v = new THREE.Vector3();
function wantedTableCard() {
  if (!G.players || G.over) return null;
  if (typeof viewerId === 'function' && viewerId() !== G.cur) return null;   // البطاقة تظهر لصاحب الدور فقط
  if (G.phase === 'card' && G.card) return { key: `c${G.card.kind}${G.card.idx}`, kind: G.card.kind, text: G.card.card.text };
  if (G.phase === 'buy') { const i = G.players[G.cur].pos; return { key: `d${i}`, deed: i }; }
  return null;
}
function makeTableCard(w) {
  let front, back, sx, sz, S, from, ry0, to;
  if (w.deed !== undefined) {
    const s = SPACES[w.deed];
    front = canvasTex(s.group ? deedCanvas(w.deed) : simpleDeedCanvas(w.deed));
    const bc = mkCanvas(180, 260), bg = bc.getContext('2d'); bg.fillStyle = '#efe6cf'; bg.fillRect(0, 0, 180, 260);
    bg.strokeStyle = '#a8641f'; bg.lineWidth = 6; bg.setLineDash([12, 8]); bg.strokeRect(12, 12, 156, 236);
    back = canvasTex(bc); sx = 1.15; sz = 1.66; S = 0.46;
    from = new THREE.Vector3(8.4, T + 0.05, 4.2); ry0 = 0.3; to = new THREE.Vector3(0, T + 0.016, -0.1);
  } else {
    front = canvasTex(cardFrontCanvas(w.kind, w.text)); back = canvasTex(cardTopCanvas(w.kind));
    sx = 1.5; sz = 1.0; S = 0.3;
    const ch = w.kind === 'chance';
    from = new THREE.Vector3(ch ? -2.3 : 2.3, T + 0.13, ch ? -2.5 : 2.5); ry0 = ch ? 0.6 : 0.6 + Math.PI; to = new THREE.Vector3(0, T + 0.016, 0.1);
  }
  const edge = new THREE.MeshBasicMaterial({ color: 0xf2ead2, transparent: true });
  const mats = [edge, edge, new THREE.MeshBasicMaterial({ map: front, toneMapped: false, transparent: true }), new THREE.MeshBasicMaterial({ map: back, toneMapped: false, transparent: true }), edge, edge];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.02, sz), mats);
  mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 20;   // يُرسم بعد بطاقات الأسماء (الشفافة) فلا تغطّيه
  scene.add(mesh);
  return { key: w.key, mesh, u: 0, dir: 1, from, to, ry0, S, sz, tex: [front, back] };
}
const _qt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.05, 0.1)), _fw = new THREE.Vector3(), _up = new THREE.Vector3(), _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
// البطاقة تُعرض أمام اللاعب: معلّقة أمام الكاميرا وتواجهها، لا على اللوحة
function poseTableCard(c) {
  const e = c.u * c.u * (3 - 2 * c.u);
  const d = 7, visH = 2 * d * Math.tan((camera.fov * Math.PI) / 360);
  camera.getWorldDirection(_fw); _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  _v.copy(camera.position).addScaledVector(_fw, d).addScaledVector(_up, -0.04 * visH);        // وسط الشاشة تقريبًا
  c.mesh.position.lerpVectors(c.from, _v, e); c.mesh.position.y += Math.sin(Math.PI * e) * 1.0;
  _q0.setFromEuler(new THREE.Euler(Math.PI, c.ry0, 0, 'YXZ'));                                 // مسطّحة ووجهها لأسفل عند الكومة
  _q1.copy(camera.quaternion).multiply(_qx).multiply(_qt);                                                   // وجهها نحو الكاميرا
  c.mesh.quaternion.slerpQuaternions(_q0, _q1, e);
  const sc = 1 + (c.S * visH / c.sz - 1) * e; c.mesh.scale.set(sc, 1, sc);
}
function tableCardStep(dt) {
  const w = wantedTableCard();
  if (tc && (!w || w.key !== tc.key)) tc.dir = -1;
  if (!tc && w) { tc = makeTableCard(w); }
  if (!tc) return;
  tc.u = Math.max(0, Math.min(1, tc.u + tc.dir * dt / (tc.dir > 0 ? TC_DUR : TC_DUR * 0.7)));
  poseTableCard(tc);
  if (tc.dir < 0 && tc.u <= 0) {
    scene.remove(tc.mesh); tc.mesh.geometry.dispose(); tc.mesh.material.forEach(m => m.dispose && m.dispose()); tc.tex.forEach(t => t.dispose()); tc = null;
  }
}

/* ---------- بناء المشهد ---------- */
function buildStatic() {
  const BG = 0xf1f3f4;
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 38, 90);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: BG, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // إضاءة استوديو + بيئة انعكاسات
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfd8dc, 0.26));
  const key = new THREE.DirectionalLight(0xfff6e8, 1.25);
  key.position.set(-7, 15, 9); key.castShadow = true;
  const coarse = matchMedia('(pointer:coarse)').matches;
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 60 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  scene.add(key);

  // لوحة: حافة سفلية + وسط
  const edgeMat = new THREE.MeshStandardMaterial({ color: BOARD_EDGE, roughness: 0.85 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(FRAME - 0.1, 0.04, FRAME - 0.1), new THREE.MeshStandardMaterial({ color: BOARD_BASE, roughness: 0.9 }));
  base.position.y = 0.02; base.receiveShadow = true; scene.add(base);

  const ccv = mkCanvas(1024, 1024); centerTex = canvasTex(ccv); drawCenter(ccv);
  const centerTop = new THREE.MeshStandardMaterial({ map: centerTex, roughness: 0.8 });
  const center = new THREE.Mesh(new THREE.BoxGeometry(9, T, 9), [edgeMat, edgeMat, centerTop, edgeMat, edgeMat, edgeMat]);
  center.position.y = T / 2; center.castShadow = center.receiveShadow = true; scene.add(center);

  // أوراق: حظ وصندوق الجماعة (ركامان على الوسط)
  const mkDeck = (kind, x, z, rot) => {
    const top = new THREE.MeshStandardMaterial({ map: canvasTex(cardTopCanvas(kind)), roughness: 0.7 });
    const side = new THREE.MeshStandardMaterial({ color: kind === 'chance' ? 0xe8741c : 0x2e7bd0, roughness: 0.8 });
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.014, 1.0), k === 8 ? [side, side, top, side, side, side] : side);
      m.position.set(x + (Math.random() - 0.5) * 0.03, T + 0.007 + k * 0.014, z + (Math.random() - 0.5) * 0.03);
      m.rotation.y = rot + (Math.random() - 0.5) * 0.04; m.castShadow = m.receiveShadow = true; scene.add(m);
    }
  };
  mkDeck('chance', -2.3, -2.5, 0.6);
  mkDeck('chest', 2.3, 2.5, 0.6 + Math.PI);

  // صكوك ملكية مبعثرة جانب اللوحة
  [[39, 8.4, 3.1, -0.35], [37, 8.9, 4.5, -0.1], [34, 7.9, 4.9, 0.28]].forEach(([i, x, z, r], k) => {
    const top = new THREE.MeshStandardMaterial({ map: canvasTex(deedCanvas(i)), roughness: 0.75 });
    const side = new THREE.MeshStandardMaterial({ color: 0xf2f0e6 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.012, 1.66), [side, side, top, side, side, side]);
    m.position.set(x, 0.045 + k * 0.016, z); m.rotation.y = r; m.castShadow = m.receiveShadow = true; scene.add(m);
  });
}

function buildTiles() {
  const edgeMat = new THREE.MeshStandardMaterial({ color: BOARD_EDGE, roughness: 0.85 });
  SPACES.forEach((s, i) => {
    const [r, c] = coord(i);
    const w = (c === 1 || c === 11) ? 1.5 : 1, d = (r === 1 || r === 11) ? 1.5 : 1;
    const corner = i % 10 === 0;
    // دوران الرسم: الشريط اللوني دائمًا نحو المركز (أسفل 0، يسار +90، أعلى 180، يمين −90)
    const rot = corner ? 0 : r === 11 ? 0 : c === 1 ? Math.PI / 2 : r === 1 ? Math.PI : -Math.PI / 2;
    const cv = mkCanvas(Math.round(w * 240), Math.round(d * 240));
    const tex = canvasTex(cv);
    const topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, T, d), [edgeMat, edgeMat, topMat, edgeMat, edgeMat, edgeMat]);
    mesh.position.set(gw(c), T / 2, gw(r));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.tile = i;
    scene.add(mesh);
    const houses = new THREE.Group(); houses.position.set(gw(c), T, gw(r)); houses.rotation.y = corner ? 0 : r === 11 ? 0 : c === 1 ? -Math.PI / 2 : r === 1 ? Math.PI : Math.PI / 2;
    scene.add(houses);
    tiles.push({ mesh, cv, tex, topMat, rot, key: '', hk: -1, houses, w, d, cx: gw(c), cz: gw(r), side: corner ? 'c' : r === 11 || r === 1 ? 'row' : 'col' });
  });
}

/* ---------- إبراز خانة الوصول: ترتفع الخانة التي سيقف عليها اللاعب ---------- */
const LIFT = 0.1;
function tilesStep(ms, dt) {
  if (!G.players) return;
  const p = G.players[G.cur];
  const dest = !G.over && p && !p.bankrupt && G.phase !== 'roll' && G.phase !== 'auction' ? p.pos : -1;
  const k = 1 - Math.exp(-dt * 9);
  tiles.forEach((t, i) => {
    const want = i === dest ? LIFT : 0;
    t.lift = (t.lift || 0) + (want - (t.lift || 0)) * k;
    if (Math.abs(t.lift) < 0.002 && want === 0) t.lift = 0;
    t.mesh.scale.y = (T + t.lift) / T;           // تمتد البلاطة للأسفل فتبقى ملتصقة باللوحة (لا تبدو طائرة)
    t.mesh.position.y = (T + t.lift) / 2;
    t.houses.position.y = T + t.lift;
    if (i !== hover) t.topMat.emissive.setHex(i === dest ? (Math.round(0x6a * (0.6 + 0.4 * Math.sin(ms / 250))) << 16 | Math.round(0x4a * (0.6 + 0.4 * Math.sin(ms / 250))) << 8) : 0);
  });
}
function tileLiftAt(x, z) {
  for (const t of tiles) if (t.lift > 0.01 && Math.abs(x - t.cx) < t.w / 2 && Math.abs(z - t.cz) < t.d / 2) return t.lift;
  return 0;
}

/* ---------- بيوت وفنادق بلاستيكية ---------- */
function prism(w, h, r, dp) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(0, h + r); s.lineTo(-w / 2, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: dp, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
  g.translate(0, 0, -dp / 2);
  return g;
}
const houseGeo = prism(0.27, 0.2, 0.13, 0.23), hotelGeo = prism(0.74, 0.2, 0.13, 0.28);
const plastic = c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25 });
const houseMat = plastic(0x1f9b3f), hotelMat = plastic(0xd62020);
function syncHouses(t, i) {
  const n = SPACES[i].type === 'prop' ? G.houses[i] : 0;
  if (n === t.hk) return;
  t.hk = n; t.houses.clear();
  const z = -0.57;                       // وسط الشريط اللوني (جهة المركز)
  const add = (geo, mat, x) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, 0, z); m.castShadow = true; t.houses.add(m); };
  if (n === 5) add(hotelGeo, hotelMat, 0);
  else for (let k = 0; k < n; k++) add(houseGeo, houseMat, (k - (n - 1) / 2) * 0.27);
}

/* ---------- البيادق ---------- */
const PROFILE = [[0, 0], [.21, 0], [.23, .03], [.2, .07], [.12, .13], [.075, .22], [.085, .32], [.15, .38], [.16, .45], [.13, .52], [.06, .56], [0, .57]].map(([x, y]) => new THREE.Vector2(x, y));
const pawnGeo = new THREE.LatheGeometry(PROFILE, 32);
/* شخصيات متحرّكة بلون اللاعب: كلّها من نموذج Blender واحد (make_character.py) بتنويعات: قطّ، فأر، دبّ، أرنب، خنزير، ذئب */
const MONSTERS = ['Cat.glb', 'Mouse.glb', 'Bear.glb', 'Rabbit.glb', 'Pig.glb', 'Wolf.glb'];
const MONSTER_H = 0.6;          // ارتفاع الشخصية (وحدة = بلاطة)
const MODEL_YAW = 0;             // اتجاه نظر النموذج الافتراضي
/* سرعة الأرض الطبيعية لمقطع الجري عند 1x (بوحدات النموذج/ث، قبل التحجيم) — تُقاس في make_character.py (RUN_SPEED).
   تُضبط سرعة تشغيل المقطع = السرعة الفعلية ÷ هذه، فتثبت القدم على الأرض ولا تنزلق. */
const RUN_SPEED = { 'Cat.glb': 2.2822, 'Mouse.glb': 2.2592, 'Bear.glb': 2.3010, 'Rabbit.glb': 2.2595, 'Pig.glb': 2.3005, 'Wolf.glb': 2.2977 };
const GAIT_SPEED = 1.3;          // سرعة أرض تقديرية (وحدة/ث) لمقطع Walk عند النماذج التي لا تملك Run
const STOP_GRACE_MS = 120;       // لا نعود إلى Idle بين بلاطتين متتاليتين
const gltfLoader = new GLTFLoader();
const loadMonster = file => new Promise((res, rej) => gltfLoader.load(`models/${file}`, res, undefined, rej));

function makePawn(p, idx) {
  const grp = new THREE.Group();                                   // الشخصية تقف مباشرة على اللوحة (بلا قاعدة)
  const fallback = new THREE.Mesh(pawnGeo, new THREE.MeshPhysicalMaterial({ color: p.color, roughness: 0.22, clearcoat: 1 }));
  fallback.scale.setScalar(0.7); fallback.visible = false; fallback.castShadow = true;     // يظهر فقط إن فشل تحميل النموذج
  const holder = new THREE.Group();
  const ncv = mkCanvas(320, 72), ng = ncv.getContext('2d');          // بطاقة اسم اللاعب فوق الشخصية
  ng.fillStyle = 'rgba(255,255,255,.96)'; ng.beginPath(); ng.roundRect(2, 2, 316, 68, 34); ng.fill();
  ng.fillStyle = p.color; ng.beginPath(); ng.arc(38, 36, 15, 0, Math.PI * 2); ng.fill();
  ng.direction = 'rtl'; ng.textAlign = 'center'; ng.textBaseline = 'middle'; ng.fillStyle = INK; ng.font = `700 34px ${FONT}`;
  ng.fillText(p.name, 188, 38, 220);
  const ntex = new THREE.CanvasTexture(ncv); ntex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: ntex, transparent: true, depthTest: false, depthWrite: false }));
  tag.scale.set(1.05, 0.24, 1); tag.position.y = 1.0; tag.renderOrder = 10;
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.29, 0.38, 40),
    new THREE.MeshBasicMaterial({ color: 0xffb300, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.015;
  grp.add(fallback, holder, tag, halo);
  scene.add(grp);
  const pw = { grp, holder, halo, tag, fallback, pos: new THREE.Vector3(), target: new THREE.Vector3(), fresh: true,
    speed: 0, lastMove: 0, gait: 'Walk', natSpeed: GAIT_SPEED,
    yaw: 0, rank: 0, tagBase: 1.0, mixer: null, actions: {}, cur: null, once: 0, dead: false, hideAt: 0, prev: null };
  const file = MONSTERS[idx % MONSTERS.length];
  loadMonster(file).then(gl => attachModel(pw, gl, file))
    .catch(err => { console.warn('تعذّر تحميل الشخصية', err); fallback.visible = true; });
  return pw;
}

function attachModel(pw, gl, file) {
  const model = gl.scene;
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const box = new THREE.Box3().setFromObject(model);
  const k = MONSTER_H / Math.max(0.01, box.max.y - box.min.y);
  model.scale.setScalar(k);
  model.position.y = -box.min.y * k;                               // القدمان على اللوحة
  pw.holder.add(model);
  pw.model = model;
  pw.tagBase = MONSTER_H + 0.3;
  pw.tag.position.y = pw.tagBase;
  pw.mixer = new THREE.AnimationMixer(model);
  gl.animations.forEach(c => { pw.actions[c.name] = pw.mixer.clipAction(c); });
  if (pw.actions.Run && RUN_SPEED[file]) { pw.gait = 'Run'; pw.natSpeed = RUN_SPEED[file] * k; }
  playAnim(pw, 'Idle');
}

function playAnim(pw, name, o = {}) {
  const a = pw.actions[name];
  if (!a || (pw.cur === a && !o.restart)) return;
  const prev = pw.cur, fade = o.fade ?? 0.2;
  a.reset(); a.enabled = true; a.timeScale = o.speed || 1;
  if (o.once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = !!o.clamp; } else a.setLoop(THREE.LoopRepeat, Infinity);
  a.fadeIn(fade).play();
  if (prev && prev !== a) prev.fadeOut(fade);
  pw.cur = a;
}
function oneShot(pw, name, speed = 1) {
  const a = pw.actions[name];
  if (!a) return;
  playAnim(pw, name, { once: true, restart: true, speed });
  pw.once = performance.now() + (a.getClip().duration / speed) * 1000;
}

function updatePawn(pw, id, ms, dt) {
  const p = G.players[id];
  // حركة بسرعة ثابتة: تصل الشخصية إلى البلاطة في MOVE_STEP_MS تقريبًا (pw.speed يُحسب عند تغيّر الوجهة)
  const dx = pw.target.x - pw.pos.x, dz = pw.target.z - pw.pos.z, dist = Math.hypot(dx, dz);
  const speed = Math.min(pw.speed, pw.natSpeed * 2.2);            // سقف تتبعه الأرجل (مثلًا القفزة إلى السجن)
  if (dist > 1e-4) {
    const step = Math.min(dist, speed * dt);
    pw.pos.x += dx / dist * step; pw.pos.z += dz / dist * step;
    pw.lastMove = ms;
  }
  const moving = dist > 1e-4 || ms - pw.lastMove < STOP_GRACE_MS;
  // الاتجاه: نحو وجهة الحركة، وعند الوقوف نحو خارج اللوحة (نحو اللاعب والكاميرا)
  const want = dist > 1e-4 ? Math.atan2(dx, dz) : moving ? pw.yaw : Math.atan2(pw.pos.x, pw.pos.z);
  pw.yaw += angDiff(pw.yaw, want) * (1 - Math.exp(-dt * 10));
  pw.holder.rotation.y = pw.yaw + MODEL_YAW;
  pw.grp.position.set(pw.pos.x, T + tileLiftAt(pw.pos.x, pw.pos.z), pw.pos.z);
  if (pw.mixer) {
    if (p.bankrupt) {
      if (!pw.dead) { pw.dead = true; playAnim(pw, 'Death', { once: true, clamp: true }); pw.hideAt = ms + 2600; }
    } else if (G.over && G.winner && G.winner.id === id) {
      playAnim(pw, 'Dance');
    } else if (!(pw.once && ms < pw.once)) {
      pw.once = 0;
      playAnim(pw, moving ? pw.gait : 'Idle');
      // مزامنة الخطوات مع الأرض: سرعة المقطع = السرعة الفعلية ÷ سرعته الطبيعية
      if (moving && pw.cur) pw.cur.timeScale = THREE.MathUtils.clamp(speed / pw.natSpeed, 0.5, 2.5);
    }
    pw.mixer.update(dt);
  }
  pw.tag.position.y += (pw.tagBase + pw.rank * 0.26 - pw.tag.position.y) * (1 - Math.exp(-dt * 8));
  if (pw.hideAt && ms > pw.hideAt) pw.grp.visible = false;
  const mine = (typeof viewerId === 'function' ? viewerId() : G.cur) === id && !G.over && !p.bankrupt;   // بيدقي أنا
  pw.halo.material.opacity = mine ? 0.75 + 0.25 * Math.sin(ms / 220) : (G.cur === id && !G.over && !p.bankrupt ? 0.35 : 0);
  const hov = S.hoverPawn === id && !p.bankrupt;
  if (hov) pw.halo.material.opacity = 1;
  pw.halo.scale.setScalar(hov ? 1.7 : mine ? 1.35 : 1);
}

/* ---------- النرد: مكعبان مستديرا الحواف يرميان ويستقران على نتيجة الخادم ---------- */
const FACE_VALUES = [3, 4, 1, 6, 2, 5];                       // +x −x +y −y +z −z (المتقابلان مجموعهما 7)
const NORMALS = { 1: [0, 1, 0], 6: [0, -1, 0], 3: [1, 0, 0], 4: [-1, 0, 0], 2: [0, 0, 1], 5: [0, 0, -1] };
const PIP = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function pipTexture(v) {
  const cv = mkCanvas(128, 128), g = cv.getContext('2d');
  g.fillStyle = '#f7f3e8'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#121212';
  PIP[v].forEach(k => { g.beginPath(); g.arc(28 + (k % 3) * 36, 28 + Math.floor(k / 3) * 36, 11, 0, Math.PI * 2); g.fill(); });
  return canvasTex(cv);
}
function buildDice() {
  const mats = FACE_VALUES.map(v => new THREE.MeshStandardMaterial({ map: pipTexture(v), roughness: 0.35 }));
  const geo = new RoundedBoxGeometry(D_SIZE, D_SIZE, D_SIZE, 4, 0.07);
  for (let k = 0; k < 2; k++) {
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true; scene.add(mesh);
    dice.push({ mesh, from: new THREE.Vector3(), fromQ: new THREE.Quaternion(), to: new THREE.Vector3(), toQ: new THREE.Quaternion(), spin: new THREE.Vector3() });
  }
}
function finalPose(d, k, v) {
  d.to.set((k ? 0.9 : -0.9) + (Math.random() - 0.5) * 0.5, T + D_SIZE / 2, 3.3 + (Math.random() - 0.5) * 0.7);   // أسفل الوسط، بعيدًا عن الشريط
  const q1 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...NORMALS[v]), new THREE.Vector3(0, 1, 0));
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
  d.toQ.copy(yaw.multiply(q1));
}
function syncDice() {
  if (!dice.length) return;
  const now = performance.now();
  if (dstate === 'none') {                                     // وضع أولي بلا حركة
    dice.forEach((d, k) => { finalPose(d, k, G.dice[k]); d.mesh.position.copy(d.to); d.mesh.quaternion.copy(d.toQ); });
    dstate = 'idle'; diceKey = G.dice.join();
  }
  if (G.rolling && dstate !== 'spin') {
    dstate = 'spin'; dT0 = now;
    dice.forEach((d, k) => {
      d.spin.set(6 + Math.random() * 6, 5 + Math.random() * 7, 6 + Math.random() * 6);
      d.from.set(k ? 1 : -1, T + 1.2, 2.8);
    });
  } else if (!G.rolling && dstate === 'spin') {
    dstate = 'land'; dT0 = now; diceKey = G.dice.join();
    dice.forEach((d, k) => { d.from.copy(d.mesh.position); d.fromQ.copy(d.mesh.quaternion); finalPose(d, k, G.dice[k]); });
  } else if (!G.rolling && dstate === 'idle' && diceKey !== G.dice.join()) {   // القيم تغيّرت بلا رمية (مثلًا إعادة اتصال)
    diceKey = G.dice.join();
    dice.forEach((d, k) => { finalPose(d, k, G.dice[k]); d.mesh.position.copy(d.to); d.mesh.quaternion.copy(d.toQ); });
  }
}
function animateDice(now, dt) {
  if (dstate === 'spin') {
    const t = (now - dT0) / 1000;
    dice.forEach((d, k) => {
      d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt; d.mesh.rotation.z += d.spin.z * dt;
      d.mesh.position.set(d.from.x + Math.sin(t * 2.4 + k) * 0.35, T + 0.9 + Math.abs(Math.sin(t * 5 + k)) * 0.5, d.from.z + Math.cos(t * 2 + k) * 0.3);
    });
  } else if (dstate === 'land') {
    const u = Math.min(1, (now - dT0) / 700), e = 1 - Math.pow(1 - u, 3);
    dice.forEach(d => {
      d.mesh.position.lerpVectors(d.from, d.to, e);
      d.mesh.position.y += Math.abs(Math.sin(u * Math.PI * 2.4)) * (1 - u) * 0.55;
      d.mesh.quaternion.slerpQuaternions(d.fromQ, d.toQ, e);
    });
    if (u >= 1) dstate = 'idle';
  }
}

/* ---------- مزامنة الحالة ---------- */
S.sync = function () {
  if (!S.on || !ready()) return;
  tiles.forEach((t, i) => {
    const key = `${G.owner[i]}|${G.mortgaged[i]}`;
    if (key !== t.key) { t.key = key; drawTile(t, i); }
    syncHouses(t, i);
  });
  while (pawns.length < G.players.length) pawns.push(makePawn(G.players[pawns.length], pawns.length));
  const byPos = {};
  G.players.forEach(p => { if (!p.bankrupt) (byPos[p.pos] || (byPos[p.pos] = [])).push(p.id); });
  G.players.forEach((p, id) => {                                    // أحداث تُحرّك الشخصيات
    const pw = pawns[id], owned = G.owner.reduce((n, o) => n + (o === p.id ? 1 : 0), 0), pv = pw.prev;
    if (pv && !p.bankrupt) {
      if (owned > pv.owned || (p.cash - pv.cash >= 200 && p.pos < pv.pos && !p.jail)) oneShot(pw, 'Jump');   // شراء أو المرور بـ«انطلق»
      else if (p.jail && !pv.jail) oneShot(pw, 'No');                                                         // السجن
    }
    pw.prev = { owned, cash: p.cash, pos: p.pos, jail: p.jail };
  });
  Object.entries(byPos).forEach(([pos, ids]) => {
    const t = tiles[pos];
    const lines = Math.ceil(ids.length / 3), longX = t.side !== 'row';     // المحور الأطول للبلاطة
    ids.forEach((id, k) => {                                              // شبكة: حتى 3 في الصف و2 صفوف
      const line = Math.floor(k / 3), inLine = Math.min(3, ids.length - line * 3);
      const along = (k % 3 - (inLine - 1) / 2) * 0.46, across = (line - (lines - 1) / 2) * 0.46;
      const pw = pawns[id], tx = t.cx + (longX ? along : across), tz = t.cz + (longX ? across : along);
      if (tx !== pw.target.x || tz !== pw.target.z) {                     // وجهة جديدة: سرعة ثابتة تصل بها خلال خطوة واحدة
        pw.target.set(tx, 0, tz);
        pw.speed = Math.max(0.6, Math.hypot(tx - pw.pos.x, tz - pw.pos.z) / (MOVE_STEP_MS / 1000));
      }
      pw.rank = k % 3;
      if (pw.fresh) { pw.pos.copy(pw.target); pw.fresh = false; }
    });
  });
  syncDice();
  lastCur = G.cur;
};
const redrawAll = () => tiles.forEach((t, i) => { if (t.key) drawTile(t, i); });

/* ---------- كاميرا المتابعة: تلحق باللاعب صاحب الدور وتدور معه عند الزوايا ---------- */
const FOLLOW_DIST = 13.5, FOLLOW_POLAR = (54 * Math.PI) / 180;
S.follow = false;
let followBlend = 1.6, lastCur = -1;
S.setFollow = function (on) {
  S.follow = on;
  if (on) followBlend = 1.6;                 // تقريب سلس عند بدء المتابعة
  window.dispatchEvent(new Event('s3dfollow'));
};
const _off = new THREE.Vector3(), _sph = new THREE.Spherical(), _want = new THREE.Vector3();
function followStep(dt) {
  if (!S.follow || !G.players || !pawns[G.cur] || G.over || G.players[G.cur].bankrupt) return;
  const p = G.players[G.cur], pw = pawns[G.cur];
  // الضلع الذي يقف عليه البيدق: 0 سفلي، 1 يسار، 2 علوي، 3 يمين — والكاميرا خارج ذلك الضلع تنظر للداخل
  const phi = -Math.floor(p.pos / 10) % 4 * (Math.PI / 2);
  const side = Math.floor(p.pos / 10) % 4, IN = [[0, -1], [1, 0], [0, 1], [-1, 0]][side];
  _want.set(pw.pos.x + IN[0] * 1.3, 0, pw.pos.z + IN[1] * 1.3);              // البيدق في منتصف الشاشة تقريبًا (إزاحة طفيفة نحو الداخل)
  const k = 1 - Math.exp(-dt * 3.2);
  controls.target.lerp(_want, k);
  _off.copy(camera.position).sub(controls.target);
  _sph.setFromVector3(_off);
  _sph.theta += angDiff(_sph.theta, phi) * k;
  _sph.phi += (FOLLOW_POLAR - _sph.phi) * k;
  if (followBlend > 0) { _sph.radius += (FOLLOW_DIST - _sph.radius) * k; followBlend -= dt; }
  _sph.makeSafe();
  camera.position.copy(controls.target).add(_off.setFromSpherical(_sph));
}
S.pawnInfo = () => pawns.map((pw, id) => ({ id, model: !!pw.model, anim: pw.cur ? pw.cur.getClip().name : null, clips: Object.keys(pw.actions).length }));
S.cam = () => { const o = camera.position.clone().sub(controls.target), s = new THREE.Spherical().setFromVector3(o); return { theta: +s.theta.toFixed(2), phi: +s.phi.toFixed(2), r: +s.radius.toFixed(2), tx: +controls.target.x.toFixed(2), tz: +controls.target.z.toFixed(2), follow: S.follow }; };

/* ---------- الحلقة والكاميرا ---------- */
function frame(ms) {
  requestAnimationFrame(frame);
  if (!S.on) return;
  const dt = Math.min(0.05, (ms - lastT) / 1000); lastT = ms;
  if (G.players) pawns.forEach((pw, id) => updatePawn(pw, id, ms, dt));
  animateDice(ms, dt);
  tilesStep(ms, dt); sceneryStep(ms);
  tableCardStep(dt);
  followStep(dt);
  controls.update();
  renderer.render(scene, camera);
}

function applySize() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return false;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.setViewOffset(W, H, 0, Math.round((BOTTOM - TOP) / 2), W, H);
  camera.updateProjectionMatrix();
  return true;
}
// الوضع الافتراضي للكاميرا: اللوحة كاملة بين اللوحتين الجانبيتين
S.home = function () {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  const th = Math.tan((FOV * Math.PI) / 360);
  const availW = Math.max(320, W - 740), availH = Math.max(320, H - TOP - BOTTOM);
  const dH = (FRAME * H) / (2 * th * availW);
  const dV = (FRAME * Math.sin(HOME_ELEV) * H) / (2 * th * availH);
  const d = Math.max(dH, dV);
  camera.position.set(0, d * Math.sin(HOME_ELEV), d * Math.cos(HOME_ELEV));
  controls.target.set(0, 0, 0);
  controls.update();
  userMoved = false;
};

/* ---------- التقاط النقر على البلاط ---------- */
function pick(e) {
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(tiles.map(t => t.mesh), false)[0];
  return hit ? hit.object.userData.tile : -1;
}
function setHover(i) {
  if (hover >= 0) tiles[hover].topMat.emissive.setHex(0x000000);
  hover = i;
  if (i >= 0) tiles[i].topMat.emissive.setHex(0x7a5a10);
}


/* ---------- المحيط: جزيرة عشبية بأشجار وصخور وخيمة (Kenney Mini Forest، CC0) ---------- */
const SCENERY = {
  tree: { h: 3.3 }, 'tree-high': { h: 4.6 }, 'rocks-low': { w: 2.3 }, 'rocks-high': { w: 2.4 }, stones: { w: 1.1 }, plant: { h: 0.75 },
  'patch-grass': { w: 2.6, flat: true }, 'patch-dirt': { w: 2.2, flat: true }, tent: { h: 2.4 }, flag: { h: 2.6 }, target: { h: 1.7 }, fence: { w: 2.3 },
  'building-structure': { h: 3.2 }, 'building-roof': { h: 3.2, pair: true },
};
const sceneryMeshes = [];
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function buildScenery() {
  const R = 21;                                                       // نصف قطر الجزيرة
  const grass = new THREE.MeshStandardMaterial({ color: 0x5c9a47, roughness: 0.96 });
  const dirt = new THREE.MeshStandardMaterial({ color: 0xb8794a, roughness: 1 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.5, 72), [dirt, grass, dirt]);
  top.position.y = -0.25 + 0.012; top.receiveShadow = true; scene.add(top);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.35, R - 0.6, 0.9, 72), dirt);   // حافة ترابية سفلية
  lip.position.y = -0.95; lip.receiveShadow = true; scene.add(lip);
  const floor = scene.children.find(o => o.geometry && o.geometry.type === 'PlaneGeometry'); if (floor) floor.position.y = -1.6;


  // إطار خشبي دافئ حول اللوحة + ظل تلامس ناعم — ليفصلها عن العشب
  const wood = new THREE.MeshStandardMaterial({ color: 0xa8662c, roughness: 0.7 }), woodDk = new THREE.MeshStandardMaterial({ color: 0x7c4620, roughness: 0.8 });
  const rim = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.15, 12.8), [woodDk, woodDk, wood, woodDk, woodDk, woodDk]);
  rim.position.y = 0.075; rim.castShadow = rim.receiveShadow = true; scene.add(rim);
  const sc = mkCanvas(256, 256), sg = sc.getContext('2d'), gr = sg.createRadialGradient(128, 128, 70, 128, 128, 128);
  gr.addColorStop(0, 'rgba(15,35,10,.55)'); gr.addColorStop(1, 'rgba(15,35,10,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, 256, 256);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(17, 17), new THREE.MeshBasicMaterial({ map: canvasTex(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.renderOrder = 1; scene.add(shadow);

  const rand = rng(7);
  const pend = Object.keys(SCENERY).length; let loaded = {};
  Promise.all(Object.keys(SCENERY).map(n => new Promise(res => gltfLoader.load(`models/scene/${n}.glb`, g => { loaded[n] = g.scene; res(); }, undefined, () => res())))).then(() => {
    const make = (n, x, z, ry = 0, k = 1) => {
      const src = loaded[n]; if (!src) return null;
      const cfg = SCENERY[n], inner = src.clone(true), m = new THREE.Group(), box = new THREE.Box3().setFromObject(src), sz = box.getSize(new THREE.Vector3());
      const base = SCENERY['building-structure'];
      let sc = cfg.h ? cfg.h / sz.y : cfg.w / Math.max(sz.x, sz.z);
      if (cfg.pair) sc = base.h / (new THREE.Box3().setFromObject(loaded['building-structure']).getSize(new THREE.Vector3()).y);
      sc *= k * 0.58; m.add(inner);
      m.scale.setScalar(sc); m.position.set(x, -box.min.y * sc + 0.005, z); m.rotation.y = ry;
      if (cfg.flat) m.position.y = 0.014 + Math.random() * 0.002;
      m.traverse(o => { if (o.isMesh) { o.castShadow = !cfg.flat; o.receiveShadow = true; } });
      scene.add(m); sceneryMeshes.push(m); return m;
    };
    const free = (x, z, tall) => {
      if (Math.abs(x) < 7.9 && Math.abs(z) < 7.9) return false;                     // اللوحة
      if (Math.hypot(x - 8.2, z - 4.6) < 2.4) return false;                         // كومة الصكوك
      if (tall && z > 6 && Math.abs(x) < 10) return false;                         // لا حاجب أمام الكاميرا
      return Math.hypot(x, z) < R - 1.6;
    };
    const scatter = (n, count, r0, r1, tall, k0 = 0.85, k1 = 1.15) => {
      let placed = 0, guard = 0;
      while (placed < count && guard++ < 400) {
        const a = rand() * Math.PI * 2, r = r0 + rand() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!free(x, z, tall)) continue;
        make(n, x, z, rand() * Math.PI * 2, k0 + rand() * (k1 - k0)); placed++;
      }
    };
    scatter('patch-grass', 16, 8.6, 19, false); scatter('patch-dirt', 6, 8.8, 18, false);
    scatter('tree-high', 7, 11.5, 18.5, true); scatter('tree', 10, 10.5, 18.5, true);
    scatter('rocks-high', 3, 12, 18, true); scatter('rocks-low', 5, 9.5, 18, false); scatter('stones', 8, 8.6, 18, false);
    scatter('plant', 18, 8.4, 19, false);
    // مشاهد ثابتة
    make('tent', -10.6, -3.2, 0.7); make('tent', 11.4, -6.6, -0.9, 0.9);
    make('building-structure', -11.4, 5, 0.5); make('building-roof', -11.4, 5, 0.5);
    const fl = make('flag', 9.6, 7.6, 0, 1); if (fl) S.flag = fl;
    make('target', 11.2, 1.4, -1.3);
    for (let i = 0; i < 7; i++) make('fence', -6.6 + i * 2.2, -9.3, 0);
    for (let i = 0; i < 4; i++) make('fence', 9.4, -1 - i * 2.2, Math.PI / 2);
  });
}
function sceneryStep(ms) { if (S.flag) S.flag.rotation.y = Math.sin(ms / 900) * 0.18; }

S.init = function (cv) {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  } catch (err) {
    console.warn('WebGL غير متاح — سيُستعمل العرض المسطّح', err);
    return false;
  }
  canvas = cv;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia('(pointer:coarse)').matches ? 1.5 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 300);
  raycaster = new THREE.Raycaster();

  controls = new OrbitControls(camera, cv);
  Object.assign(controls, {
    enableDamping: true, dampingFactor: 0.08, screenSpacePanning: false,
    minDistance: 3.2, maxDistance: 34, minPolarAngle: 0.1, maxPolarAngle: Math.PI * 0.47,
    rotateSpeed: 0.7, zoomSpeed: 0.9, panSpeed: 0.8,
  });
  controls.addEventListener('start', () => { userMoved = true; });
  controls.addEventListener('change', () => {                   // لا تدع الكاميرا تضيع بعيدًا عن اللوحة
    controls.target.x = Math.max(-8, Math.min(8, controls.target.x));
    controls.target.z = Math.max(-8, Math.min(8, controls.target.z));
    controls.target.y = 0;
  });

  buildStatic(); buildScenery(); buildTiles(); buildDice();

  let down = null;
  cv.addEventListener('pointermove', e => {
    if (e.buttons) { if (down && S.follow && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) S.setFollow(false); return; }
    const i = pick(e); if (i !== hover) setHover(i); cv.style.cursor = i >= 0 ? 'pointer' : 'grab'; });
  cv.addEventListener('pointerleave', () => setHover(-1));
  cv.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, b: e.button }; });
  cv.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), b = down.b; down = null;
    if (moved > 6 || b !== 0) return;
    const i = pick(e); if (i >= 0) ACTIONS.deed(i);
  });

  applySize(); S.home();
  new ResizeObserver(() => { if (applySize() && !userMoved && !S.follow) S.home(); }).observe(cv);
  S.on = true;
  if (!started) { started = true; requestAnimationFrame(frame); }
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 30px Tajawal'), document.fonts.load('700 100px Amiri')])
      .then(() => { redrawAll(); drawCenter(centerTex.image); }).catch(() => {});
  }
  return true;
};
