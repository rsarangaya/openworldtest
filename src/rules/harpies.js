// Harpies, Olympus's third monster: one nest per Olympus world on the shore of a wild island (the third wild shore after the cyclops's two),
// rumoured first. Sail near and a flock of FLOCK flies out and circles your ship; every few seconds one swoops on the deck and snatches a crew
// hand, two units of cargo or two days of food, then flies home with it. Shoot a thief down before it is CARRY_R off and the loot falls back
// (the crew fish it out); past that the loot is gone and the thief comes back for more, so the flock is never too small to drive off. Small flying things: chain shot tears them out of the air, round shot needs several hits, and swivel
// guns fire at them on their own. Bring down KILL_OFF and the rest flee for good (s.slain gets 'harpies'). Sail away and the flock goes home.
// Live state is s.harpies (not saved).
import { wildShores } from './cyclops.js';
import { compassWord } from './serpent.js';
import { GOODS } from '../gen/world.js';

export const WAKE_R = 280, LEAVE_R = 540, FLOCK = 6, KILL_OFF = 4, HP = 20, ORBIT = 15, FLY = 26, DIVE = 30, CARRY = 6, CARRY_R = 100, SWOOP_CD = 5, HIT_R = 5, GOLD = 400, EACH = 30;
const MUL = { chain: 2.5, round: 0.5 };
export const harpyNest = (seed) => wildShores(seed).find((l) => l.id === 'harpies') || null;
const live = (s) => { if (s.realm !== 'olympus' || (s.slain || []).includes('harpies')) return null; return harpyNest(s.seed); };
export const nearHarpies = (s, x, z) => { const l = live(s); return !!l && Math.hypot(l.x - x, l.z - z) < WAKE_R + 40; };
export function harpyRumour(s, x, z) {
  const l = live(s); if (!l) return null; const d = Math.hypot(l.x - x, l.z - z);
  return `Fishermen say HARPIES nest on the cliffs of ${l.island}, ${d > 2500 ? 'far out' : d > 1200 ? 'a long sail' : 'not far'} to the ${compassWord(l.x - x, l.z - z)}. They snatch crew and cargo off the deck. Chain shot brings them down; swivel guns help.`;
}
const lootName = (L) => L.crew ? L.crew.name : `${L.n} ${L.good === 'food' ? 'days of food' : L.good}`;
function snatch(s, h) { // what a swooping harpy takes: a hand (not the captain), else the biggest cargo, else food, else it rakes the rigging
  const hands = (s.crew || []).filter((c) => !c.captain), seed = Math.floor(s.t * 7) + h.i;
  if (hands.length && seed % 3 === 0) { const c = hands[seed % hands.length]; s.crew.splice(s.crew.indexOf(c), 1); return { crew: c }; }
  let g = null; for (const k of GOODS) if ((s.cargo[k] || 0) > (s.cargo[g] || 0)) g = k;
  if (g) { const n = Math.min(2, s.cargo[g]); s.cargo[g] -= n; return { good: g, n }; }
  if (s.food > 0) { const n = Math.min(2, s.food); s.food -= n; return { good: 'food', n }; }
  return null;
}
function giveBack(s, L) { if (L.crew) (s.crew ||= []).push(L.crew); else if (L.good === 'food') s.food += L.n; else s.cargo[L.good] = (s.cargo[L.good] || 0) + L.n; }
// a step at sea (after the ship moved). Returns the nearest harpy on the wing (a thief first) as a target for the guns, else null.
export function stepHarpies(s, dt, say, puff) {
  const p = s.ship; let m = s.harpies;
  if (!m) {
    if (Math.floor(s.t) === Math.floor(s.t - dt)) return null; // look for the nest once a second
    const l = live(s); if (!l || Math.hypot(l.x - p.x, l.z - p.z) > WAKE_R) return null;
    m = s.harpies = { x: l.x, z: l.z, island: l.island, next: s.t + 3, kills: 0, flock: [] };
    for (let i = 0; i < FLOCK; i++) m.flock.push({ i, a: (i / FLOCK) * Math.PI * 2, x: l.x + i * 2, z: l.z, y: 12, hp: HP, st: 'fly', yaw: 0, speed: 0, kind: 'harpy' });
    say(s, `Shrieks from the cliffs of ${l.island}: HARPIES! They will snatch crew and cargo off your deck. Chain shot (2) brings them down; shoot a thief before it gets away.`); s.events.push({ type: 'serpent' });
  }
  if (Math.hypot(p.x - m.x, p.z - m.z) > LEAVE_R) { s.harpies = null; if (m.flock.some((h) => !h.gone)) say(s, 'The harpies give up the chase and wheel back to their cliffs.'); return null; }
  let near = null, nd = 1e9;
  for (const h of m.flock) {
    if (h.gone) continue; let tx, ty, tz, v;
    if (h.st === 'dive') { tx = p.x; ty = 3; tz = p.z; v = DIVE; }
    else if (h.st === 'carry') { const a = Math.atan2(m.z - h.z, m.x - h.x); tx = h.x + Math.cos(a) * 10; tz = h.z + Math.sin(a) * 10; ty = 20; v = CARRY; }
    else { const a = h.a + s.t * 0.8; tx = p.x + Math.cos(a) * ORBIT; tz = p.z + Math.sin(a) * ORBIT; ty = 13 + Math.sin(s.t * 2 + h.i) * 1.5; v = FLY; }
    const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz), k = d > 0 ? Math.min(1, (v * dt) / d) : 0;
    h.x += dx * k; h.z += dz * k; h.y += (ty - h.y) * Math.min(1, dt * 3); if (d > 0.01) { h.yaw = Math.atan2(dz, dx); h.speed = Math.min(v, d / dt); }
    if (h.st === 'dive' && Math.hypot(p.x - h.x, p.z - h.z) < 3) {
      h.loot = snatch(s, h); h.st = 'carry'; s.events.push({ type: 'hit' }); puff(s, 'splash', p.x, 4, p.z, 0.5, { sc: 1.2 });
      if (h.loot) say(s, `A harpy snatches ${lootName(h.loot)} off the deck! Shoot it down before it gets away.`); else { s.hull -= 4; s.hitT = s.t; say(s, 'A harpy rakes the rigging with its claws and finds nothing to take.'); }
    }
    if (h.st === 'carry' && Math.hypot(p.x - h.x, p.z - h.z) > CARRY_R) { if (h.loot) say(s, `The harpy is gone over the cliffs with ${lootName(h.loot)}.`); h.loot = null; h.st = 'fly'; }
    const dd = Math.hypot(h.x - p.x, h.z - p.z) - (h.st === 'carry' ? 40 : 0); if (dd < nd) { nd = dd; near = h; } // the guns lay on a thief first
  }
  if (s.t >= m.next) { m.next = s.t + SWOOP_CD; const h = m.flock.find((q) => !q.gone && q.st === 'fly'); if (h) h.st = 'dive'; }
  for (const h of m.flock) if (!h.gone && h.hp <= 0) { // brought down
    h.gone = true; m.kills++; s.gold += EACH; s.score += EACH; puff(s, 'splash', h.x, 0.6, h.z, 0.8, { sc: 1.6 });
    if (h.loot) { giveBack(s, h.loot); say(s, `The harpy falls into the sea, and the crew fish ${lootName(h.loot)} back out. +${EACH} gold.`); } else say(s, `A harpy falls into the sea! +${EACH} gold.`);
  }
  if (m.kills >= KILL_OFF) { // the rest flee and drop what they carry
    for (const h of m.flock) if (!h.gone && h.loot) giveBack(s, h.loot);
    s.harpies = null; (s.slain ||= []).push('harpies'); s.gold += GOLD; s.score += GOLD; s.kills++; s.killsBy.harpies = (s.killsBy.harpies || 0) + 1;
    say(s, `The last harpies shriek and flee ${m.island} for good, dropping what they carried! +${GOLD} gold.`); s.events.push({ type: 'sunk' }); return null;
  }
  return near;
}
// a player's shot at (b.x, b.z): true when it hit a harpy
export function shotHarpy(s, b) {
  const m = s.harpies; if (!m) return false;
  for (const h of m.flock) if (!h.gone && h.hp > 0 && Math.hypot(h.x - b.x, h.z - b.z) < HIT_R) { h.hp -= b.dmg * (MUL[b.kind] || 1); h.hitT = s.t; return true; }
  return false;
}
// the swivel guns' pick: the nearest harpy within range r, hit for dmg. True when they fired
export function swivelHarpy(s, r, dmg) {
  const m = s.harpies, p = s.ship; if (!m) return false; let best = null, bd = r;
  for (const h of m.flock) { const d = Math.hypot(h.x - p.x, h.z - p.z); if (!h.gone && h.hp > 0 && d < bd) { bd = d; best = h; } }
  if (!best) return false; best.hp -= dmg; best.hitT = s.t; return true;
}
