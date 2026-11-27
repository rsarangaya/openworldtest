// Fleets (PLAN step 6, second part). A captured ship can be kept as a fleet ship if you have a spare hand to captain her. Fleet ships follow you, fight, cost upkeep on pay day,
// can be sunk (and the captain with them), can be sold at the shipwright, and obey one fleet-wide order. Pure data and helpers; the movement lives in rules/game.js (stepFleet).
import { KINDS } from '../gen/world.js';
import { crewOf, FLEET_UPKEEP } from './crew.js';

export const MAX_FLEET = 3, UPKEEP = FLEET_UPKEEP, ORDERS = ['follow', 'escort', 'attack', 'guard'];
export const ORDER_TEXT = { follow: 'Follow: stay close behind you and keep out of fights', escort: 'Escort: stay close, fire at hostile ships that come within 180', attack: 'Attack: hunt down any hostile ship within 400', guard: 'Guard: hold this spot and fight whatever comes near' };
export const fleetOf = (s) => (s.fleet = Array.isArray(s.fleet) ? s.fleet : []);
export const orderOf = (s) => s.fleetOrder || 'follow';
export const fleetUpkeep = (s) => fleetOf(s).filter((f) => !f.merc).length * UPKEEP; // hired ships are paid up front
// a hand who is not already captaining a ship
export const spareHand = (s) => crewOf(s).find((c) => !c.captain) || null;
export const canKeep = (s) => fleetOf(s).length < MAX_FLEET && !!spareHand(s);
export const sellValue = (f) => { const k = KINDS[f.kind]; return Math.round(((k.gold[0] + k.gold[1]) / 2) * 1.6 * (0.4 + 0.6 * (f.hp / f.maxHp))); };
// take a boarded enemy ship into the fleet under a spare hand
export function addPrize(s, e) {
  const c = spareHand(s); if (!c || fleetOf(s).length >= MAX_FLEET) return null; const maxHp = e.maxHp || KINDS[e.kind].hp;
  const f = { id: 'f' + (s.fleetN = (s.fleetN || 0) + 1), kind: e.kind, seed: e.seed, name: e.name, x: e.x, z: e.z, yaw: e.yaw, speed: 0, hp: Math.max(8, maxHp * 0.6), maxHp, captain: c.id, cd: 2, ax: e.x, az: e.z };
  c.captain = f.id; fleetOf(s).push(f); return f;
}
export function removeShip(s, id) { const i = fleetOf(s).findIndex((f) => f.id === id); if (i < 0) return null; const [f] = s.fleet.splice(i, 1); const c = crewOf(s).find((m) => m.captain === id); if (c) delete c.captain; return f; }
// sell a fleet ship at the shipwright: gold for her, her captain comes back aboard
export function sellShip(s, id) { const f = fleetOf(s).find((q) => q.id === id); if (!f) return 0; const g = sellValue(f); removeShip(s, id); s.gold += g; return g; }
export function cycleOrder(s, say) {
  if (!fleetOf(s).length) { say(s, 'You have no fleet to give orders to.'); return null; }
  const o = ORDERS[(ORDERS.indexOf(orderOf(s)) + 1) % ORDERS.length]; s.fleetOrder = o; for (const f of s.fleet) { f.ax = f.x; f.az = f.z; } say(s, 'Fleet order: ' + ORDER_TEXT[o] + '.'); return o;
}
