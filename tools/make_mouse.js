'use strict';
/* Builds models/Mouse.glb from tools/base/Mouse.glb (the plain mouse variant of the shared character):
   grey-brown coat, pink hands / feet / tail, pointed snout with a pink nose, buck teeth and whiskers.
   Run: node tools/make_mouse.js */
const path = require('path');
const { openGlb, newPart, ellipsoid, taperTube } = require('./glb');
const M = openGlb(path.join(__dirname, 'base', 'Mouse.glb'));

M.setCol('Skin', '#b5a595');        // grey-brown coat
M.setCol('Cream', '#f1ede6');       // belly + snout
M.setCol('Nose', '#ee8fa0');
const PINK = M.addMat('Pink', '#f2b3b4'), TOOTH = M.addMat('Tooth', '#fbfaf5'), WHISKER = M.addMat('Whisker', '#4a4540');

// pink hands, feet and tail
M.split(M.primOf('Skin'), (x, y, z) => (y < 0.1 || Math.abs(x) > 0.335 || z < -0.235 ? PINK : undefined));

/* ---------- pointed snout ---------- */
const MUZZLE_Y = 0.61, Z0 = 0.156, ZL = 0.071, STRETCH = 1.75, YC = 0.69;
const snout = p => {
  const t = Math.min(1, Math.max(0, (p[2] - Z0) / ZL));
  p[0] *= 1.15 - 0.45 * t;
  p[1] = YC + (p[1] - YC) * (1.1 - 0.35 * t);
  p[2] = Z0 + (p[2] - Z0) * STRETCH;
};
M.moveVerts(M.primOf('Cream'), p => (p[1] < MUZZLE_Y ? false : snout(p)));
const NC = [0, 0.73, 0.225], NT = [0, 0.73, 0.225]; snout(NT);
M.moveVerts(M.primOf('Nose'), p => { for (let c = 0; c < 3; c++) p[c] = NT[c] + (p[c] - NC[c]) * 1.35; });

/* ---------- buck teeth + whiskers (rigid on the Body bone) ---------- */
const teeth = newPart();
for (const s of [1, -1]) ellipsoid(teeth, [0.0135 * s, 0.642, 0.236], [0.0125, 0.024, 0.009], 8);
M.addPart(teeth, TOOTH, 'Body');
const whiskers = newPart();
for (const s of [1, -1]) for (const dy of [0.045, 0, -0.045])
  taperTube(whiskers, [[0.035 * s, 0.685, 0.235], [0.12 * s, 0.69 + dy * 0.5, 0.25], [0.225 * s, 0.685 + dy, 0.215]], 0.0055, 8, 6);
M.addPart(whiskers, WHISKER, 'Body');

M.save(path.join(__dirname, '..', 'models', 'Mouse.glb'));
