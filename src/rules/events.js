// Town events: at most one per port per notice issue, a pure function of (island seed, issue), so nothing is saved.
// food: provision price, buy: goods price multiplier, folk: extra people in the plaza, smoke: a building smoulders, hook: a side-quest template.
import { rngFor, pick } from '../gen/rng.js';
import { issueOf } from './news.js';

export const EVENTS = {
  festival: { name: 'Lantern Festival', line: 'Lanterns, music and free fish. Provisions are going cheap while it lasts.', food: 2, folk: 6 },
  market: { name: 'Great Market Day', line: 'Traders from three seas have set up in the square. Goods are cheap today.', buy: 0.8, folk: 5 },
  brawl: { name: 'Tavern Brawl', line: 'The tavern has spilled into the street and nobody is stopping it.', folk: 3, hook: 'brawl' },
  duel: { name: 'A Duellist in Town', line: 'A swaggering duellist is calling out anyone with a blade. There is a purse on it.', folk: 3, hook: 'duel' },
  fire: { name: 'House Fire', line: 'Smoke over the roofs. A house is burning and the council needs timber and hands.', smoke: true, hook: 'timber' },
  plague: { name: 'Fever in the Streets', line: 'A fever is going round. Food is dear and the healer needs herbs from a wild island.', food: 9, hook: 'herbs' },
  blockade: { name: 'Blockade', line: 'A gang off the coast is choking the harbour. Everything costs more until they are gone.', buy: 1.25, food: 8, hook: 'blockade' },
  swords: { name: 'A Stranger with a Sword', line: 'A disgraced swordswoman has been drinking alone and asking after one man.', hook: 'swordswoman' },
  charts: { name: 'A Stranger with Charts', line: 'An old cartographer is looking for someone with young legs and a sharp blade.', hook: 'cartographer' },
};
const KEYS = Object.keys(EVENTS);

export function eventFor(s, isl) {
  if (!isl?.port) return null;
  const r = rngFor(isl.seed, 9700 + issueOf(s));
  if (r() < 0.45) return null;
  const key = pick(r, KEYS); return { key, ...EVENTS[key] };
}
