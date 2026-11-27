// Crew and recruitment (PLAN step 6). You start alone. Hire sailors, gunners, a carpenter and a navigator in taverns; they fill the ship's roles, cost wages every PAY_EVERY seconds,
// have morale, fight beside you on a boarded deck, and can be lost (killed, or they desert when unpaid). Pure functions on the game state.
import { rngFor, pick } from '../gen/rng.js';
import { captainName } from '../gen/names.js';
import { shunned, worldRep } from './rep.js';

export const ROLES = {
  sailor: { name: 'Sailor', wage: 4, blurb: '+3% speed, a little faster rowing' },
  gunner: { name: 'Gunner', wage: 7, blurb: 'Cannon reload 8% faster each (up to 3 count)' },
  carpenter: { name: 'Carpenter', wage: 6, blurb: 'Mends the hull while you are not under fire' },
  navigator: { name: 'Navigator', wage: 9, blurb: 'Keeps the sails trimmed: you never lose more than 15% of the wind to a bad trim' },
};
export const ROLE_ORDER = Object.keys(ROLES);
export const CAPACITY = { sailboat: 1, cutter: 3, brigantine: 6, galleon: 10 };
export const PAY_EVERY = 120, DAY = 600, ALLY_MAX = 3, FLEET_UPKEEP = 10;
export const crewOf = (s) => (s.crew = Array.isArray(s.crew) ? s.crew : []);
export const capacity = (s) => (s.ship ? CAPACITY[s.shipClass || 'sailboat'] : 0);
export const aboard = (s) => crewOf(s).filter((c) => !c.captain); // hands on your own ship (captains sail their own prizes)
export const count = (s, role) => crewOf(s).filter((c) => c.role === role && !c.captain).length;
export const wages = (s) => crewOf(s).reduce((n, c) => n + c.wage, 0);
export const sailorMul = (s) => 1 + 0.03 * Math.min(5, count(s, 'sailor'));
export const reloadMul = (s) => 1 - 0.08 * Math.min(3, count(s, 'gunner'));
export const repairRate = (s) => 0.4 * Math.min(2, count(s, 'carpenter'));
export const trimFloor = (s) => (count(s, 'navigator') ? 0.85 : 0);
// the people looking for a berth in this tavern today (stable within a day; a bad name makes cheaper, less loyal hands)
export function candidates(s, isl) {
  const day = Math.floor(s.t / DAY), r = rngFor(isl.seed, 9100 + day), bad = worldRep(s) <= -25, out = [];
  for (let i = 0; i < 3; i++) { const role = pick(r, ROLE_ORDER), wage = Math.max(2, Math.round(ROLES[role].wage * (0.8 + r() * 0.5) * (bad ? 0.7 : 1))); out.push({ id: `c${isl.id}:${day}:${i}`, name: captainName(r), role, wage, fee: wage * 6, morale: bad ? 45 : 70, seed: (r() * 4294967296) >>> 0 }); }
  return out.filter((c) => !crewOf(s).some((m) => m.id === c.id));
}
export function hire(s, isl, c) {
  if (!s.ship || aboard(s).length >= capacity(s) || s.gold < c.fee || shunned(s, isl.id) || crewOf(s).some((m) => m.id === c.id)) return false;
  s.gold -= c.fee; crewOf(s).push({ id: c.id, name: c.name, role: c.role, wage: c.wage, morale: c.morale, seed: c.seed }); return true;
}
export function dismiss(s, id) { if (crewOf(s).find((c) => c.id === id)?.captain) return false; const i = crewOf(s).findIndex((c) => c.id === id); if (i < 0) return false; s.crew.splice(i, 1); return true; }
// pay day, desertion, carpenter's repairs. say(s, msg) reports to the log.
export function stepCrew(s, dt, say) {
  const crew = crewOf(s); if (!crew.length) return; s.payT = (s.payT || 0) + dt;
  if (s.ship && s.hull > 0 && s.hull < s.maxHull && s.t - (s.hitT ?? -99) > 8) s.hull = Math.min(s.maxHull, s.hull + repairRate(s) * dt);
  if (s.payT < PAY_EVERY) return; s.payT = 0; const kept = (s.fleet || []).filter((f) => !f.merc).length, due = wages(s) + kept * FLEET_UPKEEP;
  if (s.gold >= due) { s.gold -= due; for (const c of crew) c.morale = Math.min(100, c.morale + 6); say(s, `Pay day: ${due} gold in wages${kept ? ' and upkeep' : ''} to ${crew.length} hand${crew.length > 1 ? 's' : ''}.`); return; }
  s.gold = Math.max(0, s.gold - Math.floor(s.gold / 2)); const gone = [];
  for (const c of crew) { c.morale -= 30; if (c.morale <= 0) gone.push(c); }
  say(s, `You cannot pay the crew (${due} gold). They grumble.`);
  for (const c of gone) { if (c.captain) { const i = (s.fleet || []).findIndex((f) => f.id === c.captain); if (i >= 0) { s.fleet.splice(i, 1); say(s, `${c.name} sails off with the prize ship you could not pay for.`); } delete c.captain; } dismiss(s, c.id); const loot = Math.min(s.gold, c.wage * 3); s.gold -= loot; say(s, `${c.name}, your ${c.role}, deserts in the night${loot ? `, with ${loot} gold of the purse` : ''}.`); }
}
// a hand lost in a fight
export function lose(s, id, say) { const c = crewOf(s).find((m) => m.id === id); if (c && dismiss(s, id)) say(s, `${c.name}, your ${c.role}, is dead.`); }
// good fights lift morale; called after a win
export function cheer(s, d = 8) { for (const c of crewOf(s)) c.morale = Math.min(100, c.morale + d); }
