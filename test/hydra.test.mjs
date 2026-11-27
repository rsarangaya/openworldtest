// The hydra, played: scripted captains sail at its lair in Olympus through the real game rules. One circles it and shoots with round shot only
// (its heads multiply); one switches to fire shot whenever a stump is open (and kills it); one heaves to in its reach and is bitten; one sails away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step } from '../src/rules/game.js';
import { enterRealm } from '../src/rules/realm.js';
import { hydraLairs, HEADS, LEAVE_R, GOLD, reach } from '../src/rules/hydra.js';
import { newsFor, ISSUE_LEN } from '../src/rules/news.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { sectorIslands, onLand } from '../src/gen/world.js';
import { SHIPS } from '../src/rules/ships.js';

const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
const atSea = (seed, out = 190, fire = 20) => {
  const s = newGame(seed); enterRealm(s, 'olympus'); const l = hydraLairs(s.seed)[0];
  s.shipClass = 'brigantine'; s.maxHull = s.hull = SHIPS.brigantine.hull; s.hold = SHIPS.brigantine.hold; s.food = 30; s.ammo = { chain: 0, fire };
  s.ship = { x: l.x - out, z: l.z, yaw: 0, speed: 0, sail: 0.5, cd: [0, 0] }; s.mode = 'ship'; s.enemies.clear(); return { s, l };
};
// sail broadside passes across the wind about 45 units off it, turning back each time she is well past, and fire the side that bears;
// swerve away whenever its heads could reach her. `smart` loads fire shot while a stump is open, round shot otherwise
function fight(s, l, secs, smart) {
  const log = { maxHeads: 0, regrew: 0, bites: 0, seared: 0 }; let dir = 1;
  for (let i = 0; i < secs * 60; i++) {
    const p = s.ship, m = s.hydra, tx = m ? m.x : l.x, tz = m ? m.z : l.z, d = Math.hypot(tx - p.x, tz - p.z), bear = Math.atan2(tz - p.z, tx - p.x);
    const u = s.wind.dir + Math.PI / 2, ux = Math.cos(u), uz = Math.sin(u), side = (p.x - tx) * uz - (p.z - tz) * ux >= 0 ? 1 : -1;
    const along = (p.x - tx) * ux + (p.z - tz) * uz; if (along * dir > 80) dir = -dir; // well past: come about for the next pass
    const gx = tx + uz * side * 45 + ux * dir * 100, gz = tz - ux * side * 45 + uz * dir * 100;
    const want = m && d < reach(m.heads) + 10 ? bear + Math.PI : Math.atan2(gz - p.z, gx - p.x);
    const inp = { sail: 1, rudder: Math.max(-1, Math.min(1, wrap(want - p.yaw) * 2)) }, rel = wrap(bear - p.yaw);
    if (m && d < 70) { if (Math.abs(rel + Math.PI / 2) < 0.5) inp.fireL = true; if (Math.abs(rel - Math.PI / 2) < 0.5) inp.fireR = true; s.shot = smart && m.stumps.length && s.ammo.fire ? 'fire' : 'round'; }
    const h0 = m?.heads ?? 0; step(s, inp); const n = s.hydra;
    if (n) { log.maxHeads = Math.max(log.maxHeads, n.heads); if (m && n.heads > h0) log.regrew++; }
    for (const t of s.log.splice(0)) { if (/strike/.test(t)) log.bites++; if (/sears|stays seared/.test(t)) log.seared++; }
    s.events.length = 0; if ((s.slain || []).includes(l.id) || s.hull <= 0) break;
  }
  return log;
}

