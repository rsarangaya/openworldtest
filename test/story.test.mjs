import { islandProps } from '../src/gen/props.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, sideOffersFor, takeSide, pickSide, dropSide, nearbyIslands, groundAt, canStand, crime, stationOf, contractsFor, signContract as takeContract, grapple, finishBoarding } from '../src/rules/game.js';
import { trackable, trackedQuest } from '../src/rules/track.js';
import { stepOf, placeOf, sideTarget, COMPANIONS, knowsLanes } from '../src/rules/sidequests.js';
import { EVENTS, eventFor } from '../src/rules/events.js';
import { ISSUE_LEN } from '../src/rules/news.js';
import { mapAvailable } from '../src/rules/map.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';
import { buyPrice, foodPrice, sellPrice } from '../src/rules/trade.js';

const idle = {};
const run = (s, secs) => { for (let i = 0; i < secs * 60; i++) step(s, idle); };
const ports = (s) => nearbyIslands(s, 0, 0, 4).filter((i) => i.port);
const stand = (s, x, z) => { s.mode = 'foot'; s.foot = { x, z, y: groundAt(s, x, z), yaw: 0, vy: 0 }; };
const aShip = (s) => { s.ship = { x: 0, z: 0, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; };
// sail to a story's place; its ship should be waiting there
const seek = (s, id) => { const p = placeOf(s, s.side.find((v) => v.id === id)); s.mode = 'ship'; s.ship.x = p.x; s.ship.z = p.z; s.ship.speed = 0; run(s, 1.1); return s.enemies.get('s' + id); };

// walk one accepted story to its end, always taking option `pick`
function play(s, id, pick = 0) {
  for (let n = 0; n < 12; n++) {
    const q = s.side.find((v) => v.id === id); if (!q) return n;
    const st = stepOf(s, q), p = placeOf(s, q);
    if (st.kind === 'board') {
      const e = seek(s, id); assert.ok(e, q.tpl + ': no ship to board'); s.ship.x = e.x + 8; s.ship.z = e.z;
      assert.equal(grapple(s).type, 'deck'); for (const d of s.deck.defs) d.st = 'dead'; s.deck.won = true; assert.ok(finishBoarding(s, 'loot'));
      continue;
    }
    stand(s, p.x, p.z); s.qa = null; run(s, 0.1);
    const mine = (s.qa || []).filter((a) => a.q === id);
    assert.ok(mine.length, `${q.tpl}/${q.step}: nobody and nothing appeared at ${p.name}`);
    if (st.kind === 'fight') {
      assert.equal(mine.length, st.n);
      for (const a of mine) assert.ok(a.y >= 0.3, `${q.tpl}/${q.step}: a foe stands in the sea`);
      for (let k = 0; k < 400 && s.side.some((v) => v.id === id && v.step === q.step); k++) {
        const a = (s.qa || []).find((v) => v.q === id && v.kind === 'foe'); if (!a) break;
        stand(s, a.x - 1.2, a.z); s.foot.yaw = 0; s.hp = 100; step(s, { attack: true, yaw: 0 }); s.foot.cd = 0;
      }
    } else {
      stand(s, mine[0].x + 0.6, mine[0].z);
      const r = interact(s);
      assert.notEqual(r.type, 'none', `${q.tpl}/${q.step}: F did nothing`);
      if (r.opts) { s.gold += 100; assert.ok(pickSide(s, id, Math.min(pick, r.opts.length - 1))); }
    }
  }
  assert.fail('story never ended');
}

test('every side story can be taken in some town and played to the end', () => {
  const seen = new Set(), want = ['heirloom', 'brother', 'map', 'debt', 'swordswoman', 'cartographer', 'brawl', 'duel', 'timber', 'herbs', 'blockade', 'cargo', 'ghost', 'smugglers', 'child', 'singer', 'wedding', 'trial', 'pressgang', 'race', 'deserter'];
  const base = newGame();
  for (let issue = 0; issue < 160 && seen.size < want.length; issue++) {
    for (const isl of ports(base)) {
      const s = newGame(); s.t = issue * ISSUE_LEN + 1; s.weapon = 'sword'; s.weapons = { sword: true }; aShip(s);
      stand(s, isl.x, isl.z);
      for (const offer of sideOffersFor(s, isl)) {
        if (seen.has(offer.q.tpl)) continue;
        assert.ok(takeSide(s, offer), 'could not accept ' + offer.q.tpl);
        const gold = s.gold; play(s, offer.q.id); seen.add(offer.q.tpl);
        assert.equal(s.side.length, 0); assert.ok(s.sdone[offer.q.id]); assert.equal(s.comp, null, 'companion left over after ' + offer.q.tpl);
        assert.ok(s.gold >= gold - 100, offer.q.tpl);
      }
    }
  }
  assert.deepEqual([...seen].sort(), want.sort());
});

test('a story survives saving, can be dropped, and its companion fights and follows', () => {
  const s = newGame(); let offer, isl;
  for (let issue = 0; !offer && issue < 40; issue++) { s.t = issue * ISSUE_LEN + 1; for (isl of ports(s)) { offer = sideOffersFor(s, isl).find((o) => o.q.tpl === 'swordswoman'); if (offer) break; } }
  assert.ok(offer); takeSide(s, offer);
  assert.equal(s.comp.key, 'swordswoman');
  const t = deserialize(serialize(s));
  assert.equal(t.side.length, 1); assert.equal(t.comp.name, s.comp.name); assert.equal(sideTarget(t).title, 'A Blade Owed');
  const p = placeOf(t, t.side[0]); stand(t, p.x, p.z); run(t, 0.1);
  const foe = t.qa.find((a) => a.kind === 'foe'); stand(t, foe.x - 3, foe.z); t.hp = 1e6; t.maxHp = 1e6;
  const before = t.qa.reduce((n, a) => n + (a.hp || 0), 0); run(t, 6);
  assert.ok(!t.side.length || (t.qa || []).reduce((n, a) => n + (a.hp || 0), 0) < before || t.side[0].step !== 'start', 'the companion did not hurt anyone');
  assert.ok(!t.comp || Math.hypot(t.comp.x - t.foot.x, t.comp.z - t.foot.z) < 30);
  dropSide(s, offer.q.id); assert.equal(s.side.length, 0); assert.equal(s.comp, null);
});

test('town events: stable per issue, about half the ports, and they move prices without a money loop', () => {
  const s = newGame(), list = ports(s), keys = new Set(); let on = 0, total = 0;
  for (let issue = 0; issue < 30; issue++) { s.t = issue * ISSUE_LEN + 1; for (const isl of list) { const e = eventFor(s, isl); total++; if (e) { on++; keys.add(e.key); assert.equal(eventFor(s, isl).key, e.key); } } }
  assert.ok(on / total > 0.35 && on / total < 0.75, 'share ' + on / total);
  assert.equal(keys.size, Object.keys(EVENTS).length);
  const isl = sectorIslands(s.seed, 0, 0)[0], port = isl.port;
  for (const key of Object.keys(EVENTS)) { s.ev = { iid: port.iid, key }; for (const g of ['rum', port.cheap, port.dear]) assert.ok(sellPrice(s, port, g) < buyPrice(s, port, g)); assert.ok(foodPrice(s, port) >= 1); }
  for (const c of Object.values(COMPANIONS)) assert.ok(c.town.length && c.fight.length && c.won.length);
});

test('a knockout by a story gang does not repeat, and the event crowd stands on clear ground', () => {
  const s = newGame(); let offer, isl;
  for (let n = 0; !offer && n < 40; n++) { s.t = n * ISSUE_LEN + 1; for (isl of ports(s)) { offer = sideOffersFor(s, isl).find((o) => o.q.tpl === 'blockade'); if (offer) break; } }
  takeSide(s, offer); const p = placeOf(s, s.side[0]); stand(s, p.x, p.z); run(s, 0.1);
  stand(s, s.qa[0].x - 1.5, s.qa[0].z); s.hp = 1; let kos = 0;
  for (let i = 0; i < 20 * 60; i++) { step(s, idle); kos += s.events.filter((e) => e.type === 'arrest').length; s.events.length = 0; }
  assert.equal(kos, 1);
  let crowds = 0;
  for (let n = 0; n < 12; n++) for (const town of ports(s).slice(0, 12)) {
    const t = newGame(); t.t = n * ISSUE_LEN + 1; const e = eventFor(t, town); if (!e?.folk) continue;
    stand(t, town.x, town.z); t.t = Math.floor(t.t) + 0.999; step(t, idle); if (t.ev?.iid !== town.port.iid && t.ev?.iid !== town.id) continue;
    for (const [x, y, z] of t.ev.crowd) { assert.ok(canStand(t, x, z, y), 'someone in the crowd stands inside something'); crowds++; }
  }
  assert.ok(crowds > 20, 'crowds checked: ' + crowds);
});

test('guards come in through the door, and a house fire does not crash', () => {
  const base = newGame(); let tried = 0, caught = 0;
  for (const town of ports(base).slice(0, 8)) for (const b of islandTown(town).buildings) {
    if (!['merchant', 'tavern', 'shipwright', 'smith'].includes(b.kind)) continue;
    const s = newGame(), x = b.x, z = b.z + b.d / 2 - 1.2; if (!canStand(s, x, z, groundAt(s, x, z))) continue;
    stand(s, x, z); crime(s, town, 100, true); tried++;
    for (let i = 0; i < 60 * 60 && s.hp === s.maxHp && !(s.jailUntil > 0); i++) step(s, idle);
    if (s.hp < s.maxHp || s.jailUntil > 0) caught++;
  }
  assert.ok(tried > 8 && caught >= tried * 0.9, caught + ' of ' + tried);
  let fires = 0;
  for (const town of nearbyIslands(base, 0, 0, 9).filter((i) => i.port).slice(0, 12)) for (let n = 0; n < 40; n++) {
    const s = newGame(); s.t = n * ISSUE_LEN + 1; if (eventFor(s, town)?.key !== 'fire') continue;
    stand(s, town.x, town.z); run(s, 2.1); fires++; break;
  }
  assert.ok(fires > 0);
});

test('after an arrest you can walk out of every cell, and a save stuck in a bunk is freed', () => {
  const base = newGame(); let n = 0;
  for (const town of nearbyIslands(base, 0, 0, 5).filter((i) => i.port && stationOf(i)?.jail)) {
    const st = stationOf(town), s = newGame(), sp = st.jail.spawn, y = groundAt(s, sp.x, sp.z), seen = new Set(['0,0']), q = [[0, 0]]; let out = false; n++;
    assert.ok(canStand(s, sp.x, sp.z, y), town.port.name + ': the wake-up spot is inside something');
    while (q.length && !out) { const [i, j] = q.shift(); if (sp.z + j * 0.3 > st.b.z + st.b.d / 2 + 1) out = true; else for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { const k = a + ',' + b; if (!seen.has(k) && seen.size < 5000 && canStand(s, sp.x + a * 0.3, sp.z + b * 0.3, y)) { seen.add(k); q.push([a, b]); } } }
    assert.ok(out, town.port.name + ': cannot walk out of the guard station');
    s.foot = { x: sp.x + 0.9, z: sp.z - 0.4, y, yaw: 0, vy: 0 }; const was = { ...s.foot }; // the old spot, in the bunk
    for (let i = 0; i < 60; i++) step(s, { mz: 1, yaw: Math.PI });
    assert.ok(Math.hypot(s.foot.x - was.x, s.foot.z - was.z) > 0.5, 'still frozen at ' + town.port.name);
  }
  assert.ok(n > 15);
});
test('guards reach a wanted player standing in any town square', () => {
  const base = newGame(); let tried = 0, got = 0;
  for (const town of ports(base).slice(0, 14)) {
    const s = newGame(), pl = islandTown(town).plaza; stand(s, pl.x + 5, pl.z); crime(s, town, 100, true); tried++;
    let arrested = false; // villages without a station fine you in the street, with no cell
    for (let i = 0; i < 60 * 100 && !arrested; i++) { step(s, idle); arrested = s.events.some((e) => e.type === 'arrest'); s.events.length = 0; }
    if (arrested) got++;
  }
  assert.equal(got, tried, got + ' of ' + tried);
});

test('the map is the cartographer\'s reward, always offered in Port Haven, or else comes with the Wall', () => {
  const s = newGame(), home = sectorIslands(s.seed, 0, 0)[0]; assert.equal(mapAvailable(s), false);
  for (let n = 0; n < 12; n++) { const t = newGame(); t.t = n * ISSUE_LEN + 1; assert.ok(sideOffersFor(t, home).some((o) => o.q.tpl === 'cartographer'), 'not offered in issue ' + n); }
  const o = sideOffersFor(s, home).find((v) => v.q.tpl === 'cartographer'); takeSide(s, o); s.weapon = 'sword'; s.weapons = { sword: true };
  play(s, o.q.id, 1); assert.equal(s.flags.chart, true); assert.equal(mapAvailable(s), true);
  assert.equal(deserialize(serialize(s)).flags.chart, true);
  assert.ok(!sideOffersFor(s, home).some((v) => v.q.tpl === 'cartographer' && v.q.id === o.q.id));
  const w = newGame(); w.flags.crossed = true; assert.equal(mapAvailable(w), true);
});

test('the player picks the quest to follow: story, side story or contract', () => {
  const s = newGame(); assert.equal(trackedQuest(s).id, 'main');
  const home = sectorIslands(s.seed, 0, 0)[0], o = sideOffersFor(s, home)[0]; takeSide(s, o);
  const c = contractsFor(s, home)[0]; takeContract(s, c);
  assert.deepEqual(trackable(s).map((v) => v.id), ['main', o.q.id, c.id]);
  assert.equal(trackedQuest(s).id, o.q.id, 'a story you just took is followed');
  for (const v of trackable(s)) { s.tracked = v.id; assert.equal(trackedQuest(s).id, v.id); assert.ok(v.title && v.goal()); v.target(); }
  s.tracked = c.id; assert.equal(deserialize(serialize(s)).tracked, c.id);
  s.tracked = 'gone'; assert.equal(trackedQuest(s).id, 'main');
});
test('no town is given a loose curtain wall', () => {
  const s = newGame(); for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (const i of sectorIslands(s.seed, x, z)) assert.ok(!islandTown(i).marks.some((m) => m.k === 'wall'));
});

test('every port has a real building for each of its people, a guard station with a cell, and a notice board', () => {
  let n = 0;
  for (const town of nearbyIslands(newGame(), 0, 0, 7).filter((i) => i.port)) {
    const t = islandTown(town); n++;
    for (const p of t.npcs) assert.ok(p.shop >= 0, town.port.name + ': no building for the ' + p.kind);
    assert.ok(stationOf(town)?.jail, town.port.name + ': no cell');
    assert.ok(islandProps(town).some((p) => p.k === 'board'), town.port.name + ': no notice board');
  }
  assert.ok(n > 40, 'ports checked: ' + n);
});

test('a save that leaves you inside a building loads you onto free ground nearby', () => {
  const s = newGame(), town = ports(s)[0], b = islandTown(town).buildings.find((q) => !q.door);
  stand(s, b.x, b.z); const back = deserialize(serialize(s)), f = back.foot;
  assert.ok(canStand(back, f.x, f.z, groundAt(back, f.x, f.z)), 'still inside something');
  assert.ok(Math.hypot(f.x - b.x, f.z - b.z) < 31);
});

// the first town and issue that offers a story
function offerOf(tpl) {
  for (let n = 0; n < 80; n++) { const s = newGame(); s.t = n * ISSUE_LEN + 1; aShip(s); for (const isl of ports(s)) { const o = sideOffersFor(s, isl).find((v) => v.q.tpl === tpl); if (o) { stand(s, isl.x, isl.z); takeSide(s, o); return { s, id: o.q.id }; } } }
  assert.fail(tpl + ' never offered');
}

test('a story with a deadline moves on when it runs out, and the clock survives saving', () => {
  const { s, id } = offerOf('cargo'), q = s.side[0];
  assert.ok(q.due > s.t + 200); assert.match(sideTarget(s, id).goal, /\(\d+:\d\d left\)/);
  assert.equal(deserialize(serialize(s)).side[0].due, q.due);
  q.due = s.t + 1; run(s, 2.5);
  assert.equal(s.side[0].step, 'late'); assert.equal(s.side[0].due, undefined);
});

test('a story ship is not offered without a boat, and sinking it ends the story unpaid', () => {
  for (let n = 0; n < 20; n++) { const s = newGame(); s.t = n * ISSUE_LEN + 1; for (const isl of ports(s)) assert.ok(!sideOffersFor(s, isl).some((o) => ['ghost', 'smugglers'].includes(o.q.tpl))); }
  const { s, id } = offerOf('smugglers'), e = seek(s, id); assert.ok(e); assert.equal(sideTarget(s, id).x, e.x);
  e.hp = 0; run(s, 0.1); assert.equal(s.side.length, 0); assert.ok(s.sdone[id]);
  const two = offerOf('ghost'); two.s.side[0].step = 'hunt'; const g = seek(two.s, two.id); assert.ok(g); dropSide(two.s, two.id); assert.ok(!two.s.enemies.has(g.id), 'the ship of a dropped story stays behind');
});

test('someone you are bringing home walks behind you, and goes when the story ends', () => {
  const { s, id } = offerOf('child'); s.side[0].step = 'back';
  const p = placeOf(s, s.side[0]); stand(s, p.x, p.z); run(s, 0.5);
  assert.ok(s.ward && s.ward.small); assert.ok(Math.hypot(s.ward.x - s.foot.x, s.ward.z - s.foot.z) < 12);
  assert.equal(deserialize(serialize(s)).ward, null);
  dropSide(s, id); run(s, 0.1); assert.equal(s.ward, null);
});

test('every port can be walked from its pier to its square, with no step too high to take (regression: terraces walled piers off)', () => {
  // the player's own rules in small steps, so a hairline lip cannot be jumped over
  for (const seed of [1717, 7]) {
    const s = newGame(seed); s.mode = 'foot';
    for (const isl of nearbyIslands(s, 0, 0, 4).filter((i) => i.port)) {
      const d = isl.port.dock, to = islandTown(isl).plaza, C = 0.3, x0 = (d.x0 + d.x1) / 2, z0 = (d.z0 + d.z1) / 2;
      const h = (i, j) => Math.hypot(x0 + i * C - to.x, z0 + j * C - to.z), seen = new Set(['0,0']), open = [[0, 0, groundAt(s, x0, z0)]]; let ok = false;
      while (open.length && !ok && seen.size < 60000) {
        const [i, j, y] = open.pop();
        for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].sort((p, q) => h(...q) - h(...p))) {
          const k = a + ',' + b, x = x0 + a * C, z = z0 + b * C; if (seen.has(k) || !canStand(s, x, z, y)) continue;
          seen.add(k); open.push([a, b, groundAt(s, x, z)]); if (h(a, b) < 5) ok = true;
        }
      }
      assert.ok(ok, `${seed} ${isl.port.name}: the square cannot be reached from the pier`);
    }
  }
});

