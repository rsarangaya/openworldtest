// Fleet trade routes, played: a scripted captain who has walked two ports keeps a prize ship, sends her on a trade run from a shipyard, sails on through the real
// game rules while she is away (enemy shots pass her by, she is not moved), and is paid when she comes home. Many runs check the raiders' share and the Iron Tide's cover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, runPorts } from '../src/rules/game.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { sectorIslands } from '../src/gen/world.js';
import { SHIPS } from '../src/rules/ships.js';
import { visit } from '../src/rules/map.js';
import { addPrize, fleetOf } from '../src/rules/fleet.js';
import { runQuote, sendRun, stepRoutes, away, RISK_MAX } from '../src/rules/routes.js';

const islands = (seed, n = 3) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const quiet = () => { const out = []; return [(_, t) => out.push(t), out]; };
// a captain with a brigantine at sea, one spare hand, a prize ship kept in the fleet, and the ports of three islands walked
function captain(seed) {
  const s = newGame(seed); s.shipClass = 'brigantine'; s.maxHull = s.hull = SHIPS.brigantine.hull; s.hold = SHIPS.brigantine.hold; s.food = 40; s.gold = 3000;
  s.ship = { x: 9000, z: 9000, yaw: 0, speed: 0, sail: 0.5, cd: [0, 0] }; s.mode = 'ship'; s.enemies.clear();
  const ports = islands(seed).filter((i) => i.port?.berth); for (const p of ports.slice(0, 3)) visit(s, p);
  s.crew.push({ id: 'h1', name: 'Hand', role: 'sailor', wage: 3, morale: 80, seed: 5 });
  const f = addPrize(s, { kind: 'trader', seed: 777, name: 'The Tester', x: 9050, z: 9000, yaw: 0, maxHp: 40 }); return { s, f, here: ports[0] };
}

test('the shipyard lists the other ports you have walked, nearest first, with a stake, a profit and a risk', () => {
  const { s, here } = captain(11), ds = runPorts(s, here);
  assert.equal(ds.length, 2); assert.ok(!ds.some((d) => d.id === here.id)); assert.ok(ds[0].dist <= ds[1].dist);
  for (const d of ds) { const q = runQuote(s, here.port, d.port, d.dist); assert.ok(q.time >= 180 && q.stake >= 0 && q.profit >= 0 && q.risk > 0 && q.risk <= RISK_MAX, JSON.stringify(q)); }
  const near = runQuote(s, here.port, ds[0].port, ds[0].dist), far = runQuote(s, here.port, ds[1].port, ds[1].dist); assert.ok(far.risk >= near.risk && far.time >= near.time);
});

test('played: send her on a run, sail on while she is away, and be paid (or robbed) when she comes home', () => {
  let paid = 0, hurt = 0, lost = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const { s, f, here } = captain(seed), [say, log] = quiet(), d = runPorts(s, here).find((q) => runQuote(s, here.port, q.port, q.dist).profit > 0); if (!d) continue;
    const q = runQuote(s, here.port, d.port, d.dist), g0 = s.gold;
    assert.ok(sendRun(s, f.id, here, d, say)); assert.equal(s.gold, g0 - q.stake, 'stake paid up front'); assert.equal(sendRun(s, f.id, here, d, say), null, 'not twice');
    assert.equal(away(s).length, 1);
    // an enemy shot right through her spot does nothing while she is away
    s.shots.push({ owner: 'enemy', x: f.x, z: f.z, vx: 0, vz: 0, life: 0.5, dmg: 20 });
    const hp0 = f.hp; let t = 0; while (f.run && t < q.time + 3) { step(s, { sail: 1, rudder: 0.3 }); s.events.length = 0; if (f.run) s.log.length = 0; t += 1 / 60; if (t < 1) assert.equal(f.hp, hp0, 'shot passes her by'); }
    assert.ok(!f.run, 'back by the due time'); assert.ok(t >= q.time - 1, 'not before');
    const said = s.log.map((l) => l.text || l).join(' | ');
    if (fleetOf(s).includes(f)) { if (/is back from/.test(said)) paid++; else hurt++; assert.ok(Math.hypot(f.x - s.ship.x, f.z - s.ship.z) < 120, 'she anchors beside you'); }
    else { lost++; assert.ok(!s.crew.find((c) => c.id === 'h1').captain, 'her captain rowed home'); }
    assert.ok(/back from|Raiders/.test(said), 'you hear about it');
  }
  assert.ok(paid >= 3, `most runs pay (paid ${paid}, hurt ${hurt}, lost ${lost})`);
});

test('raiders catch about their share of runs; the Iron Tide halves it; a hired ship cannot be sent', () => {
  const rate = (tide) => { let caught = 0, n = 0; for (let seed = 1; seed <= 300; seed++) {
    const { s, f, here } = captain(1000 + seed); const [say] = quiet(); if (tide) s.merc = { co: 'tide', jobs: 0, job: null };
    const d = { id: 'x', name: 'Far Port', port: { ...here.port, x: here.port.x + 5000, cheap: 'silk', dear: 'rum', name: 'Far Port' }, dist: 5000 };
    const r = sendRun(s, f.id, here, d, say); if (!r) continue; n++; const g = s.gold; s.t = r.due; stepRoutes(s, say); if (s.gold < g + r.stake + r.profit) caught++; }
    return [caught / n, n]; };
  const [plain, n] = rate(false), [tide] = rate(true);
  assert.ok(n > 200, 'runs sent: ' + n); assert.ok(plain > 0.18 && plain < 0.42, 'plain ' + plain); assert.ok(tide < plain * 0.75, `tide ${tide} vs ${plain}`);
  const { s, here } = captain(5), [say] = quiet(); fleetOf(s).push({ id: 'm1', kind: 'navy', seed: 3, name: 'Hired', x: 0, z: 0, yaw: 0, hp: 75, maxHp: 75, merc: 'tide', until: 999 });
  assert.equal(sendRun(s, 'm1', here, runPorts(s, here)[0], say), null);
});

test('a run in progress survives saving and loading', () => {
  const { s, f, here } = captain(21), [say] = quiet(), d = runPorts(s, here).find((q) => runQuote(s, here.port, q.port, q.dist).profit > 0);
  const r = sendRun(s, f.id, here, d, say); const s2 = deserialize(serialize(s)); const f2 = s2.fleet.find((q) => q.id === f.id);
  assert.deepEqual(f2.run, r); s2.t = r.due; const g = s2.gold; stepRoutes(s2, say); assert.ok(!f2.run); assert.ok(s2.gold >= g + r.stake || !s2.fleet.includes(f2));
});
