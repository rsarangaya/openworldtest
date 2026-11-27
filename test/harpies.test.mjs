// Harpies, played: scripted captains sail at the nest in Olympus through the real game rules. One fights with chain shot and swivel guns and shoots
// thieves first; one fights with round shot only; one heaves to and does nothing (and is robbed); one sails away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step } from '../src/rules/game.js';
import { enterRealm } from '../src/rules/realm.js';
import { harpyNest, FLOCK, KILL_OFF, LEAVE_R, CARRY_R } from '../src/rules/harpies.js';
import { cyclopsLairs } from '../src/rules/cyclops.js';
import { newsFor, ISSUE_LEN } from '../src/rules/news.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { sectorIslands } from '../src/gen/world.js';
import { SHIPS } from '../src/rules/ships.js';

const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
const atSea = (seed, { chain = 0, swivel = 0, out = 200 } = {}) => {
  const s = newGame(seed); enterRealm(s, 'olympus'); const l = harpyNest(s.seed), a = Math.atan2(l.z - l.cz, l.x - l.cx);
  s.shipClass = 'brigantine'; s.maxHull = s.hull = SHIPS.brigantine.hull; s.hold = SHIPS.brigantine.hold; s.food = 30; s.ammo = { chain, fire: 0 }; s.parts = { swivel };
  s.cargo = { rum: 10, silk: 4 }; s.crew = [{ id: 'cap', name: 'Kleon', captain: true, morale: 60 }, { id: 'h1', name: 'Ione', morale: 60 }, { id: 'h2', name: 'Doros', morale: 60 }];
  s.ship = { x: l.x + Math.cos(a) * out, z: l.z + Math.sin(a) * out, yaw: a + Math.PI, speed: 0, sail: 0, cd: [0, 0] }; s.mode = 'ship'; s.enemies.clear(); return { s, l, a };
};
const goods = (s) => (s.cargo.rum || 0) + (s.cargo.silk || 0);
// stand off the coast, sailing slow circles, and fire the side a harpy is on; `thief` turns the ship to bring a harpy carrying loot abeam and fires at it first
function fight(s, l, a, secs, { shot = 'round', thief = false } = {}) {
  const log = { snatched: 0, back: 0, lost: 0 }; s.shot = shot;
  for (let i = 0; i < secs * 60; i++) {
    const p = s.ship, m = s.harpies, home = Math.hypot(p.x - l.x, p.z - l.z), inp = { sail: 0.4, rudder: home > 230 ? Math.max(-1, Math.min(1, wrap(Math.atan2(l.z - p.z, l.x - p.x) - p.yaw) * 2)) : 0.5 };
    if (m) {
      const fly = m.flock.filter((h) => !h.gone && h.hp > 0), carry = fly.filter((h) => h.st === 'carry'), list = thief && carry.length ? carry : fly;
      if (thief && carry.length) { const h = carry[0], want = Math.atan2(h.z - p.z, h.x - p.x) - Math.PI / 2; inp.sail = 1; inp.rudder = Math.max(-1, Math.min(1, wrap(want - p.yaw) * 2)); } // turn to bring the thief abeam
      for (const h of list) { const rel = wrap(Math.atan2(h.z - p.z, h.x - p.x) - p.yaw), d = Math.hypot(h.x - p.x, h.z - p.z); if (d < 60) { if (Math.abs(rel + Math.PI / 2) < 0.5) inp.fireL = true; if (Math.abs(rel - Math.PI / 2) < 0.5) inp.fireR = true; } }
    }
    step(s, inp);
    for (const t of s.log.splice(0)) { if (/snatches/.test(t)) log.snatched++; if (/fish .* back out/.test(t)) log.back++; if (/is gone over the cliffs/.test(t)) log.lost++; }
    s.events.length = 0; if ((s.slain || []).includes('harpies') || s.hull <= 0) break;
  }
  return log;
}

