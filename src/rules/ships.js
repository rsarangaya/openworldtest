// Ships the player can own. The shipyard sells them in order; buying a bigger one trades the old one in.
export const SHIP_ORDER = ['sailboat', 'cutter', 'brigantine', 'galleon'];
export const SHIPS = {
  sailboat: { name: 'Sailboat', price: 300, hull: 100, hold: 20, speed: 1, turn: 1, row: 1, dmg: 12, cd: 1, ports: 2, L: 6.2, B: 2.2, masts: 1, blurb: 'A small, handy dinghy-sized boat with one triangular sail. Cheap, and she points well into the wind.' },
  cutter: { name: 'Cutter', price: 900, hull: 140, hold: 28, speed: 1.2, turn: 1.15, row: 0.9, dmg: 13, cd: 0.9, ports: 3, L: 10.5, B: 2.6, masts: 1, blurb: 'One tall mast and a long bowsprit. The fastest hull afloat.' },
  brigantine: { name: 'Brigantine', price: 2400, hull: 240, hold: 50, speed: 1.05, turn: 0.9, row: 0.75, dmg: 17, cd: 0.9, ports: 5, L: 12.5, B: 3.5, masts: 2, blurb: 'Two masts, a deep hold and real guns. Tough and still quick.' },
  galleon: { name: 'Galleon', price: 5500, hull: 400, hold: 90, speed: 0.9, turn: 0.7, row: 0.5, dmg: 24, cd: 0.85, ports: 7, L: 15, B: 4.5, masts: 3, blurb: 'Three masts and a towering stern. Slow to turn, hard to sink.' },
};
export const shipOf = (s) => SHIPS[s.shipClass] || SHIPS.sailboat;
export const TRADE_IN = 0.6;