test('every choice in every story leads somewhere: each option can be taken and the story still ends', () => {
  const seen = new Set();
  for (let issue = 0; issue < 160; issue++) {
    const probe = newGame(); probe.t = issue * ISSUE_LEN + 1; aShip(probe);
    for (const isl of ports(probe)) for (const offer of sideOffersFor(probe, isl)) {
      if (seen.has(offer.q.tpl)) continue; seen.add(offer.q.tpl);
      for (let pick = 1; pick < 3; pick++) {
        const s = newGame(); s.t = probe.t; s.weapon = 'sword'; s.weapons = { sword: true }; aShip(s); s.gold = 500; stand(s, isl.x, isl.z);
        assert.ok(takeSide(s, offer), offer.q.tpl); play(s, offer.q.id, pick); assert.equal(s.side.length, 0, offer.q.tpl + ' option ' + pick);
      }
    }
  }
  assert.ok(seen.size >= 19, [...seen].join());
});

test('a companion you are told to speak with waits at the spot instead of appearing twice', () => {
  const { s, id } = offerOf('singer'); s.side[0].step = 'after';
  const p = placeOf(s, s.side[0]); stand(s, p.x, p.z); run(s, 1);
  const a = (s.qa || []).find((v) => v.q === id); assert.ok(a?.self, 'the story person is not marked as the companion');
  assert.deepEqual([s.comp.x, s.comp.z], [a.x, a.z]);
});

