'use strict';
/* Builds models/Bear.glb from tools/base/Bear.glb (the plain bear variant of the shared character):
   big tan muzzle with a large black nose, dark paws and ears, heavy brows.
   Run: node tools/make_bear.js */
const path = require('path');
const { openGlb, newPart, ellipsoid } = require('./glb');
const M = openGlb(path.join(__dirname, 'base', 'Bear.glb'));

M.setCol('Skin', '#8a5a3a');        // brown coat
M.setCol('Cream', '#d9b58c');       // belly + muzzle
M.setCol('Nose', '#1b1512');
const DARK = M.addMat('Dark', '#4a2d1c');

// dark paws and ears
const ear = (x, y) => (Math.abs(x) - 0.19) ** 2 + (y - 0.935) ** 2 < 0.078 ** 2;
M.split(M.primOf('Skin'), (x, y) => (y < 0.115 || Math.abs(x) > 0.325 || ear(x, y) ? DARK : undefined));

/* ---------- big muzzle + nose ---------- */
const MUZZLE_Y = 0.61, MC = [0, 0.685, 0.16], MS = [1.5, 1.4, 1.75], MSHIFT = [0, -0.012, 0];
const grow = p => { for (let c = 0; c < 3; c++) p[c] = MC[c] + (p[c] - MC[c]) * MS[c] + MSHIFT[c]; };
M.moveVerts(M.primOf('Cream'), p => (p[1] < MUZZLE_Y ? false : grow(p)));
const NC = [0, 0.73, 0.225], NT = [0, 0.73, 0.225]; grow(NT);
M.moveVerts(M.primOf('Nose'), p => { for (let c = 0; c < 3; c++) p[c] = NT[c] + (p[c] - NC[c]) * 2.1; });

/* ---------- brows (rigid on the Body bone) ---------- */
const brows = newPart();
for (const s of [1, -1]) ellipsoid(brows, [0.092 * s, 0.842, 0.168], [0.042, 0.013, 0.014], 10);
M.addPart(brows, DARK, 'Body');

M.save(path.join(__dirname, '..', 'models', 'Bear.glb'));
