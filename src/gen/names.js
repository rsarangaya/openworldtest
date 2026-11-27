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
// Atlantis: soft sea-Greek sounding places, ships named for the sea, a name and a house
const A_PRE = ['Thal', 'Cor', 'Ner', 'Pel', 'Kal', 'Del', 'Ori', 'Hal', 'Lyr', 'Mar', 'Tri', 'Cyr', 'Aeg', 'Glau', 'Ama', 'Ion'];
const A_SUF = ['assa', 'ion', 'ene', 'aia', 'ithe', 'ara', 'ope', 'anthe', 'eia', 'os', 'ys', 'ora'];
const A_FIRST = ['Ione', 'Doros', 'Thalia', 'Kyros', 'Nerissa', 'Alkis', 'Melia', 'Theron', 'Kallisto', 'Iason', 'Phaidra', 'Lykos', 'Eudora', 'Orestes'];
const A_HOUSE = ['Pelagos', 'Thalassios', 'Kymatos', 'Nerides', 'Aktaios', 'Halion', 'Glaukos', 'Tritonis'];
const A_SHIP = ['Sea Pearl', 'Coral Crown', 'Trident', 'Tide Singer', 'Glass Dolphin', 'Orichalc', 'Moon Shell', 'Wave Daughter', 'Blue Lantern', 'Foam Rider', 'Deep Gleam', 'Salt Harp'];
const atl = (r) => pick(r, A_PRE) + pick(r, A_SUF);
// Olympus: old Greek-sounding islands and cities ("-opolis"), proud ships, a name and where they hail from
const O_PRE = ['Ker', 'Myr', 'Lak', 'Ath', 'Nax', 'Mel', 'Pyr', 'Xan', 'Dor', 'Akr', 'Hel', 'Kyth', 'Phal', 'Sel', 'Zak', 'Thas'];
const O_SUF = ['os', 'ene', 'ikos', 'ira', 'aia', 'ymna', 'esos', 'athos', 'ion', 'ope'];
const O_FIRST = ['Nikandros', 'Kleon', 'Agathe', 'Demetra', 'Xenia', 'Philon', 'Lysandra', 'Timon', 'Aristos', 'Thaleia', 'Stavros', 'Ianthe', 'Melanthios', 'Kore'];
const O_SHIP = ['Bronze Eagle', 'Laurel Crown', 'Swift Owl', 'Sun Chariot', 'Thunderbolt', 'Golden Ram', 'Wine-Dark', 'Marble Wave', 'Winged Sandal', 'Olive Branch', 'Spear of Dawn', 'Silver Lyre'];
const oly = (r) => pick(r, O_PRE) + pick(r, O_SUF);
export const islandName = (r, th) => {
  if (th === 'asgard') return norse(r);
  if (th === 'atlantis') return atl(r);
  if (th === 'olympus') return oly(r);
  const k = r();
  if (k < 0.4) return `${pick(r, ADJ)} ${pick(r, NOUN)} ${pick(r, PLACE)}`;
  if (k < 0.8) return `${pick(r, POSS)} ${pick(r, PLACE)}`;
  return `${pick(r, NOUN)} ${pick(r, PLACE)}`;
};
export const portName = (r, th) => (th === 'asgard' ? norse(r) : th === 'atlantis' ? `${atl(r)} Harbour` : th === 'olympus' ? `${pick(r, O_PRE)}opolis` : r() < 0.5 ? `${pick(r, TOWN)} ${pick(r, ADJ)}` : `${pick(r, ADJ)} ${pick(r, TOWN)}`);
export const shipName = (r, th) => (th === 'asgard' ? pick(r, N_SHIP) : th === 'atlantis' ? `The ${pick(r, A_SHIP)}` : th === 'olympus' ? `The ${pick(r, O_SHIP)}` : `The ${pick(r, ADJ)} ${pick(r, NOUN)}`);
export const captainName = (r, th) => (th === 'asgard' ? `${pick(r, N_FIRST)} ${pick(r, N_PAT)}${r() < 0.5 ? 'son' : 'dottir'}` : th === 'atlantis' ? `${pick(r, A_FIRST)} ${pick(r, A_HOUSE)}` : th === 'olympus' ? `${pick(r, O_FIRST)} of ${oly(r)}` : `${pick(r, FIRST)} ${pick(r, LAST)}`);
