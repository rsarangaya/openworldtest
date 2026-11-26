// Which quest the HUD, the arrow and the kind wind follow: the story, a side story or a contract. The player picks in the quest log (s.tracked).
import { currentQuest, questText, nearestRaider } from './quests.js';
import { sideOf, sideTarget, titleOf, goalOf } from './sidequests.js';
import { active, describe, progress } from './contracts.js';

const contractTarget = (s, c) => (c.type === 'deliver' ? { x: c.to.x, z: c.to.z, label: c.to.name } : progress(s, c) < c.n ? nearestRaider(s) : c.at && { ...c.at, label: c.fromName });

// everything you could follow right now, the story first; goal() and target() are only worked out when asked
export function trackable(s) {
  const out = [], q = currentQuest(s), realm = s.realm || 'terra';
  if (q) out.push({ id: 'main', title: q.title, goal: () => questText(s, q), target: () => q.target?.(s) });
  for (const v of sideOf(s)) if (v.realm === realm) out.push({ id: v.id, title: titleOf(v), goal: () => goalOf(s, v), target: () => sideTarget(s, v.id) });
  for (const c of active(s)) out.push({ id: c.id, title: c.type === 'cull' ? 'Contract: raiders' : 'Contract: delivery', goal: () => describe(s, c), target: () => contractTarget(s, c) });
  return out;
}
export const trackedQuest = (s, list = trackable(s)) => list.find((v) => v.id === s.tracked) || list[0] || null;
