// Lived-in islands, step 4: something to do in a hamlet (no shops, no board). Its folk sell a few provisions at a cottage price and a little of
// what the kind of hamlet works at, tell a rumour (the lighthouse keeper's is a sighting from the gallery), and now and then have a small job:
// carry something to the nearest port, paid at its notice board or tavern (an ordinary deliver contract, signed with signContract). Stock is per hamlet per notice issue,
// kept in s.hamlets[id] = { i: issue, f: provisions sold, g: goods sold, r: rumours heard }; only hamlets you have traded at are stored.
import { BASE_PRICE } from '../gen/world.js';
import { rngFor } from '../gen/rng.js';
import { issueOf } from './news.js';
import { MAX_FOOD, cargoCount } from './trade.js';
import { active, done as cdone } from './contracts.js';
import { wreckRumour } from './salvage.js';
import { serpentRumour } from './serpent.js';
import { draugrRumour } from './draugr.js';
import { krakenRumour } from './kraken.js';
import { cyclopsRumour } from './cyclops.js';
import { hydraRumour } from './hydra.js';
import { harpyRumour } from './harpies.js';

// per kind: provisions in stock and their price, the good they sell (a share of the base price), and what the job carries
export const HAMLET_TRADE = {
  farm: { food: 8, fp: 3, good: 'sugar', n: 3, job: 'a cart of greens' },
  fishing: { food: 12, fp: 2, job: 'a basket of salt fish' },
  shepherd: { food: 8, fp: 3, job: 'two bales of wool' },
  woods: { food: 4, fp: 4, good: 'timber', n: 4, job: 'a load of cut planks' },
  hermit: { food: 2, fp: 4, job: 'a letter the hermit has kept for years' },
  light: { food: 3, fp: 4, job: "the keeper's order for lamp oil" },
  ruin: { food: 0, fp: 4, good: 'spice', n: 2, job: 'a sack of old coins dug from the ruins' },
};
const GOOD_SHARE = 0.6; // a hamlet sells its own goods well under any port's price
const five = (v) => Math.round(v / 5) * 5;
const MONSTER = { terra: [serpentRumour], asgard: [draugrRumour], atlantis: [krakenRumour], olympus: [cyclopsRumour, hydraRumour, harpyRumour] };

export const goodPrice = (g) => Math.round(BASE_PRICE[g] * GOOD_SHARE);
// this hamlet's stock now (a fresh issue restocks it)
export function stockOf(s, isl) {
  const i = issueOf(s), h = (s.hamlets ||= {})[isl.id];
  return h && h.i === i ? h : { i, f: 0, g: 0, r: 0 };
}
const keep = (s, isl, h) => { s.hamlets[isl.id] = h; return h; };

// what is on offer: { kind, food: left, fp, good, n: left, gp, job: the contract offer or null }
export function hamletOffer(s, isl, kind, ports) {
  const T = HAMLET_TRADE[kind] || HAMLET_TRADE.farm, h = stockOf(s, isl);
  return { kind, food: Math.max(0, T.food - h.f), fp: T.fp, good: T.good || null, n: T.good ? Math.max(0, T.n - h.g) : 0, gp: T.good ? goodPrice(T.good) : 0, job: jobOf(s, isl, T, ports) };
}
// about one issue in two a hamlet has a small job: carry its load to the nearest port
function jobOf(s, isl, T, ports) {
  const i = issueOf(s), id = `h${isl.id}:${i}`, r = rngFor(isl.seed, 9700 + i);
  if (r() < 0.5 || cdone(s)[id] || active(s).some((c) => c.id === id)) return null;
  let to = null, d = 1e9; for (const p of ports) { const q = Math.hypot(p.x - isl.x, p.z - isl.z); if (q < d) { d = q; to = p; } }
  if (!to) return null; const name = to.port?.name || to.name;
  return { id, type: 'deliver', n: 1, good: 'parcel', what: T.job, from: isl.id, fromName: isl.name, at: { x: isl.x, z: isl.z }, pay: 0, to: { id: to.id, name, x: to.x, z: to.z }, window: Math.round(300 + d / 4), reward: five(35 + d * 0.05), text: `Carry ${T.job} to ${name} (${Math.round(d)} m).` };
}

export function buyHamletFood(s, isl, kind, n) {
  const T = HAMLET_TRADE[kind] || HAMLET_TRADE.farm, h = stockOf(s, isl);
  n = Math.min(n, T.food - h.f, MAX_FOOD - s.food, Math.floor(s.gold / T.fp)); if (n <= 0) return 0;
  s.gold -= n * T.fp; s.food += n; h.f += n; keep(s, isl, h); return n;
}
export function buyHamletGood(s, isl, kind, n) {
  const T = HAMLET_TRADE[kind]; if (!T?.good) return 0; const h = stockOf(s, isl), p = goodPrice(T.good);
  n = Math.min(n, T.n - h.g, s.hold - cargoCount(s), Math.floor(s.gold / p)); if (n <= 0) return 0;
  s.gold -= n * p; s.cargo[T.good] = (s.cargo[T.good] || 0) + n; h.g += n; keep(s, isl, h); return n;
}
// a rumour: the keeper always has a sighting (the world's monster, then a wreck); others take turns between the two and plain island talk
export function hamletRumour(s, isl, kind) {
  const h = keep(s, isl, stockOf(s, isl)), n = h.r++, x = isl.x, z = isl.z, mon = MONSTER[s.realm in MONSTER ? s.realm : 'terra'];
  const sights = [...mon.map((f) => () => f(s, x, z)), () => wreckRumour(s, x, z)], order = kind === 'light' || n % 3 !== 2 ? sights : []; // every third time, plain island talk
  for (let k = 0; k < order.length; k++) { const line = order[(k + n) % order.length](); if (line) return kind === 'light' ? 'From the gallery I see a long way. ' + line : line; }
  return ['Nothing new out here. The ships pass and the gulls stay.', 'Ask at the port. They hear everything there, and believe half of it.', 'A boat came by last month with news. I have forgotten it already.'][n % 3];
}
