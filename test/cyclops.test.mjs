// The cyclops, played: scripted captains sail at his beach in Olympus through the real game rules. One dodges the foam rings and works in close
// to fire broadsides; one heaves to and is pounded; one turns away and lets him heal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step } from '../src/rules/game.js';
import { enterRealm } from '../src/rules/realm.js';
import { cyclopsLairs, RANGE, LEAVE_R, HP, SPLASH_R } from '../src/rules/cyclops.js';
import { newsFor, ISSUE_LEN } from '../src/rules/news.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { sectorIslands } from '../src/gen/world.js';
import { SHIPS } from '../src/rules/ships.js';

const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
const atSea = (seed, cls = 'brigantine', out = 200) => {
  const s = newGame(seed); enterRealm(s, 'olympus'); const l = cyclopsLairs(s.seed)[0], a = Math.atan2(l.z - l.cz, l.x - l.cx);
  s.shipClass = cls; s.maxHull = s.hull = SHIPS[cls].hull; s.hold = SHIPS[cls].hold; s.food = 30; s.ammo = { chain: 6, fire: 6 };
  s.ship = { x: l.x + Math.cos(a) * out, z: l.z + Math.sin(a) * out, yaw: a + Math.PI, speed: 0, sail: 0.5, cd: [0, 0] }; s.mode = 'ship'; s.enemies.clear(); return { s, l, a };
};
// a captain who wants him dead: run in to about 55 units, then sail back and forth along the shore with him abeam, firing the broadside that
// bears, and swerve whenever a foam ring is round her
function fight(s, l, a, secs) {
  const log = { throws: 0, hits: 0, shots: 0, dodged: 0 }; let dir = 1, seen = new Set();
  for (let i = 0; i < secs * 60; i++) {
    const p = s.ship, m = s.cyclops, d = Math.hypot(l.x - p.x, l.z - p.z), inp = { sail: 1 };
    const bear = Math.atan2(l.z - p.z, l.x - p.x);
    let want = d > 70 ? bear : d < 40 ? bear + Math.PI : a + (Math.PI / 2) * dir; // in, out, or along the shore
    if (m) for (const r of m.rocks) { if (!seen.has(r)) { seen.add(r); log.throws++; } if (Math.hypot(r.tx - p.x, r.tz - p.z) < SPLASH_R + 6) { want = Math.atan2(p.z - r.tz, p.x - r.tx); inp.sail = 1; } }
    if (Math.floor(s.t / 9) % 2) dir = -1; else dir = 1;
    inp.rudder = Math.max(-1, Math.min(1, wrap(want - p.yaw) * 2));
    if (m?.awake && d < 85) { inp.fireL = inp.fireR = true; s.shot = s.ammo.fire ? 'fire' : 'round'; }
    const h0 = s.hull, n0 = s.shots.length; step(s, inp); if (s.hull < h0 && s.log.at(-1) === 'A boulder smashes into her deck!') log.hits++; if (s.shots.length > n0) log.shots++;
    s.events.length = 0; if ((s.slain || []).includes(l.id) || s.hull <= 0) break;
  }
  log.dodged = log.throws - log.hits; return log;
}

