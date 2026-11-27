// Land battles (first pass), played: a scripted player walks a port when a raider landing party comes ashore. One fights beside the guards (turns to the
// nearest raider, closes in and swings, with the real game step and collision); another stands back in the plaza and lets the guards do it. Checks the pay,
// the town's memory, a sacked town when the raid is lost, the 30 s roll and its gap, the Iron Tide's sell-swords, and that a save mid-raid drops it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, groundAt, startRaid, townState, travelBlock } from '../src/rules/game.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { raidRoll, RAID_GAP, RAID_PAY, RAID_S, PARTY } from '../src/rules/raid.js';
import { localRep } from '../src/rules/rep.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';

const islands = (seed, n = 2) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
function ashore(seed, k = 0) { // on foot in the plaza of a port, mid-morning, no quarrel with anyone
  const s = newGame(seed * 10), isl = islands(seed * 10).filter((i) => i.port)[k], p = islandTown(isl).plaza; s.enemies.clear(); s.mode = 'foot'; s.t = 300;
  s.foot = { x: p.x + 3, z: p.z + 3, y: groundAt(s, p.x + 3, p.z + 3), yaw: 0, vy: 0 }; return { s, isl };
}
const run = (s, secs, brain) => { for (let i = 0; i < secs * 60 && s.raid; i++) { step(s, brain ? brain() : {}, 1 / 60); s.events.length = 0; } };

test('fight beside the guards: the raiders are beaten off and the town pays for each one you cut down', () => {
  let wins = 0, mine = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const { s, isl } = ashore(seed), r = startRaid(s, isl); assert.ok(r, 'a landing party comes ashore'); assert.equal(r.foes.length, PARTY[isl.tier]); assert.ok(r.defs.length >= 2, 'the guards turn out');
    assert.equal(startRaid(s, isl), null, 'one raid at a time');
    const g0 = s.gold, rep0 = localRep(s, isl.id); s.weapon = 'sword'; s.weapons.sword = true; let log = '';
    run(s, RAID_S + 5, () => { const f = s.foot, live = s.raid.foes.filter((o) => o.hp > 0); let t = live[0]; for (const o of live) if (Math.hypot(o.x - f.x, o.z - f.z) < Math.hypot(t.x - f.x, t.z - f.z)) t = o;
      if (!t) return {}; const d = Math.hypot(t.x - f.x, t.z - f.z); log = s.log.join(' | '); return { yaw: Math.atan2(t.z - f.z, t.x - f.x), mz: d > 1.6 ? 1 : 0, attack: d < 2.2 }; });
    assert.equal(s.raid, null, 'the raid ends');
    const won = /beaten off|beat the raiders off/.test(s.log.join(' ')); if (!won) continue; wins++;
    const n = Math.round((s.gold - g0) / RAID_PAY); mine += n; assert.equal(s.gold - g0, n * RAID_PAY, 'paid per raider you cut down');
    if (n) assert.ok(localRep(s, isl.id) > rep0, 'the town remembers it'); assert.ok(townState(s, isl.id) < 2, 'the town is not burning'); void log;
  }
  assert.ok(wins >= 5, `won ${wins}/6`); assert.ok(mine >= 5, `cut down ${mine}`);
});

test('stand back: the guards fight alone; a lost raid sets the town burning, and nothing is paid', () => {
  let sacked = 0, held = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const { s, isl } = ashore(seed), g0 = s.gold; startRaid(s, isl); const n = s.raid.foes.length; s.raid.defs.length = Math.min(s.raid.defs.length, n === 5 ? 1 : 2); // a thin watch
    run(s, RAID_S + 5, () => { s.hp = s.maxHp; return {}; }); assert.equal(s.raid, null);
    assert.equal(s.gold, g0, 'no pay for standing by');
    if (townState(s, isl.id) >= 2) sacked++; else held++;
  }
  assert.ok(sacked >= 1 && sacked + held === 8, `sacked ${sacked}, held ${held}`);
});

test('knocked senseless mid-raid: the town is sacked and you wake in the street', () => {
  const { s, isl } = ashore(3); startRaid(s, isl); s.raid.defs.length = 0; s.hp = 1; run(s, 60, () => ({})); assert.equal(s.raid, null);
  assert.ok(townState(s, isl.id) >= 2); assert.ok(s.hp > 0, 'awake again'); assert.ok(/senseless/.test(s.log.join(' ')));
});

test('leaving the island settles it by numbers; no sailing off mid-fight; a save drops the raid', () => {
  const { s, isl } = ashore(2); startRaid(s, isl); assert.ok(travelBlock(s), 'fast travel refused mid-raid');
  const back = deserialize(serialize(s)); assert.ok(!back.raid, 'a save mid-raid comes back quiet');
  s.foot.x += isl.r * 3; step(s, {}, 1 / 60); assert.equal(s.raid, null); assert.ok(/raiders|guards/.test(s.log.join(' ')));
});

test('the 30 s roll: about RAID_ODDS in a hundred, never early, never twice within RAID_GAP', () => {
  const { s, isl } = ashore(5); let hits = 0, n = 0;
  for (let t = 150; t < 150 + 30 * 2000; t += 30) { s.t = t; n++; if (raidRoll(s, isl, true)) hits++; }
  assert.ok(hits / n > 0.03 && hits / n < 0.1, `rate ${hits / n}`);
  s.t = 60; assert.equal(raidRoll(s, isl, true), false, 'not in the first two minutes');
  s.t = 5000; s.raidT = 5000 - RAID_GAP + 10; for (let t = 0; t < 9; t++) { s.t = 5000 + t; assert.equal(raidRoll(s, isl, true), false); }
  s.raidT = undefined; s.t = 5000; assert.equal(raidRoll(s, isl, false), false, 'not while something else is on');
});

test('played: walking a port long enough, a raid comes by itself', () => {
  const { s } = ashore(4); s.t = 200; let met = false;
  for (let i = 0; i < 60 * 60 * 25 && !met; i++) { step(s, {}, 1 / 60); s.events.length = 0; s.log.length = 0; s.hp = s.maxHp; if (s.raid) met = true; }
  assert.ok(met, 'a landing party within 25 minutes');
});

test('an Iron Tide member gets two of the company\'s sell-swords beside the guards', () => {
  const a = ashore(7), b = ashore(7); b.s.merc = { co: 'tide', jobs: 0, job: null };
  startRaid(a.s, a.isl); startRaid(b.s, b.isl); assert.equal(b.s.raid.defs.length, a.s.raid.defs.length + 2); assert.equal(b.s.raid.defs.filter((q) => q.merc).length, 2);
});

test('a raid lasts long enough to get there and join in, even in a city with a full watch', () => {
  let n = 0;
  for (let seed = 1; seed <= 6; seed++) for (const k of [0, 1]) {
    const { s, isl } = ashore(seed, k); if (!isl || !startRaid(s, isl)) continue; n++; const t0 = s.t; let first = null;
    run(s, RAID_S + 5, () => { s.hp = s.maxHp; if (first === null && s.raid.foes.some((o) => o.hp <= 0)) first = s.t - t0; return {}; });
    assert.ok(s.t - t0 >= 18, `${isl.tier} raid over in ${(s.t - t0).toFixed(0)} s`); assert.ok(first === null || first >= 5, 'no raider falls in the first 5 s');
  }
  assert.ok(n >= 10);
});
