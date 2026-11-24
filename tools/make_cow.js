'use strict';
/* Builds models/Cow.glb from tools/base/Pig.glb (same body, rig and animation set):
   white coat + black spots, dark hooves/hands, big pink muzzle, horns and an udder.
   Run: node tools/make_cow.js */
const path = require('path');
const { openGlb, newPart, ellipsoid, taperTube } = require('./glb');
const M = openGlb(path.join(__dirname, 'base', 'Pig.glb'));

M.setCol('Skin', '#1d1d20');        // spots
M.setCol('Cream', '#f6b9c1');       // muzzle
M.setCol('Nose', '#e58f9d');        // nostril pad
M.setCol('InnerEar', '#f2a5b0');
const COAT = M.addMat('Coat', '#f4f3ef'), HOOF = M.addMat('Hoof', '#1d1d20'), HORN = M.addMat('Horn', '#6b4a3a'), UDDER = M.addMat('Udder', '#f6b9c1');

// spots: blobs in rest-pose space [x, y, z, radius]
const SPOTS = [
  [0.17, 0.90, 0.06, 0.135], [-0.25, 0.53, 0.08, 0.125], [0.23, 0.44, 0.10, 0.105], [0.17, 0.21, 0.02, 0.085],
  [0.04, 0.66, -0.20, 0.15], [-0.16, 0.36, -0.18, 0.115], [-0.13, 0.90, -0.13, 0.095], [0.20, 0.70, -0.12, 0.08],
];
const inSpot = (x, y, z) => SPOTS.some(([sx, sy, sz, r]) => {
  const dx = x - sx, dy = y - sy, dz = z - sz;
  const wob = 1 + 0.16 * Math.sin(17 * Math.atan2(dy, dx) * 0.3 + sx * 40) * Math.cos(9 * dz + sy * 30);   // wavy edge
  return dx * dx + dy * dy + dz * dz < r * r * wob * wob;
});
// fur: hooves and hands dark, spots keep "Skin", the rest is the white coat
M.split(M.primOf('Skin'), (x, y, z) => (y < 0.105 || Math.abs(x) > 0.315 ? HOOF : Math.abs(x) < 0.265 && inSpot(x, y, z) ? undefined : COAT));

// "Cream" = belly patch + muzzle: the belly joins the coat, the muzzle stays pink and grows
const MUZZLE_Y = 0.61, MC = [0, 0.695, 0.165], MS = [1.6, 1.38, 1.3], MSHIFT = [0, -0.022, 0.004];
const grow = p => { for (let c = 0; c < 3; c++) p[c] = MC[c] + (p[c] - MC[c]) * MS[c] + MSHIFT[c]; };
M.split(M.primOf('Cream'), (x, y) => (y < MUZZLE_Y ? COAT : undefined));
M.moveVerts(M.primOf('Cream'), p => (p[1] < MUZZLE_Y ? false : grow(p)));
M.moveVerts(M.primOf('Nose'), grow);

// new parts, rigid on the Body bone
const horns = newPart();
for (const s of [1, -1]) taperTube(horns, [[0.105 * s, 0.925, 0.03], [0.185 * s, 1.01, 0.03], [0.125 * s, 1.085, 0.045]], 0.036);
M.addPart(horns, HORN, 'Body');
const udder = newPart();
ellipsoid(udder, [0, 0.285, 0.135], [0.098, 0.088, 0.085]);
for (const [x, y] of [[-0.045, 0.30], [0.045, 0.30], [-0.04, 0.235], [0.04, 0.235]])
  ellipsoid(udder, [x, y - 0.012, 0.135 + 0.085 * Math.sqrt(Math.max(0, 1 - (x / 0.098) ** 2 - ((y - 0.285) / 0.088) ** 2)) + 0.006], [0.02, 0.024, 0.022], 10);
M.addPart(udder, UDDER, 'Body');

M.json.nodes.forEach(n => { if (n.name === 'Pig') n.name = 'Cow'; });
M.save(path.join(__dirname, '..', 'models', 'Cow.glb'));