test('each Olympus world has two cyclops lairs on the shores of big wild islands; Terra, Asgard and Atlantis have none', () => {
  for (const seed of [1717, 7, 42]) {
    const s = newGame(seed); enterRealm(s, 'olympus'); const L = cyclopsLairs(s.seed); assert.equal(L.length, 2, 'seed ' + seed);
    for (const l of L) { const isl = sectorIslands(s.seed, Math.floor(l.cx / 600), Math.floor(l.cz / 600)).find((i) => i.id === l.iid); assert.ok(isl && !isl.port && isl.r >= 34, 'not a big wild island'); assert.ok(l.y > 1, 'not on dry land'); }
    assert.ok(Math.hypot(L[0].x - L[1].x, L[0].z - L[1].z) > 1500);
  }
  for (const r of ['terra', 'asgard', 'atlantis']) {
    const s = newGame(1717); if (r !== 'terra') enterRealm(s, r); const l = cyclopsLairs(s.seed)[0];
    s.ship = { x: l.x + 60, z: l.z, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; s.mode = 'ship'; for (let i = 0; i < 120; i++) step(s, {}); assert.equal(s.cyclops ?? null, null, r + ' has a cyclops');
  }
});

test('Olympus notice boards and taverns rumour the cyclops with his island and a bearing', () => {
  const { s, l } = atSea(1717); let body = null;
  for (let n = 0; n < 8 && !body; n++) for (const isl of sectorIslands(s.seed, 0, 0)) { s.t = n * ISSUE_LEN + 1; body ||= newsFor(s, isl).items.find((q) => q.head === 'A cyclops')?.body; }
  assert.ok(body, 'no cyclops rumour in eight issues'); assert.match(body, /to the (north|south|east|west)/); assert.ok(body.includes(l.island));
});

test('a captain who heaves to under his beach is pounded by boulders', () => {
  const { s } = atSea(1717, 'brigantine', 120); s.ship.sail = 0; let hits = 0;
  for (let i = 0; i < 60 * 30; i++) { const h = s.hull; step(s, { sail: 0 }); if (s.hull < h) hits++; s.events.length = 0; }
  assert.ok(s.cyclops?.awake, 'he never woke'); assert.ok(hits >= 4, `only ${hits} boulders hit a ship at rest`);
});

test('a captain who keeps moving dodges most boulders, brings him down with broadsides, is paid, and he stays dead through a save', () => {
  const { s, l, a } = atSea(1717); const g0 = s.gold;
  const log = fight(s, l, a, 240);
  assert.ok(log.throws >= 4, 'he hardly threw'); assert.ok(log.shots >= 6, 'the captain never fired');
  assert.ok(log.dodged > log.hits, `dodged ${log.dodged}, hit ${log.hits}`);
  assert.deepEqual(s.slain, [l.id], `not slain: hp ${s.cyclops?.hp}, hull ${s.hull}`); assert.ok(s.hull > 0); assert.ok(s.gold >= g0 + 750); assert.equal(s.killsBy.cyclops, 1);
  const t = deserialize(serialize(s)); assert.deepEqual(t.slain, [l.id]); assert.equal(t.cyclops, undefined);
  t.ship.x = l.x + Math.cos(a) * 80; t.ship.z = l.z + Math.sin(a) * 80; for (let i = 0; i < 600; i++) step(t, {}); assert.equal(t.cyclops ?? null, null, 'a slain cyclops stood up again');
  assert.ok(newsFor(s, sectorIslands(s.seed, 0, 0)[0]).items.length);
});

test('sail away and he sits down and heals; fire shot bites harder than chain', () => {
  const { s, l, a } = atSea(1717, 'brigantine', 100); for (let i = 0; i < 120 && !s.cyclops?.awake; i++) step(s, {}); const m = s.cyclops; assert.ok(m?.awake);
  const hit = (kind) => { const h = m.hp; s.shots.push({ x: m.x, z: m.z, vx: 0, vz: 0, life: 1, owner: 'player', dmg: 20, kind }); step(s, {}); return h - m.hp; };
  const f = hit('fire'), c = hit('chain'); assert.ok(f > c && c > 0, `fire ${f} chain ${c}`);
  s.ship.x = l.x + Math.cos(a) * (LEAVE_R + 20); s.ship.z = l.z + Math.sin(a) * (LEAVE_R + 20); step(s, {}); assert.equal(s.cyclops, null, 'he did not sit down');
  s.ship.x = l.x + Math.cos(a) * (RANGE - 20); s.ship.z = l.z + Math.sin(a) * (RANGE - 20); for (let i = 0; i < 70; i++) step(s, {}); assert.equal(s.cyclops?.hp, HP, 'he did not heal');
});

test('a monster never follows you into another world (found in play: a kraken holding the ship came along to Olympus)', () => {
  const { s } = atSea(1717); s.kraken = { grip: true, hp: 1, lx: s.ship.x, lz: s.ship.z }; s.cyclops = { awake: true, rocks: [] }; s.serpent = { up: true };
  enterRealm(s, 'atlantis'); assert.equal(s.kraken, null); assert.equal(s.cyclops, null); assert.equal(s.serpent, null);
});
