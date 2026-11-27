// The story: a chain of quests from "buy a ship" to "break through the ice wall".
// Quests are data. done(s) is checked every step; target(s) is what the compass points at.
import { deed } from './rep.js';
import { hash } from '../gen/rng.js';
import { asgardLine } from './lore.js';
import { draugrRumour } from './draugr.js';
import { krakenRumour } from './kraken.js';
import { cyclopsRumour } from './cyclops.js';
import { wreckRumour } from './salvage.js';
import { learnQuest } from './map.js';
import { cargoCount } from './trade.js';
import { sectorOf, sectorIslands } from '../gen/world.js';
// where the player is, on foot or afloat
const here = (s) => (s.mode === 'foot' || !s.ship ? s.foot : s.ship);
// the nearest live raider: the target for "Clear the Lanes"
export const nearestRaider = (s) => { const p = here(s); let best = null, bd = 1e12; for (const e of s.enemies.values()) if (e.kind === 'raider') { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; best = e; } } return best && { x: best.x, z: best.z, label: 'Raider ship' }; };
// the nearest buried cache you have not dug up (searched a few sectors out, re-checked twice a second)
const tcache = new WeakMap();
const nearestTreasure = (s) => {
  const c = tcache.get(s); if (c && s.t - c.t < 0.5 && s.t >= c.t) return c.v;
  const p = here(s), cx = sectorOf(p.x), cz = sectorOf(p.z); let best = null, bd = 1e12;
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (const isl of sectorIslands(s.seed, cx + i, cz + j)) if (isl.treasure && !s.found.has(isl.id)) { const d = Math.hypot(isl.treasure.x - p.x, isl.treasure.z - p.z); if (d < bd) { bd = d; best = isl; } }
  const v = best && { x: best.treasure.x, z: best.treasure.z, label: s.mode === 'foot' && bd < 80 ? 'Dig at the red X (F)' : 'Island with buried treasure' };
  tcache.set(s, { t: s.t, v }); return v;
};
// the compass points at the port from the sea, and at the actual person once you are on foot
const aim = (s, t, kind, label) => { if (!t) return null; const p = s.mode === 'foot' && t.npcs?.find((o) => o.kind === kind); return { ...t, ...(p ? { x: p.x, z: p.z } : {}), label }; };

export const QUESTS = [
  { id: 'ticket', title: 'One-Way Ticket', desc: 'The documentary said the Wall is real. Buy a ship from the shipwright in Port Haven.',
    done: (s) => !!s.ship, target: (s) => aim(s, s.targets.home, 'shipwright', 'Shipwright, Port Haven'), reward: 0,
    hint: 'Talk to the shipwright in the town square (press F).' },
  { id: 'supplies', title: 'Stock the Larder', desc: 'Buy at least 15 provisions from the merchant, then board your ship at the end of the dock.',
    done: (s) => s.food >= 15 && s.mode === 'ship', target: (s) => aim(s, s.targets.home, 'merchant', 'Merchant, Port Haven'), reward: 0,
    hint: 'Provisions cost 5 gold each. Walk to the end of the dock and press F to board.' },
  { id: 'sailor', title: 'Whispers on the Water', desc: 'An old sailor in {sailor} claims he has seen the Wall. Sail there and talk to him.',
    done: (s) => !!s.flags.sailor, target: (s) => aim(s, s.targets.sailor, 'sailor', 'Old sailor'), reward: 100,
    hint: 'Steer with A/D, trim sails with W/S. Wind at your back is fastest. Go ashore with F near a dock or beach.' },
  { id: 'raiders', title: 'Clear the Lanes', desc: 'Raiders prey on anyone heading for the rim. Sink two of them.',
    done: (s) => (s.killsBy.raider || 0) >= 2, target: nearestRaider, reward: 300,
    hint: 'Raiders fly black sails. Find one at sea and sink it.' },
  { id: 'map', title: 'A Lost Cache', desc: 'Expeditions are expensive. Dig up a buried supply cache to fund yours: look for a red X on the beach of an island with no town.',
    done: (s) => s.found.size >= 1, target: nearestTreasure, reward: 100,
    hint: 'Sail close to an empty island, go ashore (F), walk to the red X and press F to dig.' },
  { id: 'frost', title: 'The Last Outpost', desc: 'Sail to the rim and speak to the Warden of Frostwatch. The cold gets deeper the closer you get to the Wall.',
    done: (s) => !!s.flags.warden, target: (s) => aim(s, s.targets.frost, 'warden', 'Warden, Frostwatch'), reward: 150,
    hint: 'Frostwatch is on the compass. Ghost ships haunt the cold waters: keep your hull repaired.' },
  { id: 'ram', title: 'Break the Ice', desc: 'The Warden sells an icebreaker ram for 500 gold. Earn it by trading, treasure and sinking ships.',
    done: (s) => !!s.upgrades.ram, target: (s) => aim(s, s.targets.frost, 'warden', 'Warden, Frostwatch'), reward: 0,
    hint: 'Buy low, sell high: each port has a cheap and a dear good. Sunk ships pay out.' },
  { id: 'wall', title: 'The Wall', desc: 'One stretch of the Wall is paler and cracked: thin ice, but still ice. Ram through it and see what lies beyond.',
    done: (s) => !!s.flags.crossed, target: (s) => ({ ...s.targets.gate, label: 'The Weak Spot' }), reward: 0,
    hint: 'Sail to the marked weak spot at full speed.' },
];