test('each Olympus world has one harpy nest on a wild shore, apart from the cyclops; other worlds have no harpies', () => {
  for (const seed of [1717, 7, 42, 3]) {
    const s = newGame(seed); enterRealm(s, 'olympus'); const l = harpyNest(s.seed); assert.ok(l, 'no nest, seed ' + seed);
    for (const c of cyclopsLairs(s.seed)) assert.ok(Math.hypot(c.x - l.x, c.z - l.z) > 1000, 'nest beside a cyclops');
  }
  for (const r of ['terra', 'asgard', 'atlantis']) {
    const s = newGame(1717), o = newGame(1717); enterRealm(o, 'olympus'); const l = harpyNest(o.seed); if (r !== 'terra') enterRealm(s, r);
    s.ship = { x: l.x + 100, z: l.z, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; s.mode = 'ship'; for (let i = 0; i < 120; i++) step(s, {}); assert.equal(s.harpies ?? null, null, r + ' has harpies');
  }
});

test('Olympus notice boards rumour the harpies with a bearing, beside the hydra and the cyclops', () => {
  const { s } = atSea(1717); const heads = new Set(); let body = null;
  for (let n = 0; n < 18; n++) for (const isl of sectorIslands(s.seed, 0, 0)) { s.t = n * ISSUE_LEN + 1; for (const q of newsFor(s, isl).items) { heads.add(q.head); if (q.head === 'Harpies') body = q.body; } }
  assert.ok(body, 'no harpy rumour'); assert.match(body, /to the (north|south|east|west)/); assert.ok(heads.has('A cyclops') && heads.has('A hydra'), 'lost the other rumours');
});

test('a captain who heaves to and does nothing is robbed of crew and cargo, and the thieves get away', () => {
  const { s } = atSea(1717); const g0 = goods(s), c0 = s.crew.length; let lost = 0;
  for (let i = 0; i < 60 * 60; i++) { step(s, { sail: 0 }); for (const t of s.log.splice(0)) if (/is gone over the cliffs/.test(t)) lost++; s.events.length = 0; }
  assert.ok(s.harpies, 'no flock'); assert.ok(lost >= 3, `only ${lost} thieves got away`);
  assert.ok(goods(s) < g0 || s.crew.length < c0, 'nothing was taken'); assert.ok(s.crew.some((c) => c.captain), 'they took the captain');
  assert.ok(!(s.slain || []).includes('harpies'));
});

test('chain shot and swivel guns drive the flock off for good, and shooting thieves first gets the loot back', () => {
  const { s, l, a } = atSea(1717, { chain: 40, swivel: 1 }); const g0 = goods(s), c0 = s.crew.length, gold = s.gold;
  const log = fight(s, l, a, 240, { shot: 'chain', thief: true });
  assert.ok((s.slain || []).includes('harpies'), `not driven off (${JSON.stringify(log)})`); assert.equal(s.harpies, null); assert.ok(s.gold - gold >= 400 + 30 * KILL_OFF);
  assert.ok(log.lost <= 1, `${log.lost} thieves got away`); assert.ok(goods(s) + 2 * (c0 - s.crew.length) >= g0 - 2, 'most loot lost');
  assert.equal(s.killsBy.harpies, 1);
  for (let i = 0; i < 60 * 10; i++) step(s, { sail: 0 }); assert.equal(s.harpies, null, 'they came back');
  const isl = sectorIslands(s.seed, 0, 0)[0]; let news = false; for (let n = 0; n < 12; n++) { s.t = n * ISSUE_LEN + 1; if (newsFor(s, isl).items.some((q) => q.head === 'Harpies driven off')) news = true; } assert.ok(news, 'no news of it');
});

test('round shot is far weaker against them: the same captain takes much longer than with chain shot', () => {
  const r = atSea(1717); const lr = fight(r.s, r.l, r.a, 240); const c = atSea(1717, { chain: 40 }); fight(c.s, c.l, c.a, 240, { shot: 'chain' });
  assert.ok((c.s.slain || []).includes('harpies'), 'chain shot did not drive them off');
  assert.ok(r.s.t > c.s.t * 1.5, `round ${Math.round(r.s.t)}s vs chain ${Math.round(c.s.t)}s`); assert.ok(lr.snatched >= 1);
});

test('sail away and the flock goes home; the live flock is not saved', () => {
  const { s, l } = atSea(1717); for (let i = 0; i < 60 * 5; i++) step(s, { sail: 0 }); assert.ok(s.harpies && s.harpies.flock.length === FLOCK);
  const back = deserialize(serialize(s)); assert.equal(back.harpies ?? null, null);
  const a = Math.atan2(s.ship.z - l.z, s.ship.x - l.x); s.ship.x = l.x + Math.cos(a) * (LEAVE_R + 20); s.ship.z = l.z + Math.sin(a) * (LEAVE_R + 20);
  step(s, {}); assert.equal(s.harpies, null); assert.ok(CARRY_R < LEAVE_R);
});

test('thieves that get away come back, so a robbed captain can still drive the flock off', () => {
  const { s, l, a } = atSea(7, { chain: 40 }); let lost = 0;
  for (let i = 0; i < 60 * 60; i++) { step(s, { sail: 0 }); for (const t of s.log.splice(0)) if (/is gone over the cliffs/.test(t)) lost++; s.events.length = 0; }
  assert.ok(lost >= 4, `only ${lost} thieves got away`); assert.equal(s.harpies.flock.filter((h) => !h.gone).length, FLOCK);
  s.parts = { swivel: 1 }; s.enemies.clear(); fight(s, l, a, 240, { shot: 'chain' });
  assert.ok((s.slain || []).includes('harpies'), 'could not drive them off');
});
