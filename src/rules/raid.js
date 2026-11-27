// Land battles, first pass (PLAN item 9): now and then a raider landing party comes ashore at the dock of the port you are walking in. The town's guards turn out
// from their station (Iron Tide members also get two of the company's sell-swords) and fight it; you can fight beside them or stand back. Raiders strike at
// whoever is nearest, you included. Beat them all and the town pays for each one you cut down and remembers it; if they are still ashore after RAID_S, or the
// guards are all down, or you are knocked senseless, they set the town burning and row off. Leaving the island settles it by numbers. Pure functions on the state;
// the game passes its helpers in H (say, walk, ground, near, spray, station, burn).
import { hash } from '../gen/rng.js';
import { mercOf } from './mercs.js';
import { addWorld, addLocal } from './rep.js';
import { shieldOf } from './sidequests.js';

export const ON_YOU = 2, RAID_HP = 50, RAID_HIT = 6, RAID_SPEED = 3.3, DEF_HP = 80, DEF_HIT = 8, DEF_SPEED = 3.6, REACH = 1.9, RAID_S = 150, RAID_GAP = 900, RAID_ODDS = 6, RAID_PAY = 45;
export const NPC_HIT = 0.5; // guards and raiders hit each other at half strength, so a fight lasts long enough (20-35 s) for you to get there and join in
export const PARTY = { village: 3, town: 4, city: 5 }, WATCH = { village: 2, town: 3, city: 4 };
export const raidOf = (s) => s.raid || null;
const alive = (q) => q.filter((o) => o.hp > 0);

// the landing party and the defenders, placed on dry land: raiders at the shore end of the dock, guards at their station's door (or the plaza)
export function startRaid(s, isl, H) {
  if (s.raid || !isl?.port) return null; const n = PARTY[isl.tier] || 3, d = isl.port.dock, st = H.station(isl), seed = hash(s.seed, isl.id, s.t | 0, 61);
  const put = (x, z, k, extra) => { const p = H.near(s, x, z, 1.2 + k * 1.1); return p && { id: k, seed: hash(seed, k, extra.kind.length), x: p.x, z: p.z, y: p.y, cd: 1 + k * 0.2, ...extra }; };
  const foes = [], defs = [];
  for (let k = 0; k < n; k++) { const o = put(d.x1, d.z1, k, { kind: 'raider', hp: RAID_HP }); if (o) foes.push(o); }
  for (let k = 0; k < (WATCH[isl.tier] || 2); k++) { const o = put(st.x, st.z, k, { kind: 'warden', hp: DEF_HP }); if (o) defs.push(o); }
  if (mercOf(s)?.co === 'tide') for (let k = 0; k < 2; k++) { const o = put(d.x1, d.z1, k + 6, { kind: 'sailor', hp: DEF_HP, merc: true }); if (o) defs.push(o); }
  if (!foes.length) return null;
  s.raid = { isl: isl.id, name: isl.port.name, t0: s.t, n: foes.length, mine: 0, foes, defs }; s.raidT = s.t;
  H.say(s, `Raiders! A landing party of ${foes.length} comes ashore at ${isl.port.name}'s dock. ${defs.some((q) => q.merc) ? 'The guards and two Iron Tide sell-swords' : 'The guards'} turn out to meet them; the townsfolk run indoors.`); s.events?.push({ type: 'hit' });
  return s.raid;
}

// once every 30 s on foot in a quiet port: the odds of a landing (none in the first two minutes, none within RAID_GAP of the last one)
export function raidRoll(s, isl, quiet) {
  if (!quiet || s.raid || !isl?.port || s.t < 120 || s.t - (s.raidT ?? -1e9) < RAID_GAP) return false;
  return hash(s.seed, isl.id, Math.floor(s.t / 30), 62) % 100 < RAID_ODDS;
}

// a strike from the player's sword: the nearest raider in reach and in front; true when one was hit
export function hitRaider(s, w, f, fx, fz, H) {
  const r = s.raid; if (!r) return false; let best = null, bd = w.reach;
  for (const o of r.foes) { if (o.hp <= 0) continue; const dx = o.x - f.x, dz = o.z - f.z, d = Math.hypot(dx, dz); if (d < bd && (dx * fx + dz * fz) / (d || 1) > w.cone * 0.6) { bd = d; best = o; } }
  if (!best) return false; best.hp -= w.dmg; best.hitT = r.hitT = s.t; H.spray(s, best.x, best.y + 1.3, best.z, 4);
  if (best.hp <= 0) { r.mine++; fall(s, best); const left = alive(r.foes).length; H.say(s, left ? `You cut down a raider. ${left} left.` : 'You cut down the last raider.'); s.events?.push({ type: 'kill' }); }
  return true;
}
const fall = (s, o) => (s.fallen ||= []).push({ x: o.x, y: o.y, z: o.z, seed: o.seed, t: s.t });

