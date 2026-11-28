// Lived-in islands, step 2: people and animals in the hamlets. Each hamlet has a cooking fire with an islander beside it (and sometimes a
// farmer at a crop plot), one or two folk pacing near the yard, two to four animals grazing (by world), a lantern, and smoke drawn from the
// chimneys. A scripted player rows ashore, walks up to the islander by the game's own collision, talks with F, and walks among the animals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, prompt } from '../src/rules/game.js';
import { sectorIslands, islandTown, islandHeight, setSeedTheme, townsfolk, folkPos, hamletBeasts, beastPos } from '../src/gen/world.js';
import { islandProps } from '../src/gen/props.js';

const islands = (seed, n = 5) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const WORLDS = [[1717, 'terra'], [5151, 'asgard'], [6161, 'atlantis'], [7171, 'olympus']];
const inside = (t, x, z, pad = 0) => [...t.buildings, ...t.marks].some((b) => Math.abs(b.x - x) < b.w / 2 + pad && Math.abs(b.z - z) < b.d / 2 + pad);

test('hamlet life: an islander by the fire, folk and animals on clear ground, a lantern, and the right animals for each world', () => {
  const kinds = {};
  for (const [seed, th] of WORLDS) {
    setSeedTheme(seed, th);
    const hs = islands(seed).filter((i) => i.hamlet && islandTown(i).yard); let fires = 0;
    for (const isl of hs) {
      const t = islandTown(isl), P = islandProps(isl);
      assert.ok(P.some((p) => p.k === 'lamp'), `${isl.id}: a lantern`);
      if (t.fire) { fires++; assert.ok(P.some((p) => p.k === 'fire'), `${isl.id}: a fire prop`); assert.ok(!inside(t, t.fire.x, t.fire.z, 0.8), `${isl.id}: fire clear of houses`); assert.ok(t.npcs.some((n) => ['islander', 'hermit', 'keeper', 'squatter'].includes(n.role) && Math.hypot(n.x - t.fire.x, n.z - t.fire.z) < 2), `${isl.id}: someone by the fire`); }
      for (const n of t.npcs) { assert.ok(!inside(t, n.x, n.z, 0.3), `${isl.id}: ${n.role} not inside a house or plot`); assert.ok(n.y > 0.6 && Math.abs(n.y - islandHeight(isl, n.x, n.z)) < 1e-9, `${isl.id}: ${n.role} on the ground`); }
      const F = townsfolk(isl); assert.ok(F.length >= 1 && F.length <= 2, `${isl.id}: ${F.length} folk`);
      const B = hamletBeasts(isl); assert.ok(B.length <= 6, `${isl.id}: ${B.length} animals`);
      for (let tt = 0; tt < 200; tt += 3.7) {
        for (const f of F) { const p = folkPos(f, tt); assert.ok(!inside(t, p.x, p.z, 0.5) && islandHeight(isl, p.x, p.z) > 0.6, `${isl.id}: a walker stays on clear ground`); }
        for (const b of B) { const p = beastPos(b, tt); assert.ok(!inside(t, p.x, p.z, 0.5) && islandHeight(isl, p.x, p.z) > 0.6, `${isl.id}: a ${b.kind} stays out of houses and plots`); }
      }
      for (const b of B) (kinds[th] ||= new Set()).add(b.kind);
    }
    assert.ok(fires >= hs.length * 0.8, `${th}: ${fires}/${hs.length} hamlets have a fire`);
    assert.ok(hs.reduce((n, i) => n + hamletBeasts(i).length, 0) >= hs.length * 1.2, `${th}: animals in most hamlets`);
  }
  assert.ok(!kinds.asgard.has('chicken') && !kinds.olympus.has('chicken') && !kinds.atlantis.has('sheep'), JSON.stringify(Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, [...v]]))));
  setSeedTheme(1717, 'terra');
});

test('animals walk a little, then stop to graze', () => {
  setSeedTheme(1717, 'terra');
  const b = islands(1717).filter((i) => i.hamlet).flatMap(hamletBeasts)[0]; assert.ok(b);
  let walk = 0, still = 0; for (let tt = 0; tt < 40; tt += 0.1) { const p = beastPos(b, tt), q = beastPos(b, tt + 0.1), moved = Math.hypot(q.x - p.x, q.z - p.z); if (p.walk && q.walk) { walk++; assert.ok(moved > 0.01 && moved < 0.1, `a slow walk (${moved})`); } else if (!p.walk && !q.walk) { still++; assert.ok(moved < 1e-9, 'grazing in place'); } }
  assert.ok(walk > 100 && still > 100, `${walk} walking, ${still} grazing`);
});

test('played: row ashore, walk up to the islander by the fire, talk with F; hitting a hamlet islander brings no guards', () => {
  setSeedTheme(1717, 'terra');
  const hs = islands(1717).filter((i) => i.hamlet && islandTown(i).fire);
  let talked = 0;
  for (const isl of hs) {
    const S = newGame(1717), t = islandTown(isl), L = isl.landing, who = t.npcs[0];
    S.mode = 'ship'; S.ship = { x: L.x + Math.cos(L.a) * 8, z: L.z + Math.sin(L.a) * 8, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; S.shipClass = 'sailboat'; S.hull = S.maxHull = 60; S.hold = 20;
    assert.equal(interact(S).type, 'ashore');
    let last = { ...S.foot }, side = 0, dodge = 0; const goal = [t.yard, who]; let g = 0;
    for (let i = 0; i < 60 * 60 && g < 2; i++) { // up the path to the well, then over to the fire; sidestep when stuck
      const tg = goal[g]; if (Math.hypot(S.foot.x - tg.x, S.foot.z - tg.z) < (g ? 2.2 : 3.8)) { g++; continue; }
      if (i % 30 === 29) { if (Math.hypot(S.foot.x - last.x, S.foot.z - last.z) < 0.3) { dodge = 40; side = side > 0 ? -1.4 : 1.4; } last = { ...S.foot }; }
      S.foot.yaw = Math.atan2(tg.z - S.foot.z, tg.x - S.foot.x) + (dodge-- > 0 ? side : 0); step(S, { mz: 1 }, 1 / 60); S.events.length = 0;
    }
    if (g < 2) continue;
    assert.match(prompt(S) || '', /Talk to .* \((islander|hermit|keeper|squatter)\)/, `${isl.id}: the prompt names an islander`);
    const r = interact(S); assert.equal(r.type, 'npc', `${isl.id}: talked`); assert.equal(r.npc, who); assert.equal(r.lines.length, 2); assert.ok(r.lines.every((l) => typeof l === 'string' && l.length > 10), r.lines.join(' / '));
    talked++;
    if (talked === 1) { S.weapon = 'fists'; for (let i = 0; i < 120 && Math.hypot(who.x - S.foot.x, who.z - S.foot.z) > 1.4; i++) { S.foot.yaw = Math.atan2(who.z - S.foot.z, who.x - S.foot.x); step(S, { mz: 0.5 }, 1 / 60); } S.foot.yaw = Math.atan2(who.z - S.foot.z, who.x - S.foot.x); step(S, { attack: true }, 1 / 60); assert.ok(S.npcs?.[who.id]?.hit !== undefined, 'the islander was struck'); assert.equal(S.bountyGold || 0, 0, 'no bounty: no guards on a wild island'); assert.ok(!S.log.some((m) => /shop is shut|Guards!/.test(m))); }
  }
  assert.ok(talked >= 4, `talked with ${talked} of ${hs.length} islanders`);
});
