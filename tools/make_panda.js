'use strict';
/* Builds models/Panda.glb from tools/base/Bear.glb:
   white coat with black ears, eye patches, arms + shoulder band and legs; big white muzzle with a black nose.
   Run: node tools/make_panda.js */
const path = require('path');
const { openGlb, newPart, ellipsoid } = require('./glb');
const M = openGlb(path.join(__dirname, 'base', 'Bear.glb'));

M.setCol('Skin', '#f6f6f3');        // white coat
M.setCol('Cream', '#fdfdfb');       // belly + muzzle
M.setCol('Nose', '#19191c');
M.setCol('InnerEar', '#f5a8c2');
const BLACK = M.addMat('Black', '#1c1c20'), WHITE = M.addMat('White', '#ffffff');

const ear = (x, y) => (Math.abs(x) - 0.19) ** 2 + (y - 0.935) ** 2 < 0.08 ** 2;
M.split(M.primOf('Skin'), (x, y, z) => {
  const ax = Math.abs(x);
  if (y < 0.215 && z > -0.2) return BLACK;                                  // legs (not the tail)
  if (ear(x, y)) return BLACK;
  if (ax > 0.27 && y < 0.66) return BLACK;                                  // arms
  if (y > 0.5 && y < 0.625 + 0.02 * Math.cos(ax * 9)) return BLACK;         // band over the shoulders and chest
});
// keep the top of the belly patch inside the band black too
M.split(M.primOf('Cream'), (x, y) => (y > 0.5 && y < 0.61 ? BLACK : undefined));

// big muzzle + nose
const MUZZLE_Y = 0.61, MC = [0, 0.685, 0.16], MS = [1.45, 1.35, 1.6], MSHIFT = [0, -0.008, 0];
const grow = p => { for (let c = 0; c < 3; c++) p[c] = MC[c] + (p[c] - MC[c]) * MS[c] + MSHIFT[c]; };
M.moveVerts(M.primOf('Cream'), p => (p[1] < MUZZLE_Y ? false : grow(p)));
const NC = [0, 0.73, 0.225], NT = [0, 0.73, 0.225]; grow(NT);
M.moveVerts(M.primOf('Nose'), p => { for (let c = 0; c < 3; c++) p[c] = NT[c] + (p[c] - NC[c]) * 1.9; });

// eye patches: slanted shallow domes on the face (lower at the outside), with white rings so the eyes show
const patches = newPart(), rings = newPart();
for (const s of [1, -1]) {
  ellipsoid(patches, [0.094 * s, 0.782, 0.131], [0.076, 0.056, 0.055], 16, -0.55 * s);
  ellipsoid(rings, [0.08 * s, 0.79, 0.178], [0.032, 0.032, 0.0135], 12);
}
M.moveVerts(M.primOf('Eye'), p => { p[2] += 0.008; });                       // eyes sit on top of the rings
M.addPart(patches, BLACK, 'Body');
M.addPart(rings, WHITE, 'Body');

M.save(path.join(__dirname, '..', 'models', 'Panda.glb'));
