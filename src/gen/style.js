// Town characters. Each port gets one, fixed by the world seed: its own building colours, landmarks and a small reason to visit.
// 'plain' towns keep the original look. Port Haven stays plain (the story starts there); Frostwatch is a fortress.
export const STYLES = {
  plain: { label: '', perk: '' },
  fishing: { label: 'fishing village', perk: 'Provisions are cheap here.' },
  trade: { label: 'trade port', perk: 'Merchants here deal at better prices.' },
  fortress: { label: 'fortress town', perk: 'Good steel for less, and plenty of guards.' },
  mining: { label: 'mining town', perk: 'Iron from the hill: cannon sell cheap and hull repairs cost half, but food is dear.' },
  smuggler: { label: "smugglers' cove", perk: 'No questions asked: rum is cheap, guards are few, and the fence clears a bounty for half its gold.' },
  temple: { label: 'temple town', perk: 'Pilgrims come for the temple: spice for the incense is cheap, and an offering on its steps heals your wounds and mends your name here.' },
};
// a temple town in Asgard keeps a Norse hof instead: the same perk, told in its own words
export const isHof = (isl) => isl?.style === 'temple' && isl.theme === 'asgard';
export const styleText = (isl) => (isHof(isl) ? { label: 'hof town', perk: 'Folk come from all the fjords for the hof: spice for the sacred fire is cheap, and an offering at its altar stone heals your wounds and mends your name here.' } : STYLES[isl?.style]);
// u, u2: numbers 0..1 from the world seed. u2 turns four in five plain villages and towns into mining towns and the rest into smugglers' coves,
// one in four fishing villages into a cove, and one in five fishing towns into a temple town; plain cities all become temple towns.
// Trade and fortress towns of an older world keep their kind.
export function styleOf(tier, u, u2 = 1) {
  const st = tier === 'village' ? (u < 0.7 ? 'fishing' : 'plain') : tier === 'town' ? (u < 0.3 ? 'fishing' : u < 0.6 ? 'trade' : u < 0.9 ? 'fortress' : 'plain') : u < 0.45 ? 'trade' : u < 0.9 ? 'fortress' : 'plain';
  if (st === 'plain' && tier !== 'city' && u2 < 1) return u2 < 0.8 ? 'mining' : 'smuggler';
  if (u2 < 1 && ((st === 'plain' && tier === 'city') || (st === 'fishing' && tier === 'town' && u2 >= 0.8))) return 'temple';
  return st === 'fishing' && tier === 'village' && u2 >= 0.75 && u2 < 1 ? 'smuggler' : st;
}
export const foodCost = (port) => (port?.style === 'fishing' ? 3 : port?.style === 'mining' ? 7 : 5);
export const repairCost = (port) => (port?.style === 'mining' ? 1 : 2); // gold per hull point
export const isMiner = (isl, seed) => isl?.style === 'mining' && seed % 3 !== 0; // two in three of a mining town's people dress as miners (looks only)
export const isSmuggler = (isl, seed) => isl?.style === 'smuggler' && seed % 2 === 0; // half a cove's people dress as smugglers (looks only)
export const isPriest = (isl, seed) => isl?.style === 'temple' && seed % 3 === 0; // one in three of a temple town's people are robed priests (looks only)
export const OFFERING = 20, OFFER_WAIT = 300; // gold for an offering at the temple; seconds before the same temple takes another
export const bountyMul = (port) => (port?.style === 'smuggler' ? 0.5 : 1); // gold paid per gold of bounty cleared
export const weaponMul = (port) => (port?.style === 'fortress' ? 0.85 : 1);
export const extraGuards = (style) => (style === 'fortress' ? 2 : style === 'fishing' || style === 'smuggler' ? -1 : 0);
// the landmarks of each kind of town: [kind, width, depth]
export const LANDMARKS = { fishing: [['rack', 5, 1.8], ['rack', 5, 1.8], ['boat', 5.5, 2.6], ['boat', 5.5, 2.6]], trade: [['hall', 9, 6.5], ['crane', 3.6, 3.6]], fortress: [['tower', 5.5, 5.5]], mining: [['mine', 5.5, 4.5], ['cart', 4.2, 1.8]], smuggler: [['cave', 5.5, 4.5], ['stash', 3.6, 2.4]], temple: [['temple', 8, 7], ['shrine', 2.6, 2.6]] };
// what blocks walking, as rectangles [x0, x1, z0, z1]: a market hall is open between its pillars
export function markSolids(m) {
  const R = (cx, cz, w, d) => [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2];
  if (m.k !== 'hall') return [R(m.x, m.z, m.w, m.d)];
  const out = [R(m.x, m.z - m.d * 0.22, m.w * 0.55, 0.9)]; for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(R(m.x + sx * (m.w / 2 - 0.3), m.z + sz * (m.d / 2 - 0.3), 0.55, 0.55));
  return out;
}
