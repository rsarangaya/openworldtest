// The kraken, played: a scripted captain sails to the lair in Atlantis, gets grabbed, and fires both broadsides into the arms, through the real game rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, prompt } from '../src/rules/game.js';
import { diveStage } from '../src/rules/salvage.js';
import { enterRealm } from '../src/rules/realm.js';
import { krakenLairs, krakenParts, WAKE_R, LEAVE_R, HP, KEG, DEN_AT, HOARD, LASH_REST } from '../src/rules/kraken.js';
import { newsFor, ISSUE_LEN } from '../src/rules/news.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { onLand, sectorIslands } from '../src/gen/world.js';
import { SHIPS } from '../src/rules/ships.js';

const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
const atSea = (seed, cls = 'brigantine', ammo = { chain: 6, fire: 6 }) => {
  const s = newGame(seed); enterRealm(s, 'atlantis'); const l = krakenLairs(s.seed)[0];
  s.shipClass = cls; s.maxHull = s.hull = SHIPS[cls].hull; s.hold = SHIPS[cls].hold; s.food = 30; s.ammo = ammo;
  s.ship = { x: l.x - WAKE_R - 60, z: l.z, yaw: 0, speed: 0, sail: 0.5, cd: [0, 0] }; s.mode = 'ship'; s.enemies.clear(); return { s, l };
};
// a captain who wants it dead: sail for the lair, and once grabbed, fire whichever broadside is loaded; once it hides in its den, sail over
// the bubbles, take in sail until she barely drifts, and send the diver down with a keg whenever F offers it
function fight(s, secs, guns = true) {
  const log = { grabs: 0, squeezes: 0, slow: [], shots: 0, den: 0, kegs: 0, lashes: 0, views: new Set() }, l = krakenLairs(s.seed)[0];
  for (let i = 0; i < secs * 60; i++) {
    const m = s.kraken, p = s.ship, inp = { sail: 1 }, d = Math.hypot(l.x - p.x, l.z - p.z);
    if (m && m.grip) { if (guns) { inp.fireL = inp.fireR = true; s.shot = s.ammo.fire ? 'fire' : 'round'; } }
    else inp.rudder = Math.max(-1, Math.min(1, wrap(Math.atan2(l.z - p.z, l.x - p.x) - p.yaw) * 2));
    if (m?.den && d < 90) inp.sail = d < 22 || p.sail > 0.3 ? -1 : 0; if (m?.den && d < 30 && /kraken's den/.test(prompt(s) || '') && !s.dive) { if (Math.abs(p.speed) <= 2) interact(s); else inp.sail = -1; }
    if (s.dive?.den) { const v = diveStage(s); log.views.add(v.phase + (v.den ? ':den' : '')); }
    const hp0 = m?.hp, r0 = s.diveRest || 0;
    const n0 = s.shots.length, h0 = s.hull, held = m?.grip; step(s, inp); if (held && s.kraken?.grip) log.slow.push(Math.abs(s.ship.speed)); if (s.shots.length > n0) log.shots++;
    if (s.hull < h0 && s.log.at(-1) === 'The kraken squeezes! Her planks crack.') log.squeezes++;
    if (s.events.some((e) => e.type === 'serpent')) log.grabs++; s.events.length = 0;
    if (m?.den && s.kraken === m && m.hp <= hp0 - KEG + 1e-6) log.kegs++; if ((s.diveRest || 0) > r0) log.lashes++; if (s.log.at(-1)?.startsWith('Wounded, the kraken')) log.den = Math.max(log.den, 1);
    if ((s.slain || []).includes(l.id) || s.hull <= 0) break;
  }
  return log;
}

test('each Atlantis world has one kraken lair in open water; Terra, Asgard and Olympus have none', () => {
  for (const seed of [1717, 7, 42]) {
    const s = newGame(seed); enterRealm(s, 'atlantis'); const L = krakenLairs(s.seed); assert.equal(L.length, 1, 'seed ' + seed);
    assert.ok(!onLand(s.seed, L[0].x, L[0].z, 100), `${seed}: the lair is near land`);
  }
  for (const r of ['terra', 'asgard', 'olympus']) {
    const s = newGame(1717); if (r !== 'terra') enterRealm(s, r); const l = krakenLairs(s.seed)[0];
    s.ship = { x: l.x, z: l.z, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; s.mode = 'ship'; for (let i = 0; i < 120; i++) step(s, {}); assert.equal(s.kraken ?? null, null, r + ' has a kraken');
  }
});

test('Atlantis notice boards rumour the kraken with a bearing', () => {
  const { s } = atSea(1717); let body = null;
  for (let n = 0; n < 8 && !body; n++) for (const isl of sectorIslands(s.seed, 0, 0)) { s.t = n * ISSUE_LEN + 1; body ||= newsFor(s, isl).items.find((q) => q.head === 'A kraken')?.body; }
  assert.ok(body, 'no kraken rumour in eight issues'); assert.match(body, /to the (north|south|east|west)/);
});

test('a captain shoots the kraken down to half, follows it to its den and finishes it with kegs; it pays out its hoard and stays dead through a save', () => {
  const { s, l } = atSea(1717); const g0 = s.gold;
  const log = fight(s, 400);
  assert.ok(log.den, 'it never went to its den'); assert.ok(log.kegs >= 1 && log.kegs <= Math.ceil((HP * DEN_AT) / KEG), 'kegs set: ' + log.kegs);
  assert.ok(['down:den', 'search:den', 'up:den'].every((v) => log.views.has(v)), 'the dive view missed a phase: ' + [...log.views]);
  assert.ok(s.gold >= g0 + 800 + HOARD, 'no hoard paid');
  assert.ok(log.grabs >= 1, 'it never grabbed the ship'); assert.ok(log.squeezes >= 1, 'it never squeezed'); assert.ok(log.shots >= 6, 'the captain never fired');
  assert.ok(Math.max(...log.slow) <= 1.5, 'it did not drag the ship to a crawl under full sail');
  assert.deepEqual(s.slain, [l.id], `not slain: hp ${s.kraken?.hp}, hull ${s.hull}`); assert.ok(s.hull > 0, 'it sank the ship'); assert.ok(s.gold >= g0 + 800);
  assert.equal((s.killsBy.kraken), 1);
  const t = deserialize(serialize(s)); assert.deepEqual(t.slain, [l.id]); assert.equal(t.kraken, undefined);
  t.ship.x = l.x; t.ship.z = l.z; for (let i = 0; i < 600; i++) step(t, {}); assert.equal(t.kraken ?? null, null, 'a slain kraken rose again');
  assert.ok(newsFor(s, sectorIslands(s.seed, 0, 0)[0]).items.length);
});

test('a captain without guns loses hull to it, gets let go, and can sail away while it heals', () => {
  const { s, l } = atSea(1717, 'cutter'); const log = fight(s, 40, false);
  assert.ok(log.squeezes >= 2, 'it squeezed less than twice'); assert.ok(s.hull < SHIPS.cutter.hull);
  for (let i = 0; i < 60 * 30 && s.kraken?.grip; i++) step(s, {}); assert.ok(s.kraken && !s.kraken.grip, 'it never let go');
  s.kraken.hp = HP / 2; s.ship.x = l.x - LEAVE_R - 20; step(s, {}); assert.equal(s.kraken, null, 'it did not sink back');
  s.ship.x = l.x; for (let i = 0; i < 70; i++) step(s, {}); assert.equal(s.kraken?.hp, HP, 'it did not heal');
});

test('shot only hurts it while it holds on; fire bites harder than chain; its parts sit round the ship', () => {
  const { s, l } = atSea(1717); s.ship.x = l.x - 40; for (let i = 0; i < 70 && !s.kraken?.grip; i++) step(s, {}); const m = s.kraken; assert.ok(m?.grip, 'it did not grab');
  const parts = krakenParts(m, s.ship, s.t); assert.equal(parts.length, 5); for (const q of parts) assert.ok(Math.hypot(q.x - s.ship.x, q.z - s.ship.z) < 30);
  const arm = parts[1], hit = (kind) => { const h = m.hp; s.shots.push({ x: arm.x, z: arm.z, vx: 0, vz: 0, life: 1, owner: 'player', dmg: 20, kind }); step(s, {}); return h - m.hp; };
  const f = hit('fire'), c = hit('chain'); assert.ok(f > c && c > 0, `fire ${f} chain ${c}`);
  m.grip = false; const h = m.hp; s.shots.push({ x: arm.x, z: arm.z, vx: 0, vz: 0, life: 1, owner: 'player', dmg: 50, kind: 'round' }); m.burn = 0; step(s, {}); assert.equal(m.hp, h);
});

test('in its den shot cannot reach it, kegs can, an arm may throw the diver clear, and sailing off lets it heal', () => {
  let lashed = 0, set = 0;
  for (const seed of [1717, 7, 42, 99, 123, 555]) {
    const { s, l } = atSea(seed); s.ship.x = l.x - 40; for (let i = 0; i < 70 && !s.kraken?.grip; i++) step(s, {}); const m = s.kraken; assert.ok(m?.grip, seed + ': no grab');
    m.hp = HP * DEN_AT; step(s, {}); assert.ok(m.den && !m.grip, seed + ': not in its den'); assert.match(s.log.at(-1), /dives for its den/);
    const arm = krakenParts({ ...m, grip: true }, s.ship, s.t)[0]; s.shots.push({ x: arm.x, z: arm.z, vx: 0, vz: 0, life: 1, owner: 'player', dmg: 50, kind: 'round' }); step(s, {}); assert.equal(m.hp, HP * DEN_AT, 'shot hurt it in its den');
    for (let i = 0; i < 600; i++) step(s, {}); assert.ok(m.den && !m.grip && s.kraken === m, seed + ': it came back up from its den');
    s.ship.x = l.x + 5; s.ship.z = l.z; s.ship.speed = 4; assert.match(prompt(s), /kraken's den/); interact(s); assert.equal(s.dive ?? null, null, 'dived under way'); assert.match(s.log.at(-1), /Heave to/);
    s.ship.speed = 0; interact(s); assert.ok(s.dive?.den, seed + ': no den dive'); assert.match(prompt(s), /diver is down/);
    for (let i = 0; i < 60 * 7 && s.dive; i++) step(s, {}); assert.equal(s.dive, null);
    if (s.diveRest > s.t) { lashed++; assert.equal(m.hp, HP * DEN_AT); assert.ok(s.diveRest - s.t <= LASH_REST); assert.match(prompt(s), /resting/); } else { set++; assert.equal(m.hp, HP * DEN_AT - KEG); }
    const t2 = deserialize(serialize(s)); assert.equal(t2.kraken, undefined); assert.equal(t2.dive, undefined);
    s.ship.x = l.x - LEAVE_R - 20; step(s, {}); assert.equal(s.kraken, null, 'it stayed when the ship left');
    s.ship.x = l.x - 40; for (let i = 0; i < 70; i++) step(s, {}); assert.equal(s.kraken?.hp, HP, 'it did not heal'); assert.ok(!s.kraken.den);
  }
  assert.ok(set >= 2 && lashed >= 1, `kegs set ${set}, lashed ${lashed}`);
});
