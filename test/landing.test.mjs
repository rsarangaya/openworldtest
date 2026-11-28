// "Lanterns on the Beach", played: a night-only town event. A scripted captain hears of it in port after dark, takes the job, brings the ship in to the
// wild island's beach, goes ashore by the real F rule, walks up to the smugglers' boss and makes a choice: buy the spice, take the bribe, or draw and fight
// the three smugglers with the real game step (then walks home to the watch for the reward). Another captain dawdles until dawn and the landing is gone.
// Also: the event is night-only and rarer than the cutpurses' nights, a full hold refuses the crates, and a save mid-job keeps the dawn deadline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, sideOffersFor, takeSide, pickSide, nearbyIslands, groundAt, canStand } from '../src/rules/game.js';
import { LANDING_GOODS, LANDING_COST } from '../src/rules/sidequests.js';
import { eventFor } from '../src/rules/events.js';
import { nowHour, isNight } from '../src/rules/daynight.js';
import { localRep } from '../src/rules/rep.js';
import { cargoCount } from '../src/rules/trade.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { islandTown } from '../src/gen/world.js';

const ports = (s) => nearbyIslands(s, 0, 0, 4).filter((i) => i.port?.berth);
// a captain on foot in a port's plaza after dark, ship at the berth, with the landing job on offer; the k-th such night found
function offered(k = 0) {
  let found = 0;
  for (let t = 1200; t < 1200 * 60; t += 15) {
    const s = newGame(); s.t = t; if (!isNight(nowHour(s))) continue;
    for (const isl of ports(s)) {
      if (eventFor(s, isl)?.key !== 'landing') continue;
      const b = isl.port.berth, p = islandTown(isl).plaza; s.ship = { x: b.x, z: b.z, yaw: b.yaw, speed: 0, sail: 0, cd: [0, 0] }; s.mode = 'foot'; s.foot = { x: p.x + 2, z: p.z + 2, y: groundAt(s, p.x + 2, p.z + 2), yaw: 0, vy: 0 };
      s.weapon = 'sword'; s.weapons = { sword: true }; s.enemies.clear(); s.raidT = t;
      const o = sideOffersFor(s, isl).find((v) => v.q.tpl === 'landing'); if (o && found++ === k) return { s, o, home: isl };
    }
    t += 400; // the next issue
  }
  assert.fail('no landing offered');
}
const quest = (s, o) => s.side.find((v) => v.id === o.q.id);
// walk toward (x, z) the way a player does: aim, run, swing round whatever is in the way
function walkTo(s, x, z, near = 2.2, secs = 40) {
  for (let i = 0; i < secs * 60; i++) {
    const f = s.foot, d = Math.hypot(x - f.x, z - f.z); if (d < near) return true;
    const a0 = Math.atan2(z - f.z, x - f.x); let yaw = a0;
    for (const m of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3]) { const a = a0 + m; if (canStand(s, f.x + Math.cos(a) * 0.6, f.z + Math.sin(a) * 0.6, groundAt(s, f.x, f.z))) { yaw = a; break; } }
    step(s, { yaw, mz: 1, run: true }); s.events.length = 0;
  }
  return false;
}
// bring the ship in to the wild island's beach landing (from a little way out) and go ashore with F
function landAt(s, q) {
  const isl = nearbyIslands(s, q.a.x, q.a.z, 1).find((i) => i.id === q.a.id), L = isl.landing, ux = (L.x - isl.x) / Math.hypot(L.x - isl.x, L.z - isl.z), uz = (L.z - isl.z) / Math.hypot(L.x - isl.x, L.z - isl.z);
  s.mode = 'ship'; Object.assign(s.ship, { x: L.x + ux * 12, z: L.z + uz * 12, yaw: Math.atan2(-uz, -ux), speed: 0 }); for (let i = 0; i < 30; i++) step(s, {});
  const r = interact(s); assert.equal(r.type, 'ashore', s.log.slice(-2).join(' | ')); return isl;
}
// on the beach: wait for the boss to show, walk up and press F
function meetBoss(s, o) {
  for (let i = 0; i < 60 && !(s.qa || []).some((a) => a.q === o.q.id); i++) step(s, {});
  const b = (s.qa || []).find((a) => a.q === o.q.id); assert.ok(b, 'nobody on the beach'); assert.ok(b.y >= 0.3, 'the boss stands in the sea');
  assert.ok(walkTo(s, b.x, b.z), 'could not walk up to the boss'); const r = interact(s); assert.ok(r.opts?.length === 3, JSON.stringify(r)); return r;
}

test('buy in: three crates of spice go in the hold, cheap, and the watch hears of it', () => {
  const { s, o, home } = offered(0); assert.ok(takeSide(s, o)); const q = quest(s, o); assert.ok(q.due > s.t && q.due - s.t <= 360, 'the clock runs to dawn');
  landAt(s, q); meetBoss(s, o); const g0 = s.gold, c0 = s.cargo[LANDING_GOODS[0]] || 0, rep0 = localRep(s, home.id);
  assert.ok(pickSide(s, o.q.id, 0)); assert.equal(s.gold, g0 - LANDING_COST); assert.equal(s.cargo[LANDING_GOODS[0]], c0 + LANDING_GOODS[1]);
  assert.equal(quest(s, o), undefined, 'done'); assert.ok(localRep(s, home.id) < rep0);
});

