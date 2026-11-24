'use strict';
/* Builds models/Wolf.glb from tools/base/Wolf.glb (the plain one-colour wolf variant of the shared character):
   long snout, dark back / head cap / ears / tail, light cheek ruff with fur tufts, light socks and tail tip.
   Run: node tools/make_wolf.js */
const path = require('path');
const { openGlb, newPart, taperTube } = require('./glb');
const M = openGlb(path.join(__dirname, 'base', 'Wolf.glb'));

M.setCol('Skin', '#8b8f96');        // grey coat
M.setCol('Cream', '#ebe9e4');       // belly + snout
M.setCol('Nose', '#17171a');
const DARK = M.addMat('Dark', '#4b4f57'), LIGHT = M.addMat('Light', '#ebe9e4');

/* ---------- coat pattern ---------- */
const cheek = (x, y) => ((Math.abs(x) - 0.12) / 0.15) ** 2 + ((y - 0.69) / 0.115) ** 2 < 1;
M.split(M.primOf('Skin'), (x, y, z) => {
  const ax = Math.abs(x);
  if (y < 0.115) return LIGHT;                                             // socks
  if (z < -0.3 && y > 0.66) return LIGHT;                                  // tail tip
  if (z > 0 && y < 0.8 && cheek(x, y)) return LIGHT;                       // cheek ruff
  if (y > 0.805 + 0.5 * ax) return DARK;                                   // head cap (peak between the eyes) + ears
  if (ax < 0.3 && y > 0.3 && z < -0.03 + 0.025 * Math.sin(y * 34 + ax * 20)) return DARK;   // back + tail
});

/* ---------- long snout ---------- */
const MUZZLE_Y = 0.61, Z0 = 0.156, ZL = 0.071, STRETCH = 2.6, YC = 0.685;
const snout = p => {
  const t = Math.min(1, Math.max(0, (p[2] - Z0) / ZL));
  p[0] *= 1.35 - 0.45 * t;
  p[1] = YC + (p[1] - YC) * (1.3 - 0.4 * t);
  p[2] = Z0 + (p[2] - Z0) * STRETCH;
};
M.moveVerts(M.primOf('Cream'), p => (p[1] < MUZZLE_Y ? false : snout(p)));
const NC = [0, 0.73, 0.225], NT = [0, 0.73, 0.225]; snout(NT);              // the nose rides the snout tip, bigger
M.moveVerts(M.primOf('Nose'), p => { for (let c = 0; c < 3; c++) p[c] = NT[c] + (p[c] - NC[c]) * 1.75; });

/* ---------- cheek fur tufts (rigid on the Body bone) ---------- */
const tufts = newPart();
for (const s of [1, -1]) for (const [by, ty, tx] of [[0.765, 0.79, 0.285], [0.72, 0.72, 0.31], [0.675, 0.65, 0.29]])
  taperTube(tufts, [[0.18 * s, by, 0.06], [(0.18 + tx) / 2 * s, (by + ty) / 2 + 0.01, 0.06], [tx * s, ty, 0.045]], 0.05, 10, 12);
M.addPart(tufts, LIGHT, 'Body');

M.save(path.join(__dirname, '..', 'models', 'Wolf.glb'));
