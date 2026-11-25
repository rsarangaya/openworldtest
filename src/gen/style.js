// Town characters. Each port gets one, fixed by the world seed: its own building colours, landmarks and a small reason to visit.
// 'plain' towns keep the original look. Port Haven stays plain (the story starts there); Frostwatch is a fortress.
export const STYLES = {
  plain: { label: '', perk: '' },
  fishing: { label: 'fishing village', perk: 'Provisions are cheap here.' },
  trade: { label: 'trade port', perk: 'Merchants here deal at better prices.' },
  fortress: { label: 'fortress town', perk: 'Good steel for less, and plenty of guards.' },
};
export function styleOf(tier, u) { // u: a number 0..1 from the world seed
  if (tier === 'village') return u < 0.7 ? 'fishing' : 'plain';
  if (tier === 'town') return u < 0.3 ? 'fishing' : u < 0.6 ? 'trade' : u < 0.9 ? 'fortress' : 'plain';
  return u < 0.45 ? 'trade' : u < 0.9 ? 'fortress' : 'plain';
}
export const foodCost = (port) => (port?.style === 'fishing' ? 3 : 5);
export const weaponMul = (port) => (port?.style === 'fortress' ? 0.85 : 1);
export const extraGuards = (style) => (style === 'fortress' ? 2 : style === 'fishing' ? -1 : 0);
// the landmarks of each kind of town: [kind, width, depth]
export const LANDMARKS = { fishing: [['rack', 5, 1.8], ['rack', 5, 1.8], ['boat', 5.5, 2.6], ['boat', 5.5, 2.6]], trade: [['hall', 9, 6.5], ['crane', 3.6, 3.6]], fortress: [['tower', 5.5, 5.5], ['wall', 8, 1.6], ['wall', 8, 1.6]] };
// what blocks walking, as rectangles [x0, x1, z0, z1]: a market hall is open between its pillars
export function markSolids(m) {
  const R = (cx, cz, w, d) => [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2];
  if (m.k !== 'hall') return [R(m.x, m.z, m.w, m.d)];
  const out = [R(m.x, m.z - m.d * 0.22, m.w * 0.55, 0.9)]; for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(R(m.x + sx * (m.w / 2 - 0.3), m.z + sz * (m.d / 2 - 0.3), 0.55, 0.55));
  return out;
}