test('a full hold: no room for the crates, nothing paid', () => {
  const { s, o } = offered(1); assert.ok(takeSide(s, o)); const q = quest(s, o); landAt(s, q); meetBoss(s, o);
  s.cargo = { timber: s.hold }; const g0 = s.gold; assert.equal(pickSide(s, o.q.id, 0), false); assert.equal(s.gold, g0); assert.ok(/no room in the hold/.test(s.log.join(' '))); assert.ok(quest(s, o));
  assert.ok(pickSide(s, o.q.id, 2)); assert.equal(s.gold, g0 + 40, 'the bribe instead'); assert.equal(quest(s, o), undefined);
});

test('draw your weapon: the three smugglers are fought on the beach, then the watch pays at home', () => {
  let wins = 0;
  for (let k = 0; k < 4; k++) {
    const { s, o, home } = offered(k); assert.ok(takeSide(s, o)); const q = quest(s, o); landAt(s, q); meetBoss(s, o);
    assert.ok(pickSide(s, o.q.id, 1)); assert.equal(quest(s, o).step, 'fight'); assert.equal(quest(s, o).due, undefined, 'no dawn clock once the fight is on');
    for (let i = 0; i < 20; i++) step(s, {});
    const foes = (s.qa || []).filter((a) => a.q === o.q.id && a.kind === 'foe'); assert.equal(foes.length, 3);
    let hurt = 0;
    for (let i = 0; i < 60 * 90 && quest(s, o)?.step === 'fight'; i++) { // chase the nearest smuggler and swing when close
      const f = s.foot, a = (s.qa || []).filter((v) => v.q === o.q.id && v.kind === 'foe').sort((p, r) => Math.hypot(p.x - f.x, p.z - f.z) - Math.hypot(r.x - f.x, r.z - f.z))[0]; if (!a) break;
      const d = Math.hypot(a.x - f.x, a.z - f.z); if (s.hp < 100) { hurt++; } if (s.hp < 30) s.hp = 100; // a player drinks a potion... or here, just keeps going
      step(s, { yaw: Math.atan2(a.z - f.z, a.x - f.x), mz: d > 1.3 ? 1 : 0, run: true, attack: d < 2.2 }); s.events.length = 0;
    }
    assert.equal(quest(s, o)?.step, 'back', 'the smugglers are beaten'); assert.ok(hurt > 0, 'they fight back');
    const p = islandTown(home).plaza; s.mode = 'foot'; s.foot = { x: p.x + 2, z: p.z + 2, y: groundAt(s, p.x + 2, p.z + 2), yaw: 0, vy: 0 }; // sail home (fast travel stands in)
    for (let i = 0; i < 60 && !(s.qa || []).some((a) => a.q === o.q.id); i++) step(s, {});
    const w = (s.qa || []).find((a) => a.q === o.q.id); assert.ok(w, 'no watchman to report to'); assert.ok(walkTo(s, w.x, w.z), 'could not reach the watch');
    const g0 = s.gold, rep0 = localRep(s, home.id), r = interact(s); assert.ok(r.opts); assert.ok(pickSide(s, o.q.id, 0));
    assert.equal(s.gold, g0 + 140); assert.ok(localRep(s, home.id) > rep0); assert.equal(quest(s, o), undefined); wins++;
  }
  assert.equal(wins, 4);
});

test('dawdle till dawn: the boats are gone and the job with them; the deadline survives a save', () => {
  const { s, o } = offered(2); assert.ok(takeSide(s, o)); const due = quest(s, o).due;
  const t = deserialize(serialize(s)); assert.equal(quest(t, o).due, due, 'saved with its clock');
  while (s.t < due + 2) { step(s, {}); s.events.length = 0; }
  assert.equal(quest(s, o), undefined); assert.ok(/boats are gone/.test(s.log.join(' '))); assert.ok(!isNight(nowHour(s)) || nowHour(s) >= 5.5, 'it is dawn');
});

test('night only, and rarer than the cutpurses', () => {
  let land = 0, purse = 0, day = 0, n = 0;
  for (let t = 1200; t < 1200 * 30; t += 37) {
    const s = newGame(); s.t = t; const night = isNight(nowHour(s));
    for (const isl of ports(s)) { const k = eventFor(s, isl)?.key; if (!night) { if (k === 'landing' || k === 'cutpurses') day++; continue; } n++; if (k === 'landing') land++; if (k === 'cutpurses') purse++; }
  }
  assert.equal(day, 0, 'never by day'); assert.ok(land / n > 0.08 && land / n < 0.22, `landing ${land / n}`); assert.ok(purse > land, 'cutpurse nights stay commoner');
});
