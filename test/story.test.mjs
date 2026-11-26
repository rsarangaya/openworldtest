import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, sideOffersFor, takeSide, pickSide, dropSide, nearbyIslands, groundAt, canStand, crime, stationOf, contractsFor, signContract as takeContract } from '../src/rules/game.js';
import { trackable, trackedQuest } from '../src/rules/track.js';
import { stepOf, placeOf, sideTarget, COMPANIONS } from '../src/rules/sidequests.js';
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

// walk one accepted story to its end, always taking option `pick`
function play(s, id, pick = 0) {
  for (let n = 0; n < 12; n++) {
    const q = s.side.find((v) => v.id === id); if (!q) return n;
    const st = stepOf(s, q), p = placeOf(s, q);
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
      if (r.opts) { s.gold += 100; assert.ok(pickSide(s, id, pick)); }
    }
  }
  assert.fail('story never ended');
}

test('every side story can be taken in some town and played to the end', () => {
  const seen = new Set(), want = ['heirloom', 'brother', 'map', 'debt', 'swordswoman', 'cartographer', 'brawl', 'duel', 'timber', 'herbs', 'blockade'];
  const base = newGame();
  for (let issue = 0; issue < 40 && seen.size < want.length; issue++) {
    for (const isl of ports(base)) {
      const s = newGame(); s.t = issue * ISSUE_LEN + 1; s.weapon = 'sword'; s.weapons = { sword: true };
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

test('guards come in through the door, and a house-fire town with no buildings does not crash', () => {
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
  for (const town of nearbyIslands(base, 0, 0, 9).filter((i) => i.port && !islandTown(i).buildings.length)) for (let n = 0; n < 40; n++) {
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
