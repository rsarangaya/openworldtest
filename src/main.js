import { COMPANIONS } from './rules/sidequests.js';
// Entry point: game loop, input, cameras, and the bridge between the rules (rules/*), the generator (gen/*) and the renderer.
import { createRenderer } from './render/gpu.js';
import { model, mul } from './render/math.js';
import { SHIPS } from './rules/ships.js';
import { islandGroundSteps, islandStructs, wallMesh, shipMesh, shipParams, ballMesh } from './gen/mesh.js';
import { islandProps } from './gen/props.js';
import { createSprites } from './render/sprites.js';
import { newTrail, feed, buildWake } from './wake.js';
import { createWeatherFx } from './weatherfx.js';
import { roughOf } from './rules/weather.js';
import { weatherNow } from './rules/game.js';
import { createDebug, debugEnabled } from './debug.js';
import { warpText } from './rules/realm.js';
import { lifeAt, clearLife } from './rules/life.js';
import { serpentParts, LUNGE_AT } from './rules/serpent.js';
import { krakenParts } from './rules/kraken.js';
import { rockAt, SPLASH_R } from './rules/cyclops.js';
import { wrecksNear } from './rules/salvage.js';
import { bake, CRIT_BOX, paintCritter } from './render2d/art.js';
import { quantize } from './render/palette.js';
import { CINE_S, gateOf, gateAngleOf } from './rules/realm.js';
import { soundScene as sceneOf } from './rules/meadhall.js';
import { folkPos, sectorOf, sectorIslands, islandTown, townsfolk, islandHeight, dockDist, DOCK_Y, SECTOR, WALL_R, gatePos } from './gen/world.js';
import { isMiner, isSmuggler, isPriest } from './gen/style.js';
import { npcAlive, npcMax, SINK_S, CORPSE_S, groundAt } from './rules/game.js';
import { board, byId } from './rules/hunt.js';
import { travelTo, warpNow, handIn, grapple, DECK_Y, fighterOf, toggleBombard, cycleOrder } from './rules/game.js';
import { setShot, AMMO } from './rules/parts.js';
import { mapAvailable } from './rules/map.js';
import { newGame, step, interact, prompt, standingOn, nearbyIslands, say, camBlocked, toggleAuto, toggleRow, DT } from './rules/game.js';
import { wave, setCalm } from './rules/sea.js';
import { saveGame, loadGame, hasSave, loadOptions, saveOptions } from './rules/save.js';
import { createUI } from './ui.js';
import { hourAt, lightAt } from './rules/daynight.js';
import { SOFT, MID } from './render/palette.js';
import { createAudio } from './audio.js';

const BASE_SEED = 1717; // the world "Terra": same seed, same sea, every time
let SEED = BASE_SEED; // the seed of the realm in play (a realm has its own)
const $ = (id) => document.getElementById(id);
const canvas = $('c'), ui = createUI(), audio = createAudio();
let opts = loadOptions(), renderer, s = null, phase = 'boot'; // boot | menu | intro | play | panel | paused | ending | over
const keys = new Set(), view = { yaw: 0, pitch: 0 }, orbit = { yaw: 0, pitch: -0.22, idle: 0 };
const cam = { x: 0, y: 5, z: 0, yaw: 0, pitch: 0, blend: 0 };
let expectUnlock = false, saveT = 0, mouseDown = false;
const IDENT = model(0, 0, 0);
const wrapPi = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
const lerp = (a, b, t) => a + (b - a) * t;
let lastNight = 0; // how dark the last frame was (the hand on screen darkens with it)

// ---------------------------------------------------------------- sectors: built on demand, one per frame, freed when far
const sectors = new Map(), shipMeshes = new Map(), npcMeshes = new Map(), tasks = [];
let ballGpu = null, sprites = null;
const LIFE = [];
const BB = { data: new Float32Array(12 * 8000), n: 0 }, propCache = new Map();
function bb(sp, x, y, z, sc) { // one billboard instance: anchor + scale, quad extents, atlas rect
  if (!sp || BB.n >= 8000) return; const i = BB.n++ * 12, d = BB.data, u = sp.uv;
  d[i] = x; d[i + 1] = y; d[i + 2] = z; d[i + 3] = sc; d[i + 4] = sp.x0; d[i + 5] = sp.x1; d[i + 6] = sp.top; d[i + 7] = sp.bot; d[i + 8] = u.u0; d[i + 9] = u.v0; d[i + 10] = u.u1; d[i + 11] = u.v1;
}
const FIXED = { bar: 0.2, cellrail: 2, bunk: 0.9, desk: 1.1, keys: 0.7, notices: 0.9, rack: 1.5, anvil: 0.7, forge: 0.9, board: 2, stall: 1.9, bench: 0.9, counter: 2.2, shelf: 2.6 }; // wide props: half-width; drawn square-on, never turning with the camera
const key = (x, z) => `${x},${z}`;
// which sprite frame an attacker shows: 4 = the blow (for a moment after it lands), 3 = the wind-up (the last third of a second before it, when you are in reach), else the walk frame
const atkFrame = (e, near, walk) => { const la = s.t - (e.atk ?? -9); if (la >= 0 && la < 0.28) return 4; if (near && e.cd > 0 && e.cd < 0.32) return 3; return walk; };
// a sector is created empty and its meshes are built one at a time within a few ms per frame, so sailing never hitches
// the wall's mesh for one sector (flagged so it can be swapped alone when the breach opens)
const wallTask = (sx, sz) => () => { const rl = s?.realm || 'terra', g = gateOf(rl); if (rl !== 'terra' && !g) return null; // Terra's ice wall, or a world's gate (Asgard, Atlantis)
  const w = g ? wallMesh(s.seed, sx, sz, !!s.flags[g.flag], { ang: gateAngleOf(rl), arc: g.arc, realm: rl }) : wallMesh(s?.baseSeed || BASE_SEED, sx, sz, !!s?.flags?.crossed); return w ? { m: renderer.upload(w), mat: IDENT, tint: [1, 1, 1], wall: true } : null; };
