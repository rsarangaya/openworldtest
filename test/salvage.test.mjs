// Wrecks and salvage, played: a scripted captain reads the rumour on a notice board, rows to the wreck, heaves to, presses F and dives
// until the wreck is stripped, through the real game rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, prompt } from '../src/rules/game.js';
import { wrecks, startDive, divesLeft, DIVES, DIVE_S, DIVE_R, BOX } from '../src/rules/salvage.js';
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

test('the chart map learns of a wreck from the board, then from the diver, and stays stripped after a save', async () => {
  const { chartWrecks } = await import('../src/rules/salvage.js');
  const s = newGame(1717), home = sectorIslands(1717, 0, 0)[0]; let body = null;
  assert.deepEqual(chartWrecks(s), [], 'a new game already knows of a wreck');
  for (let n = 0; n < 8 && !body; n++) { s.t = n * ISSUE_LEN + 1; body = newsFor(s, home).items.find((q) => q.head === 'An old wreck')?.body; }
  const w = wrecks(1717).find((q) => body.includes(q.name.replace(/^The /, '')));
  let c = chartWrecks(s).find((q) => q.id === w.id); assert.ok(c, 'the rumour did not reach the chart'); assert.equal(c.dives, 0); assert.ok(!c.stripped);
  assert.equal(chartWrecks(s).length, 1, 'heard of wrecks nobody spoke of');
  atSea(s, w.x - 200, w.z - 60); assert.ok(reach(s, w) !== null); s.ship.speed = 0;
  interact(s); for (let i = 0; i < 60 * (DIVE_S + 1); i++) tick(s);
  assert.equal(chartWrecks(s).find((q) => q.id === w.id).dives, 1);
  for (let n = 2; n <= DIVES; n++) { interact(s); for (let i = 0; i < 60 * (DIVE_S + 1); i++) tick(s); }
  c = chartWrecks(deserialize(serialize(s))).find((q) => q.id === w.id); assert.ok(c.stripped, 'not stripped after a save');
  // the chart draws it all without error (a stand-in canvas that records nothing)
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} })), set: (o, k, v) => ((o[k] = v), true) });
  globalThis.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };
  const { drawTerra, makeView } = await import('../src/mapview.js');
  const v = makeView(); drawTerra(ctx, s, 640, 0, v); v.zoom = 5; v.x = w.x; v.z = w.z; drawTerra(ctx, s, 640, 0, v); delete globalThis.document;
});

test('a dive can go wrong over a deep wreck or in a swell: the line fouls, or the diver comes up hurt and must rest; calm shallow water is safe', async () => {
  const { diveRisk, stepDive, REST_S } = await import('../src/rules/salvage.js');
  // the odds: none in calm water over a shallow wreck, more for deep water, the strongbox and a heavy swell
  const W = wrecks(42); assert.ok(!W[0].deep && !W[1].deep && W[2].deep && W[3].deep, 'the far wrecks should lie deep');
  assert.equal(diveRisk(W[0], 1, 0), 0); assert.ok(diveRisk(W[3], 1, 0) > 0); assert.ok(diveRisk(W[3], DIVES, 0) > diveRisk(W[3], 1, 0)); assert.ok(diveRisk(W[0], 1, 1) > diveRisk(W[3], 1, 0));
  // a scripted captain dives a deep wreck in a heavy swell again and again on many seeds, through the real start and finish of each dive
  let fouled = 0, hurt = 0, fine = 0, rested = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = newGame(seed), w = wrecks(seed)[3]; atSea(s, w.x, w.z); s.cargo = {}; s.t = 100 + seed * 7.3;
    for (let k = 0; k < 8 && divesLeft(s, w) > 0; k++) {
      const said = [], before = (s.salvage || {})['terra:' + w.id] || 0, g = s.gold;
      if (s.t < (s.diveRest || 0)) {
        interact(s); assert.equal(s.dive ?? null, null, 'dived while the diver was resting'); assert.match(s.log.at(-1), /getting over/); assert.match(prompt(s), /resting/);
        s.t = s.diveRest + 0.1; rested++;
      }
      startDive(s, w, (_, m) => said.push(m), false, () => false, 1); assert.ok(s.dive, said.join('|')); assert.match(said[0], /risky dive/);
      s.t += DIVE_S + 0.01; stepDive(s, 1 / 60, (_, m) => said.push(m), () => {}, () => false, 1);
      const now = s.salvage['terra:' + w.id] || 0, msg = said.at(-1);
      if (/fouls/.test(msg)) { fouled++; assert.equal(now, before, 'a fouled dive counted'); assert.equal(s.gold, g); }
      else if (/recover/.test(msg)) { hurt++; assert.equal(now, before + 1); assert.ok(s.gold - g <= BOX[1] / 2, 'a hurt diver brought up full pay'); assert.ok(s.diveRest > s.t && s.diveRest - s.t <= REST_S + 1e-6); }
      else { fine++; assert.equal(now, before + 1); }
    }
  }
  assert.ok(fouled > 0 && hurt > 0 && fine > 0 && rested > 0, `fouled ${fouled}, hurt ${hurt}, fine ${fine}, rested ${rested}`);
  // the rest survives a save
  const s = newGame(3); s.diveRest = 500; s.t = 450; assert.equal(deserialize(serialize(s)).diveRest, 500);
  // calm water over a shallow wreck never goes wrong
  for (let seed = 1; seed <= 20; seed++) {
    const t = newGame(seed), w = wrecks(seed)[0]; atSea(t, w.x, w.z); t.t = 50 + seed;
    for (let n = 1; n <= DIVES; n++) { const said = []; startDive(t, w, (_, m) => said.push(m), false, () => false, 0); assert.doesNotMatch(said[0], /risky/); t.t += DIVE_S + 0.01; stepDive(t, 1 / 60, (_, m) => said.push(m), () => {}, () => false, 0); assert.doesNotMatch(said.at(-1), /fouls|recover/); }
    assert.equal(divesLeft(t, w), 0);
  }
});

