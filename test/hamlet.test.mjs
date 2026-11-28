// Lived-in islands, step 1: most bigger wild islands with a beach landing have a hamlet (two to five houses round a yard with a well,
// fenced crop plots, a footpath and a boat hauled up by the landing). Ports, landings and treasure stay where they were. A scripted
// player rows ashore at each hamlet's landing, walks the path up to the well by the game's own collision, and cannot walk into a house
// or through a crop plot's fence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, groundAt, interact } from '../src/rules/game.js';
import { sectorIslands, islandTown, islandHeight, setSeedTheme } from '../src/gen/world.js';
import { islandProps } from '../src/gen/props.js';
import { islandStructs } from '../src/gen/mesh.js';

const islands = (seed, n = 5) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const WORLDS = [[1717, 'terra'], [5151, 'asgard'], [6161, 'atlantis'], [7171, 'olympus']];

test('hamlets: only on wild islands with a landing, laid out clear of the landing, the treasure and each other', () => {
  for (const [seed, th] of WORLDS) {
    setSeedTheme(seed, th);
    const all = islands(seed), hs = all.filter((i) => i.hamlet);
    assert.ok(hs.length >= 5, `${th}: ${hs.length} hamlets`);
    for (const isl of all) if (isl.hamlet) assert.ok(!isl.port && isl.landing && !isl.special && isl.r >= 24, isl.id);
    for (const isl of hs) {
      const t = islandTown(isl), L = isl.landing, T = isl.treasure; assert.ok(t.yard, `${isl.id} has a yard`);
      assert.ok(t.buildings.length >= (['hermit', 'light'].includes(t.kind) ? 1 : 2) && t.buildings.length <= 5, `${isl.id}: ${t.buildings.length} houses`);
      assert.ok(t.npcs.length <= 2 && t.npcs.every((n) => n.hamlet && n.kind === 'villager')); assert.equal(t.plaza, null);
      const things = [...t.buildings, ...t.marks];
      for (const b of things) {
        assert.ok(Math.hypot(b.x - L.x, b.z - L.z) > Math.max(b.w, b.d) / 2 + 2, `${isl.id}: ${b.k || 'house'} off the landing`);
        if (T) assert.ok(Math.hypot(b.x - T.x, b.z - T.z) > Math.max(b.w, b.d) / 2 + 2, `${isl.id}: clear of the treasure`);
        assert.ok(Math.hypot(b.x - t.yard.x, b.z - t.yard.z) > Math.max(b.w, b.d) / 2 + 2, `${isl.id}: clear of the well`);
      }
      for (let i = 0; i < things.length; i++) for (let j = i + 1; j < things.length; j++) { const a = things[i], b = things[j]; assert.ok(Math.abs(a.x - b.x) > (a.w + b.w) / 2 || Math.abs(a.z - b.z) > (a.d + b.d) / 2, `${isl.id}: overlap`); }
      for (const b of t.buildings) assert.equal(islandHeight(isl, b.x, b.z), b.pad, `${isl.id}: a house stands on its terrace`);
      assert.ok(islandProps(isl).some((p) => p.k === 'well' && p.x === t.yard.x), `${isl.id}: a well`);
    }
    assert.ok(hs.some((i) => islandTown(i).marks.some((m) => ['plot', 'pen', 'rack', 'logs'].includes(m.k))) && hs.some((i) => islandTown(i).marks.some((m) => m.k === 'boat')), `${th}: work places and boats`);
    for (const isl of hs) islandStructs(isl); // the houses, plots and boats build without error
  }
  setSeedTheme(1717, 'terra');
});

test('played: row ashore at every hamlet, walk the footpath up to the well, and bump into a house and a crop plot fence', () => {
  setSeedTheme(1717, 'terra');
  const hs = islands(1717).filter((i) => i.hamlet && islandTown(i).yard);
  let plots = 0;
  for (const isl of hs) {
    const S = newGame(1717), t = islandTown(isl), L = isl.landing, Y = t.yard;
    S.mode = 'ship'; S.ship = { x: L.x + Math.cos(L.a) * 8, z: L.z + Math.sin(L.a) * 8, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; S.shipClass = 'sailboat'; S.hull = S.maxHull = 60; S.hold = 20;
    const r = interact(S); assert.equal(r.type, 'ashore', `${isl.id}: went ashore`); assert.ok(S.log.some((m) => /footpath leads up to an? /.test(m)), `${isl.id}: told of the hamlet`);
    const len = Math.hypot(Y.x - L.x, Y.z - L.z), ux = (Y.x - L.x) / len, uz = (Y.z - L.z) / len; let last = { ...S.foot }, side = 0, dodge = 0;
    for (let i = 0; i < 60 * 40 && Math.hypot(S.foot.x - Y.x, S.foot.z - Y.z) > 3.6; i++) { // follow the footpath a few steps ahead; when stuck, sidestep for a moment like a player would
      const along = Math.min(len, (S.foot.x - L.x) * ux + (S.foot.z - L.z) * uz + 4), tx = L.x + ux * along, tz = L.z + uz * along;
      if (i % 30 === 29) { if (Math.hypot(S.foot.x - last.x, S.foot.z - last.z) < 0.3) { dodge = 40; side = side > 0 ? -1.4 : 1.4; } last = { ...S.foot }; }
      S.foot.yaw = Math.atan2(tz - S.foot.z, tx - S.foot.x) + (dodge-- > 0 ? side : 0); step(S, { mz: 1 }, 1 / 60); S.events.length = 0;
    }
    assert.ok(Math.hypot(S.foot.x - Y.x, S.foot.z - Y.z) <= 3.6, `${isl.id}: reached the well (${Math.hypot(S.foot.x - Y.x, S.foot.z - Y.z).toFixed(1)} away)`);
    assert.ok(Math.hypot(S.foot.x - Y.x, S.foot.z - Y.z) > 0.9, `${isl.id}: did not walk through the well`);
    const b = t.buildings[0], m = t.marks.find((q) => q.k === 'plot');
    for (const w of [b, m]) {
      if (!w) continue; if (w === m) plots++;
      S.foot = { x: Y.x, z: Y.z + 2.4, y: groundAt(S, Y.x, Y.z + 2.4), yaw: 0, vy: 0 };
      for (let i = 0; i < 60 * 12; i++) { S.foot.yaw = Math.atan2(w.z - S.foot.z, w.x - S.foot.x); step(S, { mz: 1 }, 1 / 60); S.events.length = 0; }
      assert.ok(Math.abs(S.foot.x - w.x) > w.w / 2 - 0.05 || Math.abs(S.foot.z - w.z) > w.d / 2 - 0.05, `${isl.id}: did not walk into the ${w.k || 'house'}`);
    }
  }
  assert.ok(hs.length >= 5 && plots >= 3, `${hs.length} hamlets, ${plots} plots tried`);
});