// one frame of the fight; the player is at f, standing on island `here` (null when not on the raid's island)
export function stepRaid(s, dt, here, H) {
  const r = s.raid; if (!r) return; const f = s.foot;
  if (s.mode !== 'foot' || here?.id !== r.isl) return endRaid(s, H, 'away');
  const fs = alive(r.foes), ds = alive(r.defs);
  if (!fs.length) return endRaid(s, H, 'won');
  if (s.hp <= 0) return endRaid(s, H, 'down');
  if (!ds.length && s.t - r.t0 > 20 && s.t - (r.hitT ?? -99) > 10 || s.t - r.t0 > RAID_S) return endRaid(s, H, 'sacked'); // the guards down and you not fighting, or time up
  const jailed = s.jailUntil > s.t; let onYou = 0;
  for (const o of fs) { // a raider goes for the nearest defender; for you only when you are close or have struck it, and never more than ON_YOU at once
    let tg = null, td = 1e9; for (const q of ds) { const d = Math.hypot(q.x - o.x, q.z - o.z); if (d < td) { td = d; tg = q; } }
    const dy = Math.hypot(f.x - o.x, f.z - o.z); if (!jailed && onYou < ON_YOU && (dy < 3.5 || s.t - (o.hitT ?? -99) < 8 || !tg) && dy <= td) { tg = f; td = dy; onYou++; }
    if (!tg) continue; o.cd = Math.max(0, o.cd - dt); o.face = Math.atan2(tg.z - o.z, tg.x - o.x);
    if (td > REACH) chase(s, o, tg, td, RAID_SPEED * dt, H);
    else if (o.cd <= 0) { o.best = undefined; o.cd = 1.3; o.atk = s.t; if (tg === f) { s.hp -= RAID_HIT * shieldOf(s); s.hurtT = s.t; s.events?.push({ type: 'hit' }); if (s.hp <= 0) return endRaid(s, H, 'down'); } else { tg.hp -= RAID_HIT * NPC_HIT; tg.hitT = s.t; if (tg.hp <= 0) { fall(s, tg); H.say(s, tg.merc ? 'An Iron Tide sell-sword falls.' : 'A guard falls.'); } } }
  }
  for (const q of ds) { // a defender goes for the nearest raider
    let tg = null, td = 1e9; for (const o of fs) { if (o.hp <= 0) continue; const d = Math.hypot(o.x - q.x, o.z - q.z); if (d < td) { td = d; tg = o; } }
    if (!tg) break; q.cd = Math.max(0, q.cd - dt); q.face = Math.atan2(tg.z - q.z, tg.x - q.x);
    if (td > REACH) chase(s, q, tg, td, DEF_SPEED * dt, H);
    else if (q.cd <= 0) { q.best = undefined; q.cd = 1.1; q.atk = s.t; tg.hp -= DEF_HIT * NPC_HIT; tg.hitT = s.t; if (tg.hp <= 0) fall(s, tg); }
  }
}

// close in on a target, each fighter from its own side (so a crowd does not stand in one spot); hung up on a wall or prop for 4 s, it comes round by another way
function chase(s, o, tg, d, sp, H) {
  if (o.tg !== tg || o.best === undefined || d < o.best - 0.5) { o.tg = tg; o.best = d; o.bestT = s.t; }
  else if (s.t - o.bestT > 4) { const p = H.round(s, o, tg); if (p) { o.x = p.x; o.z = p.z; o.y = p.y; } o.best = undefined; }
  const a = o.id * 2.1 + (o.kind === 'raider' ? 0 : 1); H.walk(s, o, tg.x + Math.cos(a) * 1.1, tg.z + Math.sin(a) * 1.1, sp);
}
// how it ends: won (paid per raider you cut down, and the town and realm remember it), held (the guards won while you were away or down), or the town is set burning
export function endRaid(s, H, how) {
  const r = s.raid; if (!r) return; s.raid = null;
  if ((how === 'away' || how === 'down') && alive(r.foes).length <= alive(r.defs).length) how = 'held'; // you left, or lie senseless: settled by numbers
  if (how === 'won') {
    const pay = r.mine * RAID_PAY; if (pay) { s.gold += pay; s.score += pay; s.events?.push({ type: 'coin' }); }
    if (r.mine) { addLocal(s, r.isl, 4 + 2 * r.mine); addWorld(s, 1); }
    H.say(s, r.mine ? `The raiders are beaten off. ${r.name} pays you ${pay} gold for the ${r.mine} you cut down, and will remember it.` : `The guards beat the raiders off. ${r.name} is safe.`);
  } else if (how === 'held') H.say(s, `${s.hp <= 0 ? 'While you lie senseless the guards' : `Word comes from ${r.name}: the guards`} beat the raiders off.`);
  else { H.burn(s, r.isl); H.say(s, how === 'down' ? `While you lie senseless the raiders loot ${r.name} and set it burning.` : `The raiders loot ${r.name}, set it burning and row off.`); }
  return how;
}
