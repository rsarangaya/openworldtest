// The sea serpent, played: a scripted captain sails to a lair, keeps the beast abeam and fires the side it is on, through the real game rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step } from '../src/rules/game.js';
import { lairs, WAKE_R, LEAVE_R, HP } from '../src/rules/serpent.js';
import { newsFor, ISSUE_LEN } from '../src/rules/news.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { onLand, sectorIslands, WALL_R } from '../src/gen/world.js';
import { SHIPS } from '../src/rules/ships.js';

const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
const atSea = (seed, cls = 'brigantine') => {
  const s = newGame(seed), l = lairs(seed)[0];
  s.shipClass = cls; s.maxHull = s.hull = SHIPS[cls].hull; s.hold = SHIPS[cls].hold; s.food = 30; s.ammo = { chain: 6, fire: 6 };
  s.ship = { x: l.x - WAKE_R - 40, z: l.z, yaw: 0, speed: 0, sail: 0.5, cd: [0, 0] }; s.mode = 'ship'; return { s, l };
};
// one second of play as a captain who wants the serpent dead
function fight(s, secs) {
  const log = { rose: 0, bites: 0, shots: 0, seen: false };
  for (let i = 0; i < secs * 60; i++) {
    const m = s.serpent, p = s.ship, inp = { sail: 0 };
    if (m && m.up) {
      log.seen = true; const rel = wrap(Math.atan2(m.z - p.z, m.x - p.x) - p.yaw), side = rel < 0 ? -1 : 1, off = rel - side * Math.PI / 2;
      inp.rudder = Math.max(-1, Math.min(1, off * 2)); // swing to bring it abeam
      if (Math.abs(off) < 0.5 && Math.hypot(m.x - p.x, m.z - p.z) < 70) inp[side < 0 ? 'fireL' : 'fireR'] = true;
      s.shot = s.ammo.fire ? 'fire' : s.ammo.chain ? 'chain' : 'round';
    } else if (!m) { inp.sail = 1; inp.rudder = Math.max(-1, Math.min(1, wrap(Math.atan2(lairs(s.seed)[0].z - p.z, lairs(s.seed)[0].x - p.x) - p.yaw) * 2)); }
    const n0 = s.shots.length, h0 = s.hull; step(s, inp); if (s.shots.length > n0) log.shots++;
    if (s.log.at(-1) === 'The serpent bites the hull!' && s.hull < h0) log.bites++;
    if (s.events.some((e) => e.type === 'serpent')) log.rose++; s.events.length = 0;
    if (!s.serpent && (s.slain || []).length) break;
  }
  return log;
}

test('each world has three serpent lairs in open water, far from Port Haven, one of them past the Wall', () => {
  for (const seed of [1717, 7, 42]) {
    const L = lairs(seed); assert.equal(L.length, 3, 'seed ' + seed);
    for (const l of L) { assert.ok(!onLand(seed, l.x, l.z, 100), `${seed} ${l.id} is near land`); assert.ok(Math.hypot(l.x, l.z) > 2000, `${seed} ${l.id} is too near the start`); }
    assert.ok(Math.hypot(L[2].x, L[2].z) > WALL_R + 300 && Math.hypot(L[0].x, L[0].z) < WALL_R - 300);
  }
});

test('notice boards rumour the serpent before you meet it, with a bearing that points at a lair', () => {
  const s = newGame(1717), home = sectorIslands(1717, 0, 0)[0]; let body = null;
  for (let n = 0; n < 6 && !body; n++) { s.t = n * ISSUE_LEN + 1; body = newsFor(s, home).items.find((q) => q.head === 'Sea serpent')?.body; }
  assert.ok(body, 'no serpent rumour in six issues'); assert.match(body, /to the (north|south|east|west)/);
});

test('a captain who keeps it abeam and fires kills the serpent; it bites back, pays out, and stays dead through a save', () => {
  const { s } = atSea(1717); const g0 = s.gold;
  const log = fight(s, 240);
  assert.ok(log.seen, 'the serpent never rose'); assert.ok(log.rose >= 2, 'it never dived and came up again');
  assert.ok(log.shots >= 4, 'the captain never got a shot off'); assert.deepEqual(s.slain, ['lair0'], `not slain: hp ${s.serpent?.hp}, hull ${s.hull}, bites ${log.bites}`);
  assert.ok(s.hull > 0, 'the serpent sank the ship'); assert.ok(s.gold >= g0 + 600);
  const t = deserialize(serialize(s)); assert.deepEqual(t.slain, ['lair0']); assert.equal(t.serpent, undefined);
  step(t, {}); for (let i = 0; i < 120; i++) step(t, {}); assert.equal(t.serpent ?? null, null, 'a slain serpent rose again');
  const board = newsFor(s, sectorIslands(1717, 0, 0)[0]); assert.ok(board.items.some((q) => q.head === 'Serpent slain' || q.tag === 'About the captain'));
});

test('a captain who just sits there gets bitten; one who sails away leaves it to sink back and heal', () => {
  const { s, l } = atSea(1717, 'cutter'); s.ship.x = l.x - 60; let bites = 0;
  for (let i = 0; i < 60 * 40; i++) { const h = s.hull; step(s, {}); if (s.hull < h && s.log.at(-1) === 'The serpent bites the hull!') bites++; }
  assert.ok(bites >= 1, 'it never bit a ship that sat still'); assert.ok(s.serpent);
  s.serpent.hp = HP / 2; s.ship.x = l.x - LEAVE_R - 20; step(s, {}); assert.equal(s.serpent, null);
  s.ship.x = l.x - 60; for (let i = 0; i < 70; i++) step(s, {}); assert.equal(s.serpent?.hp, HP, 'it did not heal');
});

test('no serpent outside Terra, and shot cannot touch it while it is down', () => {
  const { s, l } = atSea(1717); s.realm = 'asgard'; s.ship.x = l.x; for (let i = 0; i < 90; i++) step(s, {}); assert.equal(s.serpent ?? null, null);
  const t = atSea(1717).s; t.ship.x = lairs(1717)[0].x - 50; for (let i = 0; i < 70; i++) step(t, {}); const m = t.serpent; assert.ok(m);
  m.up = false; t.shots.push({ x: m.x, z: m.z, vx: 0, vz: 0, life: 1, owner: 'player', dmg: 50, kind: 'round' }); step(t, {}); assert.equal(m.hp, HP);
});
