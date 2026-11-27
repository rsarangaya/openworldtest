// Fleet trade routes (PLAN item 9). At a shipyard, send one of your own fleet ships (not a hired one) on a trade run to a port you have visited in this world, and back.
// You stake her outbound cargo at this port's price; she comes home with the stake and the profit of the best good each way (her captain, hands and port dues take 70%), unless raiders catch her.
// Farther ports take longer and risk more (the pay depends on the goods); Iron Tide members sail the lanes with half the risk. While away she is out of your fleet's way (no fighting, no drawing) but still costs upkeep on pay day.
// Pure functions on the game state; stepRoutes runs once a second and returns the ships that came home, so the caller can anchor them beside you.
import { GOODS, portPrice } from '../gen/world.js';
import { rngFor } from '../gen/rng.js';
import { fleetOf, removeShip } from './fleet.js';
import { mercOf } from './mercs.js';

export const LOAD = 15, SHARE = 0.3, RUN_SPEED = 10, RUN_MIN = 180, RISK_MIN = 0.08, RISK_MAX = 0.35;
// the best good to carry from port a to port b: { g, m } (m = margin per load; g null when nothing pays)
export const bestGood = (a, b, seed) => GOODS.reduce((best, g) => { const m = portPrice(b, g, seed) - portPrice(a, g, seed); return m > best.m ? { g, m } : best; }, { g: null, m: 0 });
// what a run from port `from` to port `to` (dist apart) would cost, pay and risk
export function runQuote(s, from, to, dist) {
  const out = bestGood(from, to, s.seed), back = bestGood(to, from, s.seed), tide = mercOf(s)?.co === 'tide';
  const risk = Math.min(RISK_MAX, RISK_MIN + dist / 25000) * (tide ? 0.5 : 1);
  return { time: Math.round(Math.max(RUN_MIN, (2 * dist) / RUN_SPEED)), stake: out.g ? portPrice(from, out.g, s.seed) * LOAD : 0, profit: Math.round((out.m + back.m) * LOAD * SHARE), risk, out: out.g, back: back.g };
}
export const away = (s) => fleetOf(s).filter((f) => f.run);
export const canRun = (f) => !!f && !f.merc && !f.run;
// send fleet ship `id` from the island you stand on (isl) to destination d = { id, name, port, dist }
export function sendRun(s, id, isl, d, say) {
  const f = fleetOf(s).find((q) => q.id === id); if (!canRun(f) || !isl?.port || !d?.port) return null;
  const q = runQuote(s, isl.port, d.port, d.dist); if (q.profit <= 0) { say(s, `Nothing pays between here and ${d.name}.`); return null; }
  if (s.gold < q.stake) { say(s, `Her cargo costs ${q.stake} gold.`); return null; }
  s.gold -= q.stake; f.run = { n: (s.runN = (s.runN || 0) + 1), from: isl.port.name, to: d.name, due: s.t + q.time, stake: q.stake, profit: q.profit, risk: q.risk };
  say(s, `${f.name} sails for ${d.name}${q.out ? ' with ' + q.out : ''} and will be back in ${Math.round(q.time / 60) || 1} min.`); return f.run;
}
// once a second: ships whose run is over come home (or do not); returns the ships back in the fleet
export function stepRoutes(s, say) {
  const back = []; for (const f of [...fleetOf(s)]) {
    const r = f.run; if (!r || s.t < r.due) continue; delete f.run; const roll = rngFor(s.seed, 9900 + r.n, f.seed);
    if (roll() >= r.risk) { s.gold += r.stake + r.profit; s.score += r.profit; say(s, `${f.name} is back from ${r.to}: ${r.stake + r.profit} gold (${r.profit} profit).`); s.events?.push({ type: 'coin' }); back.push(f); }
    else if (roll() < 0.5) { f.hp = Math.max(8, Math.round(f.hp * 0.5)); s.gold += r.stake; say(s, `Raiders caught ${f.name} on the way back from ${r.to}. She fought them off and limps home with your stake, but no profit.`); back.push(f); }
    else { removeShip(s, f.id); say(s, `Raiders took ${f.name} on the run to ${r.to}, cargo and all. Her captain rowed home.`); }
  }
  return back;
}
