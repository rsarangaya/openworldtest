// Atlantis, its own world: warm turquoise sea, white-and-gold towns, sea-Greek names, Atlantean people, mantas and dolphins, bright music,
// and a crystal pillar on each island read with F. A scripted player sails there from the Outer Sea, rows into a harbour, docks,
// walks up to a pillar and reads it, the way a player would.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, prompt, canStand, groundAt, toggleRow, warpNow } from '../src/rules/game.js';
import { enterRealm, realmOf, OUTER_EDGE } from '../src/rules/realm.js';
import { REALMS } from '../src/rules/map.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';
import { islandProps } from '../src/gen/props.js';
import { PILLAR_COUNT } from '../src/rules/lore.js';
import { buyShip, buyFood } from '../src/rules/trade.js';
import { lifeAt, clearLife } from '../src/rules/life.js';
import { soundScene } from '../src/rules/meadhall.js';
import { musicStyle, barNotes } from '../src/audio.js';
import { personSpec } from '../src/render2d/art.js';

const islands = (seed, n = 3) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

test('Atlantis has its own look: warm islands, sea-Greek names, no ice rock, Atlantean people; Asgard and Terra keep theirs', () => {
  for (const seed of [1717, 7]) {
    const s = newGame(seed); enterRealm(s, 'atlantis'); const all = islands(s.seed);
    assert.ok(all.length > 20);
    for (const isl of all) {
      assert.equal(isl.theme, 'atlantis'); assert.ok(['tropical', 'sandbar', 'temperate'].includes(isl.biome), `${isl.id}: ${isl.biome}`);
      assert.ok(!isl.special, 'no Frostwatch Rock in Atlantis'); assert.match(isl.name, /^[A-Z][a-z]+$/, isl.name);
      if (isl.port) assert.match(isl.port.name, /^[A-Z][a-z]+ Harbour$/, isl.port.name);
    }
    const withPillar = all.filter((i) => islandProps(i).filter((p) => p.k === 'pillar').length === 1).length; assert.ok(withPillar >= all.length * 0.9, `seed ${seed}: ${withPillar}/${all.length} islands have one pillar`);
    const P = personSpec('villager', 3, 'atlantis'); assert.ok(P.atl && !P.vik); assert.ok(!personSpec('player', 3, 'atlantis').atl, 'the player keeps their own clothes');
    enterRealm(s, 'asgard'); assert.ok(islands(s.seed, 2).every((i) => i.theme === 'asgard' && !islandProps(i).some((p) => p.k === 'pillar')), 'Asgard keeps rune stones');
    enterRealm(s, 'terra'); assert.ok(islands(s.seed, 2).every((i) => !islandProps(i).some((p) => p.k === 'pillar' || p.k === 'rune')), 'Terra has neither');
  }
});

test('Atlantis sea life is dolphins, mantas and turtles (no cold-water animals), and its music is its own', () => {
  const s = newGame(1717); enterRealm(s, 'atlantis'); clearLife(); const kinds = new Set();
  for (let x = -2000; x <= 2000; x += 400) for (let z = -2000; z <= 2000; z += 400) for (const c of lifeAt('atlantis', s.seed, 100, x, z)) kinds.add(c.kind);
  assert.ok(kinds.has('ray') && kinds.has('dolphin'), [...kinds].join());
  for (const k of ['narwhal', 'orca', 'icewhale', 'seal', 'raven']) assert.ok(!kinds.has(k), k);
  s.mode = 'foot'; const sc = soundScene(s, null); assert.equal(musicStyle(sc), 'atlantis');
  let r = 1; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647); const b = barNotes('atlantis', 1, rnd);
  assert.ok(b.notes.length > 4 && b.notes.every((n) => n.drum || Number.isFinite(n.n)));
  assert.ok(b.notes.some((n) => n.pad && ((n.n % 12) + 12) % 12 === 6), 'the lydian raised fourth (G#) sounds in the second chord');
});

