// Place, ship and character names, built from a seeded stream. Plain seafarer vocabulary: an ordinary world.
import { pick } from './rng.js';

const ADJ = ['Quiet', 'Grey', 'Amber', 'Windswept', 'Lonely', 'Misty', 'Golden', 'Broken', 'Silent', 'Salt', 'Hollow', 'Pale', 'Crimson', 'Bright', 'Old'];
const NOUN = ['Heron', 'Anchor', 'Gull', 'Lantern', 'Otter', 'Compass', 'Pelican', 'Beacon', 'Seal', 'Kestrel', 'Willow', 'Cormorant'];
const POSS = ["Miller's", "Fisher's", "Old Tom's", "Harper's", "Nell's", "Sailor's", "Keeper's", "Weaver's"];
const PLACE = ['Cay', 'Reef', 'Bay', 'Rock', 'Harbor', 'Isle', 'Point', 'Sands', 'Cove'];
const TOWN = ['Port', 'Fort', 'Haven', 'Landing', 'Town'];
const FIRST = ['Alex', 'Jordan', 'Sam', 'Maria', 'Tom', 'Priya', 'Luca', 'Nora', 'Ben', 'Hana', 'Omar', 'Elena'];
const LAST = ['Walker', 'Reyes', 'Hughes', 'Okafor', 'Novak', 'Ferris', 'Lindqvist', 'Park', 'Moreau', 'Dalton', 'Singh', 'Brandt'];

export const islandName = (r) => {
  const k = r();
  if (k < 0.4) return `${pick(r, ADJ)} ${pick(r, NOUN)} ${pick(r, PLACE)}`;
  if (k < 0.8) return `${pick(r, POSS)} ${pick(r, PLACE)}`;
  return `${pick(r, NOUN)} ${pick(r, PLACE)}`;
};
export const portName = (r) => (r() < 0.5 ? `${pick(r, TOWN)} ${pick(r, ADJ)}` : `${pick(r, ADJ)} ${pick(r, TOWN)}`);
export const shipName = (r) => `The ${pick(r, ADJ)} ${pick(r, NOUN)}`;
export const captainName = (r) => `${pick(r, FIRST)} ${pick(r, LAST)}`;
