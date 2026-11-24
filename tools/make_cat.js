'use strict';
/* Builds models/Cat.glb from tools/base/Cat.glb (the plain cat variant of the shared character):
   orange tabby stripes (forehead, back, sides, tail rings), white mittens / socks / tail tip, white muzzle and whiskers.
   Run: node tools/make_cat.js */
const path = require('path');
const { openGlb, newPart, taperTube } = require('./glb');
const M = openGlb(path.join(__dirname, 'base', 'Cat.glb'));

M.setCol('Skin', '#e68a3e');        // orange coat
M.setCol('Cream', '#f8f3e8');       // belly + muzzle
const STRIPE = M.addMat('Stripe', '#b3541c'), WHITE = M.addMat('White', '#f8f3e8');

M.split(M.primOf('Skin'), (x, y, z) => {
  const ax = Math.abs(x);
  if (y < 0.1 || ax > 0.345) return WHITE;                                  // socks + mittens
  if (z < -0.24) {                                                          // tail: white tip, rings
    if (y > 0.74 && z > -0.47) return WHITE;
    return Math.sin((y - z * 0.6) * 46) > 0.25 ? STRIPE : undefined;
  }
  if (z > 0.02 && y > 0.86 && y < 0.99 - 0.25 * ax) {                       // three forehead stripes
    const d = Math.min(Math.abs(x), Math.abs(ax - 0.075));
    if (d < 0.013 && (ax < 0.03 || y > 0.885)) return STRIPE;
  }
  // bands across the back that thin out as they wrap round the sides
  if (z < 0.04 && ax < 0.3 && y > 0.3 && y < 0.88 && Math.sin(y * 44 + 0.6) > 0.3 + 3 * Math.max(0, z + 0.12)) return STRIPE;
});

// a slightly wider muzzle
const MUZZLE_Y = 0.61;
M.moveVerts(M.primOf('Cream'), p => { if (p[1] < MUZZLE_Y) return false; p[0] *= 1.25; });

const whiskers = newPart();
for (const s of [1, -1]) for (const dy of [0.03, -0.03])
  taperTube(whiskers, [[0.06 * s, 0.685, 0.215], [0.15 * s, 0.69 + dy * 0.6, 0.235], [0.25 * s, 0.685 + dy, 0.2]], 0.0055, 8, 6);
M.addPart(whiskers, WHITE, 'Body');

M.save(path.join(__dirname, '..', 'models', 'Cat.glb'));
