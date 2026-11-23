'use strict';
/* ==========================================================
   المؤثرات الصوتية: تُولَّد بـ WebAudio (بلا ملفات). sfxSync() تقارن الحالة الجديدة بالسابقة
   وتُشغّل الصوت المناسب؛ تُستدعى من render() عند العميل فقط.
   ========================================================== */
const SFX = { on: (() => { try { return localStorage.getItem('aqMute') !== '1'; } catch { return true; } })(), ctx: null, prev: null, lastStep: 0 };

function sfxCtx() {
  if (!SFX.ctx) { try { SFX.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (SFX.ctx.state === 'suspended') SFX.ctx.resume().catch(() => {});
  return SFX.ctx;
}
// نغمة: تردد، مدة، شكل الموجة، حجم، تأخير، انزلاق التردد
function tone(f, dur = 0.15, type = 'sine', vol = 0.18, delay = 0, slide = 0) {
  if (!SFX.on) return;
  const c = sfxCtx(); if (!c) return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur = 0.1, vol = 0.12, delay = 0, hp = 1500) {
  if (!SFX.on) return;
  const c = sfxCtx(); if (!c) return;
  const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + delay;
  s.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination); s.start(t);
}

const SOUND = {
  click: () => tone(660, 0.06, 'triangle', 0.1),
  roll: () => { for (let i = 0; i < 7; i++) noise(0.05, 0.14, i * 0.08, 900 + i * 150); },
  land: () => { tone(160, 0.12, 'sine', 0.25, 0, -80); noise(0.06, 0.18, 0, 600); tone(200, 0.1, 'sine', 0.2, 0.1, -80); },
  step: () => tone(420 + Math.random() * 60, 0.07, 'triangle', 0.09),
  buy: () => { tone(523, 0.12, 'square', 0.1); tone(659, 0.12, 'square', 0.1, 0.1); tone(784, 0.22, 'square', 0.1, 0.2); },
  gain: () => { tone(988, 0.08, 'sine', 0.16); tone(1319, 0.18, 'sine', 0.16, 0.07); },
  pay: () => { tone(392, 0.12, 'sawtooth', 0.09); tone(294, 0.2, 'sawtooth', 0.09, 0.1); },
  card: () => { noise(0.12, 0.16, 0, 2500); tone(740, 0.15, 'triangle', 0.12, 0.08); },
  jail: () => { tone(220, 0.25, 'square', 0.12, 0, -90); tone(110, 0.4, 'square', 0.12, 0.2); },
  turn: () => { tone(784, 0.1, 'sine', 0.16); tone(1047, 0.2, 'sine', 0.16, 0.1); },
  auction: () => { tone(880, 0.07, 'square', 0.08); tone(880, 0.07, 'square', 0.08, 0.12); },
  build: () => { noise(0.05, 0.2, 0, 400); tone(300, 0.1, 'square', 0.1, 0.05); tone(450, 0.14, 'square', 0.1, 0.12); },
  bankrupt: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.28, 'sawtooth', 0.12, i * 0.2)); },
  win: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, i * 0.14)); },
  timeout: () => { tone(300, 0.12, 'square', 0.1); tone(240, 0.18, 'square', 0.1, 0.12); },
};
const sfx = n => { try { SOUND[n] && SOUND[n](); } catch { /* ignore */ } };

function sfxSync() {
  const pr = SFX.prev;
  const now = {
    cur: G.cur, rolling: !!G.rolling, phase: G.phase, over: G.over, dice: G.dice.join(),
    owned: G.owner.filter(o => o !== null).length, houses: G.houses.reduce((a, b) => a + b, 0),
    pos: G.players.map(p => p.pos), cash: G.players.map(p => p.cash), jail: G.players.map(p => p.jail),
    bank: G.players.map(p => p.bankrupt), log: G.log[0],
  };
  SFX.prev = now;
  if (!pr) return;
  const me = typeof viewerId === 'function' ? viewerId() : G.cur;
  if (now.over && !pr.over) return sfx('win');
  if (now.rolling && !pr.rolling) sfx('roll');
  if (!now.rolling && pr.rolling) sfx('land');
  now.pos.forEach((p, i) => { if (p !== pr.pos[i]) { const t = performance.now(); if (t - SFX.lastStep > 150) { SFX.lastStep = t; sfx('step'); } } });
  if (now.owned > pr.owned) sfx('buy');
  else if (now.houses !== pr.houses) sfx('build');
  now.bank.forEach((b, i) => { if (b && !pr.bank[i]) sfx('bankrupt'); });
  now.jail.forEach((j, i) => { if (j && !pr.jail[i]) sfx('jail'); });
  if (now.phase === 'card' && pr.phase !== 'card') sfx('card');
  if (now.phase === 'auction' && pr.phase !== 'auction') sfx('auction');
  const d = now.cash[me] - pr.cash[me];
  if (d > 0) sfx('gain'); else if (d < 0 && now.owned === pr.owned && now.houses === pr.houses) sfx('pay');
  if (now.cur !== pr.cur) { if (now.log && /انتهت مهلة/.test(pr.log || '') ) sfx('timeout'); else if (now.cur === me) sfx('turn'); }
}

// صوت نقرة على الأزرار + أول تفاعل يفتح السياق الصوتي
document.addEventListener('pointerdown', e => { sfxCtx(); if (e.target.closest && e.target.closest('button,[data-act]')) sfx('click'); }, true);