// a city is built over several frames: each stage of the ground is one step of the task, which puts itself back at the front of the queue until done
const islandTasks = (k, isl) => {
  const it = islandGroundSteps(isl);
  const ground = { k, build: () => { const r = it.next(); if (!r.done) { tasks.unshift(ground); return null; } return { m: renderer.upload(r.value), mat: IDENT, tint: [1, 1, 1], detail: 2 }; } };
  return [ground, { k, build: () => ({ m: renderer.upload(islandStructs(isl)), mat: IDENT, tint: [1, 1, 1], detail: 1 }) }];
};
function queueSector(sx, sz) {
  const k = key(sx, sz); sectors.set(k, { sx, sz, objs: [] });
  for (const isl of sectorIslands(SEED, sx, sz)) tasks.push(...islandTasks(k, isl)); /* ground in stages, then the buildings */
  tasks.push({ k, build: wallTask(sx, sz) });
}
function pump(budgetMs) {
  const t0 = performance.now();
  do { const t = tasks.shift(); if (!t) return; const sec = sectors.get(t.k); if (!sec) continue; const o = t.build(); if (o) sec.objs.push(...[].concat(o)); } while (performance.now() - t0 < budgetMs);
}
const dropSectors = () => { for (const sec of sectors.values()) for (const o of sec.objs) renderer.free(o.m); sectors.clear(); tasks.length = 0; };
// the wall's sectors are rebuilt when the breach opens
const rebuildWall = () => { for (const [k, sec] of sectors) if (Math.abs(Math.hypot((sec.sx + 0.5) * 600, (sec.sz + 0.5) * 600) - WALL_R) < 520) { const keep = []; let had = false; for (const o of sec.objs) { if (o.wall) { renderer.free(o.m); had = true; } else keep.push(o); } if (had) { sec.objs = keep; tasks.push({ k, build: wallTask(sec.sx, sec.sz) }); } } }; // only the ice is swapped (the islands stay put), one sector per frame inside the pump budget
function updateSectors(x, z, all = false) {
  const cx = sectorOf(x), cz = sectorOf(z), R = opts.distance, want = [];
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) if (!sectors.has(key(cx + i, cz + j))) want.push([cx + i, cz + j, i * i + j * j]);
  want.sort((p, q) => p[2] - q[2]);
  for (const w of want) queueSector(w[0], w[1]);
  for (const [k, sec] of sectors) if (Math.max(Math.abs(sec.sx - cx), Math.abs(sec.sz - cz)) > R + 1) { for (const o of sec.objs) renderer.free(o.m); sectors.delete(k); }
  pump(all ? Infinity : 6);
}
const playerGpu = (cls) => { let g = shipMeshes.get('P' + cls); if (!g) { const so = [], h = shipMesh(shipParams(1, 'player', cls), so); g = { hull: renderer.upload(h), sails: so.map((q) => ({ g: renderer.upload(q.mesh), x: q.x })) }; shipMeshes.set('P' + cls, g); } return g; };
const enemyL = new Map(), enemyLen = (e) => { let l = enemyL.get(e.kind + e.seed); if (!l) { l = shipParams(e.seed, e.kind).L; enemyL.set(e.kind + e.seed, l); } return l; };
// the sail pivots about its mast; the boom swings out to the side the wind blows toward
const tr = (x) => { const o = model(0, 0, 0); o[12] = x; return o; };
const sailMat = (hm, x, trim) => mul(hm, mul(tr(x), mul(model(0, 0, 0, -trim * 1.48), tr(-x))));
// ship wakes: foam on the water built from where each stern has been (see wake.js); one small dynamic buffer per ship, freed soon after it is gone
const wakes = new Map(); let wakeFrame = 0;
function wake(objects, id, x, z, yaw, L, B, speed, t) {
  let w = wakes.get(id); if (!w) { if (Math.hypot(x - cam.x, z - cam.z) > 260) return; w = newTrail(); w.h = renderer.upload({ data: () => w.arr, count: 0 }); wakes.set(id, w); }
  w.used = wakeFrame; feed(w, x, z, yaw, L, speed, t);
  const n = buildWake(w, x, z, yaw, L, B, speed, t); if (!n) return; w.h.count = n; renderer.update(w.h, w.arr.subarray(0, n * 9)); objects.push({ m: w.h, mat: IDENT, tint: [1, 1, 1] });
}
const sweepWakes = () => { wakeFrame++; if (wakeFrame % 120) return; for (const [id, w] of wakes) if (wakeFrame - w.used > 120) { renderer.free(w.h); wakes.delete(id); } };
const beamCache = new Map(), enemyBeam = (e) => { let b = beamCache.get(e.kind + e.seed); if (!b) { b = shipParams(e.seed, e.kind).B; beamCache.set(e.kind + e.seed, b); } return b; };
const shipGpu = (seed, kind, cls = '') => { const k = kind + seed + cls; let g = shipMeshes.get(k); if (!g) { g = renderer.upload(shipMesh(shipParams(seed, kind, cls))); shipMeshes.set(k, g); } return g; };

// ---------------------------------------------------------------- cameras
const homeIsland = () => sectorIslands(SEED, 0, 0)[0];
// the hull rides the swell: heave, pitch along the waves, roll across them, a lazy wobble, and she heels over when turning at speed
const shipMat = (x, z, yaw, t, heel = 0, sink = 0) => {
  const c = Math.cos(yaw), sn = Math.sin(yaw), h0 = wave(x, z, t), hf = wave(x + c * 4, z + sn * 4, t), hb = wave(x - c * 4, z - sn * 4, t), hs = wave(x - sn * 2.5, z + c * 2.5, t), hp = wave(x + sn * 2.5, z - c * 2.5, t);
  const stp = (v, q) => Math.round(v / q) * q;
  return model(x, stp(h0 * 1.0 - 0.45 - 9 * sink ** 1.4, 0.05), z, yaw, stp(Math.atan2(hf - hb, 8) * 1.15 + sink * 0.5, 0.015), stp(Math.atan2(hs - hp, 5) * 1.1 + heel + sink * 0.9 + Math.sin(t * 1.3 + x * 0.05) * 0.03, 0.015));
};
const poseFoot = () => ({ x: s.foot.x, y: s.foot.y + 1.7 + (s.deck ? wave(s.foot.x, s.foot.z, T) - 0.15 : 0), z: s.foot.z, yaw: view.yaw, pitch: view.pitch });
function poseShip() {
  const p = s.ship, yaw = p.yaw + orbit.yaw, cp = Math.cos(orbit.pitch), fx = cp * Math.cos(yaw), fy = Math.sin(orbit.pitch), fz = cp * Math.sin(yaw), D = 15 + (SHIPS[s.shipClass] || SHIPS.sailboat).L * 1.3;
  const tx = p.x, ty = 4 + wave(p.x, p.z, T) * 0.6, tz = p.z; // the camera rises and falls with the swell
  let dist = D; // pull the camera in when terrain or a building would be in the way (e.g. a boat moored beside the town)
  for (let d = 6; d <= D; d += 2) if (camBlocked(s, tx - fx * d, Math.max(3, ty - fy * d), tz - fz * d)) { dist = Math.max(5, d - 3); break; }
  const cy = Math.max(3, ty - fy * dist);
  return { x: tx - fx * dist, y: cy, z: tz - fz * dist, yaw, pitch: Math.atan2(ty - cy, dist * cp) };
}
function menuPose(t) {
  const h = homeIsland(), c = islandTown(h).plaza, a = t * 0.08, R = 150;
  const x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R;
  return { x, y: 38, z, yaw: Math.atan2(c.z - z, c.x - x), pitch: -0.22 };
}
function updateCamera(dt, t) {
  if (!s) { Object.assign(cam, menuPose(t)); return; }
  if (s.cine && s.ship) { // the breakthrough: low and close beside the ship at the ice, then pulling back and up as she surges through
    const c = s.cine, a = s.t - c.t0, k = Math.min(1, a / CINE_S), ca = Math.cos(c.ang), sa = Math.sin(c.ang), back = 20 + 34 * k, side = 14 * (1 - k) + 6, h = 4 + 12 * k * k;
    cam.x = s.ship.x - ca * back - sa * side; cam.z = s.ship.z - sa * back + ca * side; cam.y = h; const tx = s.ship.x + ca * 18, tz = s.ship.z + sa * 18;
    cam.yaw = Math.atan2(tz - cam.z, tx - cam.x); cam.pitch = -Math.atan2(h - 4, Math.hypot(tx - cam.x, tz - cam.z)); cam.blend = 1; return;
  }
  const target = s.mode === 'ship' && s.ship ? 1 : 0;
  cam.blend += Math.sign(target - cam.blend) * Math.min(Math.abs(target - cam.blend), dt / 1.1);
  const k = cam.blend * cam.blend * (3 - 2 * cam.blend), f = poseFoot(), p = cam.blend > 0 && s.ship ? poseShip() : f;
  cam.x = lerp(f.x, p.x, k); cam.y = lerp(f.y, p.y, k); cam.z = lerp(f.z, p.z, k); cam.pitch = lerp(f.pitch, p.pitch, k); cam.yaw = f.yaw + wrapPi(p.yaw - f.yaw) * k;
  if (s.mode === 'ship') { orbit.idle += dt; if (orbit.idle > 2.5) orbit.yaw *= 1 - Math.min(1, dt * 1.5), orbit.pitch = lerp(orbit.pitch, -0.22, Math.min(1, dt * 1.5)); }
}

