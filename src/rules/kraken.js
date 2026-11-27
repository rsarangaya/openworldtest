// The kraken, Atlantis's monster (its surface phase). One lair per Atlantis world in open water, rumoured first. Sail close and it rises under
// you: four arms wrap the ship (two abeam, one on each bow) and its head breaks the surface off one side. While it holds on it drags her
// almost to a stop and squeezes the hull every few seconds. Shot only hurts the arms and head while they are up; fire hurts most, chain least.
// After a while it lets go and sinks, then grabs again. Sail away from the lair while it is down and it heals. Slain lairs stay quiet (s.slain).
// Its underwater phase: cut it to half health and it lets go and dives for its den on the sea floor under the lair, where shot cannot reach.
// Bubbles rise over the den. Heave to above them and press F: your diver goes down with a powder keg (each keg takes a quarter of its
// health), but an arm may lash out and throw the diver clear (no keg set, a short rest). Kill it in the den and its pearl hoard comes up too.
// Live state is s.kraken (not saved: it rises again when you come back).
import { seaSpots, compassWord } from './serpent.js';
import { DIVE_R, DIVE_S, SAFE_R, diveBlocked } from './salvage.js';
import { hash } from '../gen/rng.js';

export const WAKE_R = 180, LEAVE_R = 480, HIT_R = 7, HP = 600, GOLD = 800, GRIP_S = 14, DOWN_S = 7, SQUEEZE = 8, SQUEEZE_CD = 4, DRAG = 1.6, HOLD_V = 1.5;
export const DEN_AT = 0.5, KEG = 150, LASH = 0.3, LASH_REST = 30, HOARD = 300; // dives for its den at half health; a keg's damage; an arm's lash
const ARMS = [[-Math.PI / 2, 13], [Math.PI / 2, 13], [-0.75, 12], [0.75, 12]]; // [angle from the bow, distance]: abeam and on each bow, none astern by the camera
const MUL = { fire: 1.5, chain: 0.6 };
export const krakenLairs = (seed) => seaSpots(seed, [[0.45, 0.75]], 9300, 'kraken');
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
  if (m.den) { if (Math.floor(s.t) !== Math.floor(s.t - dt)) puff(s, 'splash', m.lx, 0.6, m.lz, 0.8, { sc: 1.4 }); } // bubbles over the den
  else if (m.grip) {
    p.speed = Math.max(-HOLD_V, Math.min(HOLD_V, p.speed - p.speed * Math.min(1, dt * DRAG))); // it holds her to a crawl
    if (m.burn > s.t) { m.hp -= 4 * dt; if (Math.floor(s.t * 4) !== Math.floor((s.t - dt) * 4)) puff(s, 'smoke', p.x + Math.cos(p.yaw + m.side * 1.57) * 13, 3, p.z + Math.sin(p.yaw + m.side * 1.57) * 13, 1, { vy: 2, sc: 1.4 }); }
    if (s.t - m.sq > SQUEEZE_CD) { m.sq = s.t; s.hull -= SQUEEZE; s.hitT = s.t; say(s, 'The kraken squeezes! Her planks crack.'); s.events.push({ type: 'hit' }); puff(s, 'splash', p.x, 2, p.z, 0.9, { sc: 2.6 }); }
    if (s.t - m.t0 > GRIP_S) { m.grip = false; m.t0 = s.t; say(s, 'The arms let go and slide under. It will be back: get clear, or ready the guns.'); for (const q of krakenParts({ ...m, grip: true }, p, s.t)) puff(s, 'splash', q.x, 1, q.z, 1, { sc: 2.4 }); }
    if (m.grip && m.hp > 0 && m.hp <= m.maxHp * DEN_AT) { // wounded: it goes to ground in its den
      m.grip = false; m.den = true; m.t0 = s.t; for (const q of krakenParts({ ...m, grip: true }, p, s.t)) puff(s, 'splash', q.x, 1, q.z, 1, { sc: 2.4 });
      const d = Math.hypot(m.lx - p.x, m.lz - p.z);
      say(s, `Wounded, the kraken lets go and dives for its den. Bubbles rise ${d < DIVE_R ? 'right under you' : `${Math.round(d / 10) * 10} m to the ${compassWord(m.lx - p.x, m.lz - p.z)}`}: heave to over them and send your diver down with a powder keg.`);
    }
  } else if (s.t - m.t0 > DOWN_S && Math.hypot(p.x - m.lx, p.z - m.lz) < LEAVE_R) { // it grabs again
    m.grip = true; m.t0 = s.t; m.sq = s.t; m.side = -m.side; s.events.push({ type: 'serpent' });
    say(s, m.hp < HP ? 'The KRAKEN grabs her again!' : 'The sea darkens under the keel... a KRAKEN wraps its arms round your ship! Shoot the arms (fire shot hurts most).');
    for (const q of krakenParts(m, p, s.t)) puff(s, 'splash', q.x, 1, q.z, 1.1, { sc: 3 });
  }
  if (m.hp <= 0) {
    const pay = GOLD + (m.den ? HOARD : 0); s.kraken = null; (s.slain ||= []).push(m.lair); s.gold += pay; s.score += pay; s.kills++; s.killsBy.kraken = (s.killsBy.kraken || 0) + 1;
    for (let q = 0; q < 3; q++) puff(s, 'smoke', p.x + q * 4 - 4, 3, p.z, 1.6, { vy: 2, sc: 2 }); puff(s, 'splash', p.x, 1, p.z, 1.6, { sc: 4.5 });
    say(s, m.den ? `The keg tears the den apart: the kraken is slain! Your diver brings up pearls from its hoard. +${pay} gold, and the pearl divers will sing of it.` : `The kraken lets go for good and sinks, slain! +${pay} gold, and the pearl divers will sing of it.`); s.events.push({ type: 'sunk' }); return null;
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
// the den under the ship, while the wounded kraken hides in it (within a diver's reach), else null
export const denHere = (s) => { const m = s.kraken, p = s.ship; return m?.den && p && Math.hypot(m.lx - p.x, m.lz - p.z) < DIVE_R ? m : null; };
// F over the den: send the diver down with a powder keg, or say why not
export function startDenDive(s, say, stormy, danger) {
  if (!denHere(s) || diveBlocked(s, say, stormy, danger)) return;
  s.dive = { den: true, id: 'den', t0: s.t }; s.auto = false; s.row = false; s.ship.sail = 0;
  say(s, "Your diver goes over the side with a powder keg, down to the kraken's den... Its arms are still about: a risky dive."); s.events.push({ type: 'splash' });
}
// a step while the diver is down at the den: hold the ship still; when they come up, the keg went off or an arm threw them clear
export function stepDenDive(s, dt, say, puff, danger) {
  const d = s.dive, p = s.ship, m = s.kraken; p.speed *= 1 - Math.min(1, dt * 2); p.sail = 0;
  if (!m?.den || danger(s, SAFE_R * 0.75)) { s.dive = null; say(s, 'Trouble! Your diver is hauled back up, keg and all.'); return; }
  if (s.t - d.t0 < DIVE_S) return;
  s.dive = null; m.kegs = (m.kegs || 0) + 1;
  if ((hash(s.seed, 9310 + m.kegs, (d.t0 * 10) | 0) % 1000) / 1000 < LASH) { s.diveRest = s.t + LASH_REST; say(s, `An arm lashes out of the den and throws your diver clear! They come up bruised and the keg is lost. ${LASH_REST} s to recover.`); s.events.push({ type: 'hit' }); return; }
  m.hp -= KEG; m.hitT = s.t; puff(s, 'splash', m.lx, 1, m.lz, 1.4, { sc: 4 }); puff(s, 'smoke', m.lx, 2, m.lz, 1.2, { vy: 2, sc: 1.8 }); s.events.push({ type: 'cannon', x: m.lx, z: m.lz });
  if (m.hp > 0) say(s, 'The keg goes off in the den with a dull boom and the sea heaves! It still lives: send another keg down.');
}