test('the navy deserter: papers, the marines, and a navigator who keeps the hunters thin', () => {
  const { s, id } = offerOf('deserter'); s.weapon = 'sword'; s.weapons = { sword: true }; s.gold = 300;
  assert.equal(s.comp.key, 'deserter'); assert.ok(knowsLanes(s));
  const gold = s.gold; play(s, id, 0);
  assert.equal(s.side.length, 0); assert.equal(s.comp, null);
  const hand = s.crew.find((c) => c.comp === 'deserter'); assert.ok(hand, 'the deserter did not sign on'); assert.equal(hand.role, 'navigator');
  assert.ok(s.gold >= gold - 70 + 190 - 1, 'paid the forger and got the reward');
  assert.ok(knowsLanes(s), 'the perk is lost once they join the crew');
  // at sea with a bad record: the same run with and without them aboard
  const hunters = (keep) => { const t = deserialize(serialize(s)); if (!keep) t.crew = t.crew.filter((c) => c.comp !== 'deserter'); t.mode = 'ship'; t.ship.x = 0; t.ship.z = -1800; t.bountyGold = 1000; run(t, 30); return [...t.enemies.values()].filter((e) => e.hunter).length; };
  const w = hunters(false), d = hunters(true);
  assert.ok(w >= 2, 'no hunters came at all: ' + w); assert.ok(d >= 1 && d < w, 'hunters with the deserter ' + d + ', without ' + w);
});

test('a badly hurt companion falls back behind you, and the gang turns on you instead', () => {
  const { s, id } = offerOf('deserter'); s.side[0].step = 'search';
  const p = placeOf(s, s.side[0]); stand(s, p.x, p.z); run(s, 0.2);
  const foe = s.qa.find((a) => a.q === id && a.kind === 'foe'); stand(s, foe.x + 4, foe.z); s.calm = 0; run(s, 2); // the companion arrives and the gang wakes
  s.comp.hp = 20; const hp = s.hp; run(s, 4);
  assert.ok(s.comp, 'the companion died anyway'); assert.ok(s.comp.back, 'the companion did not fall back');
  assert.ok(s.comp.hp > 20, 'no breath got back'); assert.ok(s.hp < hp, 'the gang did not turn on the player');
});
