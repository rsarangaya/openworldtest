// Asgard's mead halls, played: the tavern of an Asgard town is a big hall with a hearth and feast tables; a scripted player walks in
// through the door to the keeper with the game's own collision, talks to them, joins the feast once, and the feast survives a save.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, canStand, groundAt } from '../src/rules/game.js';
import { enterRealm } from '../src/rules/realm.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';
import { islandProps } from '../src/gen/props.js';
import { feast, feastReady, songFor, FEAST_PRICE, FEAST_EVERY, SONG_COUNT } from '../src/rules/meadhall.js';

const islands = (seed, n = 3) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
// breadth-first walk with the game's own collision: from in front of the door, can you reach a spot within talking range of the keeper?
function reach(s, x0, z0, tx, tz, rMax = 14) {
  const seen = new Set(), q = [[x0, z0]], key = (x, z) => Math.round(x * 4) + ',' + Math.round(z * 4); seen.add(key(x0, z0));
  for (let h = 0; h < q.length; h++) {
    const [x, z] = q[h]; if (Math.hypot(x - tx, z - tz) < 3.2) return [x, z];
    for (const [dx, dz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) { const nx = x + dx, nz = z + dz, k = key(nx, nz); if (seen.has(k) || Math.hypot(nx - x0, nz - z0) > rMax) continue; seen.add(k); if (canStand(s, nx, nz, groundAt(s, x, z))) q.push([nx, nz]); }
  }
  return null;
}

test('Asgard taverns are mead halls with a hearth and feast tables you can walk past to the keeper; Terra taverns are not', () => {
  for (const seed of [1717, 7]) {
    const s = newGame(seed); assert.ok(islands(s.seed, 2).every((i) => !islandTown(i).buildings.some((b) => b.hall)), 'no halls on Terra');
    enterRealm(s, 'asgard'); s.mode = 'foot'; let halls = 0, ok = 0, taverns = 0;
    for (const isl of islands(s.seed)) {
      const t = islandTown(isl), b = t.buildings.find((q) => q.kind === 'tavern'); if (!b) continue; taverns++;
      if (!b.hall) continue; halls++;
      const P = islandProps(isl); assert.ok(P.some((p) => p.k === 'hearth' && Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.z - b.z) < b.d / 2), `${isl.id}: hearth inside`);
      assert.equal(P.filter((p) => p.k === 'feast' && Math.abs(p.x - b.x) < b.w / 2).length, 2, `${isl.id}: two feast tables`);
      const keeper = t.npcs.find((n) => n.kind === 'tavern'), fy = groundAt(s, b.x, b.z + b.d / 2 + 2);
      s.foot = { x: b.x, z: b.z + b.d / 2 + 2, y: fy, yaw: 0, vy: 0 };
      if (reach(s, b.x, b.z + b.d / 2 + 2, keeper.x, keeper.z)) ok++;
    }
    assert.ok(halls >= taverns * 0.8 && halls > 3, `seed ${seed}: ${halls}/${taverns} taverns are halls`);
    assert.equal(ok, halls, `seed ${seed}: ${ok}/${halls} keepers can be walked to`);
  }
});

test('a scripted player walks into a mead hall, talks to the keeper, feasts once, and the feast is remembered through a save', () => {
  const s = newGame(1717); s.flags.crossed = true; enterRealm(s, 'asgard'); s.mode = 'foot';
  const isl = islands(s.seed).find((i) => islandTown(i).buildings.some((b) => b.hall)), t = islandTown(isl), b = t.buildings.find((q) => q.hall), keeper = t.npcs.find((n) => n.kind === 'tavern');
  s.foot = { x: b.x, z: b.z + b.d / 2 + 3, y: groundAt(s, b.x, b.z + b.d / 2 + 3), yaw: 0, vy: 0 };
  const path = reach(s, s.foot.x, s.foot.z, keeper.x, keeper.z); assert.ok(path, 'a way in');
  // walk in through the door, steering toward the keeper each step (straight in from the doorway)
  for (let i = 0; i < 60 * 12 && Math.hypot(s.foot.x - keeper.x, s.foot.z - keeper.z) > 3.2; i++) { s.foot.yaw = Math.atan2(keeper.z - s.foot.z, keeper.x - s.foot.x); step(s, { mz: 1 }, 1 / 60); s.events.length = 0; }
  assert.ok(Math.hypot(s.foot.x - keeper.x, s.foot.z - keeper.z) <= 3.2, `walked up to the keeper (${Math.hypot(s.foot.x - keeper.x, s.foot.z - keeper.z).toFixed(1)} away)`);
  const r = interact(s); assert.equal(r.type, 'npc'); assert.equal(r.panel, 'tavern');
  s.hp = 30; s.gold = FEAST_PRICE + 5; s.crew = [{ id: 'c1', name: 'Ulf', role: 'sailor', wage: 3, morale: 50, seed: 1 }];
  assert.ok(feastReady(s)); const line = feast(s);
  assert.ok(/mead/.test(line), line); assert.equal(s.hp, s.maxHp); assert.equal(s.gold, 5); assert.equal(s.crew[0].morale, 65); assert.equal(s.feasts, 1);
  const back = deserialize(serialize(s)); assert.ok(!feastReady(back), 'no second feast straight after loading');
  assert.ok(/bare/.test(feast(back)) && back.gold === 5, 'refused, nothing paid');
  back.t += FEAST_EVERY; back.gold = 3; assert.ok(/costs/.test(feast(back)) && back.gold === 3, 'too poor');
  // the skald moves through every verse before repeating
  const v = new Set(); for (let n = 0; n < SONG_COUNT; n++) v.add(songFor(keeper.seed, n)); assert.equal(v.size, SONG_COUNT);
});