test('a scripted player sails from the Outer Sea to Atlantis, rows into a harbour, docks, and reads a crystal pillar (once, saved)', () => {
  const s = newGame(1717); s.gold = 5000; s.flags.crossed = true; s.flags.beyond = true;
  const home = islands(s.seed, 0).find((i) => i.port); assert.ok(buyShip(s, home), 'bought a ship at home'); buyFood(s, 30); s.mode = 'ship';
  // sail out on Atlantis's bearing: the edge picks the world
  const th = REALMS.find((r) => r.id === 'atlantis').grand.ang; Object.assign(s.ship, { x: Math.cos(th) * (OUTER_EDGE - 1), z: Math.sin(th) * (OUTER_EDGE - 1), yaw: th, speed: 9 });
  for (let i = 0; i < 1200 && !s.warp; i++) step(s, {}); assert.equal(s.warp?.to, 'atlantis'); assert.ok(warpNow(s)); assert.equal(realmOf(s), 'atlantis');
  // the nearest harbour: come in from open water off its pier, then row up and dock
  const isl = islands(s.seed, 4).filter((i) => i.port && islandProps(i).some((p) => p.k === 'pillar')).sort((a, b) => Math.hypot(a.x - s.ship.x, a.z - s.ship.z) - Math.hypot(b.x - s.ship.x, b.z - s.ship.z))[0];
  assert.ok(isl, 'an Atlantis harbour with a pillar'); const P = isl.port;
  Object.assign(s.ship, { x: isl.x + Math.cos(P.angle) * isl.r * 2.2, z: isl.z + Math.sin(P.angle) * isl.r * 2.2, yaw: P.angle + Math.PI, speed: 0 }); s.enemies.clear();
  toggleRow(s); const steerTo = (tx, tz) => Math.max(-1, Math.min(1, wrap(Math.atan2(tz - s.ship.z, tx - s.ship.x) - s.ship.yaw) * 2));
  let docked = false; for (let i = 0; i < 60 * 180 && !docked; i++) { s.enemies.clear(); step(s, { rudder: steerTo(P.x, P.z), sail: 0, trim: 0 }, 1 / 60); if (i % 30 === 0 && /Dock/.test(prompt(s) || '')) docked = interact(s).type === 'ashore'; }
  assert.ok(docked, `docked at ${P.name}`);
  assert.ok(islandTown(isl).npcs.length > 3, 'the town has people');
  // walk to the pillar from open ground near it, turning to face it each step
  const p = islandProps(isl).find((q) => q.k === 'pillar'); let st = null;
  for (let a = 0; a < 6.3 && !st; a += 0.2) { const x = p.x + Math.cos(a) * 8, z = p.z + Math.sin(a) * 8; if (groundAt(s, x, z) > 0.7 && canStand(s, x, z, groundAt(s, x, z))) st = { x, z }; }
  assert.ok(st, 'open ground near the pillar');
  s.foot = { x: st.x, z: st.z, y: groundAt(s, st.x, st.z), yaw: 0, vy: 0 };
  for (let i = 0; i < 60 * 10 && Math.hypot(s.foot.x - p.x, s.foot.z - p.z) > 2.5; i++) { s.foot.yaw = Math.atan2(p.z - s.foot.z, p.x - s.foot.x); step(s, { mz: 1 }, 1 / 60); s.events.length = 0; }
  const d = Math.hypot(s.foot.x - p.x, s.foot.z - p.z); assert.ok(d <= 2.5 && d > 0.9, `walked up to the pillar, not through it (${d.toFixed(2)})`);
  assert.equal(prompt(s), 'F  Read the crystal pillar');
  const sc = s.score, r = interact(s); assert.equal(r.npc.name, 'Crystal pillar'); assert.ok(r.lines[0].length > 40 && /read: 1\./.test(r.lines[1]), r.lines.join(' | '));
  assert.equal(s.score, sc + 20); assert.ok(/before/.test(interact(s).lines[1])); assert.equal(s.score, sc + 20, 'counted once');
  assert.ok(!(s.runes || []).length, 'pillars do not count as rune stones (the rune gate needs Asgard stones)');
  assert.deepEqual(deserialize(serialize(s)).pillars, [isl.id]); assert.ok(PILLAR_COUNT >= 10);
});