export const currentQuest = (s) => QUESTS[s.quest] || null;
export const questText = (s, q) => q.desc.replace('{sailor}', s.targets.sailor.island);

export function advanceQuests(s, say) {
  let q;
  while ((q = QUESTS[s.quest]) && q.done(s)) {
    s.gold += q.reward; s.score += q.reward; s.quest++;
    say(s, `Quest complete: ${q.title}${q.reward ? ` (+${q.reward} gold)` : ''}`);
    const n = QUESTS[s.quest]; if (n) say(s, `New quest: ${n.title}`);
    deed(s, 'quest'); s.events.push({ type: 'quest' }); if (q.id === 'map') s.events.push({ type: 'choice' }); const lq = learnQuest(s, q.id); if (lq) say(s, lq);
  }
}

// what an NPC says and which shop it opens. Talking can also advance the story (flags).
export function dialog(s, npc) {
  const q = currentQuest(s);
  switch (npc.kind) {
    case 'shipwright':
      return { lines: s.ship ? ['A fine boat you have there. Mind the rocks.'] : ['Looking for a ship? I have a few ships on the slip, from a handy sailboat to a galleon. They all float, most days.', 'The sailboat is three hundred gold and she is yours.'], panel: 'shipyard' };
    case 'merchant': return { lines: ['Provisions, powder, rum. Whatever your hold can carry.'], panel: 'market' };
    case 'tavern': return { lines: [q ? `Rumour has it: ${q.hint}` : 'Another round for the crew!', (s.realm === 'asgard' && draugrRumour(s, npc.x, npc.z)) || (s.realm === 'atlantis' && Math.floor(s.t / 300) % 2 === 0 && krakenRumour(s, npc.x, npc.z)) || (s.realm === 'olympus' && Math.floor(s.t / 300) % 2 === 0 && cyclopsRumour(s, npc.x, npc.z)) || (Math.floor(s.t / 300) % 2 && wreckRumour(s, npc.x, npc.z)) || asgardLine(s, npc.seed, Math.floor(s.t / 300)), s.ship ? 'Some hands in the corner are looking for a berth, if you need a crew.' : 'Get yourself a ship first, then come and talk about hands.'], panel: 'tavern' };
    case 'sailor':
      s.flags.sailor = true;
      return { lines: ['You are asking about the Wall? I have seen it. A cliff of ice taller than any mast, all the way round the world.', 'There is one weak spot in it, pale and cracked, but still sealed. The Warden at Frostwatch, out on the rim, knows how to break it.', 'The land past the ice? Asgard, the old ones call it. I will not say more than that, not until you have seen the Warden.', 'Keep a hand on your guns. The black sails have been busy.'], panel: null };
    case 'warden':
      s.flags.warden = true;
      return { lines: [asgardLine(s, npc.seed, 2), ...(s.upgrades.ram ? ['That ram will do it. Make for the weak spot and do not slow down.'] : ['So the stories got you here. The weak spot is thin ice, but only an icebreaker ram will crack it.', 'I can fit one to your ship. Five hundred gold.'])], panel: 'warden' };
    case 'smith': return { lines: !s.weapon || s.weapon === 'fists' ? ['Bare hands? That is no way to cross the sea, or to walk a strange town.', 'Have a look at what I have. A good blade pays for itself.'] : ['Keep it sharp. Anything else you need?'], panel: 'arms' };
    case 'guard': return { lines: s.bountyGold > 0 ? ['You are wanted. Pay what you owe and the matter is closed.'] : s.prisoner ? ['You have someone with you. Let us have a look.'] : ['Keep the peace in this town and we will get along. Break it and you will see our cell.', 'The wanted list is here if you want honest work.'], panel: 'guard' };
    case 'villager': { const h = hash(npc.seed >>> 0, Math.floor(s.t / 400), 5); return { lines: [h % 5 < 2 ? asgardLine(s, npc.seed, Math.floor(s.t / 400)) : ['Fine weather for it.', 'Mind the guards, they have short tempers.', 'The tide is late today.', 'If you need a drink, the tavern is the place.', 'I have lived here all my life and never left. Never wanted to.'][h % 5]], panel: null }; }
    default: return { lines: ['...'], panel: null };
  }
}
export { cargoCount };
