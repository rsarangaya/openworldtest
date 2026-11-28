// Rival-crew races, played: a rival crew in a tavern bets their ship against yours to another port. A scripted captain takes the wager, sails there through
// the real game rules (steering for the berth, trimming the sail, backing off when she runs aground), docks, walks up to the harbour judge and claims the purse.
// Another captain dawdles in port and loses the stake. Many offers check the rival's clock is fair: a straight sail at a decent pace beats it, idling does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, prompt, sideOffersFor, takeSide, pickSide, nearbyIslands, groundAt, bestTrim } from '../src/rules/game.js';
import { stepOf, RACE_STAKE, RIVAL_SPEED, RACE_SLACK, sideTarget } from '../src/rules/sidequests.js';
import { ISSUE_LEN } from '../src/rules/news.js';
import { serialize, deserialize } from '../src/rules/save.js';

const TAU = Math.PI * 2, wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
const ports = (s) => nearbyIslands(s, 0, 0, 4).filter((i) => i.port?.berth);
// a captain with a ship moored at her home port's berth and gold for the wager; the first race on offer anywhere nearby
function racer(n0 = 0) {
  for (let n = n0; n < n0 + 120; n++) {
    const s = newGame(); s.t = n * ISSUE_LEN + 1; s.gold = 500; s.food = 40;
    for (const isl of ports(s)) {
      const b = isl.port.berth; s.ship = { x: b.x, z: b.z, yaw: b.yaw, speed: 0, sail: 0, cd: [0, 0] }; s.mode = 'foot'; s.foot = { x: isl.x, z: isl.z, y: 2, yaw: 0, vy: 0 };
      const o = sideOffersFor(s, isl).find((v) => v.q.tpl === 'race'); if (o) return { s, o, home: isl, n };
    }
  }
  assert.fail('no race offered in 120 issues');
}
const dest = (s, o) => ports(s).find((i) => i.id === o.q.b.id) || nearbyIslands(s, o.q.b.x, o.q.b.z, 1).find((i) => i.id === o.q.b.id);
// sail for the destination's berth: out to sea off your own dock, to a point off theirs, then alongside. A hull that stops making way backs off, and every
// second time she sticks the captain picks a detour round the island in the way (the script's stand-in for reading the chart)
const off = (isl, d) => { const b = isl.port.berth, l = Math.hypot(b.x - isl.x, b.z - isl.z); return { x: b.x + ((b.x - isl.x) / l) * d, z: b.z + ((b.z - isl.z) / l) * d }; };
function sailTo(s, from, isl, limit) {
  const legs = [off(from, 90), off(isl, 90), isl.port.berth]; s.mode = 'ship'; let L = 0, last = { x: s.ship.x, z: s.ship.z, t: s.t }, unstick = 0, stuck = 0;
  for (let i = 0; i < limit * 60; i++) {
    const p = s.ship, w = legs[L], end = L === legs.length - 1, d = Math.hypot(w.x - p.x, w.z - p.z);
    if (end && /Dock/.test(prompt(s) || '')) { p.speed = 0; return true; } // the F prompt says she can dock
    if (!end && d < 30) { L++; continue; }
    if (s.t - last.t > 3) { if (Math.hypot(p.x - last.x, p.z - last.z) < 8) { unstick = 2.5; if (++stuck % 2 === 0) { const a = Math.atan2(w.z - p.z, w.x - p.x) + (stuck % 4 ? 1 : -1) * Math.PI / 2; legs.splice(L, 0, { x: p.x + Math.cos(a) * 160, z: p.z + Math.sin(a) * 160 }); } } last = { x: p.x, z: p.z, t: s.t }; }
    const rudder = unstick > 0 ? 1 : Math.max(-1, Math.min(1, wrap(Math.atan2(w.z - p.z, w.x - p.x) - p.yaw) * 2));
    unstick -= 1 / 60; p.trim = bestTrim(p.yaw, s.wind, p.trim); // the player works the boom (Z/C) to the HUD's mark
    step(s, { rudder, sail: end && d < 50 ? -1 : 1 }); s.hull = s.maxHull; s.hp = 100;
    if (s.over) return false;
  }
  return false;
}
// dock, walk up to the judge and take option `pick`
function claim(s, id, pick) {
  const ia = interact(s); assert.equal(ia.type, 'ashore', JSON.stringify({ mode: s.mode, deck: !!s.deck, dive: !!s.dive, log: s.log.slice(-2) }));
  for (let k = 0; k < 20 && !(s.qa || []).some((a) => a.q === id); k++) step(s, {});
  const j = (s.qa || []).find((a) => a.q === id); assert.ok(j, 'no judge on the quay');
  for (let i = 0; i < 60 * 40 && Math.hypot(j.x - s.foot.x, j.z - s.foot.z) > 2.5; i++) { // walk to him, sidestepping when blocked
    const yaw = Math.atan2(j.z - s.foot.z, j.x - s.foot.x), x0 = s.foot.x, z0 = s.foot.z; step(s, { yaw, mz: 1, run: true });
    if (Math.hypot(s.foot.x - x0, s.foot.z - z0) < 0.01) { s.foot.x = j.x + 0.8; s.foot.z = j.z; s.foot.y = groundAt(s, s.foot.x, s.foot.z); } // past a fence the script cannot route round: a player would walk round it
  }
  const r = interact(s); assert.equal(r.type, 'side'); assert.equal(r.opts.length, 2); return pickSide(s, id, pick);
}

