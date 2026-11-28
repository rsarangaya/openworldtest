// "Night Market", played: a night-only town event. A scripted trader walks into a port after dark on a night market, sees the
// lamps and the crowd, walks up to the merchant by the game's own collision and buys cheaper than on an ordinary night,
// while the shipyard and armoury stay shut. On a night without the market the merchant is shut. At dawn the market is gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, canStand, groundAt } from '../src/rules/game.js';
import { eventFor, EVENTS } from '../src/rules/events.js';
import { nowHour, isNight, shopsShut, sleepTillDawn } from '../src/rules/daynight.js';
import { buy, buyPrice } from '../src/rules/trade.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';
import { GOODS } from '../src/gen/world.js';

const islands = (seed, n = 2) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const shopPort = (i) => i.port && ['merchant', 'smith', 'shipwright', 'tavern'].every((k) => islandTown(i).npcs.some((q) => q.kind === k));
function reach(s, x0, z0, tx, tz, rMax = 16) { // breadth-first walk with the game's collision to a spot within talking range
  const seen = new Set(), q = [[x0, z0]], key = (x, z) => Math.round(x * 4) + ',' + Math.round(z * 4); seen.add(key(x0, z0));
  for (let h = 0; h < q.length; h++) {
    const [x, z] = q[h]; if (Math.hypot(x - tx, z - tz) < 2.4) return [x, z];
    for (const [dx, dz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) { const nx = x + dx, nz = z + dz, k = key(nx, nz); if (seen.has(k) || Math.hypot(nx - x0, nz - z0) > rMax) continue; seen.add(k); if (canStand(s, nx, nz, groundAt(s, x, z))) q.push([nx, nz]); }
  }
  return null;
}
// from the plaza, to the shop door, then in to the keeper with the real game step
function walkTo(s, isl, npc) {
  const b = islandTown(isl).buildings.find((q) => q.door && Math.abs(npc.x - q.x) < q.w / 2 && Math.abs(npc.z - q.z) < q.d / 2) || { x: npc.x, z: npc.z + 4, d: 0 };
  const x0 = b.x, z0 = b.z + b.d / 2 + 2; s.foot = { x: x0, z: z0, y: groundAt(s, x0, z0), yaw: 0, vy: 0 };
  if (!reach(s, x0, z0, npc.x, npc.z)) return false;
  for (let i = 0; i < 60 * 10 && Math.hypot(s.foot.x - npc.x, s.foot.z - npc.z) > 2.6; i++) { s.foot.yaw = Math.atan2(npc.z - s.foot.z, npc.x - s.foot.x); step(s, { mz: 1 }, 1 / 60); s.events.length = 0; }
  return Math.hypot(s.foot.x - npc.x, s.foot.z - npc.z) <= 2.6;
}
// the first night (from t0) a port with every shop has the given night event (or, for null, an ordinary night with no market)
function nightWith(key, t0 = 1200) {
  for (let t = t0; t < 1200 * 80; t += 15) {
    const s = newGame(1717); s.t = t; if (!isNight(nowHour(s)) || !shopsShut(nowHour(s))) continue;
    for (const isl of islands(s.seed)) if (shopPort(isl) && (key ? eventFor(s, isl)?.key === key : !eventFor(s, isl)?.open)) {
      const p = islandTown(isl).plaza; s.mode = 'foot'; s.foot = { x: p.x + 2, z: p.z + 2, y: groundAt(s, p.x + 2, p.z + 2), yaw: 0, vy: 0 }; s.gold = 2000; s.hold = 20; s.enemies.clear(); s.raidT = t; s.thiefT = t; return { s, isl };
    }
  }
  assert.fail('no ' + key + ' night found');
}

test('a night market: lamps and a crowd, the merchant trades after dark and cheaper; the other shops stay shut', () => {
  const { s, isl } = nightWith('nightmarket'); const T = islandTown(isl);
  for (let i = 0; i < 70; i++) step(s, {}); // a second in the plaza: the town's news
  assert.equal(s.ev?.key, 'nightmarket'); assert.equal(s.ev.lamps.length, EVENTS.nightmarket.lamps, 'lamp posts in the square'); assert.ok(s.ev.crowd.length >= 3, 'a crowd');
  for (const [x, y, z] of s.ev.lamps) assert.ok(y >= 0.8 && Math.hypot(x - T.plaza.x, z - T.plaza.z) < 9, 'lamps stand in the square, on dry ground');
  assert.ok(s.log.some((l) => /Night Market/.test(l)), 'announced on arrival');
  const merchant = T.npcs.find((n) => n.kind === 'merchant'); assert.ok(walkTo(s, isl, merchant), 'walked to the merchant at night');
  assert.ok(shopsShut(nowHour(s)), 'it is after 20:00'); const r = interact(s); assert.equal(r.panel, 'market', 'the market trades by lamplight');
  const port = isl.port, g = GOODS.find((q) => (s.cargo[q] || 0) === 0) || GOODS[0], cheap = buyPrice(s, port, g), ev = s.ev; s.ev = null; const full = buyPrice(s, port, g); s.ev = ev;
  assert.ok(cheap < full && cheap >= Math.round(full * 0.8), `cheaper at the night market (${cheap} vs ${full})`);
  const g0 = s.gold, n = buy(s, port, g, 3); assert.equal(n, 3); assert.equal(s.gold, g0 - 3 * cheap, 'paid the night price');
  for (const kind of ['smith', 'shipwright']) { const k = T.npcs.find((q) => q.kind === kind); if (walkTo(s, isl, k)) { const r2 = interact(s); assert.equal(r2.panel, null, kind + ' still shut'); assert.ok(/shut for the night/.test(r2.lines[0])); } }
  const back = deserialize(serialize(s)); assert.ok(back.cargo[g] >= 3, 'the goods survive a save');
  sleepTillDawn(s); for (let i = 0; i < 70; i++) step(s, {}); assert.notEqual(s.ev?.key, 'nightmarket', 'gone at dawn'); assert.ok(!(s.ev?.lamps || []).length, 'lamps taken down');
});

test('on an ordinary night the merchant is shut, and the night market is rarer than the cutpurses', () => {
  const { s, isl } = nightWith(null); const merchant = islandTown(isl).npcs.find((n) => n.kind === 'merchant');
  assert.ok(walkTo(s, isl, merchant)); const r = interact(s); assert.equal(r.panel, null); assert.ok(/shut for the night/.test(r.lines[0]), r.lines[0]);
  const count = {}; const s2 = newGame(1717), ports = islands(s2.seed).filter((i) => i.port);
  for (let t = 1200; t < 1200 * 60; t += 157) { s2.t = t; if (!isNight(nowHour(s2))) continue; for (const i of ports) { const k = eventFor(s2, i)?.key || 'none'; count[k] = (count[k] || 0) + 1; } }
  assert.ok(count.nightmarket > 0 && count.nightmarket < count.cutpurses, JSON.stringify(count));
  const day = newGame(1717); for (let t = 0; t < 1200 * 20; t += 97) { day.t = t; if (isNight(nowHour(day))) continue; for (const i of ports) assert.notEqual(eventFor(day, i)?.key, 'nightmarket', 'never by day'); }
});
