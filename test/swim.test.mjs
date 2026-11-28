// Swimming the dive yourself, played: a scripted captain rows to a wreck, heaves to, sends the diver down and takes the diver (V),
// then swims through the real rules: looks at the nearest thing on the floor, swims to it, picks it up, and heads back up to the ship
// before the air runs out (greedy, but turns for home when the air left would not get them there). Also: running out of air, the strongbox.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, prompt, toggleRow } from '../src/rules/game.js';
import { wrecks, startSwim, divesLeft, DIVES, SWIM_V, AIR_S, REST_S, diverAt, diveStage } from '../src/rules/salvage.js';
import { enterRealm } from '../src/rules/realm.js';
import { SHIPS } from '../src/rules/ships.js';
import { cargoCount } from '../src/rules/trade.js';

const atSea = (s, x, z) => { s.shipClass = 'brigantine'; s.maxHull = s.hull = SHIPS.brigantine.hull; s.hold = SHIPS.brigantine.hold; s.food = 30; s.ship = { x, z, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; s.mode = 'ship'; s.weather = null; return s; };
const clear = (s) => { for (const id of s.enemies.keys()) s.dead.add(id); s.enemies.clear(); s.events.length = 0; };
function reachAndDive(s, w) {
  atSea(s, w.x - 120, w.z + 40); clear(s); toggleRow(s);
  for (let k = 0; k < 4000; k++) {
    const p = s.ship, a = Math.atan2(w.z - p.z, w.x - p.x), dyaw = Math.atan2(Math.sin(a - p.yaw), Math.cos(a - p.yaw)), d = Math.hypot(w.x - p.x, w.z - p.z);
    if (d < 22 && s.row) toggleRow(s);
    if (d < 30 && Math.abs(p.speed) <= 2 && /F  Dive/.test(prompt(s) || '')) { interact(s); assert.ok(s.dive, s.log.at(-1)); return; }
    step(s, { rudder: Math.max(-1, Math.min(1, dyaw * 2)), sail: -1 }); clear(s); s.food = 30; s.hull = s.maxHull;
  }
  assert.fail('never got to dive');
}
// the swimmer: aim at a point, return the input that swims there
const aim = (q, x, y, z) => ({ mz: 1, yaw: Math.atan2(z - q.z, x - q.x), pitch: Math.atan2(y - q.y, Math.hypot(x - q.x, z - q.z)) });
function swim(s, { idle = false } = {}) {
  const q = s.dive.swim, p = s.ship, log = []; let steps = 0, prev = null;
  while (s.dive) {
    const v = diverAt(s); assert.ok(v.y <= -0.8 && v.y >= q.floor + 1 - 1e-9, 'out of the water column ' + v.y);
    if (prev) assert.ok(Math.hypot(v.x - prev.x, v.y - prev.y, v.z - prev.z) < 0.2, 'jumped'); prev = { ...v };
    assert.equal(diveStage(s).phase, 'swim'); assert.match(prompt(s), /^Air \d+ s/);
    let inp = {};
    if (!idle) {
      const left = q.loot.filter((i) => !i.got && !(i.k === 'crate' && cargoCount(s) + q.crates >= s.hold));
      const best = left.sort((a, b) => Math.hypot(a.x - q.x, a.z - q.z) - Math.hypot(b.x - q.x, b.z - q.z))[0];
      const there = best && Math.hypot(best.x - q.x, best.z - q.z, q.floor - q.y) + Math.hypot(best.x - p.x, best.z - p.z) + Math.abs(q.floor);
      inp = best && there / SWIM_V < q.air - 3 ? aim(q, best.x, q.floor + 0.6, best.z) : { ...aim(q, p.x, 0, p.z), up: Math.hypot(q.x - p.x, q.z - p.z) < 10 };
    }
    step(s, { swim: inp }); clear(s); steps++; log.push(s.log.at(-1));
    assert.ok(steps < 60 * (AIR_S + 2), 'the swim never ended');
  }
  return steps / 60;
}

for (const [world, i] of [['terra', 0], ['terra', 2], ['asgard', 1], ['atlantis', 3], ['olympus', 0]]) test(`a captain swims the ${world} wreck ${i} and picks up what lies there`, () => {
  const s = newGame(4242); if (world !== 'terra') { s.flags.crossed = true; enterRealm(s, world); }
  const w = wrecks(s.seed, world === 'terra' ? '' : world)[i]; reachAndDive(s, w);
  assert.ok(startSwim(s, 0), 'could not take the diver'); const q = s.dive.swim, total = q.loot.filter((l) => l.k !== 'crate').reduce((a, l) => a + l.v, 0), crates = q.loot.filter((l) => l.k === 'crate').length;
  assert.ok(q.loot.length >= 4, 'too little down there'); const g0 = s.gold, c0 = s.cargo[w.good] || 0;
  const secs = swim(s), got = q.loot.filter((l) => l.got).length; if (process.env.SWIMLOG) console.log(world, i, w.deep, secs.toFixed(1), got + '/' + q.loot.length, q.gold, q.crates, s.log.at(-1));
  assert.ok(secs > 8 && secs <= AIR_S, 'swim took ' + secs);
  assert.ok(got >= 3, `only picked up ${got} of ${q.loot.length} in ${secs.toFixed(0)} s: ${s.log.at(-1)}`);
  assert.match(s.log.at(-1), /surface beside the ship/);
  assert.equal(s.gold - g0, q.gold); assert.equal((s.cargo[w.good] || 0) - c0, q.crates); assert.ok(q.gold <= total && q.crates <= crates);
  assert.equal(divesLeft(s, w), DIVES - 1, 'the dive did not count'); assert.ok(!(s.diveRest > s.t));
});

test('out of air: hauled up gasping with half the coins, no cargo, and a rest', () => {
  const s = newGame(4242), w = wrecks(s.seed)[1]; reachAndDive(s, w); startSwim(s, 0);
  const q = s.dive.swim, coin = q.loot.find((l) => l.k === 'coin'), crate = q.loot.find((l) => l.k === 'crate');
  q.x = coin.x; q.z = coin.z; q.y = q.floor + 1; step(s, {}); q.x = crate.x; q.z = crate.z; step(s, {}); clear(s); // grab one of each, then hang there
  assert.ok(coin.got && crate.got); const g0 = s.gold, c0 = s.cargo[w.good] || 0;
  const secs = swim(s, { idle: true }); assert.ok(Math.abs(secs - AIR_S) < 1.5, 'air lasted ' + secs);
  assert.match(s.log.at(-1), /Out of air/); assert.equal(s.gold - g0, coin.v >> 1); assert.equal(s.cargo[w.good] || 0, c0);
  assert.ok(s.diveRest - s.t > REST_S - 2); assert.match(prompt(s), /resting/); assert.equal(divesLeft(s, w), DIVES - 1);
});

test('a swell cuts the air; nothing found does not use up a dive; the strongbox strips her', () => {
  const s = newGame(4242), w = wrecks(s.seed)[0]; reachAndDive(s, w); startSwim(s, 1); assert.ok(Math.abs(s.dive.swim.air - AIR_S * 0.7) < 1e-9);
  s.dive.swim.leave = true; step(s, {}); clear(s); assert.equal(s.dive, null); assert.equal(divesLeft(s, w), DIVES, 'an empty swim counted'); assert.match(s.log.at(-1), /nothing/);
  s.salvage['terra:' + w.id] = DIVES - 1; interact(s); startSwim(s, 0); const q = s.dive.swim; assert.equal(q.loot.length, 1); assert.equal(q.loot[0].k, 'box');
  const g0 = s.gold; swim(s); assert.match(s.log.at(-1), /strongbox/); assert.equal(s.gold - g0, q.loot[0].v); assert.equal(divesLeft(s, w), 0);
});