// ---------------------------------------------------------------- drawing
let calmT = -9, calmZ = [];
// the eight islands nearest the camera: the swell flattens round them (see rules/sea.js `calm`)
function updateCalm(t) {
  if (t - calmT < 0.25 && t >= calmT) return; calmT = t; const cx = sectorOf(cam.x), cz = sectorOf(cam.z), z = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const isl of sectorIslands(SEED, cx + i, cz + j)) z.push([isl.x, isl.z, isl.r * 1.7, Math.hypot(isl.x - cam.x, isl.z - cam.z)]);
  z.sort((p, q) => p[3] - q[3]); calmZ = z.slice(0, 8); setCalm(calmZ);
}
// can any of this sector (a square, with the wall's overhang) be on screen?
const SECTOR_REACH = 480;
function sectorSeen(sec, halfView) {
  const dx = (sec.sx + 0.5) * 600 - cam.x, dz = (sec.sz + 0.5) * 600 - cam.z, d = Math.hypot(dx, dz); if (d <= SECTOR_REACH) return true;
  return Math.abs(wrapPi(Math.atan2(dz, dx) - cam.yaw)) <= halfView + Math.asin(SECTOR_REACH / d);
}
// spray when a hull drives into a rising sea: no state in the game rules, just a handful of splash sprites for 3/4 of a second (rain and storms only)
const splashes = new Map();
function bowSplash(id, x, z, yaw, L, B, speed, t, rough, sound) {
  if (rough < 1.12 || !sprites) return;
  let w = splashes.get(id); if (!w) { if (splashes.size > 40) splashes.clear(); splashes.set(id, (w = { t0: -9, prev: 0, k: 0 })); }
  const c = Math.cos(yaw), sn = Math.sin(yaw), dive = wave(x + c * L, z + sn * L, t) - wave(x, z, t); // how far the water stands above midships at the stem
  const th = 0.02 * L;
  if (w.prev <= th && dive > th && t - w.t0 > 0.8 && (speed > 2 || rough > 1.5)) { w.t0 = t; w.k = Math.min(1.5, (rough - 1) * 1.3 + speed / 44); sound?.(w.k); }
  w.prev = dive;
  const age = (t - w.t0) / 0.75; if (age < 0 || age >= 1) return;
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1, out = B * (0.95 + (i % 3) * 0.45) + age * (3 + 1.6 * (i % 3)) * w.k, f = L * (1.05 - (i % 5) * 0.22) - age * speed * 0.2, px = x + c * f - sn * side * out, pz = z + sn * f + c * side * out;
    bb(sprites.fx('splash'), px, wave(px, pz, t) + 1.2 + (6 + (i % 3) * 3.5) * w.k * age * (1 - age) * 2.2, pz, (0.34 + 0.3 * w.k + (i % 3) * 0.08) * (1 - age * 0.55) * Math.max(1, L / 9));
  }
}
// [haze, deep sea, shallows] per world with its own sea: Atlantis warm turquoise under a sea-green haze; Olympus a deep sunny blue under a clear, bright sky
const WORLD_SEA = { atlantis: [[0.7, 0.9, 0.9], [0.01, 0.3, 0.36], [0.16, 0.74, 0.68]], olympus: [[0.68, 0.82, 0.96], [0.01, 0.16, 0.42], [0.1, 0.48, 0.72]] };
function render(t) {
  updateCalm(t); sweepWakes(); if (sprites && s) sprites.setTheme(s.realm || 'terra');
  const zone = Math.hypot(cam.x, cam.z) / WALL_R, cold = s && s.realm === 'asgard' ? 0.85 : s?.realm === 'atlantis' || s?.realm === 'olympus' ? 0 : Math.max(0, Math.min(1, (zone - 0.5) / 0.4)) * (1 - Math.max(0, Math.min(1, (zone - 1) * WALL_R / 700))), R = opts.distance; // past the Wall the sky turns warm
  sprites?.frame(); const objects = []; BB.n = 0; const sea = s ? roughOf(weatherNow(s)) : 1;
  const halfView = Math.atan(Math.tan(0.525) * (innerWidth / innerHeight)) + 0.12; // half the horizontal field of view, plus a margin
  for (const sec of sectors.values()) if (Math.max(Math.abs(sec.sx - sectorOf(cam.x)), Math.abs(sec.sz - sectorOf(cam.z))) <= R && sectorSeen(sec, halfView)) objects.push(...sec.objs);
  if (s) {
    if (s.ship) {
      const sk = s.sunkT === undefined ? 0 : Math.min(1, (s.t - s.sunkT) / SINK_S), P = playerGpu(s.shipClass || 'sailboat'), hm = shipMat(s.ship.x, s.ship.z, s.ship.yaw, t, -(s.ship.turn || 0) * Math.min(1, s.ship.speed / 8) * 0.14, sk);
      const ph = sk ? [1 - sk * 0.5, 1 - sk * 0.5, 1 - sk * 0.4] : s.t - s.hitT < 0.22 ? [1.6, 0.6, 0.55] : [1, 1, 1]; // the hull flashes red when hit
      objects.push({ m: P.hull, mat: hm, tint: ph });
      for (const q of P.sails) objects.push({ m: q.g, mat: sailMat(hm, q.x, s.ship.trim || 0), tint: ph });
      if (!sk) wake(objects, 'P', s.ship.x, s.ship.z, s.ship.yaw, (SHIPS[s.shipClass] || SHIPS.sailboat).L, (SHIPS[s.shipClass] || SHIPS.sailboat).B, Math.abs(s.ship.speed), t);
      if (!sk) bowSplash('P', s.ship.x, s.ship.z, s.ship.yaw, (SHIPS[s.shipClass] || SHIPS.sailboat).L, (SHIPS[s.shipClass] || SHIPS.sailboat).B, Math.abs(s.ship.speed), t, sea, s.mode === 'ship' ? (k) => audio.splash(k) : null);
    }
    if (sprites && s.mode !== 'foot' || (sprites && !s.deck)) { // sea life and birds: flat sprites, mirrored to face the way they swim relative to the camera
      const L = lifeAt(s.realm || 'terra', s.seed, t, cam.x, cam.z, LIFE, s.mode === 'ship' && s.ship ? s.ship : null), rx = -Math.sin(cam.yaw), rz = Math.cos(cam.yaw);
      let wd = 1e9, bd = 1e9, bk = 'gull'; for (const c of L) { const d = Math.hypot(c.x - cam.x, c.z - cam.z); if (c.air) { if (d < bd) { bd = d; bk = c.kind; } } else if (c.kind === 'whale' || c.kind === 'icewhale' || c.kind === 'orca' || c.kind === 'narwhal') wd = Math.min(wd, d); } audio.critters({ whale: wd, bird: bd, birdKind: bk });
      const sm = s.serpent; if (sm && sm.up) { for (const q of serpentParts(sm, t)) bb(sprites.critter(q.k, Math.cos(sm.yaw) * rx + Math.sin(sm.yaw) * rz >= 0 ? 'R' : 'L', q.k === 'serhead' && s.t - sm.t0 > LUNGE_AT ? 1 : 0), q.x, q.y + wave(q.x, q.z, t), q.z, 2.3 * (q.s || 1)); const dd = Math.hypot(sm.x - cam.x, sm.z - cam.z); if (dd < 300) bb(sprites.hp(Math.max(0, Math.min(10, Math.ceil((sm.hp / sm.maxHp) * 10))), true), sm.x, 17 + wave(sm.x, sm.z, t), sm.z, Math.max(1, Math.min(3.2, dd / 40))); } // the sea serpent: head and coils, and its health
      const km = s.kraken; if (km && km.grip && s.ship) { for (const q of krakenParts(km, s.ship, s.t)) bb(sprites.critter(q.k, (q.x - s.ship.x) * rx + (q.z - s.ship.z) * rz >= 0 ? 'L' : 'R', q.k === 'krarm' ? (Math.floor(t * 1.5) + q.i) % 2 : 0), q.x, q.y + wave(q.x, q.z, t), q.z, q.k === 'krhead' ? 2.6 : 2.2); const dd = Math.hypot(km.x - cam.x, km.z - cam.z); if (dd < 300) bb(sprites.hp(Math.max(0, Math.min(10, Math.ceil((km.hp / km.maxHp) * 10))), true), km.x, 18 + wave(km.x, km.z, t), km.z, Math.max(1, Math.min(3.2, dd / 40))); } // the kraken: four arms round the ship and its head, and its health
      const cy = s.cyclops; if (cy) { bb(sprites.critter('cyclops', Math.cos(cy.yaw) * rx + Math.sin(cy.yaw) * rz >= 0 ? 'R' : 'L', cy.wind ? 1 : 0), cy.x, cy.y, cy.z, 2.4); for (const r of cy.rocks) { const q = rockAt(r, s.t); bb(sprites.critter('boulder', 'R', 0), q.x, q.y, q.z, 1.8); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + s.t * 0.4, px = r.tx + Math.cos(a) * SPLASH_R, pz = r.tz + Math.sin(a) * SPLASH_R; bb(sprites.fx('splash'), px, wave(px, pz, t) + 0.6, pz, 0.45); } } const dd = Math.hypot(cy.x - cam.x, cy.z - cam.z); if (cy.awake && dd < 400) bb(sprites.hp(Math.max(0, Math.min(10, Math.ceil((cy.hp / cy.maxHp) * 10))), true), cy.x, cy.y + 21, cy.z, Math.max(1, Math.min(3.2, dd / 40))); } // the cyclops on his beach, his boulders in flight with a ring of foam where each will land, and his health
      for (const w of wrecksNear(s, cam.x, cam.z, 450)) for (let i = 0; i < 4; i++) { const x = w.x + Math.cos(i * 1.9) * (3 + i * 2.2), z = w.z + Math.sin(i * 1.9) * (3 + i * 2.2); bb(sprites.prop({ k: i % 2 ? 'barrel' : 'crate', v: i }, 0), x, wave(x, z, t + i) - 0.35, z, 1.4); } // an old wreck: barrels and crates still bob over her
      for (const c of L) bb(sprites.critter(c.kind, c.dx * rx + c.dz * rz >= 0 ? 'R' : 'L', c.fr), c.x, c.y + (c.air ? 0 : wave(c.x, c.z, t)), c.z, c.air ? 2.4 : 2);
    }
    for (const e of s.enemies.values()) {
      const em = shipMat(e.x, e.z, e.yaw, t), flash = s.t - (e.hitT ?? -99) < 0.22; objects.push({ m: shipGpu(e.seed, e.kind, s.realm === 'asgard' ? 'v' : ''), mat: em, tint: flash ? [1.6, 0.6, 0.55] : [1, 1, 1] }); if (Math.hypot(e.x - cam.x, e.z - cam.z) < 400) { wake(objects, e.id, e.x, e.z, e.yaw, enemyLen(e), enemyBeam(e), e.speed, t); if (Math.hypot(e.x - cam.x, e.z - cam.z) < 160) bowSplash(e.id, e.x, e.z, e.yaw, enemyLen(e), enemyBeam(e), e.speed, t, sea); }
      const dd = Math.hypot(e.x - cam.x, e.z - cam.z); // a health bar above every enemy ship you can see: bigger with distance so it stays readable
      if (dd < 260 && sprites && e.maxHp) bb(sprites.hp(Math.max(0, Math.min(10, Math.ceil((e.hp / e.maxHp) * 10))), e.kind === 'raider'), e.x, 15 + wave(e.x, e.z, t) * 0.9, e.z, Math.max(1, Math.min(3.2, dd / 40)));
    }
    for (const q of Object.values(s.npcs || {})) if (q.dead && q.x !== undefined && s.t - q.t < CORPSE_S && Math.hypot(q.x - cam.x, q.z - cam.z) < 220) { // a body lies where it fell, then shrinks away
      const a = (s.t - q.t) / CORPSE_S, fade = a > 0.8 ? 1 - (a - 0.8) / 0.2 : 1, pop = Math.min(1, (s.t - q.t) / 0.25); // it topples over in a quarter second
      bb(sprites?.fallen(q.kind, q.seed), q.x - 0.9 * (1 - pop), q.y + 0.05 + 0.5 * Math.sin(pop * Math.PI), q.z, sprites.PERSON_SCALE * Math.max(0.05, fade));
    }
    for (const f of s.fleet || []) { const fm = shipMat(f.x, f.z, f.yaw, t), flash = s.t - (f.hitT ?? -99) < 0.22; objects.push({ m: shipGpu(f.seed, f.kind, s.realm === 'asgard' ? 'v' : ''), mat: fm, tint: flash ? [1.6, 0.6, 0.55] : [0.8, 0.95, 1.35] }); if (Math.hypot(f.x - cam.x, f.z - cam.z) < 400) wake(objects, f.id, f.x, f.z, f.yaw, enemyLen(f), enemyBeam(f), f.speed, t); const fd = Math.hypot(f.x - cam.x, f.z - cam.z); if (fd < 300 && sprites) bb(sprites.hp(Math.max(0, Math.min(10, Math.ceil((f.hp / f.maxHp) * 10)))), f.x, 15 + wave(f.x, f.z, t) * 0.9, f.z, Math.max(1, Math.min(3.2, fd / 40))); } // your fleet: tinted blue so you can tell them from the enemy
    for (const k of s.sinking) { const a = Math.min(1, (s.t - k.t0) / SINK_S); objects.push({ m: shipGpu(k.seed, k.kind), mat: shipMat(k.x, k.z, k.yaw, t, 0, a), tint: [1 - a * 0.5, 1 - a * 0.5, 1 - a * 0.4] }); } // a sunk ship rolls over and slips under, then is gone
    for (const f of s.fx) { const p = (s.t - f.t0) / f.life, sc = f.sc * (f.k === 'flash' ? 1 - p * 0.6 : f.k === 'smoke' ? 0.5 + p * 0.9 : f.k === 'hurt' ? 0.18 : 0.6 + p * 0.6) * (1 - p ** 3 * 0.7); bb(sprites?.fx(f.k), f.x, f.y, f.z, sc); }
    if (s.shots.length) { ballGpu ||= renderer.upload(ballMesh()); for (const b of s.shots) objects.push({ m: ballGpu, mat: model(b.x, 2.5 + Math.sin(b.life * 3) * 0.3, b.z), tint: [1, 1, 1] }); }
    if (s.deck) for (const d of s.deck.defs) { const hv = wave(d.x, d.z, t) - 0.15, y = DECK_Y + hv; if (d.st === 'dead') { if (s.t - d.deadT < CORPSE_S) bb(sprites.fallen('sailor', d.seed), d.x, y + 0.05, d.z, sprites.PERSON_SCALE); continue; } if (d.st === 'taken') continue; const la = s.t - (d.atk ?? -9), lu = la < 0.3 ? Math.sin((la / 0.3) * Math.PI) : 0; if (d.st === 'sub') bb(sprites.fallen('sailor', d.seed), d.x, y + 0.05, d.z, sprites.PERSON_SCALE); else bb(sprites.person(d.captain || s.deck.id.length && s.enemies.get(s.deck.id)?.kind === 'navy' ? 'warden' : 'sailor', d.seed, 'down', atkFrame(d, Math.hypot(d.x - s.foot.x, d.z - s.foot.z) < 2.6, 1 + (((d.walk || 0) * 1.4 | 0) & 1))), d.x + Math.cos(d.face || 0) * lu * 0.7, y, d.z + Math.sin(d.face || 0) * lu * 0.7, sprites.PERSON_SCALE); if (d.st === 'free' && s.t - (d.hitT ?? -99) < 12) bb(sprites.hp(Math.max(0, Math.min(10, Math.ceil((d.hp / d.max) * 10)))), d.x, y + 2.9, d.z, 0.5); }
    if (s.deck) for (const a of s.deck.allies || []) { if (a.st !== 'free') continue; const hv = wave(a.x, a.z, t) - 0.15, y = DECK_Y + hv, la = s.t - (a.atk ?? -9), lu = la < 0.3 ? Math.sin((la / 0.3) * Math.PI) : 0; bb(sprites.person('sailor', a.seed, 'down', atkFrame(a, Math.hypot(a.x - s.foot.x, a.z - s.foot.z) < 2.6, 1 + (((a.walk || 0) * 1.4 | 0) & 1))), a.x + Math.cos(a.face || 0) * lu * 0.7, y, a.z + Math.sin(a.face || 0) * lu * 0.7, sprites.PERSON_SCALE); if (s.t - (a.hitT ?? -99) < 12) bb(sprites.hp(Math.max(0, Math.min(10, Math.ceil((a.hp / a.max) * 10)))), a.x, y + 2.9, a.z, 0.5); }
    const pw = s.prisoner && s.hunts[s.prisoner], pww = pw && byId(s, s.prisoner); if (pw && !pw.aboard && pww && pw.x !== undefined) bb(sprites.person('sailor', pww.seed, 'down', 1 + (((pw.walk || 0) * 1.4 | 0) & 1)), pw.x, pw.y ?? groundAt(s, pw.x, pw.z), pw.z, sprites.PERSON_SCALE); // the bound prisoner walks behind you
    for (const [id, h] of Object.entries(s.hunts || {})) if (h.st === 'killed' && s.t - h.deadT < CORPSE_S && h.x !== undefined && Math.hypot(h.x - cam.x, h.z - cam.z) < 220) { const k = byId(s, id); if (k?.seed !== undefined) bb(sprites.fallen('sailor', k.seed), h.x, (h.y || 0) + 0.05, h.z, sprites.PERSON_SCALE * Math.max(0.05, 1 - Math.max(0, (s.t - h.deadT) / CORPSE_S - 0.8) / 0.2)); }
    const px = s.mode === 'foot' ? s.foot.x : s.ship.x, pz = s.mode === 'foot' ? s.foot.z : s.ship.z;
    const wd = s.ward; if (wd && wd.x !== undefined && s.mode === 'foot' && !s.deck) bb(sprites.person(wd.small ? 'child' : 'villager', wd.seed, 'down', 1 + (((wd.walk || 0) * 1.4 | 0) & 1)), wd.x, wd.y ?? groundAt(s, wd.x, wd.z), wd.z, sprites.PERSON_SCALE * (wd.small ? 0.65 : 1)); // someone you are bringing home
    const co = s.comp; if (co && co.x !== undefined && s.mode === 'foot' && !s.deck) { const la = s.t - (co.atk ?? -9), lu = la < 0.3 ? Math.sin((la / 0.3) * Math.PI) : 0; bb(sprites.person(COMPANIONS[co.key].kind, co.seed, 'down', ((t * 4) | 0) & 1), co.x + Math.cos(co.face || 0) * lu * 0.6, co.y ?? groundAt(s, co.x, co.z), co.z + Math.sin(co.face || 0) * lu * 0.6, sprites.PERSON_SCALE); } // whoever walks with you
    const bd = board(s); // once a frame, not once per island
    for (const isl of nearbyIslands(s, px, pz, 1)) if (Math.hypot(isl.x - px, isl.z - pz) < isl.r * 1.7 + 60) {
      const kb = (q, x, z) => { const a = q ? s.t - q.hit : 9; if (!(a < 0.28)) return [x, z, 1]; const f = Math.sin((a / 0.28) * Math.PI), dx = x - px, dz = z - pz, d = Math.hypot(dx, dz) || 1; return [x + (dx / d) * 0.5 * f, z + (dz / d) * 0.5 * f, 1 - 0.14 * f]; }; // a hit person is knocked back and squashes
      const hpBar = (id, kind, x, y, z) => { const q = s.npcs?.[id]; if (q && !q.dead && s.t - q.hit < 12) bb(sprites.hp(Math.max(0, Math.min(10, Math.ceil((q.hp / npcMax(kind)) * 10)))), x, y + 2.9, z, 0.5); };
      for (const n of islandTown(isl).npcs) if (npcAlive(s, n.id)) { const [kx, kz, ks] = kb(s.npcs?.[n.id], n.x, n.z); bb(sprites.person(n.kind, n.seed, 'down', 0), kx, n.y, kz, sprites.PERSON_SCALE * ks); hpBar(n.id, n.kind, n.x, n.y, n.z); } // shopkeepers face you and stand still
      for (const f of townsfolk(isl)) { if (!npcAlive(s, `v${isl.id}:${f.seed}`)) continue; // villagers stroll round the plaza; the sprite shows the way they walk relative to the camera
        const tt = s ? s.t : t, an = f.a0 + tt * f.speed, sg = Math.sign(f.speed), vx = -Math.sin(an) * sg, vz = Math.cos(an) * sg, fwd = vx * Math.cos(cam.yaw) + vz * Math.sin(cam.yaw), rgt = -vx * Math.sin(cam.yaw) + vz * Math.cos(cam.yaw);
        const dir = Math.abs(fwd) >= Math.abs(rgt) ? (fwd > 0 ? 'up' : 'down') : rgt > 0 ? 'right' : 'left';
        const vx2 = f.cx + Math.cos(an) * f.rad, vz2 = f.cz + Math.sin(an) * f.rad;
        const [kx, kz, ks] = kb(s.npcs?.[`v${isl.id}:${f.seed}`], vx2, vz2);
        bb(sprites.person(isMiner(isl, f.seed) ? 'miner' : isSmuggler(isl, f.seed) ? 'smuggler' : isPriest(isl, f.seed) ? 'priest' : 'villager', f.seed, dir, 1 + (((t * 5 + f.seed) | 0) & 1)), kx, islandHeight(isl, vx2, vz2), kz, sprites.PERSON_SCALE * ks);
      }
      for (const o of s.foes) if (o.isl === isl.id) { const la = s.t - (o.atk ?? -9), lu = la < 0.3 ? Math.sin((la / 0.3) * Math.PI) : 0; bb(sprites.person(o.kind, o.seed, 'down', atkFrame(o, Math.hypot(o.x - s.foot.x, o.z - s.foot.z) < 2.6, 1 + (((o.walk || 0) * 1.4 | 0) & 1))), o.x + Math.cos(o.face || 0) * lu * 0.7, o.y, o.z + Math.sin(o.face || 0) * lu * 0.7, sprites.PERSON_SCALE); hpBar(o.id, o.kind, o.x, o.y, o.z); } // a hidden fighter, now revealed
      for (const a of s.qa || []) if (a.isl === isl.id) { // people in your stories: a speaker, a mark to search, or a gang
        if (a.kind === 'find') { bb(sprites.fx('flash'), a.x, a.y + 0.7 + Math.sin(s.t * 3) * 0.2, a.z, 0.3); continue; }
        if (a.kind === 'talk') { if (!a.self) bb(sprites.person('villager', a.seed, 'down', 0), a.x, a.y, a.z, sprites.PERSON_SCALE); bb(sprites.fx('flash'), a.x, a.y + 3.1, a.z, 0.22); continue; }
        const la = s.t - (a.atk ?? -9), lu = la < 0.3 ? Math.sin((la / 0.3) * Math.PI) : 0; bb(sprites.person('sailor', a.seed, 'down', atkFrame(a, Math.hypot(a.x - s.foot.x, a.z - s.foot.z) < 2.6, 1 + (((a.walk || 0) * 1.4 | 0) & 1))), a.x + Math.cos(a.face || 0) * lu * 0.7, a.y, a.z + Math.sin(a.face || 0) * lu * 0.7, sprites.PERSON_SCALE * (a.boss ? 1.18 : 1));
        if (a.awake) bb(sprites.hp(Math.max(0, Math.min(10, Math.ceil((a.hp / a.max) * 10)))), a.x, a.y + (a.boss ? 3.4 : 2.9), a.z, 0.5);
      }
      for (const b of s.fallen || []) if (s.t - b.t < CORPSE_S && Math.hypot(b.x - isl.x, b.z - isl.z) < isl.r * 1.7) bb(sprites.fallen('sailor', b.seed), b.x, b.y + 0.05, b.z, sprites.PERSON_SCALE);
      if (s.ev?.iid === isl.id) (s.ev.crowd || []).forEach(([x, y, z], k) => bb(sprites.person('villager', (isl.seed + k * 131) >>> 0, 'down', ((t * 2 + k) | 0) & 1), x, y, z, sprites.PERSON_SCALE)); // a crowd round the well
      for (const g of s.guards) if (g.isl === isl.id) { // a guard lunges at you when it strikes and flinches when you hit it
        const la = s.t - (g.atk ?? -9), fa = s.t - (g.hitT ?? -9), lu = la < 0.3 ? Math.sin((la / 0.3) * Math.PI) : 0, fl = fa < 0.25 ? Math.sin((fa / 0.25) * Math.PI) : 0, off = lu * 0.7 - fl * 0.5;
        bb(sprites.person('warden', g.seed, 'down', atkFrame(g, Math.hypot(g.x - s.foot.x, g.z - s.foot.z) < 2.6, 1 + (((g.walk || 0) * 5 | 0) & 1))), g.x + Math.cos(g.face || 0) * off, g.y, g.z + Math.sin(g.face || 0) * off, sprites.PERSON_SCALE * (1 - fl * 0.12));
      }
      const hunt = (w, h, id) => { const fr = 1 + (((h.walk || 0) * 1.4 | 0) & 1), x = h.x, z = h.z, y = h.y ?? groundAt(s, x, z);
        if (h.st === 'sub') bb(sprites.fallen('sailor', w.seed), x, y + 0.05, z, sprites.PERSON_SCALE); else { const la = s.t - (h.atk ?? -9), lu = la < 0.3 ? Math.sin((la / 0.3) * Math.PI) : 0; bb(sprites.person('sailor', w.seed, 'down', h.st === 'bound' ? 1 : atkFrame(h, Math.hypot(h.x - s.foot.x, h.z - s.foot.z) < 2.6, fr)), x + Math.cos(h.face || 0) * lu * 0.7, y, z + Math.sin(h.face || 0) * lu * 0.7, sprites.PERSON_SCALE); }
        if (h.st !== 'bound' && s.t - (h.hitT ?? -99) < 12) bb(sprites.hp(Math.max(0, Math.min(10, Math.ceil((h.hp / w.hp) * 10)))), x, y + 2.9, z, 0.5); };
      for (const w of bd) { const h = s.hunts?.[w.id]; if (w.kind === 'foot' && h && h.x !== undefined && (h.st === 'free' || h.st === 'sub') && w.island.id === isl.id) hunt(w, h); } // wanted people hide on their island; a beaten one lies down
      for (const id of s.jailed?.[isl.id] || []) { const w = byId(s, id), k = s.jailed[isl.id].indexOf(id); const b = islandTown(isl).buildings.find((q) => q.jail); if (w && b && k < 3) bb(sprites.person('sailor', w.seed, 'down', 0), b.jail.spawn.x - 0.9 * k, b.pad, b.jail.spawn.z + 0.4 * (k % 2), sprites.PERSON_SCALE); } // prisoners you handed in sit in the cell
      if (s.jailUntil > s.t) for (const b of islandTown(isl).buildings) if (b.jail) bb(sprites.gate(), (b.jail.gate[0] + b.jail.gate[1]) / 2, b.pad, (b.jail.gate[2] + b.jail.gate[3]) / 2, -1); // the cell gate is shut: bars across it
      let props = propCache.get(isl.seed); if (!props) { props = islandProps(isl); for (const p of props) { const h = (x) => islandHeight(isl, x, p.z); p.y = dockDist(isl, p.x, p.z) < 1.8 ? Math.max(h(p.x), DOCK_Y) : FIXED[p.k] ? Math.min(h(p.x - FIXED[p.k]), h(p.x), h(p.x + FIXED[p.k])) - 0.05 : h(p.x); } propCache.set(isl.seed, props); if (propCache.size > 60) propCache.delete(propCache.keys().next().value); }
      // nothing turns with the camera: wide props face one way, round ones are two crossed quads
      for (const p of props) { const dx = p.x - cam.x, dz = p.z - cam.z; if (dx * dx + dz * dz < 36000 && (p.k !== 'tuft' && p.k !== 'flower' || dx * dx + dz * dz < 6400)) { const sp = sprites.prop(p, isl.biome); bb(sp, p.x, p.y, p.z, -1); if (!FIXED[p.k] && p.k !== 'tuft' && p.k !== 'flower') bb(sp, p.x, p.y, p.z, -1000); } }
    }
  }
  const far = R * SECTOR * 1.5 + 600, wp = WORLD_SEA[s?.realm], mix = (a, b, k) => (wp ? wp[k] : a.map((v, i) => lerp(v, b[i], cold))); // Atlantis and Olympus have their own sea and haze
  // the weather greys the sky and the light, thickens the haze and raises the swell
  const wx = s ? weatherNow(s) : null, over = wx ? Math.min(1, Math.max(wx.cloud * 0.75 + wx.storm * 0.25, wx.fog)) : 0, rough = wx ? roughOf(wx) : 1, haze = wx ? 1 + 8 * wx.fog * wx.fog + 0.6 * wx.rain + 0.5 * wx.snow + 0.5 * wx.storm : 1;
  const grey = wx && wx.fog > 0.5 ? [0.7, 0.74, 0.78] : [0.42, 0.47, 0.55], dull = (c) => c.map((v, i) => lerp(v, grey[i] * (wx && wx.storm > 0.5 ? 0.82 : 1), over * 0.8)), shade = (c) => c.map((v) => v * (1 - 0.32 * over));
  // day and night: the sun (or moon) and how dark it is; indoors the lamps keep most of the dark out
  const L = lightAt(s ? hourAt(s.t, s.dayOff) : 12), inside = s && s.mode === 'foot' && sectorIslands(s.seed, sectorOf(cam.x), sectorOf(cam.z)).some((i) => islandTown(i).buildings.some((b) => b.door && Math.abs(cam.x - b.x) < b.w / 2 && Math.abs(cam.z - b.z) < b.d / 2)), night = L.night * (inside ? 0.35 : 1); lastNight = night;
  const dark = (c) => c.map((v, i) => lerp(v, [0.05, 0.07, 0.16][i], night * 0.85));
  renderer.draw({ sun: L.sun, night, dusk: L.dusk,
    cam: { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch, fov: 1.05 }, t, far, extent: R * SECTOR * 1.3 + 200, objects, bb: BB, calm: calmZ,
    pal: { cold, over, rough, density: (2.4 / (R * SECTOR * 0.8 + 300)) * haze, fog: dark(dull(mix([0.62, 0.78, 0.9], [0.82, 0.9, 0.96], 0))), deep: dark(shade(mix([0.02, 0.2, 0.32], [0.04, 0.17, 0.27], 1))), shal: dark(shade(mix([0.1, 0.5, 0.55], [0.3, 0.62, 0.72], 2))), aurora: s && s.realm === 'asgard' ? 0.75 * Math.max(0, 1 - over * 1.6) : 0 },
  });
}
// pixel-art look: the world is drawn at a small internal height (opts.pixels, default 270) and the browser scales it up with hard edges
function resize() {
  const h = SOFT ? 720 : MID ? 540 : Math.max(120, Math.min(720, opts.pixels | 0 || 270));
  renderer?.resize(Math.round((h * innerWidth) / innerHeight), h);
}

