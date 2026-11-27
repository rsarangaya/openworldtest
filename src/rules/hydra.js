// The hydra, Olympus's second monster. One lair per Olympus world, in open water, rumoured first. Sail close and it rises with three heads and
// swims at you; in reach, every head bites. Shot cuts heads: each head takes HEAD_HP. A head cut by round or chain shot leaves a stump that grows
// two new heads after REGROW seconds, unless fire shot sears it first (any fire hit seals every open stump, and a head cut while it burns never
// grows back). Slain when no heads and no open stumps are left. Sail away and it sinks and heals. Live state is s.hydra (not saved); slain lairs
// are s.slain (saved).
import { seaSpots, compassWord } from './serpent.js';

export const WAKE_R = 200, LEAVE_R = 480, TETHER = 90, HIT_R = 9, BITE = 2, BITE_CD = 2.5, HEAD_HP = 45, HEADS = 3, MAX_HEADS = 9, REGROW = 15, SWIM = 5, GOLD = 900;
export const reach = (heads) => 18 + 3 * heads; // more heads, longer reach: 27 with three, 45 with nine
const MUL = { chain: 0.6 };
export const hydraLairs = (seed) => seaSpots(seed, [[0.35, 0.65]], 9500, 'hydra');
const live = (s) => s.realm === 'olympus' ? hydraLairs(s.seed).filter((l) => !(s.slain || []).includes(l.id)) : [];
export const nearHydra = (s, x, z) => live(s).some((l) => Math.hypot(l.x - x, l.z - z) < LEAVE_R);
export function hydraRumour(s, x, z) {
  const l = live(s)[0]; if (!l) return null; const d = Math.hypot(l.x - x, l.z - z);
  return `Sponge divers say a many-headed HYDRA lives in open water ${d > 2500 ? 'far out' : d > 1200 ? 'a long sail' : 'not far'} to the ${compassWord(l.x - x, l.z - z)}. Cut off a head and two grow back, unless the stump is burned. Bring fire shot.`;
}
// where to draw it: the body and a fan of heads facing the ship, each { k: 'hybody' | 'hyhead', x, z, y, i }
export function hydraParts(m, t) {
  const out = [{ k: 'hybody', x: m.x, z: m.z, y: -0.4 }], n = m.heads;
  for (let i = 0; i < n; i++) { const a = m.yaw + (n > 1 ? (i / (n - 1) - 0.5) * 2.2 : 0); out.push({ k: 'hyhead', x: m.x + Math.cos(a) * 4, z: m.z + Math.sin(a) * 4, y: -0.3 + 0.4 * Math.sin(t * 2 + i * 1.3), i }); }
  return out;
}
// a step at sea (after the ship moved). Returns it as a target for the guns while it is up, else null.
export function stepHydra(s, dt, say, puff) {
  const p = s.ship; let m = s.hydra;
  if (!m) {
    if (Math.floor(s.t) === Math.floor(s.t - dt)) return null; // look for a lair once a second
    const l = live(s).find((q) => Math.hypot(q.x - p.x, q.z - p.z) < WAKE_R); if (!l) return null;
    m = s.hydra = { lair: l.id, lx: l.x, lz: l.z, x: l.x, z: l.z, yaw: Math.atan2(p.z - l.z, p.x - l.x), speed: 0, heads: HEADS, cut: HEAD_HP, stumps: [], burn: 0, biteT: s.t, kind: 'hydra', hp: HEADS, maxHp: MAX_HEADS };
    say(s, 'Three heads rise hissing from the sea... a HYDRA! Cut a head off and two grow back: sear the stumps with fire shot (3).'); s.events.push({ type: 'serpent' }); puff(s, 'splash', m.x, 1, m.z, 1.2, { sc: 3.6 });
  }
  if (Math.hypot(p.x - m.lx, p.z - m.lz) > LEAVE_R) { s.hydra = null; say(s, 'The hydra sinks back into its deep water. Its heads will grow back while it waits.'); return null; }
  const d = Math.hypot(p.x - m.x, p.z - m.z), want = Math.atan2(p.z - m.z, p.x - m.x);
  m.yaw = want; const go = d > 12 && Math.hypot(m.x + Math.cos(want) - m.lx, m.z + Math.sin(want) - m.lz) < TETHER; // swims slowly at you, never far from home
  m.speed = go ? SWIM : 0; m.x += Math.cos(want) * m.speed * dt; m.z += Math.sin(want) * m.speed * dt;
  if (m.burn > s.t && Math.floor(s.t * 4) !== Math.floor((s.t - dt) * 4)) puff(s, 'smoke', m.x, 4, m.z, 1, { vy: 2, sc: 1.5 });
  if (m.heads && d < reach(m.heads) && s.t - m.biteT > BITE_CD) { m.biteT = s.t; s.hull -= BITE * m.heads; s.hitT = s.t; s.events.push({ type: 'hit' }); say(s, m.heads > 1 ? `${m.heads} heads strike at her deck!` : 'The last head strikes at her deck!'); puff(s, 'splash', p.x, 2, p.z, 0.8, { sc: 2.2 }); }
  for (const st of m.stumps) if (s.t >= st) { m.heads = Math.min(MAX_HEADS, m.heads + 2); say(s, `Two heads burst from the stump! It has ${m.heads} now. Burn the stumps with fire shot.`); s.events.push({ type: 'serpent' }); puff(s, 'splash', m.x, 2, m.z, 1, { sc: 2.6 }); }
  m.stumps = m.stumps.filter((st) => s.t < st); m.hp = m.heads;
  if (!m.heads && !m.stumps.length) { // slain: it stays slain, and the towns will hear of it
    s.hydra = null; (s.slain ||= []).push(m.lair); s.gold += GOLD; s.score += GOLD; s.kills++; s.killsBy.hydra = (s.killsBy.hydra || 0) + 1;
    puff(s, 'splash', m.x, 1, m.z, 1.6, { sc: 4.5 }); for (let q = 0; q < 3; q++) puff(s, 'smoke', m.x + q * 3 - 3, 3, m.z, 1.6, { vy: 2, sc: 2 });
    say(s, `The last head falls and the hydra sinks, slain! +${GOLD} gold, and the sponge divers will dive again.`); s.events.push({ type: 'sunk' }); return null;
  }
  return m;
}
// a player's shot at (b.x, b.z): true when it hit the hydra
export function shotHydra(s, b) {
  const m = s.hydra; if (!m || Math.hypot(m.x - b.x, m.z - b.z) > HIT_R) return false;
  m.hitT = s.t; const say = (t) => { s.log.push(t); if (s.log.length > 6) s.log.shift(); };
  if (b.kind === 'fire') { m.burn = s.t + 6; if (m.stumps.length) { m.stumps = []; say('The fire sears the stumps: nothing will grow from them.'); } }
  if (!m.heads) return true; // only stumps left: fire seals them, the rest splashes off the body
  m.cut -= b.dmg * (MUL[b.kind] || 1);
  if (m.cut <= 0) {
    m.heads--; m.cut = HEAD_HP; m.hp = m.heads;
    if (m.burn > s.t) say(m.heads ? `A burning head falls, and the stump stays seared. ${m.heads} left.` : 'The last burning head falls.');
    else { m.stumps.push(s.t + REGROW); say(`A head falls! Sear the stump with fire shot within ${REGROW} seconds, or two will grow back.`); }
  }
  return true;
}
