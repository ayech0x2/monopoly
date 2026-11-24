'use strict';
/* Small helpers for editing the character models (.glb) without Blender:
   re-split a primitive's triangles between materials, move vertices, add rigid parts on a bone.
   Used by make_cow.js and make_wolf.js. */
const fs = require('fs');

function openGlb(file) {
  const glb = fs.readFileSync(file);
  const jsonLen = glb.readUInt32LE(12), json = JSON.parse(glb.slice(20, 20 + jsonLen));
  let bin = Buffer.from(glb.slice(20 + jsonLen + 8));
  const mats = json.materials, prims = json.meshes[0].primitives;

  /* ---------- accessors ---------- */
  const readF32 = i => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], n = a.type === 'VEC3' ? 3 : 4;
    const off = (bv.byteOffset || 0) + (a.byteOffset || 0), out = new Float32Array(a.count * n);
    for (let k = 0; k < out.length; k++) out[k] = bin.readFloatLE(off + k * 4);
    return out;
  };
  const writeF32 = (i, out) => {                       // write positions back and refresh min/max
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], off = (bv.byteOffset || 0) + (a.byteOffset || 0);
    for (let k = 0; k < out.length; k++) bin.writeFloatLE(out[k], off + k * 4);
    Object.assign(a, bounds(out));
  };
  const readIdx = i => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], off = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = new Uint32Array(a.count);
    for (let k = 0; k < a.count; k++) out[k] = a.componentType === 5125 ? bin.readUInt32LE(off + k * 4) : bin.readUInt16LE(off + k * 2);
    return out;
  };
  const addView = (buf, target) => {
    const pad = (4 - bin.length % 4) % 4;
    bin = Buffer.concat([bin, Buffer.alloc(pad), buf]);
    json.bufferViews.push({ buffer: 0, byteOffset: bin.length - buf.length, byteLength: buf.length, ...(target ? { target } : {}) });
    return json.bufferViews.length - 1;
  };
  const addAccessor = (typed, type, componentType, target, minmax) => {
    const bufferView = addView(Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength), target);
    const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
    json.accessors.push({ bufferView, componentType, count: typed.length / n, type, ...(minmax || {}) });
    return json.accessors.length - 1;
  };
  const addIndices = list => addAccessor(Uint32Array.from(list), 'SCALAR', 5125, 34963);

  /* ---------- materials ---------- */
  const matIdx = name => mats.findIndex(m => m.name === name);
  const setCol = (name, hex) => { mats[matIdx(name)].pbrMetallicRoughness.baseColorFactor = [...lin(hex), 1]; };
  const addMat = (name, hex) => {                      // same finish as the fur, another colour
    const m = JSON.parse(JSON.stringify(mats[matIdx('Skin')]));
    m.name = name; m.pbrMetallicRoughness.baseColorFactor = [...lin(hex), 1];
    mats.push(m); return mats.length - 1;
  };
  const primOf = name => prims.find(p => p.material === matIdx(name));

  /* Re-split one primitive's triangles: pick(x, y, z of the centroid) returns a material index
     (or undefined to keep the primitive's own material). */
  function split(prim, pick) {
    const pos = readF32(prim.attributes.POSITION), idx = readIdx(prim.indices), groups = new Map([[prim.material, []]]);
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
      const m = pick((pos[a] + pos[b] + pos[c]) / 3, (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3) ?? prim.material;
      if (!groups.has(m)) groups.set(m, []);
      groups.get(m).push(idx[t], idx[t + 1], idx[t + 2]);
    }
    for (const [m, list] of groups) {
      if (m === prim.material) prim.indices = addIndices(list);
      else if (list.length) prims.push({ attributes: prim.attributes, indices: addIndices(list), material: m });
    }
  }
  /* Move a primitive's vertices: fn(p) mutates [x, y, z] (return false to leave the vertex). */
  function moveVerts(prim, fn) {
    const acc = prim.attributes.POSITION, out = readF32(acc);
    for (let i = 0; i < out.length; i += 3) {
      const p = [out[i], out[i + 1], out[i + 2]];
      if (fn(p) === false) continue;
      out[i] = p[0]; out[i + 1] = p[1]; out[i + 2] = p[2];
    }
    writeF32(acc, out);
  }
  /* Add new geometry { pos, nor, idx } as a primitive that follows one bone rigidly. */
  function addPart(g, material, boneName) {
    const joint = json.skins[0].joints.findIndex(n => json.nodes[n].name === boneName);
    for (let t = 0; t < g.idx.length; t += 3) {        // make every triangle face along its vertex normals (outward)
      const [a, b, c] = [g.idx[t] * 3, g.idx[t + 1] * 3, g.idx[t + 2] * 3], p = g.pos, n = g.nor;
      const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (f[0] * (n[a] + n[b] + n[c]) + f[1] * (n[a + 1] + n[b + 1] + n[c + 1]) + f[2] * (n[a + 2] + n[b + 2] + n[c + 2]) < 0) { const s = g.idx[t + 1]; g.idx[t + 1] = g.idx[t + 2]; g.idx[t + 2] = s; }
    }
    const count = g.pos.length / 3, joints = new Uint8Array(count * 4), weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { joints[i * 4] = joint; weights[i * 4] = 1; }
    const pos = Float32Array.from(g.pos);
    prims.push({
      attributes: {
        POSITION: addAccessor(pos, 'VEC3', 5126, 34962, bounds(pos)),
        NORMAL: addAccessor(Float32Array.from(g.nor), 'VEC3', 5126, 34962),
        JOINTS_0: addAccessor(joints, 'VEC4', 5121, 34962),
        WEIGHTS_0: addAccessor(weights, 'VEC4', 5126, 34962),
      },
      indices: addIndices(g.idx), material,
    });
  }
  function save(out) {
    bin = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
    json.buffers[0].byteLength = bin.length;
    let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
    const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
    const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
    const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
    fs.writeFileSync(out, Buffer.concat([head, jh, js, bh, bin]));
    console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  }
  return { json, matIdx, setCol, addMat, primOf, split, moveVerts, addPart, save };
}