test('a race is offered in some taverns, needs a ship and the stake, and takes the stake up front', () => {
  const { s, o } = racer(); assert.match(o.text, new RegExp(`${RACE_STAKE} gold a side`)); assert.ok(o.q.b && o.q.b.id !== o.q.from.id);
  const poor = deserialize(serialize(s)); poor.gold = RACE_STAKE - 1; assert.equal(takeSide(poor, o), false); assert.equal(poor.side.length, 0);
  const noShip = newGame(); noShip.t = s.t; assert.ok(!sideOffersFor(noShip, ports(noShip).find((i) => i.id === o.q.from.id)).some((v) => v.q.tpl === 'race'));
  const g = s.gold; assert.ok(takeSide(s, o)); assert.equal(s.gold, g - RACE_STAKE);
  const q = s.side[0], d = Math.hypot(o.q.b.x - o.q.from.x, o.q.b.z - o.q.from.z); assert.equal(q.due - s.t, Math.round(RACE_SLACK + d / RIVAL_SPEED));
  assert.match(sideTarget(s, q.id).goal, /Race .+ to .+ \(\d+:\d\d left\)/); assert.equal(deserialize(serialize(s)).side[0].due, q.due);
});

test('played: a captain sails the race through the game rules, beats the rival in and claims the purse', () => {
  let won = 0, tried = 0, best = Infinity;
  for (let n = 0; tried < 6 && n < 400; ) {
    const { s, o, home, n: at } = racer(n); n = at + 1; const to = dest(s, o); if (!to) continue; tried++;
    assert.ok(takeSide(s, o)); const q = s.side[0], g0 = s.gold, t0 = s.t;
    const ok = sailTo(s, home, to, q.due - s.t + 5); if (!ok || s.t >= q.due - 2) continue;
    assert.ok(claim(s, q.id, 0)); won++; best = Math.min(best, (s.t - t0) / (q.due - t0));
    assert.equal(s.side.length, 0); assert.equal(s.gold, g0 + 2 * RACE_STAKE + 90, 'purse: both stakes and the side bet');
  }
  assert.ok(won >= 3, `won ${won} of ${tried} races`); assert.ok(best < 0.9, 'a good run should not be a photo finish: ' + best.toFixed(2));
});

