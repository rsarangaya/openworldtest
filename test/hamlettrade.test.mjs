// Lived-in islands, step 4: something to do in a hamlet. A scripted player rows ashore, walks up to whoever is there and talks (the talk now
// leads to "Trade and talk"), buys provisions until the hamlet has none to spare, buys the hamlet's own good where it has one, asks for news
// (a lighthouse keeper always has a sighting), takes the small job when there is one, and is paid for it at the nearest port's board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, hamletFor, signContract, settleBoard, nearbyIslands } from '../src/rules/game.js';
import { sectorIslands, islandTown, setSeedTheme } from '../src/gen/world.js';
import { buyHamletFood, buyHamletGood, hamletRumour, HAMLET_TRADE, goodPrice } from '../src/rules/hamlet.js';
import { active } from '../src/rules/contracts.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { ISSUE_LEN } from '../src/rules/news.js';

const islands = (seed, n = 7) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const WORLDS = [[1717, 'terra'], [5151, 'asgard'], [6161, 'atlantis'], [7171, 'olympus']];

function walkTo(S, goals) { // like a player: head for each goal in turn, sidestep when stuck
  let g = 0, last = { ...S.foot }, side = 0, dodge = 0;
  for (let i = 0; i < 60 * 60 && g < goals.length; i++) {
    const tg = goals[g]; if (Math.hypot(S.foot.x - tg.x, S.foot.z - tg.z) < (g === goals.length - 1 ? 2.2 : 3.8)) { g++; continue; }
    if (i % 30 === 29) { if (Math.hypot(S.foot.x - last.x, S.foot.z - last.z) < 0.3) { dodge = 40; side = side > 0 ? -1.4 : 1.4; } last = { ...S.foot }; }
    S.foot.yaw = Math.atan2(tg.z - S.foot.z, tg.x - S.foot.x) + (dodge-- > 0 ? side : 0); step(S, { mz: 1 }, 1 / 60); S.events.length = 0;
  }
  return g === goals.length;
}

test('played: trade and talk at one hamlet of each kind, take its job and be paid at the port', () => {
  const done = new Set(); let jobs = 0, paid = 0;
  for (const [seed, th] of WORLDS) {
    setSeedTheme(seed, th);
    for (const isl of islands(seed).filter((i) => i.hamlet && islandTown(i).npcs.length)) {
      const t = islandTown(isl), k = t.kind; if (done.has(k) && jobs >= 2) continue;
      const S = newGame(seed), L = isl.landing; S.realm = th; S.gold = 400; S.food = 10;
      S.mode = 'ship'; S.ship = { x: L.x + Math.cos(L.a) * 8, z: L.z + Math.sin(L.a) * 8, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; S.shipClass = 'sailboat'; S.hull = S.maxHull = 60; S.hold = 20;
      assert.equal(interact(S).type, 'ashore');
      const who = t.npcs[0]; if (!walkTo(S, [t.yard, who])) continue;
      const r = interact(S); if (r.type !== 'npc' || r.npc.id !== who.id) continue;
      assert.equal(r.panel, 'hamlet', `${isl.id}: hamlet folk open the hamlet page`);
      const T = HAMLET_TRADE[k], o = hamletFor(S, isl); assert.equal(o.food, T.food); assert.equal(o.good, T.good || null);
      // provisions until there are none to spare (or the purse or the larder is full)
      const g0 = S.gold, f0 = S.food; let n = 0, b; while ((b = buyHamletFood(S, isl, k, 5))) n += b;
      assert.equal(n, Math.min(T.food, 40 - f0)); assert.equal(S.food, f0 + n); assert.equal(S.gold, g0 - n * T.fp); assert.equal(hamletFor(S, isl).food, T.food - n);
      if (T.good) { const c = S.gold; let m = 0; while (buyHamletGood(S, isl, k, 1)) m++; assert.equal(m, T.n); assert.equal(S.cargo[T.good], T.n); assert.equal(S.gold, c - T.n * goodPrice(T.good)); assert.ok(goodPrice(T.good) < 0.7 * { sugar: 28, timber: 18, spice: 70 }[T.good]); }
      else assert.equal(buyHamletGood(S, isl, k, 1), 0);
      const news = [0, 1, 2].map(() => hamletRumour(S, isl, k)); assert.ok(news.every((l) => typeof l === 'string' && l.length > 20), news.join(' | '));
      if (k === 'light') assert.ok(news.every((l) => l.startsWith('From the gallery')), `keeper: ${news[0]}`);
      // the stock is kept in the save, and a new issue restocks it
      const L2 = deserialize(serialize(S)); assert.equal(hamletFor(L2, isl).food, T.food - n);
      L2.t += ISSUE_LEN; assert.equal(hamletFor(L2, isl).food, T.food);
      // the small job: an ordinary contract to the nearest port, paid at its board
      if (o.job) {
        const ports = nearbyIslands(S, isl.x, isl.z, 3).filter((i) => i.port), to = ports.find((p) => p.id === o.job.to.id);
        assert.ok(to && ports.every((p) => Math.hypot(p.x - isl.x, p.z - isl.z) >= Math.hypot(to.x - isl.x, to.z - isl.z) - 1e-6), 'the nearest port');
        assert.ok(signContract(S, o.job)); assert.equal(hamletFor(S, isl).job, null, 'taken once');
        assert.ok(active(S).some((c) => c.id === o.job.id && c.what === HAMLET_TRADE[k].job));
        const before = S.gold; settleBoard(S, isl); assert.equal(S.gold, before, 'not paid at the hamlet');
        settleBoard(S, to); assert.ok(S.gold > before, 'paid at the port'); paid++; jobs++;
      }
      done.add(k);
    }
  }
  setSeedTheme(1717, 'terra');
  assert.ok(done.size >= 6, `traded at ${[...done]}`); assert.ok(paid >= 2, `jobs paid: ${paid}`);
});
