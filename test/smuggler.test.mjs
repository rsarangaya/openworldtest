// Smugglers' coves, played: some plain villages and towns and one in four fishing villages become coves (cities, trade and fortress
// towns never do). Each has a cave mouth up the hill and a stash of contraband under a tarp, half its people dress as smugglers,
// rum is cheap, it has fewer guards, and its fence clears a bounty for half the gold. A scripted player walks in from the dock,
// hears what kind of town it is, is stopped by the stash, and clears a bounty at the fence after the guards would have taken it all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, groundAt, canStand, payBounty } from '../src/rules/game.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';
import { styleOf, STYLES, isSmuggler, extraGuards, bountyMul } from '../src/gen/style.js';
import { islandStructs } from '../src/gen/mesh.js';
import { buyPrice } from '../src/rules/trade.js';

const islands = (seed, n = 4) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };

test("smugglers' coves: only from plain or fishing villages and plain towns; landmarks, prices and looks", () => {
  for (const tier of ['village', 'town', 'city']) for (let u = 0; u < 1; u += 0.01) for (const u2 of [0, 0.5, 0.79, 0.8, 0.9, 0.99]) {
    const old = styleOf(tier, u), now = styleOf(tier, u, u2);
    if (now === 'smuggler') { assert.notEqual(tier, 'city'); assert.ok(old === 'plain' || (old === 'fishing' && tier === 'village'), `${tier} ${old}`); }
    if (old === 'trade' || old === 'fortress') assert.equal(now, old);
  }
  assert.ok(STYLES.smuggler.label && STYLES.smuggler.perk);
  let n = 0, withCave = 0;
  for (const seed of [1717, 7, 42, 99]) {
    const ports = islands(seed).filter((i) => i.port), coves = ports.filter((i) => i.style === 'smuggler'); n += coves.length;
    for (const isl of coves) {
      assert.notEqual(isl.tier, 'city'); assert.equal(isl.port.cheap, 'rum'); assert.notEqual(isl.port.dear, 'rum');
      const ks = islandTown(isl).marks.map((m) => m.k); if (ks.includes('cave')) withCave++;
      const v = islandStructs(isl).v; assert.ok(v.length > 0 && v.every(Number.isFinite), 'mesh builds');
    }
    assert.ok(ports.filter((i) => i.style !== 'smuggler').every((i) => islandTown(i).marks.every((m) => m.k !== 'cave' && m.k !== 'stash')), 'caves only in coves');
  }
  assert.ok(n >= 4, `${n} coves over four worlds`);
  assert.ok(withCave >= n * 0.6, `${withCave}/${n} coves found room for the cave`);
  const isl = { style: 'smuggler' }; let sm = 0; for (let k = 0; k < 300; k++) if (isSmuggler(isl, k)) sm++; assert.ok(sm > 100 && sm < 200);
  assert.ok(!isSmuggler({ style: 'mining' }, 2));
  assert.equal(extraGuards('smuggler'), -1); assert.equal(bountyMul({ style: 'smuggler' }), 0.5); assert.equal(bountyMul(null), 1);
});

test('a scripted player walks into a cove, cannot walk through the stash, and clears a bounty at the fence for half', () => {
  const s = newGame(1717); s.mode = 'foot';
  let isl = null; for (const seed of [1717, 7, 42, 99]) { isl = islands(seed).find((i) => i.style === 'smuggler' && islandTown(i).plaza && islandTown(i).marks.some((m) => m.k === 'stash')); if (isl) { s.seed = seed; break; } }
  assert.ok(isl, 'a cove');
  const S = newGame(s.seed); S.mode = 'foot';
  const t = islandTown(isl), p = isl.port, d = p.dock;
  S.foot = { x: d.x1, z: d.z1, y: groundAt(S, d.x1, d.z1), yaw: 0, vy: 0 };
  for (let i = 0; i < 60 * 25 && Math.hypot(S.foot.x - t.plaza.x, S.foot.z - t.plaza.z) > 8.5; i++) {
    const a = Math.atan2(t.plaza.z - S.foot.z, t.plaza.x - S.foot.x); S.foot.yaw = a + (i % 240 < 30 ? 0.9 : 0); step(S, { mz: 1 }, 1 / 60); S.events.length = 0;
  }
  assert.ok(Math.hypot(S.foot.x - t.plaza.x, S.foot.z - t.plaza.z) <= 8.5, 'reached the plaza');
  assert.ok(S.log.some((m) => /a smugglers' cove/.test(m)), 'told on arrival: ' + S.log.join(' | '));
  const m = t.marks.find((q) => q.k === 'stash'); let st = null;
  for (let a = 0; a < 6.3 && !st; a += 0.15) { const x = m.x + Math.cos(a) * 6, z = m.z + Math.sin(a) * 6; if (canStand(S, x, z, groundAt(S, x, z)) && groundAt(S, x, z) > 0.7) st = { x, z }; }
  assert.ok(st, 'open ground near the stash');
  S.foot = { x: st.x, z: st.z, y: groundAt(S, st.x, st.z), yaw: 0, vy: 0 };
  for (let i = 0; i < 60 * 5; i++) { S.foot.yaw = Math.atan2(m.z - S.foot.z, m.x - S.foot.x); step(S, { mz: 1 }, 1 / 60); S.events.length = 0; }
  assert.ok(Math.abs(S.foot.x - m.x) > m.w / 2 - 0.05 || Math.abs(S.foot.z - m.z) > m.d / 2 - 0.05, 'did not walk into the stash');
  // the fence: a 301 gold bounty cleared for 151 gold; a guard would take all 301. Short of gold, half of what you pay is cleared twice over.
  S.bounty = 2; S.bountyGold = 301; S.gold = 1000; assert.equal(payBounty(S, p), 151); assert.equal(S.gold, 849); assert.equal(S.bountyGold, 0); assert.equal(S.bounty, 0);
  S.bounty = 2; S.bountyGold = 301; S.gold = 1000; assert.equal(payBounty(S), 301); assert.equal(S.bountyGold, 0);
  S.bounty = 2; S.bountyGold = 300; S.gold = 50; assert.equal(payBounty(S, p), 50); assert.equal(S.bountyGold, 200); assert.equal(S.bounty, 2);
  // rum is cheaper here than the average port where it is not the cheap good
  const other = islands(S.seed).filter((i) => i.port && i.style !== 'smuggler' && i.style !== 'trade' && i.port.cheap !== 'rum');
  const avg = other.reduce((a, i) => a + buyPrice(S, i.port, 'rum'), 0) / other.length;
  assert.ok(buyPrice(S, p, 'rum') < avg, `rum ${buyPrice(S, p, 'rum')} here vs ${avg.toFixed(0)} elsewhere`);
});
