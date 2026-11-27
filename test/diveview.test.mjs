// The dive view, played: a scripted captain heaves to over a wreck and sends the diver down; the view's stages follow the real dive
// (down the line, searching, back up), the strongbox shows only on the last dive, and the view closes when the diver surfaces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact } from '../src/rules/game.js';
import { wrecks, diveStage, DIVES } from '../src/rules/salvage.js';
import { enterRealm } from '../src/rules/realm.js';
import { SHIPS } from '../src/rules/ships.js';

const atSea = (s, x, z) => { s.shipClass = 'brigantine'; s.maxHull = s.hull = SHIPS.brigantine.hull; s.hold = SHIPS.brigantine.hold; s.food = 30; s.ship = { x, z, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; s.mode = 'ship'; return s; };
const tick = (s) => { step(s, {}); for (const id of s.enemies.keys()) s.dead.add(id); s.enemies.clear(); s.events.length = 0; };

for (const world of ['terra', 'atlantis']) test(`the dive view follows each dive to the ${world} wreck and closes after it`, () => {
  const s = newGame(1717); if (world !== 'terra') { s.flags.crossed = true; enterRealm(s, world); }
  const w = wrecks(s.seed, world === 'terra' ? '' : world)[0]; atSea(s, w.x, w.z); s.weather = null;
  assert.equal(diveStage(s), null, 'a view with no diver down');
  for (let n = 1; n <= DIVES; n++) {
    interact(s); const first = diveStage(s); assert.ok(first, 'dive ' + n + ' did not start: ' + s.log.at(-1));
    assert.equal(first.w.id, w.id); assert.equal(first.realm, world); assert.equal(first.last, n === DIVES, 'strongbox shown on the wrong dive');
    const seen = [], depths = [];
    while (s.dive) { const d = diveStage(s); if (seen.at(-1) !== d.phase) seen.push(d.phase); depths.push(d.depth); assert.ok(d.depth >= 0 && d.depth <= 1 && d.k >= 0 && d.k <= 1); tick(s); }
    assert.deepEqual(seen, ['down', 'search', 'up'], 'dive ' + n);
    assert.ok(Math.max(...depths) === 1 && depths[0] < 0.1 && depths.at(-1) < 0.15, 'the diver did not go down and come back');
    assert.equal(diveStage(s), null, 'the view stays open after the diver surfaced');
    s.diveRest = 0;
  }
});

test('the kraken has its own lair, apart from the wrecks, whichever is asked for first', async () => {
  const { krakenLairs, WAKE_R } = await import('../src/rules/kraken.js');
  for (const seed of [91, 92]) {
    const L = seed === 91 ? krakenLairs(seed) : null, W = wrecks(seed, 'atlantis'), K = L || krakenLairs(seed);
    assert.equal(W.length, 4); assert.equal(K.length, 1); assert.equal(K[0].id, 'kraken0');
    for (const w of W) assert.ok(Math.hypot(w.x - K[0].x, w.z - K[0].z) > WAKE_R * 2, `wreck ${w.id} lies in the kraken's lair`);
  }
});
