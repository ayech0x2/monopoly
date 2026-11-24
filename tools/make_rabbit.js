'use strict';
/* Builds models/Rabbit.glb from tools/base/Rabbit.glb (the plain rabbit variant of the shared character):
   white coat with sandy ear tips and a pink belly, puffy cheeks with buck teeth, long feet and a big fluffy tail.
   Run: node tools/make_rabbit.js */
const path = require('path');
const { openGlb, newPart, ellipsoid } = require('./glb');
const M = openGlb(path.join(__dirname, 'base', 'Rabbit.glb'));

M.setCol('Skin', '#f3f0ea');        // white coat
M.setCol('Cream', '#fbf9f5');       // cheeks
M.setCol('Nose', '#ee8fa0');
const SAND = M.addMat('Sand', '#c9a987'), TOOTH = M.addMat('Tooth', '#ffffff'), BELLY = M.addMat('Belly', '#f7d3d8');

const TAIL_C = [0, 0.365, -0.25];
M.split(M.primOf('Skin'), (x, y) => (y > 1.12 ? SAND : undefined));                       // ear tips
M.moveVerts(M.primOf('Skin'), p => {
  if (p[2] < -0.225 && p[1] > 0.2 && p[1] < 0.55) {                                                        // fluffy tail (blended in at its base)
    const f = 1 + 0.45 * Math.min(1, (-0.225 - p[2]) / 0.04);
    for (let c = 0; c < 3; c++) p[c] = TAIL_C[c] + (p[c] - TAIL_C[c]) * f;
    return;
  }
  if (p[1] < 0.1 && p[2] > 0.02) { p[2] = 0.02 + (p[2] - 0.02) * (1 + 0.6 * (1 - p[1] / 0.1)); return; }   // long feet
  return false;
});

// puffy cheeks, bigger nose
const MUZZLE_Y = 0.61, MC = [0, 0.685, 0.165], MS = [1.55, 1.2, 1.2];
const grow = p => { for (let c = 0; c < 3; c++) p[c] = MC[c] + (p[c] - MC[c]) * MS[c]; };
M.split(M.primOf('Cream'), (x, y) => (y < MUZZLE_Y ? BELLY : undefined));
M.moveVerts(M.primOf('Cream'), p => (p[1] < MUZZLE_Y ? false : grow(p)));
const NC = [0, 0.73, 0.225], NT = [0, 0.73, 0.225]; grow(NT);
M.moveVerts(M.primOf('Nose'), p => { for (let c = 0; c < 3; c++) p[c] = NT[c] + (p[c] - NC[c]) * 1.3; });

const teeth = newPart();
for (const s of [1, -1]) ellipsoid(teeth, [0.015 * s, 0.632, 0.218], [0.014, 0.028, 0.009], 8);
M.addPart(teeth, TOOTH, 'Body');

M.save(path.join(__dirname, '..', 'models', 'Rabbit.glb'));
