// Day and night, played: a new game starts in the morning; a scripted player sails and walks through a whole day by the real game step,
// sees dusk, a short night lit by the moon and the dawn after it; the clock only moves in quarter hours, the rules do not change with it,
// the debug offset survives a save, and every glowing (window or lamp) colour in town and ship meshes is marked whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, DT } from '../src/rules/game.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { DAY, hourAt, lightAt, clockText } from '../src/rules/daynight.js';
import { sectorIslands } from '../src/gen/world.js';
import { islandStructs, shipMesh, shipParams } from '../src/gen/mesh.js';

test('the clock: morning start, quarter-hour steps, short nights, a sun or moon always above', () => {
  assert.equal(hourAt(0), 8); assert.equal(clockText(hourAt(0)), '08:00');
  let dark = 0, prev = hourAt(0), jumps = 0;
  for (let t = 0; t <= DAY; t += 1) {
    const h = hourAt(t), L = lightAt(h);
    assert.equal(h * 4, Math.round(h * 4), 'quarter hours only');
    if (h !== prev) { jumps++; prev = h; }
    if (L.night > 0.5) dark++;
    assert.ok(L.sun[1] > 0.1, 'light always comes from above');
    assert.ok(L.night >= 0 && L.night <= 1 && L.dusk >= 0 && L.dusk <= 1);
  }
  assert.equal(jumps, 96, 'one day, 96 quarter hours');
  assert.ok(dark / DAY > 0.15 && dark / DAY < 0.3, `nights are short: ${(dark / DAY).toFixed(2)}`);
  assert.equal(lightAt(12).night, 0); assert.equal(lightAt(0).night, 1); assert.ok(lightAt(18).dusk > 0.5 && lightAt(6).dusk > 0.5 && lightAt(12).dusk === 0);
  assert.equal(hourAt(DAY), 8, 'a full day comes round'); assert.equal(hourAt(0, 15), 23); assert.equal(hourAt(0, 18), 2);
});

test('a scripted player lives through a day: dusk, night, dawn; the game rules do not care', () => {
  const s = newGame(1717), seen = new Set(), gold0 = s.gold;
  s.input = { fwd: true, run: true }; s.thiefT = 1e9; // walks about town on the real step (no cutpurse: thief.test.mjs covers those)
  for (let i = 0; i < Math.ceil(DAY / DT) + 10; i++) {
    step(s, s.input);
    const h = hourAt(s.t, s.dayOff), L = lightAt(h);
    seen.add(L.night === 1 ? 'night' : L.dusk > 0.5 ? (h < 12 ? 'dawn' : 'dusk') : L.night === 0 ? 'day' : 'twilight');
  }
  for (const k of ['day', 'dusk', 'night', 'dawn']) assert.ok(seen.has(k), k);
  assert.equal(s.gold, gold0); assert.ok(Number.isFinite(s.foot.x) && Number.isFinite(s.hp));
  s.dayOff = 9; const back = deserialize(serialize(s)); assert.equal(back.dayOff, 9); assert.equal(hourAt(back.t, back.dayOff), hourAt(s.t, s.dayOff));
});

test('glass and lamps are marked to glow, whole colours only, and nothing else is', () => {
  let glow = 0;
  const check = (v) => { for (let i = 6; i < v.length; i += 9) { const c = [v[i], v[i + 1], v[i + 2]], hi = c.filter((x) => x > 1.5).length; assert.ok(hi === 0 || hi === 3, 'all three channels or none'); if (hi) { glow++; assert.ok(c.every((x) => x <= 3)); } } };
  for (const isl of sectorIslands(1717, 0, 0).concat(sectorIslands(1717, 1, 0))) check(islandStructs(isl).v);
  const n0 = glow; assert.ok(n0 > 0, 'town windows glow');
  check(shipMesh(shipParams(3, 'trader', 'galleon')).v); assert.ok(glow > n0, 'ship windows glow');
});
