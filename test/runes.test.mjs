// Asgard's rune stones, played: one carved stone per Asgard island, reachable on foot, read with F through the real game rules, counted once and saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, prompt, canStand, groundAt } from '../src/rules/game.js';
import { enterRealm } from '../src/rules/realm.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';
import { islandProps } from '../src/gen/props.js';
import { RUNE_COUNT } from '../src/rules/lore.js';

const islands = (seed, n = 3) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
// grid search with the game's own collision and step height: can you walk from the stone down to the beach?
function toShore(s, x0, z0, rMax) {
  const seen = new Set(), q = [[x0, z0]], key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2); seen.add(key(x0, z0));
  while (q.length) {
    const [x, z] = q.pop(), y = groundAt(s, x, z); if (y < 0.7) return true;
    for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) { const nx = x + dx, nz = z + dz, k = key(nx, nz); if (seen.has(k) || Math.hypot(nx - x0, nz - z0) > rMax) continue; seen.add(k); if (canStand(s, nx, nz, y)) q.push([nx, nz]); }
  }
  return false;
}

test('every Asgard island has one rune stone, clear of the town, and you can walk from it to the shore; Terra has none', () => {
  for (const seed of [1717, 7]) {
    const s = newGame(seed); assert.ok(islands(s.seed, 2).every((i) => !islandProps(i).some((p) => p.k === 'rune')), 'none on Terra');
    enterRealm(s, 'asgard'); s.mode = 'foot'; const all = islands(s.seed); let n = 0, walk = 0;
    for (const isl of all) {
      const r = islandProps(isl).filter((p) => p.k === 'rune'); assert.ok(r.length <= 1, isl.id); if (!r.length) continue; n++;
      const p = r[0]; assert.ok(!islandTown(isl).buildings.some((b) => Math.abs(b.x - p.x) < b.w / 2 + 1 && Math.abs(b.z - p.z) < b.d / 2 + 1), `${isl.id}: stone inside a building`);
      s.foot = { x: p.x, z: p.z, y: groundAt(s, p.x, p.z), yaw: 0, vy: 0 };
      // stand next to it (the stone itself is solid) and walk down to the beach
      const sp = [[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]].map(([a, b]) => [p.x + a, p.z + b]).find(([x, z]) => canStand(s, x, z, groundAt(s, p.x, p.z)));
      if (sp && toShore(s, sp[0], sp[1], isl.r * 1.3)) walk++;
    }
    assert.ok(n >= all.length * 0.9, `seed ${seed}: ${n}/${all.length} islands have a stone`);
    assert.ok(walk >= n * 0.9, `seed ${seed}: ${walk}/${n} stones can be walked to from the shore`);
  }
});

test('a scripted player walks up to a rune stone, reads it with F, it counts once, and the count survives a save', () => {
  const s = newGame(1717); s.flags.crossed = true; enterRealm(s, 'asgard'); s.mode = 'foot';
  const isl = islands(s.seed).find((i) => i.port && islandProps(i).some((p) => p.k === 'rune')), p = islandProps(isl).find((q) => q.k === 'rune');
  // start 8 units off on open ground and walk straight at it, turning to face it every step
  let st = null; for (let a = 0; a < 6.3 && !st; a += 0.2) { const x = p.x + Math.cos(a) * 8, z = p.z + Math.sin(a) * 8; if (groundAt(s, x, z) > 0.7 && canStand(s, x, z, groundAt(s, x, z))) st = { x, z }; }
  assert.ok(st, 'open ground near the stone');
  s.foot = { x: st.x, z: st.z, y: groundAt(s, st.x, st.z), yaw: 0, vy: 0 };
  for (let i = 0; i < 60 * 10 && Math.hypot(s.foot.x - p.x, s.foot.z - p.z) > 2.5; i++) { s.foot.yaw = Math.atan2(p.z - s.foot.z, p.x - s.foot.x); step(s, { mz: 1 }, 1 / 60); s.events.length = 0; }
  assert.ok(Math.hypot(s.foot.x - p.x, s.foot.z - p.z) <= 2.5, 'walked up to the stone');
  assert.ok(Math.hypot(s.foot.x - p.x, s.foot.z - p.z) > 0.9, 'but not through it');
  assert.equal(prompt(s), 'F  Read the rune stone');
  const sc = s.score, r = interact(s); assert.equal(r.type, 'npc'); assert.equal(r.npc.name, 'Rune stone');
  assert.ok(r.lines[0].length > 40 && /read: 1\./.test(r.lines[1]), r.lines.join(' | ')); assert.equal(s.score, sc + 20);
  const again = interact(s); assert.ok(/before/.test(again.lines[1])); assert.equal(s.score, sc + 20, 'counted once'); assert.equal(s.runes.length, 1);
  const back = deserialize(serialize(s)); assert.deepEqual(back.runes, [isl.id]);
  assert.ok(RUNE_COUNT >= 10);
});
