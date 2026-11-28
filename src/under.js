// Under the surface with your diver (round 131, the first step of underwater in 3D). While a diver is down, V puts the camera on the diver:
// down the line, round the wreck (or the kraken's den) and back up. The scene is the normal one seen from below, plus one small sea-floor
// mesh per world (built once), the wreck as an old hull with her masts gone lying tilted on it, and flat fish sprites. Thick water-coloured fog hides
// everything past a few dozen units, so nothing else needs drawing. The water surface and sky shaders have an "under" branch (gpu.js).
import { Mesh, shipMesh, shipParams } from './gen/mesh.js';
import { model } from './render/math.js';
import { hash } from './gen/rng.js';

const N = 14, CELL = 7; // the floor patch: 14 x 14 cells of 7 units round the wreck, a little uneven
// per world: sand, its darker patches, weed, and (Atlantis) coral
const FLOORS = { terra: [[0.62, 0.56, 0.4], [0.5, 0.45, 0.33], [0.2, 0.42, 0.22]], asgard: [[0.42, 0.43, 0.45], [0.32, 0.33, 0.36], [0.22, 0.32, 0.24]], atlantis: [[0.8, 0.76, 0.62], [0.68, 0.64, 0.52], [0.86, 0.44, 0.5]], olympus: [[0.64, 0.55, 0.42], [0.52, 0.44, 0.34], [0.3, 0.44, 0.24]] };
const SWIM = { terra: 'turtle', asgard: 'seal', atlantis: 'ray', olympus: 'turtle' };
const strHash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; };

function floorMesh(realm, den) {
  const [sand, dark, weed] = FLOORS[realm] || FLOORS.terra, m = new Mesh(), H = N * CELL / 2;
  const ht = (i, j) => (hash(77, i, j) % 100) / 100 * 0.9 - (Math.hypot(i - N / 2, j - N / 2) > N / 2 - 1 ? 1.5 : 0); // the rim sags away into the murk
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const P = (a, b) => [a * CELL - H, ht(a, b), b * CELL - H];
    m.quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), hash(78, i, j) % 5 ? sand : dark);
  }
  for (let k = 0; k < 18; k++) { const x = (hash(79, k) % (N * CELL - 8)) - H + 4, z = (hash(80, k) % (N * CELL - 8)) - H + 4; if (Math.hypot(x, z) < 7) continue;
    if (k % 3 === 0) m.blob(x, 0.3, z, 0.8 + (k % 4) * 0.4, dark, 0.7); // stones
    else for (let q = 0; q < 3; q++) m.line([x + q * 0.4, 0, z], [x + q * 0.4 + 0.3, 1.6 + ((k + q) % 3) * 0.9, z + 0.2], 0.12, weed); } // weed (coral in Atlantis)
  if (den) { // the kraken's den: a mound of rock with a black mouth facing the way the diver comes in
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; m.blob(Math.cos(a) * 5, 2.2, Math.sin(a) * 5, 4.2, k % 2 ? dark : [0.36, 0.36, 0.38], 0.9); }
    m.blob(0, 5, 0, 5.5, [0.34, 0.34, 0.36], 0.8); m.box(0, 1.6, 5.3, 4, 3.2, 1.4, [0.03, 0.03, 0.04]);
  }
  return m;
}

export function createUnder(renderer) {
  const meshes = new Map();
  const get = (k, make) => { let g = meshes.get(k); if (!g) { g = renderer.upload(make()); meshes.set(k, g); if (meshes.size > 12) { const [k0, g0] = meshes.entries().next().value; renderer.free(g0); meshes.delete(k0); } } return g; };
  const floorOf = (realm, den) => get(realm + (den ? 'd' : ''), () => floorMesh(realm, den));
  const hullOf = (seed, realm) => get('w' + seed + realm, () => shipMesh({ ...shipParams(seed, 'trader', realm === 'asgard' ? 'v' : ''), masts: 0, jib: false, crates: false }, [])); // the sails (a longship's) go to the unused list
  // add the floor, the wreck and the fish for this frame; bb draws a flat sprite
  return (s, d, dv, objects, bb, sprites, t) => {
    const realm = d.realm, h = strHash(d.w.name), fy = dv.floor;
    objects.push({ m: floorOf(realm, d.den), mat: model(dv.wx, fy, dv.wz, d.den ? Math.atan2(dv.z - dv.wz, dv.x - dv.wx) - Math.PI / 2 : 0), tint: [1, 1, 1] });
    if (!d.den) { const tilt = h & 1 ? 1 : -1; objects.push({ m: hullOf(h % 997, realm), mat: model(dv.wx, fy + 0.9, dv.wz, (h % 628) / 100, 0.1 * tilt, 0.42 * tilt, 0.75), tint: [0.8, 0.62, 0.45] }); } // an old hull on her side, half in the sand
    else if (sprites) { const ax = dv.wx + Math.cos(dv.yaw + Math.PI) * 6, az = dv.wz + Math.sin(dv.yaw + Math.PI) * 6; for (let i = 0; i < 2; i++) bb(sprites.critter('krarm', i ? 'L' : 'R', (Math.floor(t * 1.5) + i) % 2), ax + (i ? 3 : -3), fy + 2.6, az, 2.2); } // arms curling out of the den
    if (!sprites) return;
    for (let i = 0; i < 6; i++) { const a = t * (0.25 + i * 0.03) * (i & 1 ? 1 : -1) + i * 1.1, r = 9 + i * 3, kind = i < 4 ? 'school' : SWIM[realm] || 'turtle'; // fish circling the wreck at different depths
      bb(sprites.critter(kind, (i & 1 ? 1 : -1) > 0 ? 'R' : 'L', ((t * 2 + i) | 0) & 1), dv.wx + Math.cos(a) * r, fy + 4 + (i % 3) * 3.5, dv.wz + Math.sin(a) * r, kind === 'school' ? 1.6 : 2); }
    for (let i = 0; i < 3; i++) { const u = (t * 0.7 + i / 3) % 1; bb(sprites.fx('splash'), dv.x + Math.cos(dv.yaw) * 1.6 + (i - 1) * 0.3, dv.y - 0.6 + u * 2.2, dv.z + Math.sin(dv.yaw) * 1.6, 0.05 + u * 0.05); } // the diver's own bubbles
  };
}
