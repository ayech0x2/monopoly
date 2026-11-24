'use strict';
/* Builds models/Lion.glb from tools/base/Cat.glb:
   golden coat, short round ears, puffy rust mane framing the whole face, tufted tail, big cream muzzle with whiskers.
   Run: node tools/make_lion.js */
const path = require('path');
const { openGlb, newPart, ellipsoid, taperTube } = require('./glb');
const M = openGlb(path.join(__dirname, 'base', 'Cat.glb'));

M.setCol('Skin', '#f7b31c');        // golden coat
M.setCol('Cream', '#fbf2d8');       // muzzle
M.setCol('Nose', '#f08a9c');
M.setCol('InnerEar', '#f3b1bd');
const MANE = M.addMat('Mane', '#c6481a'), LINE = M.addMat('Line', '#4a2c12'), SKIN = M.matIdx('Skin');

// short round ears: the cat's tall points are squashed down (flattening the tips) and widened
const EAR_Y = 0.93, EAR_H = 0.09;
const roundEar = p => {
  if (p[1] < EAR_Y || Math.abs(p[0]) < 0.1) return false;
  const k = (p[1] - EAR_Y) / 0.172;                                          // 0 at the base, 1 at the old tip
  p[1] = EAR_Y + EAR_H * Math.tanh((p[1] - EAR_Y) / EAR_H * 1.25);
  p[0] = Math.sign(p[0]) * (0.17 + (Math.abs(p[0]) - 0.17) * (1.1 + 0.55 * k));
};
M.moveVerts(M.primOf('Skin'), roundEar);
M.moveVerts(M.primOf('InnerEar'), roundEar);

// tail tuft: the last stretch of the tail turns rust and swells
const isTuft = p => p[2] < -0.24 && p[1] > 0.74 && p[2] > -0.49;
M.split(M.primOf('Skin'), (x, y, z) => (isTuft([x, y, z]) ? MANE : undefined));
const tip = [0, 0, 0]; let n = 0;
M.moveVerts(M.primOf('Skin'), p => { if (isTuft(p)) { for (let c = 0; c < 3; c++) tip[c] += p[c]; n++; } return false; });
tip.forEach((_, c) => { tip[c] /= n; });
M.moveVerts(M.primOf('Skin'), p => {
  if (!isTuft(p)) return false;
  const f = 1 + 0.7 * Math.min(1, (p[1] - 0.74) / 0.04);                     // blended in where the tuft starts
  for (let c = 0; c < 3; c++) p[c] = tip[c] + (p[c] - tip[c]) * f;
});

// no belly patch; wide muzzle
const MUZZLE_Y = 0.61, MC = [0, 0.685, 0.165], MS = [1.65, 1.4, 1.4];
const grow = p => { for (let c = 0; c < 3; c++) p[c] = MC[c] + (p[c] - MC[c]) * MS[c]; };
M.split(M.primOf('Cream'), (x, y) => (y < MUZZLE_Y ? SKIN : undefined));
M.moveVerts(M.primOf('Cream'), p => (p[1] < MUZZLE_Y ? false : grow(p)));
const NC = [0, 0.73, 0.225], NT = [0, 0.73, 0.225]; grow(NT);
M.moveVerts(M.primOf('Nose'), p => { for (let c = 0; c < 3; c++) p[c] = NT[c] + (p[c] - NC[c]) * 1.7; });

// mane: a ring of puffs framing the face (rigid on the Body bone). It sits behind the ears at the top
// and swings forward at the bottom so it shows under the chin, in front of the chest.
const mane = newPart(), PUFFS = 14;
for (let i = 0; i < PUFFS; i++) {
  const a = 2 * Math.PI * (i + 0.5) / PUFFS, s = Math.sin(a), low = Math.max(0, -s);
  ellipsoid(mane, [0.262 * Math.cos(a), 0.785 + (s > 0 ? 0.235 : 0.25) * s, -0.045 - 0.105 * Math.max(0, s) + 0.24 * low * low],
    [0.098, 0.098 - 0.012 * low, 0.105 - 0.012 * low], 14);
}
M.addPart(mane, MANE, 'Body');

const whiskers = newPart();
for (const s of [1, -1]) for (const dy of [0.035, 0, -0.035])
  taperTube(whiskers, [[0.09 * s, 0.685 + dy * 0.3, 0.215], [0.17 * s, 0.69 + dy * 0.7, 0.225], [0.25 * s, 0.68 + dy, 0.19]], 0.0055, 8, 6);
M.addPart(whiskers, LINE, 'Body');

M.save(path.join(__dirname, '..', 'models', 'Lion.glb'));
