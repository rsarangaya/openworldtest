// Thieves at night, played: a scripted player walks a port after dark when a cutpurse bumps into them. One runs him down (turns to him, runs, swings when
// close, with the real game step and collision) and gets the purse back; another stands still and loses it. Checks the 20 s roll (night only, its gap, a thin
// purse), the night-only "Cutpurses Abroad" event and its reward, leaving the island, fast travel and a save mid-chase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, groundAt, canStand, startThief, travelBlock } from '../src/rules/game.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { thiefRoll, take, THIEF_GAP, THIEF_S, THIEF_REWARD, THIEF_MIN } from '../src/rules/thief.js';
import { eventFor, EVENTS } from '../src/rules/events.js';
import { hourAt, nowHour, isNight } from '../src/rules/daynight.js';
import { localRep } from '../src/rules/rep.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';

const islands = (seed, n = 2) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const night = (() => { for (let t = 1200; t < 2400; t += 0.5) if (hourAt(t) === 22) return t; })(), noon = (() => { for (let t = 1200; t < 2400; t += 0.5) if (hourAt(t) === 12) return t; })();
function ashore(seed, k = 0, t = night) { // on foot in the plaza of a port, late evening, a full purse
  const s = newGame(seed * 10), isl = islands(seed * 10).filter((i) => i.port)[k], p = islandTown(isl).plaza; s.enemies.clear(); s.mode = 'foot'; s.t = t; s.raidT = t; s.gold = 300;
  s.foot = { x: p.x + 3, z: p.z + 3, y: groundAt(s, p.x + 3, p.z + 3), yaw: 0, vy: 0 }; return { s, isl };
}
const run = (s, secs, brain) => { for (let i = 0; i < secs * 60 && s.thief; i++) { step(s, brain ? brain() : {}, 1 / 60); s.events.length = 0; } };
const chaser = (s) => () => { const f = s.foot, o = s.thief; if (!o) return {}; const d = Math.hypot(o.x - f.x, o.z - f.z), a0 = Math.atan2(o.z - f.z, o.x - f.x); // steer round walls and props the way a player would
  let yaw = a0; for (const m of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3]) { const a = a0 + m; if (canStand(s, f.x + Math.cos(a) * 0.6, f.z + Math.sin(a) * 0.6, groundAt(s, f.x, f.z))) { yaw = a; break; } }
  return { yaw, mz: d > 1.2 ? 1 : 0, run: true, attack: d < 2.3 }; };

test('run him down: the cutpurse drops the purse and the town thanks you', () => {
  let caught = 0, tries = 0;
  for (let seed = 1; seed <= 8; seed++) for (let k = 0; k < 2; k++) {
    const { s, isl } = ashore(seed, k), rep0 = localRep(s, isl.id), o = startThief(s, isl); if (!o) continue; tries++;
    assert.equal(o.amt, take(300)); assert.equal(s.gold, 300 - o.amt, 'the purse is lighter'); assert.equal(startThief(s, isl), null, 'one at a time');
    s.weapon = 'sword'; s.weapons.sword = true; run(s, THIEF_S + 2, chaser(s)); assert.equal(s.thief, null, 'the chase ends');
    if (/bring the cutpurse down/.test(s.log.join(' '))) { caught++; assert.ok(s.gold >= 300, 'gold back'); assert.ok(localRep(s, isl.id) > rep0, 'the town remembers it'); }
    else assert.equal(s.gold, 300 - o.amt);
  }
  assert.ok(tries >= 12, `tries ${tries}`); assert.ok(caught / tries >= 0.75, `caught ${caught}/${tries}`);
});

test('stand still: the watch turns out, and the watchman either nabs him (purse back, to the cells) or loses him', () => {
  let nab = 0, gone = 0;
  for (let seed = 1; seed <= 8; seed++) for (let k = 0; k < 2; k++) {
    const { s, isl } = ashore(seed, k), rep0 = localRep(s, isl.id), o = startThief(s, isl); if (!o) continue; run(s, THIEF_S + 2, () => ({}));
    const L = s.log.join(' '); assert.equal(s.thief, null); assert.ok(/Stop, thief!/.test(L), 'a watchman hears the shout');
    if (/tackles the cutpurse/.test(L)) { nab++; assert.equal(s.gold, 300, 'purse back, no reward'); assert.ok(/to the cells/.test(L)); assert.ok(localRep(s, isl.id) > rep0); }
    else { gone++; assert.equal(s.gold, 300 - o.amt, 'gold gone'); assert.ok(/lost in the dark lanes/.test(L)); }
  }
  assert.ok(nab >= 3 && gone >= 3, `the watchman is a help, not a sure thing: nabbed ${nab}, lost ${gone}`);
});