const lin = hex => [1, 3, 5].map(i => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
const bounds = p => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i++) { const c = i % 3; if (p[i] < min[c]) min[c] = p[i]; if (p[i] > max[c]) max[c] = p[i]; }
  return { min, max };
};

/* ---------- geometry builders (append to g = { pos, nor, idx }) ---------- */
const newPart = () => ({ pos: [], nor: [], idx: [] });
function ellipsoid(g, [cx, cy, cz], [rx, ry, rz], seg = 20, tilt = 0) {     // tilt: rotation about the z axis (radians)
  const base = g.pos.length / 3, ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let i = 0; i <= seg; i++) for (let k = 0; k <= seg * 2; k++) {
    const th = Math.PI * i / seg, ph = Math.PI * k / seg;
    const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
    const ox = rx * nx, oy = ry * ny, l = Math.hypot(nx / rx, ny / ry, nz / rz), mx = nx / rx / l, my = ny / ry / l;
    g.pos.push(cx + ox * ct - oy * st, cy + ox * st + oy * ct, cz + rz * nz);
    g.nor.push(mx * ct - my * st, mx * st + my * ct, nz / rz / l);
  }
  const row = seg * 2 + 1;
  for (let i = 0; i < seg; i++) for (let k = 0; k < seg * 2; k++) {
    const a = base + i * row + k, b = a + 1, c = a + row, d = c + 1;
    g.idx.push(a, b, c, b, d, c);
  }
}
/* Tapering tube along a quadratic bezier P[0..2] (horn, fur tuft): radius R at the base, a point at the tip. */
function taperTube(g, P, R, N = 14, M = 14) {
  const at = t => P[0].map((_, c) => (1 - t) * (1 - t) * P[0][c] + 2 * t * (1 - t) * P[1][c] + t * t * P[2][c]);
  const tan = t => { const v = P[0].map((_, c) => 2 * (1 - t) * (P[1][c] - P[0][c]) + 2 * t * (P[2][c] - P[1][c])); const l = Math.hypot(...v); return v.map(x => x / l); };
  const base = g.pos.length / 3;
  for (let i = 0; i <= N; i++) {
    const t = i / N, c = at(t), T = tan(t), r = R * Math.pow(1 - t, 0.75) + 0.002;
    const U = Math.abs(T[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1], V = [T[1] * U[2] - T[2] * U[1], T[2] * U[0] - T[0] * U[2], T[0] * U[1] - T[1] * U[0]];
    const vl = Math.hypot(...V); V.forEach((_, q) => V[q] /= vl);
    const W = [V[1] * T[2] - V[2] * T[1], V[2] * T[0] - V[0] * T[2], V[0] * T[1] - V[1] * T[0]];
    for (let k = 0; k <= M; k++) {
      const a = 2 * Math.PI * k / M, n = [0, 1, 2].map(q => Math.cos(a) * V[q] + Math.sin(a) * W[q]);
      g.pos.push(c[0] + r * n[0], c[1] + r * n[1], c[2] + r * n[2]); g.nor.push(...n);
    }
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < M; k++) {
    const a = base + i * (M + 1) + k, b = a + 1, c = a + M + 1, d = c + 1;
    g.idx.push(a, b, c, b, d, c);
  }
}

module.exports = { openGlb, newPart, ellipsoid, taperTube };
