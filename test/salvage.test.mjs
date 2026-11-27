// Wrecks and salvage, played: a scripted captain reads the rumour on a notice board, rows to the wreck, heaves to, presses F and dives
// until the wreck is stripped, through the real game rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, prompt } from '../src/rules/game.js';
import { wrecks, startDive, DIVES, DIVE_S, DIVE_R } from '../src/rules/salvage.js';
import { newsFor, ISSUE_LEN } from '../src/rules/news.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { enterRealm } from '../src/rules/realm.js';
import { onLand, sectorIslands, WALL_R } from '../src/gen/world.js';
import { SHIPS } from '../src/rules/ships.js';

const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
const atSea = (s, x, z, cls = 'brigantine') => { s.shipClass = cls; s.maxHull = s.hull = SHIPS[cls].hull; s.hold = SHIPS[cls].hold; s.food = 30; s.ship = { x, z, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; s.mode = 'ship'; return s; };
const tick = (s, inp = {}) => { step(s, inp); for (const id of s.enemies.keys()) s.dead.add(id); s.enemies.clear(); s.events.length = 0; }; // a quiet sea: no raiders wander in
// row to the wreck, ship oars and drift to a stop above it; returns the seconds it took
function reach(s, w) {
  for (let i = 0; i < 60 * 240; i++) {
    const p = s.ship, d = Math.hypot(w.x - p.x, w.z - p.z);
    if (d < DIVE_R - 2 && Math.abs(p.speed) < 1) return i / 60;
    s.row = d > 28; tick(s, { rudder: Math.max(-1, Math.min(1, wrap(Math.atan2(w.z - p.z, w.x - p.x) - p.yaw) * 2)), sail: -1 });
  }
  return null;
}

test('every world has four wrecks in open water, the same each time, with a name and a cargo', () => {
  for (const seed of [1717, 7, 42]) {
    const W = wrecks(seed); assert.equal(W.length, 4, 'seed ' + seed);
    for (const w of W) { assert.ok(!onLand(seed, w.x, w.z, 100), `${seed} ${w.id} is near land`); assert.ok(w.name && w.good); assert.ok(Math.hypot(w.x, w.z) < WALL_R); }
    assert.deepEqual(wrecks(seed), W);
  }
  const s = newGame(1717); s.flags.crossed = true; enterRealm(s, 'asgard'); assert.equal(wrecks(s.seed, 'asgard').length, 4);
});

test('a captain reads of a wreck on the board, rows there, dives until she is stripped, and it all survives a save', () => {
  const s = newGame(1717), home = sectorIslands(1717, 0, 0)[0]; let body = null;
  for (let n = 0; n < 8 && !body; n++) { s.t = n * ISSUE_LEN + 1; body = newsFor(s, home).items.find((q) => q.head === 'An old wreck')?.body; }
  assert.ok(body, 'no wreck rumour in eight issues'); assert.match(body, /to the (north|south|east|west)/);
  const w = wrecks(1717).find((q) => body.includes(q.name.replace(/^The /, ''))); assert.ok(w, 'the rumour names no wreck: ' + body);
  atSea(s, w.x - 280, w.z + 40); s.gold = 0; s.cargo = {};
  assert.ok(reach(s, w) !== null, 'never got there');
  assert.match(prompt(s), /F {2}Dive on the wreck/);
  s.ship.speed = 5; interact(s); assert.equal(s.dive ?? null, null, 'dived while under way'); assert.match(s.log.at(-1), /Heave to/);
  s.ship.speed = 0;
  for (let n = 1; n <= DIVES; n++) {
    interact(s); assert.ok(s.dive, 'dive ' + n + ' did not start: ' + s.log.at(-1));
    for (let i = 0; i < 60 * (DIVE_S - 1); i++) tick(s, { sail: 1, rudder: 1 }); // the helm does nothing while the diver is down
    assert.ok(s.dive && Math.abs(s.ship.speed) < 1, 'the ship moved with a diver down'); assert.match(prompt(s), /diver is down/);
    for (let i = 0; i < 90; i++) tick(s);
    assert.equal(s.dive, null); assert.equal(s.salvage['terra:' + w.id], n);
  }
  assert.ok(s.gold >= 2 * 40 + 160, 'paid too little: ' + s.gold); assert.ok(s.cargo[w.good] >= 2, 'no cargo came up'); assert.match(s.log.at(-1), /strongbox/);
  assert.doesNotMatch(prompt(s) || '', /Dive/, 'a stripped wreck can still be dived');
  const g = s.gold; interact(s); for (let i = 0; i < 60 * 8; i++) tick(s); assert.equal(s.gold, g);
  const t = deserialize(serialize(s)); assert.equal(t.salvage['terra:' + w.id], DIVES); assert.equal(t.dive, undefined);
  const later = newsFor(s, home); assert.ok(!later.items.some((q) => q.head === 'An old wreck' && q.body.includes(w.name.replace(/^The /, ''))), 'the board still rumours a stripped wreck');
});

test('no diving with raiders about, in a storm, or with a full hold of cargo; trouble hauls the diver up', () => {
  const s = newGame(7), w = wrecks(7)[1]; atSea(s, w.x, w.z);
  const raider = { id: 'r1', seed: 5, kind: 'raider', x: w.x + 120, z: w.z, yaw: 0, name: 'the Black Gull', speed: 0, hp: 60, maxHp: 60, cd: [9, 9] };
  s.enemies.set('r1', raider); interact(s); assert.equal(s.dive ?? null, null); assert.match(s.log.at(-1), /enemies about/);
  s.enemies.clear(); const said = []; startDive(s, w, (_, m) => said.push(m), true, () => false); assert.equal(s.dive ?? null, null); assert.match(said[0], /storm/);
  interact(s); assert.ok(s.dive);
  for (let i = 0; i < 60; i++) step(s, {}); s.enemies.set('r1', { ...raider, x: s.ship.x + 60 }); step(s, {});
  assert.equal(s.dive, null); assert.match(s.log.join('|'), /hauled back up/); assert.equal((s.salvage || {})['terra:' + w.id] || 0, 0);
  for (let i = 0; i < 5; i++) tick(s); s.cargo = { rum: s.hold }; const g = s.gold; s.ship.speed = 0; interact(s); for (let i = 0; i < 60 * (DIVE_S + 1); i++) tick(s);
  assert.ok(s.gold > g, s.log.slice(-3).join(" | ")); assert.equal(s.cargo.rum, s.hold); assert.equal(Object.keys(s.cargo).length, 1, 'cargo came up into a full hold');
});