test('wanted here: no watchman turns out for you, and he gets away', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const { s, isl } = ashore(seed); s.alert[isl.id] = s.t + 999; const o = startThief(s, isl); assert.ok(o); run(s, THIEF_S + 2, () => ({}));
    assert.ok(!/Stop, thief!/.test(s.log.join(' '))); assert.equal(s.gold, 300 - o.amt);
  }
});

test('the roll: night only, about THIEF_ODDS in a hundred, never twice within THIEF_GAP, not on a thin purse', () => {
  const { s, isl } = ashore(5); let hits = 0, n = 0;
  for (let t = night; t < night + 20 * 4000; t += 20) { s.t = t; if (!isNight(nowHour(s))) continue; n++; if (thiefRoll(s, isl, true, null)) hits++; }
  assert.ok(hits / n > 0.04 && hits / n < 0.13, `rate ${hits / n}`);
  s.t = noon; for (let i = 0; i < 50; i++, s.t += 0.01) assert.equal(thiefRoll(s, isl, true, null), false, 'no cutpurse by day');
  s.t = night; s.thiefT = night - THIEF_GAP + 10; let any = false; for (let i = 0; i < 9; i++) any ||= thiefRoll(s, isl, true, { thief: true }); assert.equal(any, false, 'gap');
  s.thiefT = undefined; s.gold = THIEF_MIN - 1; for (let t = night; t < night + 2000; t += 20) { s.t = t; assert.equal(thiefRoll(s, isl, true, { thief: true }), false, 'thin purse'); }
});

test('a cutpurse night: only after dark, more of them, and the watch pays for each one', () => {
  let nightEv = 0, dayEv = 0, s0 = null;
  const sv = newGame(70); for (const isl of islands(70).filter((i) => i.port)) { const s = sv; for (let d = 0; d < 6; d++) { s.t = night + d * 1200; if (eventFor(s, isl)?.key === 'cutpurses') { nightEv++; s0 ||= { isl, t: s.t }; } s.t = noon + d * 1200; if (eventFor(s, isl)?.key === 'cutpurses') dayEv++; } }
  assert.equal(dayEv, 0, 'never by day'); assert.ok(nightEv > 0, 'some nights'); assert.ok(EVENTS.cutpurses.night);
  const s = newGame(70), isl = s0.isl, p = islandTown(isl).plaza; s.enemies.clear(); s.mode = 'foot'; s.t = s0.t; s.raidT = s.t; s.gold = 300; s.foot = { x: p.x + 3, z: p.z + 3, y: groundAt(s, p.x + 3, p.z + 3), yaw: 0, vy: 0 };
  let a = 0, b = 0; for (let k = 0; k < 3000; k++) { const q = { ...s, t: s0.t + (k % 40) * 20 + Math.floor(k / 40) * 1200 }; if (!isNight(nowHour(q))) continue; if (thiefRoll(q, isl, true, EVENTS.cutpurses)) a++; if (thiefRoll(q, isl, true, null)) b++; }
  assert.ok(a > b * 2, `more cutpurses on their night: ${a} vs ${b}`);
  const o = startThief(s, isl); s.weapon = 'sword'; s.weapons.sword = true; run(s, THIEF_S + 2, chaser(s));
  if (/bring the cutpurse down/.test(s.log.join(' '))) assert.equal(s.gold, 300 + THIEF_REWARD, 'purse back plus the reward'); else assert.equal(s.gold, 300 - o.amt);
});

test('leaving the island loses him; no fast travel mid-chase; a save drops the chase', () => {
  const { s, isl } = ashore(2), o = startThief(s, isl); assert.ok(travelBlock(s)); const back = deserialize(serialize(s)); assert.ok(!back.thief);
  s.foot.x += isl.r * 3; step(s, {}, 1 / 60); assert.equal(s.thief, null); assert.equal(s.gold, 300 - o.amt);
});

test('played: strolling a port at night long enough, a cutpurse comes by himself (and never by day)', () => {
  const { s } = ashore(4); s.raidT = 1e9; s.t = night - 300; let met = 0, day = 0; const wander = () => ({ yaw: s.t * 0.3, mz: 0.6 });
  for (let i = 0; i < 60 * 600 && !met; i++) { const had = !!s.thief; step(s, s.thief ? chaser(s)() : wander(), 1 / 60); s.events.length = 0; if (!had && s.thief) { met++; if (!isNight(nowHour(s))) day++; } }
  assert.ok(met >= 1, 'a cutpurse turned up'); assert.equal(day, 0);
});
