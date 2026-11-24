'use strict';
/* Builds models/Pig.glb from tools/base/Pig.glb (the plain pig variant of the shared character):
   soft pink coat, big snout with nostrils, dark trotters and rosy cheeks.
   Run: node tools/make_pig.js */
const path = require('path');
const { openGlb, newPart, ellipsoid } = require('./glb');
const M = openGlb(path.join(__dirname, 'base', 'Pig.glb'));

M.setCol('Skin', '#f3a9b4');        // pink coat
M.setCol('Cream', '#f9cdd3');       // belly + snout
M.setCol('Nose', '#ee8da0');        // snout disc
const TROTTER = M.addMat('Trotter', '#8a5560'), BLUSH = M.addMat('Blush', '#ee7f97'), NOSTRIL = M.addMat('Nostril', '#a84f66');

M.split(M.primOf('Skin'), (x, y, z) => {
  const ax = Math.abs(x);
  if (y < 0.085 || ax > 0.36) return TROTTER;
  if (z > 0.1 && ((ax - 0.165) / 0.048) ** 2 + ((y - 0.7) / 0.036) ** 2 < 1) return BLUSH;   // rosy cheeks
});

// big snout
const MUZZLE_Y = 0.61, MC = [0, 0.7, 0.17], MS = [1.5, 1.4, 1.5];
const grow = p => { for (let c = 0; c < 3; c++) p[c] = MC[c] + (p[c] - MC[c]) * MS[c]; };
M.moveVerts(M.primOf('Cream'), p => (p[1] < MUZZLE_Y ? false : grow(p)));
M.moveVerts(M.primOf('Nose'), grow);

const nostrils = newPart(), NZ = [0, 0.709, 0.247]; grow(NZ);
for (const s of [1, -1]) ellipsoid(nostrils, [0.024 * s, NZ[1], NZ[2] - 0.004], [0.011, 0.017, 0.008], 8);
M.addPart(nostrils, NOSTRIL, 'Body');

M.save(path.join(__dirname, '..', 'models', 'Pig.glb'));
