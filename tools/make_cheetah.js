'use strict';
/* Builds models/Cheetah.glb from tools/base/Cat.glb:
   golden coat with dark spots, white muzzle / chest / belly / hands / feet, dark nose, ears and whiskers.
   Run: node tools/make_cheetah.js */
const path = require('path');
const { openGlb, newPart, taperTube } = require('./glb');
const M = openGlb(path.join(__dirname, 'base', 'Cat.glb'));

const DARK_HEX = '#4b2a12';
M.setCol('Skin', '#f59c1c');        // golden coat
M.setCol('Cream', '#fbf7ea');       // belly + muzzle
M.setCol('Nose', '#5b2415');
M.setCol('InnerEar', '#3d2414');
const SPOT = M.addMat('Spot', DARK_HEX), WHITE = M.addMat('White', '#fbf7ea');

// scattered spots: one jittered blob per cell of a 3D grid
const CELL = 0.082, rnd = (i, j, k, n) => { const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + n * 19.19) * 43758.5453; return h - Math.floor(h); };
const inSpot = (x, y, z) => {
  const ci = Math.floor(x / CELL), cj = Math.floor(y / CELL), ck = Math.floor(z / CELL);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let k = ck - 1; k <= ck + 1; k++) {
    const r = 0.017 + 0.011 * rnd(i, j, k, 3);
    const dx = x - (i + 0.2 + 0.6 * rnd(i, j, k, 0)) * CELL, dy = (y - (j + 0.2 + 0.6 * rnd(i, j, k, 1)) * CELL) * 0.8, dz = z - (k + 0.2 + 0.6 * rnd(i, j, k, 2)) * CELL;
    if (dx * dx + dy * dy + dz * dz < r * r) return true;
  }
  return false;
};
M.split(M.primOf('Skin'), (x, y, z) => {
  const ax = Math.abs(x);
  if (y < 0.1 || ax > 0.345) return WHITE;                                   // feet + hands
  if (z > 0.1 && ax < 0.105 && y > 0.5 && y < 0.67) return WHITE;            // chest joins belly and muzzle
  if (z < -0.24 && y > 0.74 && z > -0.47) return SPOT;                       // dark tail tip
  if (z > 0.1 && ax < 0.15 && y > 0.6 && y < 0.84) return;                   // clean face round the eyes and muzzle
  if (inSpot(x, y, z)) return SPOT;
});

// wide muzzle, bigger nose
const MUZZLE_Y = 0.61, MC = [0, 0.685, 0.165], MS = [1.45, 1.25, 1.3];
const grow = p => { for (let c = 0; c < 3; c++) p[c] = MC[c] + (p[c] - MC[c]) * MS[c]; };
M.moveVerts(M.primOf('Cream'), p => (p[1] < MUZZLE_Y ? false : grow(p)));
const NC = [0, 0.73, 0.225], NT = [0, 0.73, 0.225]; grow(NT);
M.moveVerts(M.primOf('Nose'), p => { for (let c = 0; c < 3; c++) p[c] = NT[c] + (p[c] - NC[c]) * 1.5; });

const whiskers = newPart();
for (const s of [1, -1]) for (const dy of [0.04, 0, -0.04])
  taperTube(whiskers, [[0.09 * s, 0.685 + dy * 0.3, 0.215], [0.17 * s, 0.69 + dy * 0.7, 0.225], [0.255 * s, 0.68 + dy, 0.19]], 0.0055, 8, 6);
M.addPart(whiskers, SPOT, 'Body');

M.save(path.join(__dirname, '..', 'models', 'Cheetah.glb'));
