// Asgard's music, played: a scripted player sails in Terra, crosses to Asgard, goes ashore and walks into a mead hall with the game's own
// collision. At each stage the sound scene must pick the right style, and every style's bars must be sane (in range, in the key, no clicks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, standingOn, groundAt } from '../src/rules/game.js';
import { enterRealm } from '../src/rules/realm.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';
import { soundScene } from '../src/rules/meadhall.js';
import { musicStyle, barNotes } from '../src/audio.js';

const islands = (seed, n = 3) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const style = (s) => musicStyle(soundScene(s, s.mode === 'foot' ? standingOn(s) : null));
const rng = (k) => () => ((k = (k * 1103515245 + 12345) >>> 0) / 4294967296);

test('a scripted player hears Terra music at sea, Asgard music ashore, and the mead-hall tune only inside the hall', () => {
  const s = newGame(1717); assert.equal(style(s), 'terra', 'Terra at the start');
  s.flags.crossed = true; enterRealm(s, 'asgard'); s.mode = 'ship'; assert.equal(style(s), 'norse', 'Asgard at sea');
  const isl = islands(s.seed).find((i) => islandTown(i).buildings.some((b) => b.hall)), t = islandTown(isl), b = t.buildings.find((q) => q.hall), keeper = t.npcs.find((n) => n.kind === 'tavern');
  s.mode = 'foot'; const z0 = b.z + b.d / 2 + 3; s.foot = { x: b.x, z: z0, y: groundAt(s, b.x, z0), yaw: 0, vy: 0 };
  assert.equal(style(s), 'norse', 'outside the hall door'); const sc = soundScene(s, standingOn(s)); assert.ok(sc.town > 0.2, 'the crowd is heard near the plaza');
  let seenHall = false, leftHall = false;
  for (let i = 0; i < 60 * 12 && Math.hypot(s.foot.x - keeper.x, s.foot.z - keeper.z) > 3.2; i++) { s.foot.yaw = Math.atan2(keeper.z - s.foot.z, keeper.x - s.foot.x); step(s, { mz: 1 }, 1 / 60); s.events.length = 0; if (style(s) === 'hall') seenHall = true; }
  assert.ok(seenHall && style(s) === 'hall', 'the hall tune plays by the keeper');
  for (let i = 0; i < 60 * 12 && !leftHall; i++) { s.foot.yaw = Math.PI / 2; step(s, { mz: 1 }, 1 / 60); s.events.length = 0; if (style(s) !== 'hall') leftHall = true; } // walk back out of the door (+z)
  assert.ok(leftHall && style(s) === 'norse', 'Asgard music again outside');
  enterRealm(s, 'terra'); s.mode = 'ship'; assert.equal(style(s), 'terra', 'back home, Terra music');
});

test('every style writes sane bars: notes in range and in key, envelopes that open and close, hall bars keep a steady drum', () => {
  const KEY = { norse: [0, 2, 3, 5, 7, 8, 10], hall: [0, 2, 3, 5, 7, 9, 10] }; // D minor, D dorian (Terra's plucks follow each chord's root, as before, so it is not checked)
  for (const st of ['terra', 'norse', 'hall']) for (let bar = 0; bar < 64; bar++) {
    const { len, notes } = barNotes(st, bar, rng(bar * 7 + st.length));
    assert.equal(len, st === 'hall' ? 4 : 8); assert.ok(notes.length > 4 && notes.length < 30, `${st} bar ${bar}: ${notes.length} notes`);
    for (const x of notes) {
      assert.ok(x.t >= 0 && x.t < len, `${st}: starts inside the bar`); assert.ok(x.peak > 0 && x.peak <= 0.3, `${st}: gentle level`);
      if (x.drum) continue; assert.ok(x.a > 0.001 && x.d > 0.1, `${st}: no clicks`);
      assert.ok(x.n >= -12 && x.n <= 44, `${st}: note ${x.n} in range`); assert.ok(!KEY[st] || KEY[st].includes(((x.n % 12) + 12) % 12), `${st}: note ${x.n} in key`);
    }
    if (st === 'hall') assert.equal(notes.filter((x) => x.drum).length, 6, 'six drum beats a bar');
    if (st === 'norse') assert.ok(notes.some((x) => x.n === -12), 'the low drone');
  }
});
