// Town events: at most one per port per notice issue, a pure function of (island seed, issue), so nothing is saved.
// food: provision price, buy: goods price multiplier, folk: extra people in the plaza, smoke: a building smoulders, hook: a side-quest template.
import { rngFor, pick } from '../gen/rng.js';
import { issueOf } from './news.js';
import { isNight, nowHour } from './daynight.js';

export const EVENTS = {
  festival: { name: 'Lantern Festival', line: 'Lanterns, music and free fish. Provisions are going cheap while it lasts.', food: 2, folk: 6 },
  market: { name: 'Great Market Day', line: 'Traders from three seas have set up in the square. Goods are cheap today.', buy: 0.8, folk: 5 },
  brawl: { name: 'Tavern Brawl', line: 'The tavern has spilled into the street and nobody is stopping it.', folk: 3, hook: 'brawl' },
  duel: { name: 'A Duellist in Town', line: 'A swaggering duellist is calling out anyone with a blade. There is a purse on it.', folk: 3, hook: 'duel' },
  fire: { name: 'House Fire', line: 'Smoke over the roofs. A house is burning and the council needs timber and hands.', smoke: true, hook: 'timber' },
  plague: { name: 'Fever in the Streets', line: 'A fever is going round. Food is dear and the healer needs herbs from a wild island.', food: 9, hook: 'herbs' },
  blockade: { name: 'Blockade', line: 'A gang off the coast is choking the harbour. Everything costs more until they are gone.', buy: 1.25, food: 8, hook: 'blockade' },
  child: { name: 'A Child Missing', line: 'Lanterns along the shore, and one name being called over and over.', folk: 4, hook: 'child' },
  smugglers: { name: 'Smugglers Sighted', line: 'The council is offering a reward for a ship that pays no harbour dues.', hook: 'smugglers' },
  wedding: { name: 'A Wedding Day', line: 'Garlands on every door, a feast laid out, and no groom.', food: 2, folk: 6, hook: 'wedding' },
  trial: { name: 'Public Trial', line: 'The square is packed. A neighbour stands accused and the magistrate wants witnesses.', folk: 6, hook: 'trial' },
  pressgang: { name: 'Press Gang', line: 'Navy men are dragging likely lads out of doorways to fill a crew.', folk: 2, hook: 'pressgang' },
  gale: { name: 'Storm Damage', line: 'Last night\'s gale took roofs and boats. Food is dear and good timber is wanted.', food: 7, hook: 'timber' },
  song: { name: 'A Singer without a Song', line: 'A tavern singer sits dry-eyed over an empty case, asking for a strong arm.', hook: 'singer' },
  swords: { name: 'A Stranger with a Sword', line: 'A disgraced swordswoman has been drinking alone and asking after one man.', hook: 'swordswoman' },
  charts: { name: 'A Stranger with Charts', line: 'An old cartographer is looking for someone with young legs and a sharp blade.', hook: 'cartographer' },
  deserter: { name: 'A Deserter in Hiding', line: 'Marines are searching the lanes for a runaway sailor. One cellar door in town has stayed bolted all week.', hook: 'deserter' },
  shield: { name: 'A Shield without a Wall', line: 'A shieldmaiden sits by the mead-hall fire with an empty arm. Raiders burned her jarl\'s hall, and her shield was taken for a debt.', hook: 'shieldmaiden', world: 'asgard' }, // Asgard only
  cutpurses: { name: 'Cutpurses Abroad', line: 'A ring of cutpurses works the lanes after dark. Keep a hand on your purse: the watch pays 30 gold for each one brought down.', night: true, thief: true }, // night only
};
const keysOf = (w) => Object.keys(EVENTS).filter((k) => !EVENTS[k].night && (!EVENTS[k].world || EVENTS[k].world === w)), KEYS = {};

export function eventFor(s, isl) {
  if (!isl?.port) return null;
  if (isNight(nowHour(s)) && rngFor(isl.seed, 9900 + issueOf(s))() < 0.3) return { key: 'cutpurses', ...EVENTS.cutpurses }; // some nights belong to the cutpurses
  const r = rngFor(isl.seed, 9700 + issueOf(s));
  if (r() < 0.45) return null;
  const w = s.realm || 'terra', key = pick(r, (KEYS[w] ||= keysOf(w))); return { key, ...EVENTS[key] };
}
