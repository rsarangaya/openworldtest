// Draugr longships, played: a scripted captain sails to a sea barrow in Asgard, keeps each dead longship abeam and fires, through the real game rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, grapple } from '../src/rules/game.js';
import { enterRealm } from '../src/rules/realm.js';
import { barrows, WAKE_R, LEAVE_R, PACK } from '../src/rules/draugr.js';
import { newsFor, ISSUE_LEN } from '../src/rules/news.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { onLand, sectorIslands, KINDS } from '../src/gen/world.js';
import { SHIPS } from '../src/rules/ships.js';

const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
const inAsgard = (seed, cls = 'galleon', ammo = { chain: 0, fire: 40 }) => {
  const s = newGame(seed); s.flags.crossed = true; enterRealm(s, 'asgard'); const b = barrows(s.seed)[0];
  s.shipClass = cls; s.maxHull = s.hull = SHIPS[cls].hull; s.hold = SHIPS[cls].hold; s.food = 30; s.ammo = ammo;
  s.ship = { x: b.x - WAKE_R - 40, z: b.z, yaw: 0, speed: 0, sail: 0.5, cd: [0, 0] }; s.mode = 'ship'; return { s, b };
};
// a captain who wants the pack sunk: sail for the barrow, then bring the nearest dead ship abeam and fire that side
function fight(s, b, secs) {
  const log = { rose: false, shots: 0, maxPack: 0 };
  for (let i = 0; i < secs * 60; i++) {
    const p = s.ship, inp = { sail: 0.6 }; let e = null, ed = 1e9;
    for (const q of s.enemies.values()) if (q.kind === 'draugr') { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < ed) { ed = d; e = q; } }
    if (e) {
      const rel = wrap(Math.atan2(e.z - p.z, e.x - p.x) - p.yaw), side = rel < 0 ? -1 : 1, off = rel - side * Math.PI / 2;
      inp.rudder = Math.max(-1, Math.min(1, off * 2)); if (Math.abs(off) < 0.45 && ed < 90) inp[side < 0 ? 'fireL' : 'fireR'] = true;
      s.shot = s.ammo.fire ? 'fire' : 'round';
    } else if (!s.draugr) { inp.sail = 1; inp.rudder = Math.max(-1, Math.min(1, wrap(Math.atan2(b.z - p.z, b.x - p.x) - p.yaw) * 2)); }
    const n0 = s.shots.length; step(s, inp); if (s.shots.length > n0) log.shots++;
    if (s.draugr) { log.rose = true; log.maxPack = Math.max(log.maxPack, s.draugr.ids.length); } s.events.length = 0;
    if ((s.slain || []).includes(b.id) || s.hull <= 0) break;
  }
  return log;
}

test('each Asgard world has three sea barrows in open water, and none of them raise a pack on Terra', () => {
  for (const seed of [1717, 7]) {
    const s = newGame(seed); enterRealm(s, 'asgard'); const B = barrows(s.seed); assert.equal(B.length, 3, 'seed ' + seed);
    for (const b of B) assert.ok(!onLand(s.seed, b.x, b.z, 100), `${seed} ${b.id} is near land`);
  }
  const t = newGame(1717), b = barrows(t.seed)[0]; t.ship = { x: b.x, z: b.z, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; t.mode = 'ship';
  for (let i = 0; i < 90; i++) step(t, {}); assert.equal(t.draugr ?? null, null);
});

test('Asgard notice boards rumour the barrow with a bearing', () => {
  const { s } = inAsgard(1717), isl = sectorIslands(s.seed, 0, 0)[0] || sectorIslands(s.seed, 1, 0)[0]; let body = null;
  for (let n = 0; n < 6 && !body; n++) { s.t = n * ISSUE_LEN + 1; body = newsFor(s, isl).items.find((q) => q.head === 'The sea barrow')?.body; }
  assert.ok(body, 'no barrow rumour in six issues'); assert.match(body, /to the (north|south|east|west)/);
});

test('a captain with fire shot sinks the whole pack, lays the barrow to rest, and it stays quiet through a save', () => {
  const { s, b } = inAsgard(1717); const g0 = s.gold;
  const log = fight(s, b, 300);
  assert.ok(log.rose, 'the pack never rose'); assert.equal(log.maxPack, PACK); assert.ok(log.shots >= 6, 'no shots fired');
  assert.ok(s.slain.includes(b.id), `not at rest: ${[...s.enemies.values()].filter((e) => e.kind === 'draugr').map((e) => e.hp.toFixed(0))}, hull ${s.hull.toFixed(0)}`);
  assert.ok(s.hull > 0); assert.equal(s.killsBy.draugr, PACK); assert.ok(s.gold >= g0 + 450 + PACK * KINDS.draugr.gold[0]);
  const t = deserialize(serialize(s)); assert.ok(t.slain.includes(b.id)); assert.equal(t.draugr, undefined);
  for (let i = 0; i < 120; i++) step(t, {}); assert.equal(t.draugr ?? null, null, 'a quiet barrow rose again');
});

test('iron only half bites the dead, fire bites harder, they cannot be boarded, and they sink back when you leave', () => {
  const { s, b } = inAsgard(1717); s.ship.x = b.x - 60; for (let i = 0; i < 70; i++) step(s, {}); assert.ok(s.draugr, 'no pack');
  const e = s.enemies.get(s.draugr.ids[0]), hp = e.hp;
  s.shots.push({ x: e.x, z: e.z, vx: 0, vz: 0, life: 1, owner: 'player', dmg: 20, kind: 'round' }); step(s, {}); assert.ok(Math.abs(hp - e.hp - 10) < 1, 'round shot did ' + (hp - e.hp));
  const h2 = e.hp; s.shots.push({ x: e.x, z: e.z, vx: 0, vz: 0, life: 1, owner: 'player', dmg: 20, kind: 'fire' }); step(s, {}); assert.ok(h2 - e.hp >= 24, 'fire did ' + (h2 - e.hp));
  Object.assign(e, { x: s.ship.x + 8, z: s.ship.z }); assert.equal(grapple(s).type, 'none'); assert.ok(!s.deck); assert.match(s.log.at(-1), /dead crew/);
  s.ship.x = b.x - LEAVE_R - 30; step(s, {}); assert.equal(s.draugr, null); assert.ok(![...s.enemies.values()].some((q) => q.kind === 'draugr'), 'the dead stayed up');
});
