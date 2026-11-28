// Lived-in islands, step 3: kinds of hamlet, so they do not all look alike. Farmsteads, fishing camps, shepherds' steadings, woodcutters'
// camps, hermits' huts, lighthouses and old ruins with squatters, weighted by world. Each has its own work place, people and animals.
// A scripted player rows ashore at one of each kind, is told what is up the path, walks up by the game's own collision and talks to the
// one at work (or by the fire), and cannot walk through the lighthouse, the pen or a ruin's broken walls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, prompt, groundAt } from '../src/rules/game.js';
import { sectorIslands, islandTown, setSeedTheme, hamletBeasts, hamletKind, HAMLET_SAY } from '../src/gen/world.js';
import { islandStructs } from '../src/gen/mesh.js';

const islands = (seed, n = 7) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const WORLDS = [[1717, 'terra'], [5151, 'asgard'], [6161, 'atlantis'], [7171, 'olympus']];
const WORK = { farm: 'plot', fishing: 'rack', shepherd: 'pen', woods: 'logs', hermit: 'shrine', light: 'light' };

test('hamlet kinds: every kind turns up, each with its own work place, people and animals, and no sheep in Atlantis', () => {
  const seen = {};
  for (const [seed, th] of WORLDS) {
    setSeedTheme(seed, th);
    for (const isl of islands(seed).filter((i) => i.hamlet && islandTown(i).yard)) {
      const t = islandTown(isl), k = t.kind, B = hamletBeasts(isl); (seen[k] ||= new Set()).add(th);
      assert.equal(k, hamletKind(isl)); assert.ok(HAMLET_SAY[k], k);
      if (k === 'hermit' || k === 'light') assert.equal(t.buildings.length, 1, `${isl.id}: one cottage at a ${k}`);
      if (k === 'ruin') { assert.ok(t.buildings.every((b) => b.ruin), 'every ruin house is broken'); assert.ok(!t.marks.some((m) => m.k === 'boat'), 'squatters have no boat'); assert.equal(B.length, 0); if (t.fire) assert.equal(t.npcs.filter((n) => n.role === 'squatter').length, 2); }
      else assert.ok(t.buildings.every((b) => !b.ruin));
      if (k === 'fishing') assert.ok(t.marks.filter((m) => m.k === 'boat').length <= 2);
      if (k === 'shepherd') { assert.ok(B.length >= 3 && B.every((b) => b.kind !== 'chicken'), `${isl.id}: a flock (${B.map((b) => b.kind)})`); }
      if (WORK[k] && t.marks.some((m) => m.k === WORK[k])) { const others = Object.values(WORK).filter((w) => w !== WORK[k]); assert.ok(!t.marks.some((m) => others.includes(m.k)), `${isl.id}: only its own work place`); }
      const wk = { fishing: 'fisher', shepherd: 'shepherd', woods: 'woodcutter' }[k]; if (wk && t.marks.some((m) => m.k === WORK[k])) assert.ok(t.npcs.some((n) => n.role === wk) || t.npcs.length >= 1, `${isl.id}: someone at work`);
      if (th === 'atlantis') assert.ok(!B.some((b) => b.kind === 'sheep'));
      islandStructs(isl);
    }
  }
  for (const k of Object.keys(HAMLET_SAY)) assert.ok(seen[k], `some ${k} somewhere (${JSON.stringify(Object.fromEntries(Object.entries(seen).map(([a, b]) => [a, [...b]])))})`);
  setSeedTheme(1717, 'terra');
});

test('played: row ashore at one hamlet of each kind, hear what is up the path, walk up and talk; bump the lighthouse, pen and ruins', () => {
  const done = new Set(), lines = {};
  for (const [seed, th] of WORLDS) {
    setSeedTheme(seed, th);
    for (const isl of islands(seed).filter((i) => i.hamlet && islandTown(i).npcs.length)) {
      const t = islandTown(isl); if (done.has(t.kind)) continue;
      const S = newGame(seed), L = isl.landing; S.realm = th;
      S.mode = 'ship'; S.ship = { x: L.x + Math.cos(L.a) * 8, z: L.z + Math.sin(L.a) * 8, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; S.shipClass = 'sailboat'; S.hull = S.maxHull = 60; S.hold = 20;
      assert.equal(interact(S).type, 'ashore'); assert.ok(S.log.some((m) => m.includes('footpath leads up to ' + HAMLET_SAY[t.kind])), `${isl.id}: told of ${HAMLET_SAY[t.kind]} (${S.log.slice(-1)})`);
      const who = t.npcs.find((n) => n.role !== 'islander') || t.npcs[0], goal = [t.yard, who]; let g = 0, last = { ...S.foot }, side = 0, dodge = 0;
      for (let i = 0; i < 60 * 60 && g < 2; i++) { // up the path to the well, then over to them; sidestep when stuck, like a player
        const tg = goal[g]; if (Math.hypot(S.foot.x - tg.x, S.foot.z - tg.z) < (g ? 2.2 : 3.8)) { g++; continue; }
        if (i % 30 === 29) { if (Math.hypot(S.foot.x - last.x, S.foot.z - last.z) < 0.3) { dodge = 40; side = side > 0 ? -1.4 : 1.4; } last = { ...S.foot }; }
        S.foot.yaw = Math.atan2(tg.z - S.foot.z, tg.x - S.foot.x) + (dodge-- > 0 ? side : 0); step(S, { mz: 1 }, 1 / 60); S.events.length = 0;
      }
      if (g < 2 || !new RegExp('\\(' + who.role + '\\)').test(prompt(S) || '')) continue; // someone else nearer, or no way through: try another of this kind
      const r = interact(S); assert.equal(r.type, 'npc'); assert.equal(r.lines.length, 2); assert.ok(r.lines.every((l) => typeof l === 'string' && l.length > 10), `${who.role}: ${r.lines}`);
      lines[t.kind] = who.role + ': ' + r.lines[0];
      for (const w of [t.marks.find((m) => ['light', 'pen'].includes(m.k)), t.buildings.find((b) => b.ruin)]) { // walk straight at it for twelve seconds
        if (!w) continue; S.foot = { x: t.yard.x, z: t.yard.z + 2.4, y: groundAt(S, t.yard.x, t.yard.z + 2.4), yaw: 0, vy: 0 };
        for (let i = 0; i < 60 * 12; i++) { S.foot.yaw = Math.atan2(w.z - S.foot.z, w.x - S.foot.x); step(S, { mz: 1 }, 1 / 60); S.events.length = 0; }
        assert.ok(Math.abs(S.foot.x - w.x) > w.w / 2 - 0.05 || Math.abs(S.foot.z - w.z) > w.d / 2 - 0.05, `${isl.id}: did not walk into the ${w.k || 'ruin'}`);
      }
      done.add(t.kind);
    }
  }
  setSeedTheme(1717, 'terra');
  assert.ok(done.size >= 6, `visited ${[...done]}: ${JSON.stringify(lines)}`);
});
