// Asgard people carry axes, played: a scripted player commits a crime in an Asgard port and in a Terra port; the guards that turn
// out (drawn as wardens) carry a Dane axe in Asgard and none on Terra. Story fighters and some villagers in Asgard carry a bearded axe;
// children, shopkeepers in coats and everyone outside Asgard carry none. Sprites are drawn from personSpec(kind, seed % 16, theme).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, groundAt, crime } from '../src/rules/game.js';
import { enterRealm } from '../src/rules/realm.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';
import { personSpec } from '../src/render2d/art.js';

const islands = (seed, n = 2) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const guardsAfterCrime = (s) => {
  s.mode = 'foot'; const isl = islands(s.seed).find((i) => i.port && i.tier === 'town'), pl = islandTown(isl).plaza;
  s.foot = { x: pl.x + 3, z: pl.z + 3, y: groundAt(s, pl.x + 3, pl.z + 3), yaw: 0, vy: 0 }; crime(s, isl, 50, false);
  const seen = new Map(); for (let i = 0; i < 60 * 20; i++) { step(s, {}, 1 / 60); s.events.length = 0; s.hp = s.maxHp; for (const g of s.guards) seen.set(g.id, g); }
  return [...seen.values()];
};

test('guards who turn out after a crime carry a Dane axe in Asgard and none on Terra', () => {
  const terra = guardsAfterCrime(newGame(1717)); assert.ok(terra.length >= 1, 'Terra guards came');
  for (const g of terra) assert.equal(personSpec('warden', g.seed % 16, 'terra').axe, undefined);
  const s = newGame(1717); s.flags.crossed = true; enterRealm(s, 'asgard'); const vik = guardsAfterCrime(s); assert.ok(vik.length >= 1, 'Asgard guards came');
  for (const g of vik) { const P = personSpec('warden', g.seed % 16, 'asgard'); assert.equal(P.axe, 'dane'); assert.ok(P.vik); }
});

test('in Asgard fighters mostly, smiths always and some villagers carry a bearded axe; children and coated folk never', () => {
  const share = (kind) => { let n = 0; for (let k = 0; k < 16; k++) if (personSpec(kind, k, 'asgard').axe === 'bearded') n++; return n; };
  const sailors = share('sailor'), villagers = share('villager');
  assert.ok(sailors >= 8 && sailors <= 15, `fighters ${sailors}/16`); assert.ok(villagers >= 1 && villagers <= 9, `villagers ${villagers}/16`);
  assert.equal(share('smith'), 16);
  for (const kind of ['child', 'merchant', 'tavern', 'priest']) for (let k = 0; k < 16; k++) assert.ok(!personSpec(kind, k, 'asgard').axe, kind);
  for (const th of ['terra', 'atlantis', 'olympus']) for (const kind of ['warden', 'sailor', 'villager', 'smith']) for (let k = 0; k < 16; k++) assert.ok(!personSpec(kind, k, th).axe, th + ' ' + kind);
});

