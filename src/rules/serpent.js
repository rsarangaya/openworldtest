// The sea serpent, the first monster. A few deep-water lairs per Terra world (two inside the Wall, one in the Outer Sea), far from land and from
// Port Haven, hinted first by notice boards and tavern talk. Sail close and it rises: it circles the ship, lunges to bite, then dives and comes up
// somewhere else. Shot only hurts it while it is up (chain slows it, fire burns it). Sail away and it sinks back and heals. Slain lairs stay quiet.
// Live state is s.serpent (not saved: it rises again when you come back); slain lairs are s.slain (saved).
import { WALL_R, TAU, onLand } from '../gen/world.js';
import { rngFor, hash } from '../gen/rng.js';

export const WAKE_R = 200, LEAVE_R = 520, HIT_R = 8, BITE_R = 10, BITE = 14, HP = 240, GOLD = 650, UP_S = 11, DOWN_S = 5, LUNGE_AT = 7.5;
const cache = new Map();
// the lairs of a world: [{ id, x, z }], deterministic per seed, each in open water at least 120 units from any island
export function lairs(seed) {
  if (cache.has(seed)) return cache.get(seed);
  const out = [], rings = [[0.42, 0.62], [0.66, 0.86], [1.09, 1.3]];
  rings.forEach(([a, b], i) => { const r = rngFor(seed, 8800 + i); for (let k = 0; k < 60; k++) { const ang = r() * TAU, d = WALL_R * (a + (b - a) * r()), x = Math.cos(ang) * d, z = Math.sin(ang) * d; if (!onLand(seed, x, z, 120)) { out.push({ id: 'lair' + i, x, z }); break; } } });
  cache.set(seed, out); return out;
}
const live = (s) => (s.realm || 'terra') === 'terra' ? lairs(s.baseSeed || s.seed).filter((l) => !(s.slain || []).includes(l.id)) : [];
// ships give a living serpent's waters a wide berth (none are put there)
export const nearLair = (s, x, z) => live(s).some((l) => Math.hypot(l.x - x, l.z - z) < LEAVE_R);
const NAMES = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compassWord = (dx, dz) => NAMES[Math.round(((((Math.atan2(dz, dx) * 180) / Math.PI + 90) % 360 + 360) % 360) / 45) % 8];
// a rumour of the nearest living serpent, as seen from (x, z), or null when none are left
export function serpentRumour(s, x, z) {
  let best = null, bd = 1e9; for (const l of live(s)) { const d = Math.hypot(l.x - x, l.z - z); if (d < bd) { bd = d; best = l; } }
  if (!best) return null;
  const far = bd > 2500 ? 'far out' : bd > 1200 ? 'a long sail' : 'not far', beyond = Math.hypot(best.x, best.z) > WALL_R;
  return `Fishermen swear a sea serpent lives in deep water ${far} to the ${compassWord(best.x - x, best.z - z)}${beyond ? ', past the Wall' : ''}. Only shot hurts it, they say, and only while its head is up. Small boats should keep well away.`;
}
// a step at sea (after the ship moved). Returns the serpent when it is up and can be aimed at, else null.
export function stepSerpent(s, dt, say, puff) {
  const p = s.ship; let m = s.serpent;
  if (!m) {
    if (Math.floor(s.t) === Math.floor(s.t - dt)) return null; // look for a lair once a second
    const l = live(s).find((q) => Math.hypot(q.x - p.x, q.z - p.z) < WAKE_R); if (!l) return null;
    const a = Math.atan2(p.z - l.z, p.x - l.x);
    m = s.serpent = { lair: l.id, lx: l.x, lz: l.z, hp: HP, maxHp: HP, x: p.x - Math.cos(a) * 70, z: p.z - Math.sin(a) * 70, yaw: a, speed: 0, kind: 'serpent', up: true, t0: s.t, ang: a + Math.PI, burn: 0, slow: 0, seed: hash(s.seed >>> 0, 8899) };
    say(s, 'The sea boils ahead... a SEA SERPENT rises! Shoot it while its head is up.'); s.events.push({ type: 'serpent' }); puff(s, 'splash', m.x, 1, m.z, 1.2, { sc: 3.4 }); return m;
  }
  if (Math.hypot(p.x - m.lx, p.z - m.lz) > LEAVE_R) { s.serpent = null; say(s, 'The serpent sinks back into its deep. It will heal, and wait.'); return null; }
  const a = s.t - m.t0, slow = m.slow > s.t ? 0.45 : 1;
  if (m.burn > s.t && m.up) { m.hp -= 3 * dt; if (Math.floor(s.t * 4) !== Math.floor((s.t - dt) * 4)) puff(s, 'smoke', m.x, 3.5, m.z, 1, { vy: 2, sc: 1.4 }); }
  if (m.up) {
    const lunge = a > LUNGE_AT, d = Math.hypot(p.x - m.x, p.z - m.z);
    if (!lunge) m.ang += 0.32 * dt * slow; // circle the ship at 45 units
    const tx = lunge ? p.x : p.x + Math.cos(m.ang) * 45, tz = lunge ? p.z : p.z + Math.sin(m.ang) * 45, want = Math.atan2(tz - m.z, tx - m.x);
    let dy = want - m.yaw; dy -= TAU * Math.floor((dy + Math.PI) / TAU); m.yaw += Math.max(-2 * dt, Math.min(2 * dt, dy));
    m.speed += ((lunge ? 24 : 15) * slow - m.speed) * Math.min(1, dt * 1.5);
    if (lunge && d < BITE_R) { s.hull -= BITE; s.hitT = s.t; say(s, 'The serpent bites the hull!'); s.events.push({ type: 'hit' }); puff(s, 'splash', p.x, 2, p.z, 0.9, { sc: 2.6 }); dive(s, m, puff); }
    else if (a > UP_S) dive(s, m, puff);
  } else {
    m.speed += (20 - m.speed) * Math.min(1, dt); // swims under you to come up on another side
    if (a > DOWN_S) { m.up = true; m.t0 = s.t; m.ang = Math.atan2(m.z - p.z, m.x - p.x); puff(s, 'splash', m.x, 1, m.z, 1, { sc: 3 }); s.events.push({ type: 'serpent' }); }
  }
  m.x += Math.cos(m.yaw) * m.speed * dt; m.z += Math.sin(m.yaw) * m.speed * dt;
  if (m.hp <= 0) { // slain: it stays slain, and the towns will hear of it
    s.serpent = null; (s.slain ||= []).push(m.lair); s.gold += GOLD; s.score += GOLD; s.kills++; s.killsBy.serpent = (s.killsBy.serpent || 0) + 1;
    puff(s, 'splash', m.x, 1, m.z, 1.6, { sc: 4.5 }); for (let q = 0; q < 3; q++) puff(s, 'smoke', m.x + q * 3 - 3, 3, m.z, 1.6, { vy: 2, sc: 2 });
    say(s, `The sea serpent thrashes and sinks, slain! +${GOLD} gold, and a tale every tavern will want.`); s.events.push({ type: 'sunk' }); return null;
  }
  return m.up ? m : null;
}
function dive(s, m, puff) { m.up = false; m.t0 = s.t; const p = s.ship; m.yaw = Math.atan2(p.z - m.z, p.x - m.x) + (hash(m.seed, Math.floor(s.t)) % 2 ? 0.5 : -0.5); puff(s, 'splash', m.x, 1, m.z, 1, { sc: 3 }); }
// a player's shot at (b.x, b.z): true when it hit the serpent (which must be up)
export function shotSerpent(s, b) {
  const m = s.serpent; if (!m || !m.up || Math.hypot(m.x - b.x, m.z - b.z) > HIT_R) return false;
  m.hp -= b.dmg; m.hitT = s.t; if (b.kind === 'chain') m.slow = s.t + 6; if (b.kind === 'fire') m.burn = s.t + 6; return true;
}
// where to draw it: the head and three coils trailing behind, each { x, z, y, k: 'serhead' | 'sercoil' }; empty while it is down
export function serpentParts(m, t) {
  if (!m || !m.up) return [];
  const c = Math.cos(m.yaw), n = Math.sin(m.yaw), out = [{ k: 'serhead', x: m.x, z: m.z, y: 0.2 + 0.4 * Math.sin(t * 3) }];
  for (let i = 1; i <= 3; i++) { const back = i * 6.5, side = Math.sin(t * 2.2 - i * 1.3) * 2.4; out.push({ k: 'sercoil', x: m.x - c * back - n * side, z: m.z - n * back + c * side, y: -0.3 + 0.5 * Math.sin(t * 2.6 - i), s: 1 - i * 0.12 }); }
  return out;
}
