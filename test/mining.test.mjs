// Mining towns, played: most plain villages and towns become mining towns (older fishing, trade and fortress towns keep their kind),
// each has a mine mouth and an ore cart, and a scripted player walks in from the dock, hears what kind of town it is,
// is stopped by the rock heap, and pays the town's own prices: dear food, cheap cannon and half-price hull repairs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, groundAt, canStand } from '../src/rules/game.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';
import { styleOf, STYLES, isMiner } from '../src/gen/style.js';
import { islandStructs } from '../src/gen/mesh.js';
import { buyFood, repair, buyPrice } from '../src/rules/trade.js';

const islands = (seed, n = 4) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };

test('mining towns: only from plain villages and towns, never cities; every other town keeps its old kind', () => {
  for (const tier of ['village', 'town', 'city']) for (let u = 0; u < 1; u += 0.01) for (const u2 of [0, 0.3, 0.64, 0.66, 0.99]) {
    const old = styleOf(tier, u), now = styleOf(tier, u, u2);
    if (now !== old) { assert.equal(old, 'plain'); assert.equal(now, 'mining'); assert.notEqual(tier, 'city'); }
  }
  assert.ok(STYLES.mining.label && STYLES.mining.perk);
  let n = 0, withMine = 0;
  for (const seed of [1717, 7, 42]) {
    const ports = islands(seed).filter((i) => i.port), mines = ports.filter((i) => i.style === 'mining'); n += mines.length;
    assert.ok(mines.length >= 2, `seed ${seed}: ${mines.length} mining towns of ${ports.length}`);
    for (const isl of mines) {
      assert.notEqual(isl.tier, 'city'); assert.equal(isl.port.cheap, 'cannon'); assert.notEqual(isl.port.dear, 'cannon');
      const ks = islandTown(isl).marks.map((m) => m.k); if (ks.includes('mine')) withMine++; assert.ok(ks.length, isl.id + ' has a landmark');
      const v = islandStructs(isl).v; assert.ok(v.length > 0 && v.every(Number.isFinite), 'mesh builds');
    }
    assert.ok(ports.filter((i) => i.style !== 'mining').every((i) => islandTown(i).marks.every((m) => m.k !== 'mine' && m.k !== 'cart')), 'mines only in mining towns');
  }
  assert.ok(withMine >= n * 0.75, `${withMine}/${n} mining towns found room for the mine`);
  const isl = { style: 'mining' }; let miners = 0; for (let k = 0; k < 300; k++) if (isMiner(isl, k)) miners++; assert.ok(miners > 150 && miners < 250);
  assert.ok(!isMiner({ style: 'fishing' }, 1));
});

test('a scripted player walks into a mining town from the dock, is told what it is, cannot walk through the mine, and pays its prices', () => {
  const s = newGame(1717); s.mode = 'foot';
  const isl = islands(s.seed).find((i) => i.style === 'mining' && islandTown(i).plaza && islandTown(i).marks.some((m) => m.k === 'mine')); assert.ok(isl, 'a mining town');
  const t = islandTown(isl), p = isl.port, d = p.dock;
  // start at the land end of the dock and walk to the plaza, steering at it each step, the way a player would
  s.foot = { x: d.x1, z: d.z1, y: groundAt(s, d.x1, d.z1), yaw: 0, vy: 0 };
  for (let i = 0; i < 60 * 25 && Math.hypot(s.foot.x - t.plaza.x, s.foot.z - t.plaza.z) > 8.5; i++) {
    const a = Math.atan2(t.plaza.z - s.foot.z, t.plaza.x - s.foot.x); s.foot.yaw = a + (i % 240 < 30 ? 0.9 : 0); step(s, { mz: 1 }, 1 / 60); s.events.length = 0;
  }
  assert.ok(Math.hypot(s.foot.x - t.plaza.x, s.foot.z - t.plaza.z) <= 8.5, 'reached the plaza');
  assert.ok(s.log.some((m) => /a mining town/.test(m)), 'told on arrival: ' + s.log.join(' | '));
  // walk straight at the mine: the rock heap stops you at its edge
  const m = t.marks.find((q) => q.k === 'mine'); let st = null;
  for (let a = 0; a < 6.3 && !st; a += 0.15) { const x = m.x + Math.cos(a) * 9, z = m.z + Math.sin(a) * 9; if (canStand(s, x, z, groundAt(s, x, z)) && groundAt(s, x, z) > 0.7) st = { x, z }; }
  assert.ok(st, 'open ground near the mine');
  s.foot = { x: st.x, z: st.z, y: groundAt(s, st.x, st.z), yaw: 0, vy: 0 };
  for (let i = 0; i < 60 * 6; i++) { s.foot.yaw = Math.atan2(m.z - s.foot.z, m.x - s.foot.x); step(s, { mz: 1 }, 1 / 60); s.events.length = 0; }
  assert.ok(Math.abs(s.foot.x - m.x) > m.w / 2 - 0.05 || Math.abs(s.foot.z - m.z) > m.d / 2 - 0.05, 'did not walk into the rock');
  // prices: food dear, repairs half price, cannon cheaper here than in a plain or fortress town
  s.gold = 1000; s.food = 0; buyFood(s, 5, p); assert.equal(1000 - s.gold, 35);
  s.ship = { x: p.berth.x, z: p.berth.z, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; s.maxHull = 100; s.hull = 60; s.gold = 1000;
  assert.equal(repair(s, p), 40); assert.equal(1000 - s.gold, 40); s.hull = 60; s.gold = 1000; repair(s, null); assert.equal(1000 - s.gold, 80);
  const other = islands(s.seed).filter((i) => i.port && i.style !== 'mining' && i.style !== 'trade' && i.port.cheap !== 'cannon');
  const avg = other.reduce((a, i) => a + buyPrice(s, i.port, 'cannon'), 0) / other.length;
  assert.ok(buyPrice(s, p, 'cannon') < avg, `cannon ${buyPrice(s, p, 'cannon')} here vs ${avg.toFixed(0)} elsewhere`);
});
