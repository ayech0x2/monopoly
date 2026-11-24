'use strict';
/* Builds models/Monkey.glb from tools/base/Mouse.glb (round side ears + long thin tail of the shared character):
   brown coat, tan face mask round the eyes, big tan muzzle with nostrils and a smile, tan ears, hands, feet and belly.
   Run: node tools/make_monkey.js */
const path = require('path');
const { openGlb, newPart, ellipsoid, taperTube } = require('./glb');
const M = openGlb(path.join(__dirname, 'base', 'Mouse.glb'));

const TAN_HEX = '#f3cfae';
M.setCol('Skin', '#8f4f17');        // brown coat
M.setCol('Cream', TAN_HEX);         // belly + muzzle
M.setCol('Nose', TAN_HEX);
M.setCol('InnerEar', '#ecc09d');
const TAN = M.addMat('Tan', TAN_HEX), LINE = M.addMat('Line', '#6b3a22');

M.split(M.primOf('Skin'), (x, y) => (y < 0.1 || Math.abs(x) > 0.335 ? TAN : undefined));   // feet + hands

// big muzzle sitting under the eyes; the old nose bump flattens into it
const MUZZLE_Y = 0.61, MC = [0, 0.685, 0.16], MS = [1.5, 1.45, 1.5], MSHIFT = [0, -0.03, 0];
const grow = p => { for (let c = 0; c < 3; c++) p[c] = MC[c] + (p[c] - MC[c]) * MS[c] + MSHIFT[c]; };
M.moveVerts(M.primOf('Cream'), p => (p[1] < MUZZLE_Y ? false : grow(p)));
M.moveVerts(M.primOf('Nose'), p => { grow(p); p[2] -= 0.02; });

// mask round the eyes: two shallow domes on the face, the eyes poke through
const mask = newPart();
for (const s of [1, -1]) ellipsoid(mask, [0.074 * s, 0.795, 0.128], [0.094, 0.086, 0.053], 16);
M.addPart(mask, TAN, 'Body');

const face = newPart();
for (const s of [1, -1]) {
  ellipsoid(face, [0.02 * s, 0.7, 0.258], [0.008, 0.012, 0.007], 8);                       // nostrils
  taperTube(face, [[0, 0.628, 0.252], [0.04 * s, 0.628, 0.247], [0.082 * s, 0.648, 0.215]], 0.0065, 8, 6);   // smile
}
M.addPart(face, LINE, 'Body');

M.save(path.join(__dirname, '..', 'models', 'Monkey.glb'));
