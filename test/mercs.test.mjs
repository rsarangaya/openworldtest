// Mercenary companies, played: scripted captains join a company in a tavern, take its job, hunt the ships it wants through the real game rules
// (sailing and broadsides), and report to an agent. Others hire a company ship that fights beside them, costs no upkeep and sails home when the term is up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step } from '../src/rules/game.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { sectorIslands, KINDS } from '../src/gen/world.js';
import { SHIPS } from '../src/rules/ships.js';
import { worldRep } from '../src/rules/rep.js';
import { trackable } from '../src/rules/track.js';
import { PAY_EVERY } from '../src/rules/crew.js';
import { COMPANIES, agentsAt, join, leave, offer, takeJob, report, jobProgress, hireShip, hirePrice, refusal, rankOf, TERM, JOIN_FEE } from '../src/rules/mercs.js';

const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
const islands = (seed, n = 3) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const quiet = (s) => { const out = []; return [(_, t) => out.push(t), out]; };
function atSea(seed) {
  const s = newGame(seed); s.shipClass = 'brigantine'; s.maxHull = s.hull = SHIPS.brigantine.hull; s.hold = SHIPS.brigantine.hold; s.food = 40; s.gold = 1000;
  s.ship = { x: 9000, z: 9000, yaw: 0, speed: 0, sail: 0.5, cd: [0, 0] }; s.mode = 'ship'; s.enemies.clear(); return s;
}
let N = 0;
const spawn = (s, kind) => { const p = s.ship, a = p.yaw + 0.6, id = 'tq' + ++N; s.enemies.set(id, { id, seed: 1234 + N * 77, kind, x: p.x + Math.cos(a) * 160, z: p.z + Math.sin(a) * 160, yaw: a + Math.PI, name: 'Test ' + N, captain: 'Nobody', gen: false, speed: 0, hp: KINDS[kind].hp, maxHp: KINDS[kind].hp, cd: [1, 1] }); return id; };
// close to about 40 m of the target, then run alongside it and fire the side that bears. Returns true when it sank.
function hunt(s, id, secs = 240) {
  for (let i = 0; i < secs * 60; i++) {
    const e = s.enemies.get(id); if (!e) return true; const p = s.ship, d = Math.hypot(e.x - p.x, e.z - p.z), bear = Math.atan2(e.z - p.z, e.x - p.x), rel = wrap(bear - p.yaw);
    const want = d > 55 ? bear : bear + (rel > 0 ? -Math.PI / 2 : Math.PI / 2), inp = { sail: 1, rudder: Math.max(-1, Math.min(1, wrap(want - p.yaw) * 2)) };
    if (d < 75) { if (Math.abs(rel + Math.PI / 2) < 0.45) inp.fireL = true; if (Math.abs(rel - Math.PI / 2) < 0.45) inp.fireR = true; }
    step(s, inp); s.events.length = 0; s.log.length = 0; if (s.hull <= 0) return false;
  }
  return !s.enemies.has(id);
}

test('agents: no Black Gulls in a fortress town, no Iron Tide in a smugglers\' cove; the Iron Tide refuses a Distrusted name', () => {
  assert.deepEqual(agentsAt({ style: 'fortress' }), ['tide']); assert.deepEqual(agentsAt({ style: 'smuggler' }), ['gull']); assert.deepEqual(agentsAt({ style: 'trade' }), ['tide', 'gull']);
  const s = atSea(7); const [say, log] = quiet(); s.rep.world = -30;
  assert.ok(refusal(s, 'tide')); assert.equal(join(s, 'tide', say), false); assert.equal(hireShip(s, 'tide', say), null); assert.equal(s.gold, 1000, 'nothing taken');
  assert.equal(refusal(s, 'gull'), null); assert.ok(join(s, 'gull', say)); assert.equal(s.gold, 1000 - JOIN_FEE); assert.equal(join(s, 'tide', say), false, 'one company at a time');
});