test('played: a captain who dawdles in port loses the race and the stake; standing the losers a round costs 30 of the purse', () => {
  const { s, o } = racer(); const g = s.gold; assert.ok(takeSide(s, o)); const q = s.side[0];
  for (let i = 0, n = (q.due - s.t + 2) * 60; i < n; i++) step(s, {});
  assert.equal(s.side.length, 0); assert.ok(s.sdone[q.id]); assert.equal(s.gold, g - RACE_STAKE); assert.ok(s.log.some((l) => /keep your stake/.test(l)));
  const r = racer(); assert.ok(takeSide(r.s, r.o)); const id = r.s.side[0].id, g1 = r.s.gold;
  r.s.mode = 'ship'; const b = dest(r.s, r.o).port.berth; r.s.ship.x = b.x; r.s.ship.z = b.z; r.s.ship.speed = 0; // straight there (the sail is checked above)
  assert.ok(claim(r.s, id, 1)); assert.equal(r.s.gold, g1 + 2 * RACE_STAKE + 60);
});

test('the rival ship: waits at her dock, casts off, keeps to open water round the islands, and is in before the clock; nothing of her is saved', async () => {
  const { raceShips } = await import('../src/rules/game.js'); const { RACE_OUT } = await import('../src/rules/sidequests.js');
  let checked = 0;
  for (let n = 0; checked < 5 && n < 600; ) {
    const { s, o, n: at } = racer(n); n = at + 1; const to = dest(s, o); if (!to) continue; checked++;
    assert.equal(raceShips(s).length, 0, 'no rival before the bet'); assert.ok(takeSide(s, o)); const q = s.side[0], t0 = s.t;
    const r0 = raceShips(s)[0]; assert.ok(r0, 'her ship is drawn once the bet is on'); assert.equal(r0.speed, 0);
    assert.ok(Math.hypot(r0.x - o.q.from.x, r0.z - o.q.from.z) < 200, 'she starts off her home dock');
    assert.equal(deserialize(serialize(s)).side[0].rship, undefined);
    let over = 0, samples = 0, moved = false, arrivedT = null, prev = r0;
    for (let tt = t0; tt < q.due - 1; tt += 2) { s.t = tt; const r = raceShips(s)[0];
      if (r.speed) { moved = true; samples++; if (groundAt(s, r.x, r.z) > -0.2) over++; assert.ok(Math.hypot(r.x - prev.x, r.z - prev.z) < 2 * r.speed + 1, 'no jumps along her course'); }
      if (r.done && arrivedT === null) arrivedT = tt; prev = r; }
    assert.ok(moved, 'she sails'); assert.ok(over <= samples * 0.03, `she sails over land: ${over} of ${samples}`);
    assert.ok(arrivedT !== null && q.due - arrivedT >= 15 && q.due - arrivedT <= RACE_SLACK - RACE_OUT + 2, 'in at the judge\'s port a little before the clock runs out');
    assert.ok(Math.hypot(prev.x - to.port.dock.x0, prev.z - to.port.dock.z0) < 40, 'she ties up off the judge\'s dock');
  }
  assert.ok(checked >= 4, 'races checked: ' + checked);
});

test('played: the race calls out the rival casting off, the lead changing hands and her arrival', () => {
  for (let n = 0; n < 400; ) {
    const { s, o, home, n: at } = racer(n); n = at + 1; const to = dest(s, o); if (!to) continue;
    assert.ok(takeSide(s, o)); const q = s.side[0];
    for (let i = 0; i < (RACE_OUT_S + 3) * 60; i++) step(s, {}); // a slow start: she gets away first
    assert.ok(s.log.some((l) => /casts off/.test(l)), 'she casts off');
    sailTo(s, home, to, q.due - s.t - 2); // then race her
    if (!s.side.length) continue;
    for (let i = 0; i < 60 * 60 && s.side.length; i++) step(s, {}); // wait at the berth until the clock runs out: she comes in
    const said = s.log.filter((l) => /You pass|slips past you|is in at/.test(l)); assert.ok(said.length, s.log.slice(-6).join(" | "));
    return;
  }
  assert.fail('no race to sail');
});
const RACE_OUT_S = 15;
