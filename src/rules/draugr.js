// Draugr longships, Asgard's monster. A few sea barrows per Asgard world, in open water, rumoured on notice boards and in taverns. Sail close
// and a pack of dead longships rises round you. Round and chain shot only half bite the dead; fire burns them fast. They cannot be boarded.
// They do not turn broadside to fight: they steer straight at you and ram (RAM hull, and the rammer splinters too). Sink the whole pack and the barrow is quiet for good (s.slain, saved). Sail away and the survivors sink back to wait.
// Live state is s.draugr = { barrow, x, z, ids } (not saved: the pack rises again when you come back).
import { onLand, KINDS } from '../gen/world.js';
import { rngFor, hash } from '../gen/rng.js';
import { shipName, captainName } from '../gen/names.js';
import { seaSpots, compassWord } from './serpent.js';

export const WAKE_R = 220, LEAVE_R = 600, PACK = 3, BONUS = 450, RAM = 9, RAM_R = 9, RAM_CD = 6;
export const barrows = (seed) => seaSpots(seed, [[0.35, 0.55], [0.6, 0.78], [0.8, 0.9]], 8900, 'barrow');
const live = (s) => s.realm === 'asgard' ? barrows(s.seed).filter((b) => !(s.slain || []).includes(b.id)) : [];
export const nearBarrow = (s, x, z) => live(s).some((b) => Math.hypot(b.x - x, b.z - z) < LEAVE_R);
// how hard a player's shot bites a ship: the dead shrug off iron and burn like tinder
export const shotMul = (e, kind) => (e.kind !== 'draugr' ? 1 : kind === 'fire' ? 1.25 : 0.5);
export function draugrRumour(s, x, z) {
  let best = null, bd = 1e9; for (const b of live(s)) { const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
  if (!best) return null;
  return `The old men say a sea barrow lies ${bd > 2500 ? 'far out' : bd > 1200 ? 'a long row' : 'not far'} to the ${compassWord(best.x - x, best.z - z)}, where drowned warriors still man their longships. Iron barely bites the dead. Bring fire.`;
}
// a step at sea: raise the pack near a barrow, let it sink back if you leave, lay the barrow to rest when every ship of it is sunk
export function stepDraugr(s, dt, say, puff) {
  const p = s.ship, d = s.draugr;
  if (!d) {
    if (Math.floor(s.t) === Math.floor(s.t - dt)) return; // look once a second
    const b = live(s).find((q) => Math.hypot(q.x - p.x, q.z - p.z) < WAKE_R); if (!b) return;
    const n = (s.drN = (s.drN || 0) + 1), ids = [], r = rngFor(s.seed, 8950 + n);
    for (let i = 0, k = 0; i < PACK && k < 40; k++) { // round the ship, mostly ahead, in open water
      const a = p.yaw + (i - 1) * 1.1 + (r() - 0.5) * 0.6 + (k >= 12 ? r() * 6.3 : 0), dd = 130 + r() * 50, x = p.x + Math.cos(a) * dd, z = p.z + Math.sin(a) * dd;
      if (onLand(s.seed, x, z, 20)) continue;
      const id = `dr${n}.${i++}`, sr = rngFor(s.seed, 8960 + n * 7 + i);
      s.enemies.set(id, { id, seed: hash(s.seed, 8970 + n * 7 + i), kind: 'draugr', x, z, yaw: a + Math.PI, name: 'the drowned ' + shipName(sr, 'asgard'), captain: captainName(sr, 'asgard'), gen: false, speed: 0, hp: KINDS.draugr.hp, maxHp: KINDS.draugr.hp, cd: [2, 2] });
      puff(s, 'splash', x, 1, z, 1.2, { sc: 3.4 }); ids.push(id);
    }
    s.draugr = { barrow: b.id, x: b.x, z: b.z, ids };
    say(s, 'Green fire on the water... DRAUGR LONGSHIPS rise from the barrow! Iron barely bites the dead: use fire shot (3).'); s.events.push({ type: 'serpent' }); return;
  }
  const left = d.ids.filter((id) => s.enemies.has(id));
  if (Math.hypot(p.x - d.x, p.z - d.z) > LEAVE_R) { for (const id of left) s.enemies.delete(id); s.draugr = null; if (left.length) say(s, 'The dead longships sink back into their barrow. They will wait.'); return; }
  for (const id of left) { const e = s.enemies.get(id); if (Math.hypot(e.x - p.x, e.z - p.z) < RAM_R && !(e.ramT > s.t)) { e.ramT = s.t + RAM_CD; e.speed *= 0.3; e.hp -= 8; e.hitT = s.t; s.hull -= RAM; s.hitT = s.t; say(s, 'A draugr longship rams you! Timber screams.'); s.events.push({ type: 'hit' }); puff(s, 'splash', (e.x + p.x) / 2, 2, (e.z + p.z) / 2, 0.9, { sc: 2.6 }); } }
  if (!left.length) {
    s.draugr = null; (s.slain ||= []).push(d.barrow); s.gold += BONUS; s.score += BONUS; s.killsBy.barrow = (s.killsBy.barrow || 0) + 1;
    say(s, `The last draugr goes down and the green fire dies. The barrow is at rest. +${BONUS} gold from the grave-silver.`); s.events.push({ type: 'quest' });
  }
}