test('each Olympus world has one hydra lair in open water; Terra, Asgard and Atlantis have none', () => {
  for (const seed of [1717, 7, 42]) {
    const s = newGame(seed); enterRealm(s, 'olympus'); const L = hydraLairs(s.seed); assert.equal(L.length, 1, 'seed ' + seed); assert.ok(!onLand(s.seed, L[0].x, L[0].z, 100), 'lair near land');
  }
  for (const r of ['terra', 'asgard', 'atlantis']) {
    const s = newGame(1717); if (r !== 'terra') enterRealm(s, r); const l = hydraLairs(s.seed)[0];
    s.ship = { x: l.x + 60, z: l.z, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; s.mode = 'ship'; for (let i = 0; i < 120; i++) step(s, {}); assert.equal(s.hydra ?? null, null, r + ' has a hydra');
  }
});

test('Olympus notice boards rumour the hydra with a bearing, and still rumour the cyclops in other issues', () => {
  const { s } = atSea(1717); const heads = new Set(); let body = null;
  for (let n = 0; n < 12; n++) for (const isl of sectorIslands(s.seed, 0, 0)) { s.t = n * ISSUE_LEN + 1; for (const q of newsFor(s, isl).items) { heads.add(q.head); if (q.head === 'A hydra') body = q.body; } }
  assert.ok(body, 'no hydra rumour in twelve issues'); assert.match(body, /to the (north|south|east|west)/); assert.ok(heads.has('A cyclops'), 'the cyclops rumour went away');
});

test('it rises when you come near, and a captain who heaves to in its reach is bitten by every head', () => {
  const { s, l } = atSea(1717, 150); for (let i = 0; i < 120 && !s.hydra; i++) step(s, {});
  assert.ok(s.hydra, 'it never rose'); assert.equal(s.hydra.heads, HEADS);
  s.ship.x = s.hydra.x - 12; s.ship.z = s.hydra.z; s.ship.sail = 0; const h = s.hull;
  for (let i = 0; i < 60 * 10; i++) step(s, { sail: 0 });
  assert.ok(h - s.hull >= 6 * HEADS, `only ${h - s.hull} hull lost in ten seconds`); assert.ok(Math.hypot(s.hydra.x - l.x, s.hydra.z - l.z) < 100, 'it strayed from its lair');
});

test('round shot alone only feeds it: cut heads grow back two for one', () => {
  const { s, l } = atSea(1717, 190, 0); const log = fight(s, l, 90, false);
  assert.ok(log.regrew >= 2, `heads regrew ${log.regrew} times`); assert.ok(log.maxHeads > HEADS, `never more than ${log.maxHeads} heads`);
  assert.ok(!(s.slain || []).includes(l.id), 'killed with round shot alone');
});

test('a captain who sears the stumps with fire shot kills it, is paid, and it stays dead through a save', () => {
  const { s, l } = atSea(1717); const g0 = s.gold; const log = fight(s, l, 240, true);
  assert.deepEqual(s.slain, [l.id], `not slain: ${s.hydra?.heads} heads, ${s.hydra?.stumps.length} stumps, hull ${s.hull}`);
  assert.ok(s.hull > 0); assert.ok(log.seared >= 1, 'never seared a stump'); assert.ok(s.gold >= g0 + GOLD); assert.equal(s.killsBy.hydra, 1);
  assert.ok(newsFor(s, sectorIslands(s.seed, 0, 0)[0]).items.length);
  const t = deserialize(serialize(s)); assert.deepEqual(t.slain, [l.id]); assert.equal(t.hydra, undefined);
  t.ship.x = l.x - 80; t.ship.z = l.z; for (let i = 0; i < 300; i++) step(t, {}); assert.equal(t.hydra ?? null, null, 'a slain hydra rose again');
});

test('sail away and it sinks; come back and it has three heads again', () => {
  const { s, l } = atSea(1717, 150); for (let i = 0; i < 120 && !s.hydra; i++) step(s, {}); s.hydra.heads = 6;
  s.ship.x = l.x - LEAVE_R - 20; step(s, {}); assert.equal(s.hydra, null, 'it did not sink');
  s.ship.x = l.x - 150; for (let i = 0; i < 70; i++) step(s, {}); assert.equal(s.hydra?.heads, HEADS);
  enterRealm(s, 'atlantis'); assert.equal(s.hydra, null, 'it followed into another world');
});
