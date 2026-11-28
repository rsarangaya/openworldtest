// Going down with the diver, played: a scripted captain sails for a wreck, heaves to over her, presses F and follows the diver's path
// (what the camera shows under the surface). The diver starts beside the ship, stays under water and above the floor, reaches the wreck
// and circles her close enough to see through the murk, moves smoothly, and comes back up beside the ship. Also the kraken's den.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, prompt, toggleRow } from '../src/rules/game.js';
import { wrecks, diverAt, diveStage, FLOOR } from '../src/rules/salvage.js';
import { enterRealm } from '../src/rules/realm.js';
import { SHIPS } from '../src/rules/ships.js';

const atSea = (s, x, z) => { s.shipClass = 'brigantine'; s.maxHull = s.hull = SHIPS.brigantine.hull; s.hold = SHIPS.brigantine.hold; s.food = 30; s.ship = { x, z, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; s.mode = 'ship'; s.weather = null; return s; };
const clear = (s) => { for (const id of s.enemies.keys()) s.dead.add(id); s.enemies.clear(); s.events.length = 0; };
// follow one dive: every step, the diver's place; checks the path as it goes
function follow(s, wx, wz, deep) {
  const fy = -(deep ? FLOOR.deep : FLOOR.near), path = []; let prev = null, nearest = 1e9;
  while (s.dive) {
    const v = diverAt(s); assert.ok(v, 'no diver position while down');
    assert.ok(v.y <= -2.3 && v.y >= fy + 1, `the diver left the water column: y ${v.y.toFixed(2)} (floor ${fy})`);
    assert.equal(v.floor, fy); assert.ok(Math.abs(v.wx - wx) < 1e-9 && Math.abs(v.wz - wz) < 1e-9, 'looking at the wrong place');
    if (prev) assert.ok(Math.hypot(v.x - prev.x, v.y - prev.y, v.z - prev.z) < 3, 'the camera jumped');
    if (diveStage(s).phase === 'search') { const d = Math.hypot(v.x - wx, v.z - wz); assert.ok(d < 18, 'searching too far off: ' + d); }
    const lx = Math.cos(v.yaw), lz = Math.sin(v.yaw); assert.ok(((wx - v.x) * lx + (wz - v.z) * lz) >= 0, 'looking away from the wreck');
    nearest = Math.min(nearest, Math.hypot(v.x - wx, v.z - wz)); path.push(v); prev = v; step(s, {}); clear(s);
  }
  return { path, nearest };
}

for (const [world, i] of [['terra', 0], ['terra', 3], ['asgard', 1], ['olympus', 2]]) test(`a captain sails to the ${world} wreck ${i}, dives and goes down with the diver`, () => {
  const s = newGame(4242); if (world !== 'terra') { s.flags.crossed = true; enterRealm(s, world); }
  const w = wrecks(s.seed, world === 'terra' ? '' : world)[i]; atSea(s, w.x - 120, w.z + 40); clear(s);
  let dived = false; toggleRow(s); // oars out: wind or not
  for (let k = 0; k < 4000 && !dived; k++) { // row for her, ship the oars close by, press F when the prompt offers the dive
    const p = s.ship, a = Math.atan2(w.z - p.z, w.x - p.x), dyaw = Math.atan2(Math.sin(a - p.yaw), Math.cos(a - p.yaw)), d = Math.hypot(w.x - p.x, w.z - p.z);
    if (d < 22 && s.row) toggleRow(s);
    const inp = { rudder: Math.max(-1, Math.min(1, dyaw * 2)), sail: -1 };
    if (d < 30 && Math.abs(p.speed) <= 2 && /dive|diver/i.test(prompt(s) || '')) { interact(s); dived = !!s.dive; if (!dived) throw new Error(s.log.at(-1)); break; }
    step(s, inp); clear(s); s.food = 30; s.hull = s.maxHull;
  }
  assert.ok(dived, 'never got to dive: ' + s.log.at(-1));
  const p = { x: s.ship.x, z: s.ship.z }, { path, nearest } = follow(s, w.x, w.z, w.deep);
  assert.ok(path.length > 30, 'too short a dive');
  assert.ok(Math.hypot(path[0].x - p.x, path[0].z - p.z) < 6 && Math.hypot(path.at(-1).x - p.x, path.at(-1).z - p.z) < 10, 'the diver did not start and end at the ship');
  assert.ok(nearest < 18, 'never got close to the wreck');
  assert.ok(Math.min(...path.map((v) => v.y)) < -(w.deep ? FLOOR.deep : FLOOR.near) + 5, 'never got down to the floor');
  assert.equal(diverAt(s), null, 'still under after the diver surfaced');
});

test('down to the kraken den: the diver goes to the den under the lair, not the ship', async () => {
  const { krakenLairs } = await import('../src/rules/kraken.js');
  const s = newGame(31); s.flags.crossed = true; enterRealm(s, 'atlantis'); const l = krakenLairs(s.seed)[0]; atSea(s, l.x + 12, l.z); clear(s);
  s.kraken = { lair: l.id, lx: l.x, lz: l.z, hp: 600, maxHp: 1200, grip: false, den: true, t0: s.t, side: 1, sq: 0, burn: 0, kind: 'kraken', yaw: 0, speed: 0 };
  assert.match(prompt(s), /kraken's den/); interact(s); assert.ok(s.dive?.den, 'no den dive: ' + s.log.at(-1));
  const { nearest } = follow(s, l.x, l.z, true); assert.ok(nearest < 18);
});
