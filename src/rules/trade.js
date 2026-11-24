// Shops and trading: pure functions on the game state (no drawing, no DOM).
import { GOODS, portPrice } from '../gen/world.js';

import { buyMult, sellMult, deed } from './rep.js';
import { SHIPS, SHIP_ORDER, TRADE_IN } from './ships.js';
import { hullBonus, holdBonus } from './parts.js';
export const SHIP_PRICE = 300, RAM_PRICE = 500, FOOD_PRICE = 5, MAX_FOOD = 40;
export const cargoCount = (s) => GOODS.reduce((n, g) => n + (s.cargo[g] || 0), 0);
export const buyPrice = (s, port, g) => Math.round(portPrice(port, g, s.seed) * buyMult(s, port.iid));
export const sellPrice = (s, port, g) => Math.floor(portPrice(port, g, s.seed) * 0.88 * sellMult(s, port.iid));

export function buy(s, port, g, n = 1) {
  n = Math.min(n, s.hold - cargoCount(s), Math.floor(s.gold / buyPrice(s, port, g)));
  if (n <= 0) return 0;
  s.gold -= n * buyPrice(s, port, g); s.cargo[g] = (s.cargo[g] || 0) + n; deed(s, 'trade', port.iid, n); return n;
}
export function sell(s, port, g, n = 1) {
  n = Math.min(n, s.cargo[g] || 0);
  if (n <= 0) return 0;
  s.gold += n * sellPrice(s, port, g); s.cargo[g] -= n; deed(s, 'trade', port.iid, n); return n;
}
export function buyFood(s, n = 1) {
  n = Math.min(n, MAX_FOOD - s.food, Math.floor(s.gold / FOOD_PRICE));
  if (n <= 0) return 0;
  s.gold -= n * FOOD_PRICE; s.food += n; return n;
}
export function repair(s) {
  if (!s.ship) return 0;
  const need = Math.ceil(s.maxHull - s.hull), pts = Math.min(need, Math.floor(s.gold / 2));
  s.gold -= pts * 2; s.hull = Math.min(s.maxHull, s.hull + pts); return pts;
}
// the shipwright: sells a ship moored at the dock of the island the player stands on. Buying a bigger one trades the old one in.
export function shipQuote(s, id) { const c = SHIPS[id], old = s.ship ? SHIPS[s.shipClass || 'sailboat'] : null; return old ? Math.round(c.price - old.price * TRADE_IN) : c.price; }
export function buyShip(s, isl, id = 'sailboat') {
  const c = SHIPS[id]; if (!c || !isl.port) return false;
  const old = s.ship ? SHIP_ORDER.indexOf(s.shipClass || 'sailboat') : -1;
  if (SHIP_ORDER.indexOf(id) <= old || s.gold < shipQuote(s, id)) return false;
  if (s.ship && Math.hypot(s.ship.x - isl.port.berth.x, s.ship.z - isl.port.berth.z) > 45) return false; // she must be here to be traded in
  const p = isl.port; s.gold -= shipQuote(s, id);
  s.ship = { x: p.berth.x, z: p.berth.z, yaw: p.berth.yaw, speed: 0, sail: 0.5, cd: [0, 0] };
  s.shipClass = id; s.maxHull = c.hull + hullBonus(s); s.hold = c.hold + holdBonus(s); s.hull = s.maxHull; return true;
}
export function buyRam(s) {
  if (s.upgrades.ram || s.gold < RAM_PRICE) return false;
  s.gold -= RAM_PRICE; s.upgrades.ram = true; return true;
}
