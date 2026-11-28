// Asgard's hof, played: a temple town in Asgard has a Norse hof (a timber hall with dragon gables and an altar stone) in place of the
// Greek-style temple. A scripted player walks up to it by the game's own collision, is told it is a hof, makes an offering by F (healed,
// gold spent, the town thinks better of them), and the notice board and town page call it a hof town. Terra temple towns are unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, groundAt, canStand, prompt, interact } from '../src/rules/game.js';
import { enterRealm } from '../src/rules/realm.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';
import { islandStructs } from '../src/gen/mesh.js';
import { isHof, styleText, STYLES, OFFERING } from '../src/gen/style.js';
import { localRep } from '../src/rules/rep.js';
import { newsFor } from '../src/rules/news.js';

const islands = (seed, n = 4) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
function asgardHof() { for (const sd of [1717, 7, 42, 99, 5, 11]) { const s = newGame(sd); enterRealm(s, 'asgard'); s.mode = 'foot'; const isl = islands(s.seed).find((i) => i.style === 'temple' && islandTown(i).plaza && islandTown(i).marks.some((m) => m.k === 'temple')); if (isl) return [s, isl]; } return []; }

test('a temple town in Asgard is a hof town; Terra keeps its temples', () => {
  const [s, isl] = asgardHof(); assert.ok(isl, 'an Asgard temple town'); assert.equal(isl.theme, 'asgard'); assert.ok(isHof(isl));
  assert.equal(styleText(isl).label, 'hof town'); assert.match(styleText(isl).perk, /hof/);
  const v = islandStructs(isl).v; assert.ok(v.length > 0 && v.every(Number.isFinite), 'the hof mesh builds');
  const asTerra = islandStructs({ ...isl, theme: undefined }).v; assert.notEqual(v.length, asTerra.length, 'the hof is not the temple mesh');
  const t = newGame(1717), terra = islands(t.seed).filter((i) => i.style === 'temple');
  assert.ok(terra.length && terra.every((i) => !isHof(i) && styleText(i) === STYLES.temple), 'Terra temple towns stay temples');
  void s;
});

test('a scripted player walks to the hof and makes an offering at its altar stone', () => {
  const [S, isl] = asgardHof(); const t = islandTown(isl), m = t.marks.find((q) => q.k === 'temple');
  let st = null; for (const r of [7, 8, 9, 10]) for (let a = 0; a < 6.3 && !st; a += 0.15) { const x = m.x + Math.cos(a) * r, z = m.z + Math.sin(a) * r; if (canStand(S, x, z, groundAt(S, x, z)) && groundAt(S, x, z) > 0.7) st = { x, z }; }
  assert.ok(st, 'open ground near the hof');
  S.foot = { x: st.x, z: st.z, y: groundAt(S, st.x, st.z), yaw: 0, vy: 0 };
  for (let i = 0; i < 60 * 6; i++) { S.foot.yaw = Math.atan2(m.z - S.foot.z, m.x - S.foot.x); step(S, { mz: 1 }, 1 / 60); S.events.length = 0; }
  assert.ok(Math.abs(S.foot.x - m.x) > m.w / 2 - 0.05 || Math.abs(S.foot.z - m.z) > m.d / 2 - 0.05, 'did not walk into the hof');
  assert.match(prompt(S) || '', /offering at the hof/, 'prompt: ' + prompt(S));
  S.gold = 100; S.hp = 20; const before = localRep(S, isl.id); const r = interact(S);
  assert.equal(r.npc.name, 'Hof'); assert.match(r.lines[0], /altar stone/); assert.equal(S.gold, 100 - OFFERING); assert.equal(S.hp, S.maxHp); assert.equal(localRep(S, isl.id), before + 5);
  assert.match(interact(S).lines[0], /godi/, 'refused again at once, in Norse words');
  assert.match(newsFor(S, isl).title, /\(hof town\)/);
});