test('every world keeps its own chart: a captain in Asgard hears of a wreck, sails there, dives, and the Asgard chart shows the waters, the wreck and the rune gate', async () => {
  const { chartWrecks } = await import('../src/rules/salvage.js');
  const { mapOf, reveal } = await import('../src/rules/map.js');
  const { gateAngleOf } = await import('../src/rules/realm.js');
  const s = newGame(2024); const terraW = wrecks(2024)[0]; (s.salvage ||= {})['terra:' + terraW.id] = 1; // a Terra wreck already dived on
  enterRealm(s, 'asgard'); assert.deepEqual(chartWrecks(s), [], 'Terra\'s wrecks show on the Asgard chart');
  const home = sectorIslands(s.seed, 0, 0)[0]; let body = null;
  for (let n = 0; n < 12 && !body; n++) { s.t = n * ISSUE_LEN + 1; body = newsFor(s, home).items.find((q) => q.head === 'An old wreck')?.body; }
  assert.ok(body, 'no wreck rumour on the Asgard board');
  const w = wrecks(s.seed, 'asgard').find((q) => body.includes(q.name.replace(/^The /, ''))); assert.ok(w);
  assert.deepEqual(chartWrecks(s).map((q) => q.id), [w.id]);
  const terraCells = Object.keys(mapOf(s).cells.terra || {}).length;
  atSea(s, w.x - 200, w.z - 60); assert.ok(reach(s, w) !== null, 'never reached the wreck'); s.ship.speed = 0;
  const cells = mapOf(s).cells.asgard || {}; assert.ok(Object.keys(cells).length > 4, 'sailing Asgard charted nothing');
  assert.equal(Object.keys(mapOf(s).cells.terra || {}).length, terraCells, 'Asgard waters were written onto Terra\'s chart');
  interact(s); assert.ok(s.dive, s.log.at(-1)); for (let i = 0; i < 60 * (DIVE_S + 1); i++) tick(s);
  assert.equal(chartWrecks(s)[0].dives, 1);
  // draw it: the dived wreck's name at zoom 5, the gate's name once its cliffs are seen, the dashed rim
  const said = [], dashes = []; const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 10 }) : k === 'fillText' ? (t) => said.push(t) : k === 'setLineDash' ? (d) => dashes.push(d.length) : () => ({ addColorStop() {} })), set: (o, k, v) => ((o[k] = v), true) });
  globalThis.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };
  const { drawLocal, makeView } = await import('../src/mapview.js');
  const v = makeView(); v.zoom = 5; v.x = w.x; v.z = w.z; drawLocal(ctx, s, 640, 0, v);
  assert.ok(said.includes(w.name.replace(/^The /, '')), 'the dived wreck is not named on the Asgard chart');
  assert.ok(!said.includes('The Rune Gate'), 'the gate is drawn before anyone saw it');
  const ga = gateAngleOf('asgard'); reveal(s, 'asgard', Math.cos(ga) * (WALL_R - 200), Math.sin(ga) * (WALL_R - 200), 520);
  said.length = 0; drawLocal(ctx, s, 640, 0, makeView()); assert.ok(said.includes('The Rune Gate'), 'the gate is missing once seen'); assert.ok(dashes.some((n) => n > 0), 'no dashed rim');
  delete globalThis.document;
  // back home the Terra chart shows Terra's wreck again, and Asgard's waters survive a save
  const t = deserialize(serialize(s)); assert.ok(Object.keys(mapOf(t).cells.asgard).length >= Object.keys(cells).length);
  enterRealm(s, 'terra'); assert.deepEqual(chartWrecks(s).map((q) => q.id), [terraW.id]);
});
