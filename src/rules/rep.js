// Reputation, two layers. LOCAL: how one town sees you (s.rep.local[islandId]). WORLD: how the realm's sailors and navy see you (s.rep.world).
// Both run -100..100. Crimes lower them, deeds raise them. Pure functions on the game state; no drawing.
export const CLOSED_AT = -60;          // at or below this a town's shops refuse you
export const FORGIVE_PER_S = 1 / 20;   // a bad name slowly heals when you stay out of trouble (so no quest can stay locked)
const clamp = (v) => Math.max(-100, Math.min(100, v));
export const repOf = (s) => (s.rep ||= { world: 0, local: {} });
export const localRep = (s, id) => repOf(s).local[id] || 0;
export const worldRep = (s) => repOf(s).world;
export function addLocal(s, id, d) { const r = repOf(s); if (id !== undefined && id !== null) r.local[id] = clamp((r.local[id] || 0) + d); }
export function addWorld(s, d) { const r = repOf(s); r.world = clamp(r.world + d); }
// deeds and their weight: [local, world]
export const DEEDS = { hurt: [-2, -0.5], killVillager: [-25, -4], killShopkeeper: [-40, -8], killWarden: [-60, -15], trade: [0.4, 0.1], quest: [4, 5], sunkHostile: [0, 3], sunkPeaceful: [0, -12], helpedPort: [3, 1], lawKill: [2, 3], bombard: [-3, -1], piracy: [0, -10], boardHostile: [0, 2], handIn: [8, 6] };
export function deed(s, name, islandId, scale = 1) { const [l, w] = DEEDS[name]; if (l) addLocal(s, islandId, l * scale); if (w) addWorld(s, w * scale); }
// the heal over time; called once a second
export function forgive(s, dt) { const r = repOf(s); for (const k in r.local) { if (r.local[k] < 0) r.local[k] = Math.min(0, r.local[k] + dt * FORGIVE_PER_S); } if (r.world < 0 && (s.bounty || 0) === 0) r.world = Math.min(0, r.world + dt * FORGIVE_PER_S * 0.25); }
export const tier = (v) => (v >= 60 ? 'Honoured' : v >= 25 ? 'Trusted' : v > -25 ? 'Unknown' : v > CLOSED_AT ? 'Distrusted' : 'Hated');
export const shunned = (s, id) => localRep(s, id) <= CLOSED_AT;
// prices: good name = up to 8% better, bad name = up to 20% worse
export const buyMult = (s, id) => { const v = localRep(s, id); return v >= 0 ? 1 - 0.08 * Math.min(1, v / 100) : 1 + 0.2 * Math.min(1, -v / 100); };
export const sellMult = (s, id) => { const v = localRep(s, id); return v >= 0 ? 1 + 0.06 * Math.min(1, v / 100) : 1 - 0.15 * Math.min(1, -v / 100); };
