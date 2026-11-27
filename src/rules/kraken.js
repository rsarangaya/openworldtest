// The kraken, Atlantis's monster (its surface phase). One lair per Atlantis world in open water, rumoured first. Sail close and it rises under
// you: four arms wrap the ship (two abeam, one on each bow) and its head breaks the surface off one side. While it holds on it drags her
// almost to a stop and squeezes the hull every few seconds. Shot only hurts the arms and head while they are up; fire hurts most, chain least.
// After a while it lets go and sinks, then grabs again. Sail away from the lair while it is down and it heals. Slain lairs stay quiet (s.slain).
// Live state is s.kraken (not saved: it rises again when you come back).
import { seaSpots, compassWord } from './serpent.js';

export const WAKE_R = 180, LEAVE_R = 480, HIT_R = 7, HP = 600, GOLD = 800, GRIP_S = 14, DOWN_S = 7, SQUEEZE = 8, SQUEEZE_CD = 4, DRAG = 1.6, HOLD_V = 1.5;
const ARMS = [[-Math.PI / 2, 13], [Math.PI / 2, 13], [-0.75, 12], [0.75, 12]]; // [angle from the bow, distance]: abeam and on each bow, none astern by the camera
const MUL = { fire: 1.5, chain: 0.6 };
export const krakenLairs = (seed) => seaSpots(seed, [[0.45, 0.75]], 9100, 'kraken');
const live = (s) => s.realm === 'atlantis' ? krakenLairs(s.seed).filter((l) => !(s.slain || []).includes(l.id)) : [];
export const nearKraken = (s, x, z) => live(s).some((l) => Math.hypot(l.x - x, l.z - z) < LEAVE_R);
export function krakenRumour(s, x, z) {
  const l = live(s)[0]; if (!l) return null; const d = Math.hypot(l.x - x, l.z - z);
  return `Pearl divers whisper of a kraken in deep water ${d > 2500 ? 'far out' : d > 1200 ? 'a long sail' : 'not far'} to the ${compassWord(l.x - x, l.z - z)}. It takes whole ships in its arms and holds them still. Cut it loose with cannon; fire, they say, makes it let go fastest.`;
}
// where its parts are while it holds the ship: four arms round her and the head off one side, each { k: 'krarm' | 'krhead', x, z, y }; empty while it is down
export function krakenParts(m, p, t) {
  if (!m || !m.grip) return [];
  const at = (a, d) => [p.x + Math.cos(p.yaw + a) * d, p.z + Math.sin(p.yaw + a) * d];
  const out = ARMS.map(([a, d], i) => { const [x, z] = at(a, d); return { k: 'krarm', x, z, y: -0.4 + 0.5 * Math.sin(t * 2.4 + i * 1.7), i }; });
  const [x, z] = at(m.side * 1.15, 28); out.push({ k: 'krhead', x, z, y: -0.3 + 0.3 * Math.sin(t * 1.3) });
  return out;
}
// a step at sea (after the ship moved). Returns the head as a target for the guns while it holds on, else null.
export function stepKraken(s, dt, say, puff) {
  const p = s.ship; let m = s.kraken;
  if (!m) {
    if (Math.floor(s.t) === Math.floor(s.t - dt)) return null; // look for a lair once a second
    const l = live(s).find((q) => Math.hypot(q.x - p.x, q.z - p.z) < WAKE_R); if (!l) return null;
    m = s.kraken = { lair: l.id, lx: l.x, lz: l.z, hp: HP, maxHp: HP, grip: false, t0: s.t - DOWN_S, side: 1, sq: 0, burn: 0, kind: 'kraken', yaw: 0, speed: 0 };
  }
  if (!m.grip && Math.hypot(p.x - m.lx, p.z - m.lz) > LEAVE_R) { s.kraken = null; say(s, 'The kraken sinks back into the deep. It will heal, and wait.'); return null; }
  if (m.grip) {
    p.speed = Math.max(-HOLD_V, Math.min(HOLD_V, p.speed - p.speed * Math.min(1, dt * DRAG))); // it holds her to a crawl
    if (m.burn > s.t) { m.hp -= 4 * dt; if (Math.floor(s.t * 4) !== Math.floor((s.t - dt) * 4)) puff(s, 'smoke', p.x + Math.cos(p.yaw + m.side * 1.57) * 13, 3, p.z + Math.sin(p.yaw + m.side * 1.57) * 13, 1, { vy: 2, sc: 1.4 }); }
    if (s.t - m.sq > SQUEEZE_CD) { m.sq = s.t; s.hull -= SQUEEZE; s.hitT = s.t; say(s, 'The kraken squeezes! Her planks crack.'); s.events.push({ type: 'hit' }); puff(s, 'splash', p.x, 2, p.z, 0.9, { sc: 2.6 }); }
    if (s.t - m.t0 > GRIP_S) { m.grip = false; m.t0 = s.t; say(s, 'The arms let go and slide under. It will be back: get clear, or ready the guns.'); for (const q of krakenParts({ ...m, grip: true }, p, s.t)) puff(s, 'splash', q.x, 1, q.z, 1, { sc: 2.4 }); }
  } else if (s.t - m.t0 > DOWN_S && Math.hypot(p.x - m.lx, p.z - m.lz) < LEAVE_R) { // it grabs again
    m.grip = true; m.t0 = s.t; m.sq = s.t; m.side = -m.side; s.events.push({ type: 'serpent' });
    say(s, m.hp < HP ? 'The KRAKEN grabs her again!' : 'The sea darkens under the keel... a KRAKEN wraps its arms round your ship! Shoot the arms (fire shot hurts most).');
    for (const q of krakenParts(m, p, s.t)) puff(s, 'splash', q.x, 1, q.z, 1.1, { sc: 3 });
  }
  if (m.hp <= 0) {
    s.kraken = null; (s.slain ||= []).push(m.lair); s.gold += GOLD; s.score += GOLD; s.kills++; s.killsBy.kraken = (s.killsBy.kraken || 0) + 1;
    for (let q = 0; q < 3; q++) puff(s, 'smoke', p.x + q * 4 - 4, 3, p.z, 1.6, { vy: 2, sc: 2 }); puff(s, 'splash', p.x, 1, p.z, 1.6, { sc: 4.5 });
    say(s, `The kraken lets go for good and sinks, slain! +${GOLD} gold, and the pearl divers will sing of it.`); s.events.push({ type: 'sunk' }); return null;
  }
  if (!m.grip) return null;
  const h = krakenParts(m, p, s.t).at(-1); m.x = h.x; m.z = h.z; m.yaw = p.yaw; m.speed = p.speed; return m;
}
// a player's shot at (b.x, b.z): true when it hit an arm or the head (only while it holds on)
export function shotKraken(s, b) {
  const m = s.kraken; if (!m || !m.grip) return false;
  if (!krakenParts(m, s.ship, s.t).some((q) => Math.hypot(q.x - b.x, q.z - b.z) < (q.k === 'krhead' ? HIT_R + 2 : HIT_R))) return false;
  m.hp -= b.dmg * (MUL[b.kind] || 1); m.hitT = s.t; if (b.kind === 'fire') m.burn = s.t + 6; return true;
}