test('an Iron Tide member sinks raiders under sail, reports to an agent and rises in rank; the job pays nothing in a cove', () => {
  const s = atSea(1717); const [say, log] = quiet(); s.shot = 'round';
  const isl = islands(s.seed).find((i) => i.port && agentsAt(i).includes('tide')), cove = { ...isl, style: 'smuggler' };
  assert.ok(join(s, 'tide', say)); let paid = 0, jobs = 0;
  for (let round = 0; round < 3; round++) {
    const o = offer(s); assert.ok(o.n >= 2 && o.pay > 0); assert.ok(takeJob(s, say)); assert.equal(offer(s), null, 'one job at a time');
    for (let k = 0; k < o.n; k++) { const id = spawn(s, 'raider'); assert.ok(trackable(s).some((v) => v.id === 'merc' && v.target()?.label === 'Raider'), 'the job can be tracked to a raider'); assert.ok(hunt(s, id), `sank raider ${k + 1} of job ${round + 1}`); s.hull = s.maxHull; }
    assert.equal(jobProgress(s), o.n); assert.equal(report(s, cove, say), 0, 'no Iron Tide agent in a cove');
    const g = s.gold; assert.equal(report(s, isl, say), o.pay); assert.equal(s.gold - g, o.pay); paid += o.pay; jobs++;
  }
  assert.equal(s.merc.jobs, 3); assert.equal(rankOf(s.merc.jobs)[0], 'Sergeant'); assert.ok(log.some((t) => /made Sergeant/.test(t)));
  assert.ok(worldRep(s) > 0, 'honest mercenary work lifts your name'); assert.ok(offer(s).pay > 0);
  assert.ok(hirePrice(s, 'tide') < COMPANIES.tide.hireFee, 'members hire cheaper');
  const back = deserialize(serialize(s)); assert.equal(back.merc.jobs, 3, 'membership is saved');
});

test('a Black Gull member is paid for sunk merchantmen; the bounty and lost name follow, and the Iron Tide strikes such a name off', () => {
  const s = atSea(42); const [say, log] = quiet(); s.shot = 'round';
  assert.ok(join(s, 'gull', say)); const o = offer(s); takeJob(s, say);
  for (let k = 0; k < o.n; k++) assert.ok(hunt(s, spawn(s, 'trader')), 'sank a merchantman');
  assert.ok(report(s, { style: 'smuggler' }, say) === o.pay, 'paid by the agent in a cove');
  assert.ok(s.bounty > 0 && worldRep(s) < 0, 'piracy still costs your name: ' + worldRep(s));
  for (let k = 0; k < 4 && worldRep(s) > -25; k++) hunt(s, spawn(s, 'trader'));
  assert.ok(refusal(s, 'tide'), 'the Iron Tide will not deal with you now');
  // a Tide member who turns to piracy is struck off, and their hired Tide ship leaves
  const t = atSea(43); const [say2, log2] = quiet(); join(t, 'tide', say2); assert.ok(hireShip(t, 'tide', say2)); takeJob(t, say2);
  for (let k = 0; k < 6 && t.merc; k++) { hunt(t, spawn(t, 'trader')); for (let i = 0; i < 90; i++) { step(t, { sail: 0 }); t.events.length = 0; } }
  for (let i = 0; i < 120; i++) { step(t, { sail: 0 }); t.events.length = 0; }
  assert.equal(t.merc, null, 'struck off'); assert.equal(t.fleet.filter((f) => f.merc === 'tide').length, 0, 'their ship sailed home');
});

test('a hired ship joins the fleet without a spare hand, fights raiders, costs no upkeep on pay day and sails home when the term is up', () => {
  const s = atSea(99); const [say, log] = quiet(); s.crew = [{ id: 'c1', name: 'Hand', role: 'sailor', wage: 4, morale: 70, seed: 1 }];
  const g0 = s.gold, f = hireShip(s, 'gull', say); assert.ok(f, log.join(' | ')); assert.equal(s.gold, g0 - COMPANIES.gull.hireFee); assert.equal(s.fleet.length, 1); assert.ok(!s.crew[0].captain, 'no hand needed to captain her');
  s.fleetOrder = 'attack'; const id = spawn(s, 'raider'); let hitByFleet = false;
  for (let i = 0; i < 60 * 60 && s.enemies.has(id); i++) { const e = s.enemies.get(id), h = e.hp; step(s, { sail: 0.3, rudder: 0.2 }); s.events.length = 0; if (s.enemies.get(id) && s.enemies.get(id).hp < h) hitByFleet = true; s.hull = s.maxHull; }
  assert.ok(hitByFleet || !s.enemies.has(id), 'the hired ship engaged the raider');
  s.payT = PAY_EVERY - 0.5; const g = s.gold; for (let i = 0; i < 60; i++) { step(s, { sail: 0 }); s.events.length = 0; }
  assert.equal(g - s.gold, 4, 'pay day takes the wage only, no upkeep for the hired ship');
  const back = deserialize(serialize(s)); assert.equal(back.fleet[0].merc, 'gull', 'the hire is saved');
  s.t = f.until - 0.5; for (let i = 0; i < 90; i++) { step(s, { sail: 0 }); s.events.length = 0; }
  assert.equal(s.fleet.length, 0, 'term up'); assert.ok(s.log.some((x) => /term is up/.test(x)));
  assert.equal(TERM, 600);
});
