// Norse axes, played: a scripted player walks up to an Asgard smith, finds the two Norse axes on sale (never on Terra), buys them,
// cycles the axes with key 4 through the game's own step, and fights with them: the Dane axe reaches further and hits harder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, groundAt } from '../src/rules/game.js';
import { enterRealm } from '../src/rules/realm.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';
import { WEAPONS, NORSE, armoryOf, buyWeapon, keyWeapon } from '../src/rules/weapons.js';

const islands = (seed, n = 2) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const smithOf = (s) => { for (const isl of islands(s.seed)) { const n = islandTown(isl).npcs.find((q) => q.kind === 'smith'); if (n) return [isl, n]; } return []; };

test('only Asgard armouries sell the Norse axes, and every armoury list fits keys 1-5', () => {
  const s = newGame(1717), [tisl] = smithOf(s); assert.ok(tisl, 'a Terra smith');
  assert.ok(!armoryOf(tisl).some((id) => WEAPONS[id].norse), 'none on Terra');
  enterRealm(s, 'asgard'); const [aisl] = smithOf(s); assert.ok(aisl, 'an Asgard smith');
  const list = armoryOf(aisl); for (const id of NORSE) assert.ok(list.includes(id), id + ' sold in Asgard');
  for (const id of list) assert.ok(WEAPONS[id].n >= 1 && WEAPONS[id].n <= 5, id + ' has a key');
});

test('a scripted player buys Norse axes from an Asgard smith, cycles them with key 4, and the Dane axe out-reaches the bearded axe', () => {
  const s = newGame(1717); s.flags.crossed = true; enterRealm(s, 'asgard'); s.mode = 'foot';
  const [isl, smith] = smithOf(s);
  s.foot = { x: smith.x + 2, z: smith.z, y: groundAt(s, smith.x + 2, smith.z), yaw: Math.PI, vy: 0 };
  const r = interact(s); assert.equal(r.type, 'npc'); assert.equal(r.npc.kind, 'smith'); assert.equal(r.panel, 'arms');
  s.gold = 500; assert.ok(buyWeapon(s, 'bearded'), 'bought the bearded axe'); assert.equal(s.gold, 360);
  s.gold = 250; assert.ok(!buyWeapon(s, 'daneaxe'), 'too poor for the Dane axe'); assert.equal(s.gold, 250);
  s.gold = 700; assert.ok(buyWeapon(s, 'daneaxe')); assert.ok(buyWeapon(s, 'axe'));
  // key 4 through the real step: axe -> bearded -> Dane axe -> axe; from a sword, 4 picks the first axe owned
  s.weapons.sword = true; step(s, { wsel: 1 }, 1 / 60); assert.equal(s.weapon, 'sword');
  const seen = []; for (let k = 0; k < 4; k++) { step(s, { wsel: 4 }, 1 / 60); seen.push(s.weapon); }
  assert.deepEqual(seen, ['axe', 'bearded', 'daneaxe', 'axe']);
  const only = newGame(1); only.weapons = { daneaxe: true }; only.weapon = 'fists'; assert.equal(keyWeapon(only, 4), 'daneaxe');
  // a hostile 4 units ahead: out of the bearded axe's reach, inside the Dane axe's
  const fight = (id) => {
    const t = deserialize(serialize(s)); t.mode = 'foot'; t.weapon = id; t.foot.yaw = 0; t.foot.cd = 0;
    const fx = t.foot.x + 4, fz = t.foot.z; t.foes = [{ id: 'axetest', kind: 'villager', name: 'the raider', seed: 9, isl: isl.id, x: fx, z: fz, y: groundAt(t, fx, fz), cd: 9 }];
    step(t, { attack: true, yaw: 0 }, 1 / 60); return t.npcs.axetest;
  };
  assert.equal(fight('bearded'), undefined, 'bearded axe misses at 4 units');
  const hit = fight('daneaxe'); assert.ok(hit && hit.hit !== undefined, 'Dane axe lands at 4 units');
  assert.ok(WEAPONS.daneaxe.dmg > WEAPONS.axe.dmg && WEAPONS.bearded.cd < WEAPONS.axe.cd, 'heavier and quicker than the plain axe');
  const back = deserialize(serialize(s)); assert.ok(back.weapons.bearded && back.weapons.daneaxe, 'axes kept through a save');
});
