// Temple towns, played: plain cities and one in five fishing towns become temple towns (villages, trade and fortress towns never do).
// Each has a pillared temple and a wayside shrine, a third of its people are robed priests, and spice is cheap. A scripted player
// walks in from the dock, hears what kind of town it is, is stopped by the temple, and makes an offering on its steps by the F key:
// it heals and raises the town's opinion, costs gold, and is refused when broke or when the temple has had one lately.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, groundAt, canStand, prompt, interact } from '../src/rules/game.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';
import { styleOf, STYLES, isPriest, OFFERING, OFFER_WAIT } from '../src/gen/style.js';
import { islandStructs } from '../src/gen/mesh.js';
import { localRep } from '../src/rules/rep.js';

const islands = (seed, n = 4) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };

test('temple towns: only from plain cities and fishing towns; landmarks, prices and looks', () => {
  for (const tier of ['village', 'town', 'city']) for (let u = 0; u < 1; u += 0.01) for (const u2 of [0, 0.5, 0.79, 0.8, 0.9, 0.99]) {
    const old = styleOf(tier, u), now = styleOf(tier, u, u2);
    if (now === 'temple') { assert.notEqual(tier, 'village'); assert.ok((old === 'plain' && tier === 'city') || (old === 'fishing' && tier === 'town'), `${tier} ${old}`); }
    if (old === 'trade' || old === 'fortress') assert.equal(now, old);
  }
  assert.ok(STYLES.temple.label && STYLES.temple.perk);
  let n = 0, withTemple = 0;
  for (const seed of [1717, 7, 42, 99]) {
    const ports = islands(seed).filter((i) => i.port), temples = ports.filter((i) => i.style === 'temple'); n += temples.length;
    for (const isl of temples) {
      assert.notEqual(isl.tier, 'village'); assert.equal(isl.port.cheap, 'spice'); assert.notEqual(isl.port.dear, 'spice');
      if (islandTown(isl).marks.some((m) => m.k === 'temple')) withTemple++;
      const v = islandStructs(isl).v; assert.ok(v.length > 0 && v.every(Number.isFinite), 'mesh builds');
    }
    assert.ok(ports.filter((i) => i.style !== 'temple').every((i) => islandTown(i).marks.every((m) => m.k !== 'temple' && m.k !== 'shrine')), 'temples only in temple towns');
  }
  assert.ok(n >= 3, `${n} temple towns over four worlds`);
  assert.ok(withTemple >= n * 0.8, `${withTemple}/${n} temple towns found room for the temple`);
  let pr = 0; for (let k = 0; k < 300; k++) if (isPriest({ style: 'temple' }, k)) pr++; assert.ok(pr > 60 && pr < 140);
  assert.ok(!isPriest({ style: 'mining' }, 3));
});

test('a scripted player walks into a temple town, cannot walk through the temple, and makes an offering on its steps', () => {
  let isl = null, seed = 0; for (const sd of [1717, 7, 42, 99]) { isl = islands(sd).find((i) => i.style === 'temple' && islandTown(i).plaza && islandTown(i).marks.some((m) => m.k === 'temple')); if (isl) { seed = sd; break; } }
  assert.ok(isl, 'a temple town');
  const S = newGame(seed); S.mode = 'foot';
  const t = islandTown(isl), d = isl.port.dock;
  S.foot = { x: d.x1, z: d.z1, y: groundAt(S, d.x1, d.z1), yaw: 0, vy: 0 };
  for (let i = 0; i < 60 * 25 && Math.hypot(S.foot.x - t.plaza.x, S.foot.z - t.plaza.z) > 8.5; i++) {
    const a = Math.atan2(t.plaza.z - S.foot.z, t.plaza.x - S.foot.x); S.foot.yaw = a + (i % 240 < 30 ? 0.9 : 0); step(S, { mz: 1 }, 1 / 60); S.events.length = 0;
  }
  assert.ok(Math.hypot(S.foot.x - t.plaza.x, S.foot.z - t.plaza.z) <= 8.5, 'reached the plaza');
  assert.ok(S.log.some((m) => /a temple town/.test(m)), 'told on arrival: ' + S.log.join(' | '));
  // walk to the temple steps by the game's own collision, from the nearest open ground in front of it
  const m = t.marks.find((q) => q.k === 'temple'); let st = null;
  for (const r of [7, 8, 9, 10]) for (let a = 0; a < 6.3 && !st; a += 0.15) { const x = m.x + Math.cos(a) * r, z = m.z + Math.sin(a) * r; if (canStand(S, x, z, groundAt(S, x, z)) && groundAt(S, x, z) > 0.7) st = { x, z }; }
  assert.ok(st, 'open ground near the temple');
  S.foot = { x: st.x, z: st.z, y: groundAt(S, st.x, st.z), yaw: 0, vy: 0 };
  for (let i = 0; i < 60 * 6; i++) { S.foot.yaw = Math.atan2(m.z - S.foot.z, m.x - S.foot.x); step(S, { mz: 1 }, 1 / 60); S.events.length = 0; }
  assert.ok(Math.abs(S.foot.x - m.x) > m.w / 2 - 0.05 || Math.abs(S.foot.z - m.z) > m.d / 2 - 0.05, 'did not walk into the temple');
  assert.match(prompt(S) || '', /offering at the temple/, 'prompt at the steps: ' + prompt(S));
  // broke: refused, nothing changes
  S.gold = 5; S.hp = 30; let r = interact(S); assert.equal(r.type, 'npc'); assert.equal(S.gold, 5); assert.equal(S.hp, 30);
  // paid: healed, the town's opinion rises, gold spent
  S.gold = 100; const before = localRep(S, isl.id); r = interact(S);
  assert.equal(S.gold, 100 - OFFERING); assert.equal(S.hp, S.maxHp); assert.equal(localRep(S, isl.id), before + 5);
  // again at once: refused; after the wait: taken
  S.hp = 40; interact(S); assert.equal(S.gold, 100 - OFFERING); assert.equal(S.hp, 40);
  S.t += OFFER_WAIT + 1; interact(S); assert.equal(S.gold, 100 - 2 * OFFERING); assert.equal(S.hp, S.maxHp);
});
