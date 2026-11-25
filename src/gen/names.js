// Place, ship and character names, built from a seeded stream. Plain seafarer vocabulary: an ordinary world.
import { pick } from './rng.js';

const ADJ = ['Quiet', 'Grey', 'Amber', 'Windswept', 'Lonely', 'Misty', 'Golden', 'Broken', 'Silent', 'Salt', 'Hollow', 'Pale', 'Crimson', 'Bright', 'Old'];
const NOUN = ['Heron', 'Anchor', 'Gull', 'Lantern', 'Otter', 'Compass', 'Pelican', 'Beacon', 'Seal', 'Kestrel', 'Willow', 'Cormorant'];
const POSS = ["Miller's", "Fisher's", "Old Tom's", "Harper's", "Nell's", "Sailor's", "Keeper's", "Weaver's"];
const PLACE = ['Cay', 'Reef', 'Bay', 'Rock', 'Harbor', 'Isle', 'Point', 'Sands', 'Cove'];
const TOWN = ['Port', 'Fort', 'Haven', 'Landing', 'Town'];
const FIRST = ['Alex', 'Jordan', 'Sam', 'Maria', 'Tom', 'Priya', 'Luca', 'Nora', 'Ben', 'Hana', 'Omar', 'Elena'];
const LAST = ['Walker', 'Reyes', 'Hughes', 'Okafor', 'Novak', 'Ferris', 'Lindqvist', 'Park', 'Moreau', 'Dalton', 'Singh', 'Brandt'];

// Asgard's own vocabulary: Norse-sounding places, longship names, patronymics
const N_PRE = ['Raven', 'Storm', 'Frost', 'Iron', 'Wolf', 'Thor', 'Bear', 'Eagle', 'Grim', 'Skal', 'Hel', 'Njord', 'Frey', 'Sig', 'Ulf', 'Rune', 'Bran', 'Asa'];
const N_SUF = ['vik', 'holm', 'fjord', 'ness', 'heim', 'garth', 'strand', 'by', 'stead', 'dal'];
const N_FIRST = ['Bjorn', 'Eirik', 'Ragnar', 'Sigrid', 'Freya', 'Astrid', 'Ulf', 'Gunnar', 'Ingrid', 'Leif', 'Thora', 'Hakon', 'Ragna', 'Olaf', 'Svea', 'Harald', 'Gudrun', 'Torvald'];
const N_PAT = ['Eriks', 'Olafs', 'Hrolfs', 'Svens', 'Thors', 'Gunnars', 'Ivars', 'Halvards'];
const N_SHIP = ['Sea Wolf', 'Raven-Wing', 'Iron Serpent', 'Storm-Rider', 'Fjord Dragon', "Odin's Eye", 'Thunderprow', 'Frostbite', 'Whale-Road', 'Long Serpent', 'Wave-Steed', 'Bloodsail'];
const norse = (r) => { const p = pick(r, N_PRE), s = pick(r, N_SUF); return p + s; };
export const islandName = (r, th) => {
  if (th === 'asgard') return norse(r);
  const k = r();
  if (k < 0.4) return `${pick(r, ADJ)} ${pick(r, NOUN)} ${pick(r, PLACE)}`;
  if (k < 0.8) return `${pick(r, POSS)} ${pick(r, PLACE)}`;
  return `${pick(r, NOUN)} ${pick(r, PLACE)}`;
};
export const portName = (r, th) => (th === 'asgard' ? norse(r) : r() < 0.5 ? `${pick(r, TOWN)} ${pick(r, ADJ)}` : `${pick(r, ADJ)} ${pick(r, TOWN)}`);
export const shipName = (r, th) => (th === 'asgard' ? pick(r, N_SHIP) : `The ${pick(r, ADJ)} ${pick(r, NOUN)}`);
export const captainName = (r, th) => (th === 'asgard' ? `${pick(r, N_FIRST)} ${pick(r, N_PAT)}${r() < 0.5 ? 'son' : 'dottir'}` : `${pick(r, FIRST)} ${pick(r, LAST)}`);
