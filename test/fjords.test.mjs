// Asgard's fjord coasts: Asgard islands have long narrow inlets cut into the land, and each Asgard port stands at the head of a wide
// fjord. A scripted player boards at the head, rows out the fjord to open sea without grounding, turns back, and docks again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, prompt, toggleRow, hullHit } from '../src/rules/game.js';
import { enterRealm } from '../src/rules/realm.js';
import { buyShip, buyFood } from '../src/rules/trade.js';
import { sectorIslands, islandHeight, walkHeight, islandTown } from '../src/gen/world.js';
import { buildContours } from '../src/gen/terrain.js';

const islands = (seed, n = 3) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

test('Asgard islands get fjords and every Asgard port sits at the head of a navigable one; Terra has none', () => {
  for (const seed of [1717, 7, 42]) {
    const s = newGame(seed); assert.ok(islands(s.seed, 2).every((i) => !i.fjords), 'no fjords on Terra');
    enterRealm(s, 'asgard'); let ports = 0, inlets = 0;
    for (const isl of islands(s.seed)) {
      if (isl.r >= 20 && !isl.special && (!isl.port || isl.r >= 40)) assert.ok(isl.fjords?.length, `${isl.id}: an Asgard island has at least one inlet`); // a village may lose its only one: inlets keep clear of the harbour
      inlets += isl.fjords?.length || 0; if (!isl.port || isl.r < 40) continue; ports++;
      const P = isl.port, f = isl.fjords[0], d = P.dock; assert.ok(f.port && f.a === P.angle, `${isl.id}: the port fjord runs along the port bearing`);
      assert.ok(islandHeight(isl, P.x, P.z) < 0.3 && islandHeight(isl, P.berth.x, P.berth.z) < 0.3, `${isl.id}: berth and mooring in water`);
      assert.ok(walkHeight(isl, (d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2) >= 0.5, `${isl.id}: dock walkable`);
      assert.ok(islandHeight(isl, d.x1 - (d.x0 - d.x1) * 0.2, d.z1 - (d.z0 - d.z1) * 0.2) > 0.3, `${isl.id}: the dock reaches land at the fjord head`);
      // the land closes in on both sides of the fjord: it is an inlet, not open coast (villages under radius 40 keep an open-coast harbour: too cramped for a fjord)
      const head = P.shore + 4, side = (k) => islandHeight(isl, isl.x + f.c * head - f.s * 22 * k, isl.z + f.s * head + f.c * 22 * k);
      assert.ok(side(1) > 0.3 && side(-1) > 0.3, `${isl.id}: land on both sides of the fjord head`);
      // a hull lined up with the fjord clears every point from the berth to open sea
      for (let t = P.shore + 13; t < isl.r * 1.6; t += 2) assert.equal(hullHit(s, isl.x + f.c * t, isl.z + f.s * t, P.angle, 8, 3.5), null, `${isl.id}: fjord clear at ${t.toFixed(0)}`);
      assert.ok(['merchant', 'guard'].every((k) => islandTown(isl).buildings.some((b) => b.kind === k)), `${isl.id}: the town still fits`);
      const c = buildContours(isl); assert.ok(c.levels[1].loops.length >= 1, `${isl.id}: the coast still draws`);
    }
    assert.ok(ports >= 4 && inlets > ports, `seed ${seed}: ${ports} ports, ${inlets} inlets`);
  }
});

test('a scripted player rows out of an Asgard fjord port to open sea, turns back up the fjord, and docks at the head', () => {
  const s = newGame(1717); enterRealm(s, 'asgard'); s.gold = 5000;
  const isl = islands(s.seed).filter((i) => i.port && i.fjords && i.r >= 40).sort((a, b) => b.r - a.r)[0]; assert.ok(isl, 'a big Asgard port');
  const P = isl.port, d = P.dock; assert.ok(buyShip(s, isl)); buyFood(s, 15);
  s.foot.x = (d.x0 + d.x1) / 2; s.foot.z = (d.z0 + d.z1) / 2; assert.match(prompt(s), /Board/); assert.equal(interact(s).type, 'board');
  toggleRow(s); assert.ok(s.row, 'oars out');
  const hull0 = s.hull, steerTo = (tx, tz) => { const want = Math.atan2(tz - s.ship.z, tx - s.ship.x); return Math.max(-1, Math.min(1, wrap(want - s.ship.yaw) * 2)); };
  const far = { x: isl.x + Math.cos(P.angle) * isl.r * 2.2, z: isl.z + Math.sin(P.angle) * isl.r * 2.2 };
  let out = false; for (let i = 0; i < 60 * 120 && !out; i++) { step(s, { rudder: steerTo(far.x, far.z), sail: 0, trim: 0 }, 1 / 60); out = Math.hypot(s.ship.x - isl.x, s.ship.z - isl.z) > isl.r * 1.7; }
  assert.ok(out, `rowed out of the fjord (at ${Math.hypot(s.ship.x - isl.x, s.ship.z - isl.z).toFixed(0)} of ${isl.r.toFixed(0)})`);
  let docked = false; for (let i = 0; i < 60 * 180 && !docked; i++) { step(s, { rudder: steerTo(P.x, P.z), sail: 0, trim: 0 }, 1 / 60); if (i % 30 === 0 && /Dock/.test(prompt(s) || '')) docked = interact(s).type === 'ashore'; }
  assert.ok(docked, 'docked at the fjord head');
  assert.ok(s.hull >= hull0 - 5, `no grounding in the fjord: hull ${s.hull} from ${hull0}`);
  assert.ok(walkHeight(isl, s.foot.x, s.foot.z) >= 0.3, 'ashore on walkable ground');
});
