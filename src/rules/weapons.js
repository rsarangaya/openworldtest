// Weapons carried on foot. You start with NOTHING but your fists: every weapon is bought at an armoury (the smith). Keys 1-5 equip what you own.
// reach = how far it hits, cone = how straight ahead the target must be (1 = dead ahead), cd = seconds between swings. The pistol is a ranged shot.
export const WEAPONS = {
  fists:  { n: 0, name: 'Fists',  dmg: 2,  reach: 1.9, cone: 0.5,  cd: 0.5,  price: 0,   blurb: 'Bare hands.' },
  sword:  { n: 1, name: 'Sword',  dmg: 10, reach: 3.3, cone: 0.5,  cd: 0.55, price: 50,  blurb: 'Balanced and reliable.' },
  dagger: { n: 2, name: 'Dagger', dmg: 6,  reach: 2.4, cone: 0.45, cd: 0.28, price: 60,  blurb: 'Short but very fast.' },
  spear:  { n: 3, name: 'Spear',  dmg: 12, reach: 5.0, cone: 0.8,  cd: 0.7,  price: 120, blurb: 'Long reach, narrow thrust.' },
  axe:    { n: 4, name: 'Axe',    dmg: 20, reach: 3.0, cone: 0.4,  cd: 0.9,  price: 150, blurb: 'Slow and heavy; wide swing.' },
  pistol: { n: 5, name: 'Pistol', dmg: 18, reach: 26,  cone: 0.97, cd: 1.8,  price: 260, blurb: 'One loud shot at range, then a long reload.', ranged: true },
};
export const WEAPON_ORDER = ['sword', 'dagger', 'spear', 'axe', 'pistol']; // what the armoury sells, and what keys 1-5 pick
export const weaponOf = (s) => WEAPONS[s.weapon] || WEAPONS.fists;
export const owns = (s, id) => id === 'fists' || !!s.weapons?.[id];
export function equip(s, id) { if (!WEAPONS[id] || !owns(s, id)) return false; s.weapon = id; return true; }
export function buyWeapon(s, id, mult = 1) {
  const w = WEAPONS[id]; if (!w || id === 'fists' || owns(s, id)) return false; const price = Math.round(w.price * mult); if (s.gold < price) return false;
  s.gold -= price; (s.weapons ||= {})[id] = true; s.weapon = id; return true;
}
