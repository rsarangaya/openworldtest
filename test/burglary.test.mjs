// House burglaries, played: a scripted player walks from the plaza of a port to a dark house door at night (real game step and collision), reads the prompt,
// presses F and waits at the lock. Checks loot, being seen (the alarm and guards), giving up by stepping away, one try a day, nothing by day, the kid's help,
// and a save mid-lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, groundAt, canStand, prompt, interact, wantedHere } from '../src/rules/game.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { PICK_S, loot, seenOdds, nearHouse } from '../src/rules/burglary.js';
import { hourAt, DAY } from '../src/rules/daynight.js';
import { localRep } from '../src/rules/rep.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';

const islands = (seed, n = 2) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const at = (h) => { for (let t = 1200; t < 2400; t += 0.5) if (hourAt(t) === h) return t; };
const night = at(22), noon = at(12);
function ashore(seed, k, t = night) {
  const s = newGame(seed * 10), isl = islands(seed * 10).filter((i) => i.port)[k]; if (!isl) return {}; const p = islandTown(isl).plaza; s.enemies.clear(); s.mode = 'foot'; s.t = t; s.raidT = t + 1e6; s.thiefT = t + 1e6; s.gold = 100;
  s.foot = { x: p.x + 3, z: p.z + 3, y: groundAt(s, p.x + 3, p.z + 3), yaw: 0, vy: 0 }; return { s, isl };
}
const tick = (s, n = 1, ctl = {}) => { for (let i = 0; i < n; i++) { step(s, ctl, 1 / 60); s.events.length = 0; } };
// walk like a player to the spot just outside a house door, steering round walls; true when there
function walkTo(s, x, z, secs = 40) {
  for (let i = 0; i < secs * 60; i++) { const f = s.foot, d = Math.hypot(x - f.x, z - f.z); if (d < 0.35) return true; const a0 = Math.atan2(z - f.z, x - f.x);
    let yaw = a0; for (const m of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3]) { const a = a0 + m; if (canStand(s, f.x + Math.cos(a) * 0.6, f.z + Math.sin(a) * 0.6, groundAt(s, f.x, f.z))) { yaw = a; break; } }
    tick(s, 1, { yaw, mz: 1, run: d > 3 }); }
  return false;
}
// the houses of a port whose door you can reach on foot
const houses = (isl) => islandTown(isl).buildings.map((b, bi) => ({ b, bi })).filter(({ b }) => !b.kind && !b.door);
const door = (b) => [b.x, b.z + b.d / 2 + 1];

test('a night of burglary: walk to doors, pick locks, sometimes get seen', () => {
  let clean = 0, seen = 0, reached = 0;
  for (let seed = 1; seed <= 8; seed++) for (let k = 0; k < 3; k++) {
    const { s, isl } = ashore(seed, k); if (!s) continue; const hs = houses(isl).slice(0, 2);
    for (const { b, bi } of hs) {
      if (s.guards.length) break; // the alarm is up: a careful burglar stops for the night
      if (!walkTo(s, ...door(b))) continue; const h = nearHouse(s, [isl]); if (!h || h.bi !== bi) continue; reached++;
      assert.match(prompt(s) || '', /Break into the house/);
      const g0 = s.gold, rep0 = localRep(s, isl.id), odds = seenOdds(s, isl, bi, { station: () => null, ev: () => null, kid: () => null }), want = loot(s, isl, bi);
      assert.ok(odds >= 20 && odds <= 70);
      interact(s); assert.ok(s.burgle, 'at the lock'); assert.match(prompt(s), /Working the lock/);
      tick(s, Math.ceil(PICK_S * 60) + 2); assert.equal(s.burgle, null, 'done');
      const log = s.log.join(' ');
      if (s.gold - g0 === want) { clean++; assert.equal(wantedHere(s, isl) && !(localRep(s, isl.id) <= -25), false, 'unseen: no alarm'); }
      else { seen++; assert.equal(s.gold - g0, Math.floor(want / 2), 'seen: half'); assert.ok(wantedHere(s, isl), 'the alarm is up'); assert.ok(localRep(s, isl.id) < rep0); assert.match(log, /Thieves!/); }
      assert.equal(nearHouse(s, [isl]).tried, true, 'one try a day'); assert.doesNotMatch(prompt(s) || '', /Break into/);
      interact(s); assert.equal(s.burgle, null, 'no second try tonight');
    }
  }
  console.log(`burglary: reached ${reached} doors, clean ${clean}, seen ${seen}`); assert.ok(reached >= 20, `reached ${reached}`); assert.ok(clean > seen, `clean ${clean} seen ${seen}`); assert.ok(seen >= 3, `seen ${seen}`);
});

test('seen: the guards turn out and hunt you', () => {
  let hunted = 0;
  for (let seed = 1; seed <= 12 && hunted < 3; seed++) for (let k = 0; k < 3; k++) {
    const { s, isl } = ashore(seed, k); if (!s) continue;
    for (const { b, bi } of houses(isl)) { if (!walkTo(s, ...door(b))) continue; if (nearHouse(s, [isl])?.bi !== bi) continue; interact(s); tick(s, 200); if (/Thieves!/.test(s.log.join(' '))) break; }
    if (!/Thieves!/.test(s.log.join(' '))) continue; tick(s, 120); if (s.guards.length) hunted++;
  }
  assert.ok(hunted >= 3, `hunted ${hunted}`);
});

test('step away and you give up; by day no prompt; a save mid-lock drops it; the kid halves time and odds', () => {
  let n = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const { s, isl } = ashore(seed, 0); if (!s) continue; const h0 = houses(isl).find(({ b }) => walkTo(s, ...door(b)) && nearHouse(s, [isl])); if (!h0) continue; n++;
    interact(s); tick(s, 30); tick(s, 40, { mz: 1, yaw: Math.PI / 2 }); assert.equal(s.burgle, null); assert.match(s.log.join(' '), /leave the lock alone/); assert.ok(!Object.keys(s.burgled || {}).length, 'giving up is not a try');
    walkTo(s, ...door(h0.b)); interact(s); assert.ok(s.burgle); const back = deserialize(serialize(s)); assert.equal(back.burgle, undefined, 'not saved mid-lock');
    s.burgle = null; s.t = noon; assert.equal(nearHouse(s, [isl]), null, 'by day the door is just a door'); assert.doesNotMatch(prompt(s) || '', /Break into/);
    s.t = night + DAY; s.comp = { key: 'urchin', name: 'Pip' }; const H = (kid) => ({ station: () => null, ev: () => null, kid: () => kid });
    assert.equal(seenOdds(s, isl, h0.bi, H('Pip')), Math.round(seenOdds(s, isl, h0.bi, H(null)) / 2));
    interact(s); assert.equal(s.burgle?.need, PICK_S / 2);
  }
  assert.ok(n >= 4, `n ${n}`);
});
