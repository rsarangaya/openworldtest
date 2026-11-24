// Ship parts and special shot (PLAN step 5). Parts are bought at the shipwright and fitted to the ship you already own (no need to buy a whole new one),
// and they stay when you trade up. Pure functions on the game state.
export const PARTS = {
  sails: { name: 'Sails', max: 3, price: [250, 500, 900], blurb: 'Better canvas: +8% speed a level.' },
  plating: { name: 'Hull plating', max: 3, price: [300, 600, 1000], blurb: 'Iron over the oak: +25 hull a level (fitted free of charge on top of repairs).' },
  hold: { name: 'Bigger hold', max: 3, price: [200, 400, 700], blurb: '+10 cargo space a level.' },
  guns: { name: 'Gun carriages', max: 3, price: [350, 700, 1200], blurb: 'Better carriages and powder: +15% cannon damage a level.' },
  oars: { name: 'Sweeps', max: 2, price: [150, 350], blurb: 'Longer oars: +25% rowing speed a level.' },
  swivel: { name: 'Swivel guns', max: 1, price: [450], blurb: 'Rail guns that fire on their own at hostile ships within 28 units.' },
};
export const PART_ORDER = Object.keys(PARTS);
export const AMMO = { round: { name: 'Round shot', dmg: 1, price: 0 }, chain: { name: 'Chain shot', dmg: 0.6, price: 8, blurb: 'Tears rigging: the target slows to 40% for 8 s.' }, fire: { name: 'Fire shot', dmg: 0.7, price: 12, blurb: 'Sets the target ablaze: 3 hull a second for 6 s.' } };
export const AMMO_ORDER = ['round', 'chain', 'fire'];
export const SWIVEL_RANGE = 28, SWIVEL_DMG = 3, SWIVEL_CD = 1.2;
export const level = (s, id) => (s.parts || {})[id] || 0;
export const speedMul = (s) => 1 + 0.08 * level(s, 'sails');
export const gunMul = (s) => 1 + 0.15 * level(s, 'guns');
export const rowMul = (s) => 1 + 0.25 * level(s, 'oars');
export const hullBonus = (s) => 25 * level(s, 'plating');
export const holdBonus = (s) => 10 * level(s, 'hold');
export const partPrice = (s, id) => PARTS[id].price[level(s, id)];
export const canFit = (s, id) => !!s.ship && !!PARTS[id] && level(s, id) < PARTS[id].max && s.gold >= partPrice(s, id);
// fit a part (the ship must be moored at this port: the caller checks the distance)
export function fitPart(s, id) {
  if (!canFit(s, id)) return false;
  s.gold -= partPrice(s, id); s.parts ||= {}; s.parts[id] = level(s, id) + 1;
  if (id === 'plating') { s.maxHull += 25; s.hull += 25; } if (id === 'hold') s.hold += 10;
  return true;
}
export const ammoOf = (s) => (s.ammo ||= { chain: 0, fire: 0 });
export function buyAmmo(s, id, n = 10) {
  if (!AMMO[id] || id === 'round') return 0; n = Math.min(n, Math.floor(s.gold / AMMO[id].price), 99 - (ammoOf(s)[id] || 0)); if (n <= 0) return 0;
  s.gold -= n * AMMO[id].price; ammoOf(s)[id] += n; return n;
}
// choose the shot for the next broadsides (round shot is always available)
export function setShot(s, id) { if (!AMMO[id] || (id !== 'round' && !ammoOf(s)[id])) return false; s.shot = id; return true; }
// what the next broadside uses (falls back to round shot when the chosen kind has run out)
export const shotNow = (s) => { const id = s.shot || 'round'; return id === 'round' || ammoOf(s)[id] > 0 ? id : 'round'; };
