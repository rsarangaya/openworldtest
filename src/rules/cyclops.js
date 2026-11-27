// The cyclops, Olympus's monster. Two lairs per Olympus world: each on the shore of a big wild island (no town) away from the centre, rumoured
// first. Come within sight and he stands on the beach; come within range and he lobs boulders at where your ship will be. A white ring of foam
// marks where each one will land: sail out of it (change course or speed) before it comes down. Cannon fire from the sea hurts him (fire most,
// chain least: he is no ship). Sail away and he sits down and heals. Slain lairs stay quiet (s.slain). Live state is s.cyclops (not saved).
// He only throws at ships: on foot nobody wakes him (left for later).
import { sectorIslands, rawHeight, WALL_R, SECTOR, TAU } from '../gen/world.js';
import { hash } from '../gen/rng.js';
import { compassWord } from './serpent.js';

export const SEE_R = 420, RANGE = 260, LEAVE_R = 520, HIT_R = 10, HP = 360, GOLD = 750, THROW_CD = 4, SPLASH_R = 12, ROCK = 12, WIND = 0.9;
const MUL = { fire: 1.4, chain: 0.5 };
const cache = new Map();
// wild shores of an Olympus world: [{ id, x, z, y, iid, island, cx, cz }], the biggest wild islands past a third of the way out, far apart, each with a
// spot on its shore. The first two are the cyclops's lairs, the third (when there is one) the harpies' nest
export const cyclopsLairs = (seed) => wildShores(seed).slice(0, 2);
export function wildShores(seed) {
  if (cache.has(seed)) return cache.get(seed);
  const n = Math.ceil(WALL_R / SECTOR), cand = [];
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (const isl of sectorIslands(seed, i, j)) {
    const d = Math.hypot(isl.x, isl.z); if (!isl.port && !isl.special && isl.r >= 34 && isl.biome !== 'sandbar' && d > WALL_R * 0.3 && d < WALL_R * 0.85) cand.push(isl);
  }
  cand.sort((a, b) => b.r - a.r || a.id.localeCompare(b.id));
  const out = [];
  for (const isl of cand) {
    if (out.length >= 3) break; if (out.some((l) => Math.hypot(l.x - isl.x, l.z - isl.z) < 1500)) continue; // far apart
    const a = ((hash(isl.seed >>> 0, 61) >>> 0) % 1000) / 1000 * TAU, c = Math.cos(a), sn = Math.sin(a);
    let sh = 0; for (let dd = isl.r * 1.5; dd > 0; dd -= 0.5) if (rawHeight(isl, isl.x + c * dd, isl.z + sn * dd) > 1.2) { sh = dd; break; }
    if (!sh) continue; const x = isl.x + c * (sh - 2), z = isl.z + sn * (sh - 2); // just up the beach, facing the sea
    out.push({ id: out.length < 2 ? 'cyclops' + out.length : 'harpies', x, z, y: rawHeight(isl, x, z), iid: isl.id, island: isl.name, cx: isl.x, cz: isl.z });
  }
  cache.set(seed, out); return out;
}
const live = (s) => s.realm === 'olympus' ? cyclopsLairs(s.seed).filter((l) => !(s.slain || []).includes(l.id)) : [];
export const nearCyclops = (s, x, z) => live(s).some((l) => Math.hypot(l.x - x, l.z - z) < RANGE + 40);
export function cyclopsRumour(s, x, z) {
  let best = null, bd = 1e9; for (const l of live(s)) { const d = Math.hypot(l.x - x, l.z - z); if (d < bd) { bd = d; best = l; } }
  if (!best) return null;
  return `Goatherds say a one-eyed giant lives on ${best.island}, ${bd > 2500 ? 'far out' : bd > 1200 ? 'a long sail' : 'not far'} to the ${compassWord(best.x - x, best.z - z)}. He throws boulders the size of a hut at any ship he sees. Watch for the foam where it will fall, and keep moving.`;
}
// where a boulder is in its flight: { x, y, z } (an arc from his hand to the ring)
export function rockAt(r, t) { const k = Math.min(1, Math.max(0, (t - r.t0) / r.T)); return { x: r.x0 + (r.tx - r.x0) * k, z: r.z0 + (r.tz - r.z0) * k, y: r.y0 * (1 - k) + 24 * r.T * k * (1 - k) }; }
// a step at sea (after the ship moved). Returns him as a target for the guns while he is in range, else null.
export function stepCyclops(s, dt, say, puff) {
  const p = s.ship; let m = s.cyclops;
  if (!m) {
    if (Math.floor(s.t) === Math.floor(s.t - dt)) return null; // look for a lair once a second
    const l = live(s).find((q) => Math.hypot(q.x - p.x, q.z - p.z) < SEE_R); if (!l) return null;
    m = s.cyclops = { lair: l.id, x: l.x, z: l.z, y: l.y, island: l.island, hp: HP, maxHp: HP, awake: false, next: 0, rocks: [], burn: 0, kind: 'cyclops', yaw: 0, speed: 0 };
  }
  const d = Math.hypot(p.x - m.x, p.z - m.z);
  if (d > LEAVE_R) { if (m.awake) say(s, 'The cyclops sits down on his beach and watches you go. He will heal, and wait.'); s.cyclops = null; return null; }
  if (!m.awake && d < RANGE) { m.awake = true; m.next = s.t + 2; s.events.push({ type: 'serpent' }); say(s, `A CYCLOPS stands up on the beach of ${m.island} and hefts a boulder! Watch for the foam ring where it will land and sail out of it. Shoot him from close in.`); }
  if (m.burn > s.t) { m.hp -= 3 * dt; if (Math.floor(s.t * 4) !== Math.floor((s.t - dt) * 4)) puff(s, 'smoke', m.x, m.y + 9, m.z, 1, { vy: 2, sc: 1.6 }); }
  if (m.awake && s.t >= m.next && d < RANGE && d > 14) { // throw at where she will be, with a little scatter
    m.next = s.t + THROW_CD; const T = 1.8 + d / 140, lead = 0.85, sc = hash(s.seed >>> 0, Math.floor(s.t * 10)) >>> 0;
    const tx = p.x + Math.cos(p.yaw) * p.speed * T * lead + ((sc % 9) - 4), tz = p.z + Math.sin(p.yaw) * p.speed * T * lead + (((sc >>> 4) % 9) - 4);
    m.rocks.push({ x0: m.x, z0: m.z, y0: m.y + 12, tx, tz, t0: s.t, T });
  }
  for (const r of m.rocks) if (s.t - r.t0 >= r.T) { // it comes down
    r.done = true; puff(s, 'splash', r.tx, 1, r.tz, 1.2, { sc: 3.6 });
    if (Math.hypot(p.x - r.tx, p.z - r.tz) < SPLASH_R) { s.hull -= ROCK; s.hitT = s.t; s.events.push({ type: 'hit' }); say(s, 'A boulder smashes into her deck!'); puff(s, 'smoke', p.x, 4, p.z, 1.2, { vy: 2, sc: 1.8 }); }
  }
  m.rocks = m.rocks.filter((r) => !r.done); m.yaw = Math.atan2(p.z - m.z, p.x - m.x); m.wind = m.awake && m.next - s.t < WIND;
  if (m.hp <= 0) {
    s.cyclops = null; (s.slain ||= []).push(m.lair); s.gold += GOLD; s.score += GOLD; s.kills++; s.killsBy.cyclops = (s.killsBy.cyclops || 0) + 1;
    for (let q = 0; q < 3; q++) puff(s, 'smoke', m.x + q * 3 - 3, m.y + 6, m.z, 1.6, { vy: 2, sc: 2.2 });
    say(s, `The cyclops topples into the surf, slain! +${GOLD} gold, and the goatherds of ${m.island} can sleep again.`); s.events.push({ type: 'sunk' }); return null;
  }
  return m.awake && d < RANGE ? m : null;
}
// a player's shot at (b.x, b.z): true when it hit him (awake or not: shooting a sleeping giant wakes him)
export function shotCyclops(s, b) {
  const m = s.cyclops; if (!m || Math.hypot(m.x - b.x, m.z - b.z) > HIT_R) return false;
  m.hp -= b.dmg * (MUL[b.kind] || 1); m.hitT = s.t; if (b.kind === 'fire') m.burn = s.t + 6; if (!m.awake) { m.awake = true; m.next = s.t + 1.5; } return true;
}