// ---------------------------------------------------------------- input
const locked = () => document.pointerLockElement === canvas;
function lock() { try { const p = canvas.requestPointerLock(); p?.catch?.(() => {}); } catch {} }
function unlock() { if (locked()) { expectUnlock = true; setTimeout(() => { expectUnlock = false; }, 400); document.exitPointerLock(); } } // the flag can never stay stuck and swallow a real Esc
// While playing, browser shortcuts (Ctrl+W, Ctrl+B, Ctrl+D, F5...) are blocked. In fullscreen, Chrome/Edge let us capture the
// reserved ones too (Keyboard Lock); everywhere else a "leave site?" prompt is the safety net for Ctrl+W. Escape (pause) releases it all.
let guard = false;
const LOCK_KEYS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => 'Key' + c).concat(['Tab', 'F5', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']);
let kbLocked = false;
function applyGuard() {
  guard = phase === 'play' || phase === 'panel';
  const wantLock = guard && !!document.fullscreenElement;
  if (wantLock === kbLocked) return;
  kbLocked = wantLock;
  try { if (wantLock) navigator.keyboard?.lock?.(LOCK_KEYS); else navigator.keyboard?.unlock?.(); } catch {}
}
function goFullscreen() { if (opts.fullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch?.(() => {}); }
addEventListener('beforeunload', (e) => { if (guard) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('fullscreenchange', () => { kbLocked = false; applyGuard(); resize(); });
let wsel = 0;
addEventListener('keydown', (e) => {
  audio.init();
  if (guard && ((e.ctrlKey || e.metaKey) || (/^F\d+$/.test(e.code) && e.code !== 'F12'))) e.preventDefault();
  if (e.code === 'Tab' || (e.code === 'Space' && phase === 'play')) e.preventDefault();
  if (e.code === 'Backquote' && dbg && s && !e.repeat) { if (dbg.toggle()) unlock(); else if (phase === 'play') lock(); return; }
  if (e.code === 'KeyP' && s && phase === 'play' && !e.repeat) { toggleAfk(); return; }
  if (e.code === 'Escape' && phase === 'play' && !locked()) { pause(); return; }
  if (e.code === 'Escape' && phase === 'paused' && !e.repeat) { ($('pR') || $('oB'))?.click(); return; } // Esc again resumes (or backs out of Options)
  if (e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);
  if (phase === 'panel' && e.code === 'KeyM' && document.getElementById('mapc')) { document.getElementById('mC').click(); return; }
  if (phase === 'panel' && e.code === 'Escape') { ui.closePanel(); phase = 'play'; lock(); return; } // Esc closes any panel and takes the mouse back
  if (phase !== 'play') return;
  if (/^Digit[1-5]$/.test(e.code) && s?.mode === 'foot') wsel = +e.code[5];
  else if (/^Digit[1-3]$/.test(e.code) && s?.mode === 'ship') { const id = ['round', 'chain', 'fire'][+e.code[5] - 1]; if (setShot(s, id)) say(s, AMMO[id].name + ' loaded.'); else say(s, 'You have no ' + AMMO[id].name.toLowerCase() + '. Buy some at the shipwright.'); }
  else if (e.code === 'KeyF') onInteract();
  else if (e.code === 'KeyG' && s?.mode === 'ship') { const r = grapple(s); if (r.type === 'deck') { view.yaw = s.foot.yaw; view.pitch = 0; } }
  else if (e.code === 'KeyB') toggleBombard(s);
  else if (e.code === 'KeyT' && s?.mode === 'ship') cycleOrder(s, say);
  else if (e.code === 'KeyM' && !mapAvailable(s)) say(s, 'You have no map. An old cartographer in Port Haven might part with one for a favour.');
  else if (e.code === 'KeyM') { phase = 'panel'; unlock(); ui.map(s, () => { phase = 'play'; lock(); }, (id) => { phase = 'warp'; ui.fade(true); setTimeout(() => { travelTo(s, id); const f = s.mode === 'ship' ? s.ship : s.foot; clearLife(); updateSectors(f.x, f.z, true); view.yaw = s.mode === 'ship' ? s.ship.yaw : s.foot.yaw; view.pitch = 0; cam.blend = s.mode === 'ship' ? 1 : 0; orbit.yaw = 0; orbit.pitch = -0.22; keys.clear(); ui.fade(false); phase = 'play'; lock(); saveGame(s); }, 900); }); }
  else if (e.code === 'KeyR') toggleAuto(s);
  else if (e.code === 'KeyO') toggleRow(s);
  else if (e.code === 'Tab') { phase = 'panel'; unlock(); ui.questLog(s, () => { phase = 'play'; lock(); }); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('mousedown', (e) => { if (e.button === 0 && phase === 'play' && locked()) mouseDown = true; });
addEventListener('mouseup', () => { mouseDown = false; });
addEventListener('blur', () => keys.clear());
addEventListener('mousemove', (e) => {
  if (phase !== 'play' || !locked()) return;
  const k = 0.0022 * opts.sens, cl = (v) => Math.max(-200, Math.min(200, v)); // Chrome can report one huge jump when the lock is (re)acquired: it must not pin the view straight up
  const mvX = cl(e.movementX), mvY = cl(e.movementY);
  if (s.mode === 'foot') { view.yaw += mvX * k; view.pitch = Math.max(-1.45, Math.min(1.45, view.pitch - mvY * k)); }
  else { orbit.yaw += mvX * k; orbit.pitch = Math.max(-0.9, Math.min(0.15, orbit.pitch - mvY * k)); orbit.idle = 0; }
});
canvas.addEventListener('click', () => { audio.init(); if (phase === 'play' && !locked()) { goFullscreen(); lock(); } }); // only the click that captures the mouse may go fullscreen: attack clicks must never drop the pointer lock
document.addEventListener('pointerlockchange', () => {
  ui.crosshair(locked() && s?.mode === 'foot');
  if (locked()) return;
  if (expectUnlock) { expectUnlock = false; return; }
  if (phase === 'play' && !opts.afk && !dbg?.open) pause();
});
addEventListener('resize', resize);

function onInteract() {
  const r = interact(s);
  if (r.type === 'npc') {
    phase = 'panel'; unlock();
    ui.dialog(s, r, { island: standingOn(s), audio, say: (m) => say(s, m), onChange: () => saveGame(s), onClose: () => { phase = 'play'; lock(); saveGame(s); } });
  } else if (r.type === 'side') { phase = 'panel'; unlock(); ui.side(s, r, () => { phase = 'play'; lock(); saveGame(s); });
  } else if (r.type === 'prize') { phase = 'panel'; unlock(); ui.prize(s, () => { phase = 'play'; lock(); saveGame(s); });
  } else if (r.type === 'news') { phase = 'panel'; unlock(); ui.news(s, r.island, () => { phase = 'play'; lock(); saveGame(s); });
  } else if (r.type === 'ashore') { view.yaw = s.foot.yaw; view.pitch = 0; saveGame(s); }
  else if (r.type === 'board') { orbit.yaw = 0; orbit.pitch = -0.22; orbit.idle = 0; saveGame(s); }
  else if (r.type === 'dig') { audio.coin(); saveGame(s); }
}

// ---------------------------------------------------------------- flow: menu -> intro -> play -> pause / ending / game over
const getOptions = () => opts;
const setOptions = (o) => { opts = o; saveOptions(o); audio.setVolume(o.volume); resize(); };
function showMenu() {
  phase = 'menu'; s = null; ui.hud(false); ui.crosshair(false); ui.loading(false);
  ui.menu({ hasSave: hasSave(), getOptions, setOptions, onNew: newGameFlow, onContinue: continueFlow });
}
function startPlay(game, then) {
  s = game; ui.fade(true); if (SEED !== s.seed) { SEED = s.seed; dropSectors(); }
  setTimeout(() => {
    const px = s.mode === 'ship' ? s.ship.x : s.foot.x, pz = s.mode === 'ship' ? s.ship.z : s.foot.z;
    updateSectors(px, pz, true); view.yaw = s.foot.yaw; view.pitch = 0; cam.blend = s.mode === 'ship' ? 1 : 0; orbit.yaw = 0; orbit.pitch = -0.22;
    ui.hud(true); phase = 'play'; ui.fade(false); saveT = 0; then?.();
  }, 850);
}
async function newGameFlow() {
  goFullscreen(); phase = 'intro';
  await ui.intro([
    'Tuesday night. A documentary murmurs in a quiet apartment.',
    '“…the Wall. A cliff of ice ringing the whole world. Every map ends at it. No expedition has returned to say what lies beyond.”',
    'The narrator calls it a legend. You cannot stop thinking about it.',
    'By morning your savings are spent and you are standing in Port Haven, the last harbour on the maps, with a one-way ticket and a lot of questions.',
    'Time to find out if the Wall is real.',
  ]);
  startPlay(newGame(BASE_SEED), () => { phase = 'panel'; unlock(); ui.welcome(() => { phase = 'play'; lock(); }); });
}
function continueFlow() { goFullscreen(); const g = loadGame(); if (!g) return newGameFlow(); startPlay(g); }
function pause() {
  phase = 'paused'; unlock();
  ui.pause({ getOptions, setOptions, onResume: () => { phase = 'play'; lock(); }, onSave: () => saveGame(s), onQuit: () => { saveGame(s); showMenu(); } });
}

// crossing to another world: a banner, a fade, the swap (old realm's caches dropped), then the new one fades in
function startWarp(to) {
  if (phase !== 'play') return; phase = 'warp'; ui.cine(false); ui.banner(warpText(s, to), to === 'terra' ? '' : 'Past the edge of the charts', 2600); ui.fade(true);
  setTimeout(() => {
    warpNow(s); SEED = s.seed; clearLife(); dropSectors(); updateSectors(s.ship.x, s.ship.z, true); cam.blend = 1; orbit.yaw = 0; orbit.pitch = -0.22; view.yaw = s.ship.yaw; keys.clear();
    ui.fade(false); phase = 'play'; saveGame(s);
  }, 1500);
}
// ---------------------------------------------------------------- AFK mode: the game keeps running when you tab away or let go of the mouse (P, or Options).
// Browsers stop animation frames in hidden tabs, so a tiny worker keeps the clock going there (nothing is drawn while hidden).
let hiddenAt = 0, badge = null;
const showAfk = () => { if (!badge) { badge = document.createElement('div'); badge.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(130px);z-index:9;padding:3px 8px;border:1px solid #c9a13a;border-radius:4px;background:rgba(10,14,22,.85);color:#f3d98a;font:12px monospace;pointer-events:none'; badge.textContent = 'AFK ON (P)'; document.body.appendChild(badge); } badge.style.display = opts.afk && s ? 'block' : 'none'; };
function toggleAfk() { setOptions({ ...opts, afk: !opts.afk }); if (s) say(s, opts.afk ? 'AFK mode on: the game keeps running when you tab away. Enemies can still reach you.' : 'AFK mode off: letting go of the mouse pauses again.'); }
try {
  const clock = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 100)'], { type: 'text/javascript' })));
  clock.onmessage = () => { if (!(opts.afk && document.hidden && s && renderer)) { hiddenAt = 0; return; } const now = performance.now(); if (!hiddenAt) { hiddenAt = now; return; } const el = Math.min(2, (now - hiddenAt) / 1000); hiddenAt = now; T += el; advance(el, 150); };
} catch { /* no workers here: AFK then only covers losing the mouse */ }
const weatherFx = createWeatherFx((delay, gain) => audio.thunder(delay, gain));
const dbg = debugEnabled() ? createDebug({
  get: () => s, say,
  teleport: () => { clearLife(); updateSectors(s.ship.x, s.ship.z, true); cam.blend = 1; view.yaw = s.ship.yaw; orbit.yaw = 0; },
  warp: (to) => { if ((s.realm || 'terra') === to) { say(s, 'You are already in ' + to + '.'); return; } if (phase === 'warp') return; if (phase === 'paused' || phase === 'panel') { document.getElementById('pause')?.classList.remove('on'); document.getElementById('panel')?.classList.remove('on'); } phase = 'play'; s.cine = null; s.warp = { to, t0: s.t, ang: -1.5 }; startWarp(to); },
  info: () => 'music ' + audio.style + '  fps ' + (window.__fps || 0).toFixed(0) + '  cpu ' + (window.__ms?.step || 0).toFixed(2) + '+' + (window.__ms?.draw || 0).toFixed(2) + ' ms  sectors ' + sectors.size + (performance.memory ? '  heap ' + Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : ''),
}) : null;
// ---------------------------------------------------------------- main loop
// what the ears should hear: at sea, or ashore, and how busy the town around you is (louder near the plaza, bigger in cities)
const soundScene = () => sceneOf(s, s.mode === 'foot' ? standingOn(s) : null);
let prevMode = null, last = performance.now(), acc = 0, T = 0, fpsN = 0, fpsT = 0;
// one slice of game time: step the rules and react to what happened
function advance(dt, maxSteps) {
  if (s && phase === 'play') {
    acc += dt;
    for (let n = 0; acc >= DT && n < maxSteps; n++, acc -= DT) {
      const on = (k) => (keys.has(k) ? 1 : 0);
      step(s, s.mode === 'ship'
        ? { rudder: on('KeyD') - on('KeyA'), sail: on('KeyW') - on('KeyS'), trim: on('KeyC') - on('KeyZ'), fireL: keys.has('KeyQ'), fireR: keys.has('KeyE') }
        : { mx: on('KeyD') - on('KeyA'), mz: on('KeyW') - on('KeyS'), run: keys.has('ShiftLeft') || keys.has('ShiftRight'), jump: keys.has('Space'), yaw: view.yaw, attack: keys.has('KeyQ') || mouseDown, wsel: (() => { const w = wsel; wsel = 0; return w; })() }, DT);
    }
    for (const ev of s.events) {
      if (ev.type === 'cannon') audio.boom(1 / (1 + Math.hypot(ev.x - (s.ship?.x || 0), ev.z - (s.ship?.z || 0)) / 60));
      else if (ev.type === 'slash') { audio.slash(ev.hit); ui.slash(ev.w, ev.hit); } else if (ev.type === 'kill') audio.boom(0.25); else if (ev.type === 'grapple') { view.yaw = ev.yaw; view.pitch = 0; audio.boom(0.5); } else if (ev.type === 'won') { audio.quest(); phase = 'panel'; unlock(); ui.prize(s, () => { phase = 'play'; lock(); saveGame(s); }); } else if (ev.type === 'arrest') { view.yaw = s.foot.yaw = ev.yaw; view.pitch = 0; mouseDown = false; keys.clear(); }
      else if (ev.type === 'cine') { ui.cine(true); audio.boom(0.8); audio.crack(); } else if (ev.type === 'break') { ui.flash(); rebuildWall(); audio.iceBreak(); } else if (ev.type === 'banner') { ui.cine(false); ui.banner(ev.text, ev.sub, 4200); audio.quest(); saveGame(s); } else if (ev.type === 'warp') startWarp(ev.to);
      else if (ev.type === 'serpent') audio.boom(0.55); else if (ev.type === 'splash') audio.splash(1);
      else if (ev.type === 'hit') { audio.hit(); if (s.mode === 'foot') ui.hurt(); } else if (ev.type === 'coin' || ev.type === 'sunk') audio.coin(); else if (ev.type === 'quest') { audio.quest(); saveGame(s); } else if (ev.type === 'choice') { phase = 'panel'; unlock(); ui.choice(() => { phase = 'play'; lock(); }); }
    }
    s.events.length = 0;
    saveT += dt; if (saveT > 30) { saveT = 0; saveGame(s); }
    if (s.over) { phase = 'over'; unlock(); ui.gameOver({ hasSave: hasSave(), onLoad: continueFlow, onMenu: showMenu }); }
  }
  dbg?.tick();
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; T += dt;
  applyGuard();
  if (renderer.lost) { ui.error('The graphics device was lost: ' + renderer.lost + '. Reload the page.'); return; }
  const p0 = performance.now();
  if (!(opts.afk && document.hidden)) advance(dt, 5);
  const p1 = performance.now();
  updateCamera(dt, T);
  const fx = s ? (s.mode === 'ship' && s.ship ? s.ship.x : s.foot.x) : cam.x, fz = s ? (s.mode === 'ship' && s.ship ? s.ship.z : s.foot.z) : cam.z;
  updateSectors(fx, fz);
  render(T);
  { const live = s && phase !== 'menu', w = live ? weatherNow(s) : null, indoors = live && w.rain + w.snow > 0 && s.mode === 'foot' && !s.deck && (standingOn(s) ? islandTown(standingOn(s)).buildings.some((b) => Math.abs(b.x - s.foot.x) < b.w / 2 && Math.abs(b.z - s.foot.z) < b.d / 2) : false);
    weatherFx.draw(dt, w, live ? Math.sin(s.wind.dir - cam.yaw) : 0, indoors); audio.weather(w && !indoors ? w.rain : 0, w ? w.storm : 0); }
  if (s && (phase === 'play' || phase === 'panel')) { // the HUD keeps up while a shop is open (gold after a purchase)
    const pr = prompt(s) || (!locked() ? 'Click to capture the mouse' : null);
    if (s.mode !== prevMode) { prevMode = s.mode; ui.tips(s.mode === 'ship'); }
    ui.updateHud(s, { prompt: pr, yaw: cam.yaw, moving: ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some((k) => keys.has(k)), night: lastNight }); showAfk();
    audio.update(s.ship?.speed || 0, s.realm === 'asgard' ? 0.85 : s.realm === 'atlantis' || s.realm === 'olympus' ? 0 : Math.max(0, Math.min(1, (Math.hypot(cam.x, cam.z) / WALL_R - 0.5) / 0.4)), soundScene());
  }
  const p2 = performance.now(), M = (window.__ms ||= { step: 0, draw: 0 }); M.step += (p1 - p0 - M.step) * 0.05; M.draw += (p2 - p1 - M.draw) * 0.05; // smoothed CPU milliseconds a frame
  fpsN++; fpsT += dt; if (fpsT > 1) { window.__fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
}

(async () => {
  try {
    renderer = await createRenderer(canvas); sprites = createSprites(renderer);
  } catch (e) { ui.error(e.message); return; }
  audio.setVolume(opts.volume); resize();
  window.__pk = { sheet: () => { const kinds = Object.keys(CRIT_BOX), c = document.createElement('canvas'); c.width = 900; c.height = kinds.length * 70; const g = c.getContext('2d'); g.fillStyle = '#4a86b8'; g.fillRect(0, 0, c.width, c.height); kinds.forEach((k, i) => { let x = 4; for (const fr of [0, 1, 2]) for (const d of ['R', 'L']) { const b = bake(CRIT_BOX[k], 10, (q) => paintCritter(q, k, d, fr)); quantize(b.c); g.drawImage(b.c, x, i * 70 + 4); x += b.c.width + 6; } g.fillStyle = '#fff'; g.font = '11px sans-serif'; g.fillText(k, 4, i * 70 + 66); }); return c.toDataURL(); }, lifeAt, home: homeIsland, town: islandTown, get s() { return s; }, get phase() { return phase; }, cam, view, opts, sectors, newGame: () => startPlay(newGame(BASE_SEED)), warp: () => warpNow(s), startWarp: (to) => startWarp(to), updateSectors, interact: onInteract, T: () => T, step, board, handIn, fighterOf, townsfolk, sectorIslands, folkPos, islandProps };
  updateSectors(homeIsland().x, homeIsland().z, true); // warm the sea behind the menu
  showMenu(); requestAnimationFrame(loop);
})();
