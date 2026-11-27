// Thieves at night, first pass (PLAN item 7): after dark, walking a port, now and then a cutpurse bumps into you, takes part of your purse and runs for the
// lanes. Run him down (he is a little slower than you running, and tires) and strike him: he drops the purse, and the town thanks you; lose sight of him
// (THIEF_FAR away, or THIEF_S gone by, or you leave the island) and the gold is gone. On a "Cutpurses Abroad" night (events.js) they are out more often and the
// watch pays a reward for each one brought down. Pure functions on the state; the game passes its helpers in H (say, walk, near, spray, ev).
import { hash } from '../gen/rng.js';
import { addLocal } from './rep.js';
import { isNight, nowHour } from './daynight.js';

export const THIEF_HP = 18, THIEF_SPEED = 6.2, THIEF_TIRED = 5.0, THIEF_FAR = 30, THIEF_S = 30, THIEF_GAP = 240, THIEF_ODDS = 8, THIEF_ODDS_EV = 30, THIEF_REWARD = 30, THIEF_MIN = 10;
export const take = (gold) => Math.min(80, Math.max(5, Math.floor(gold * 0.15))); // what a cutpurse gets away with: a sixth or so of the purse, 5-80 gold
export const thiefOf = (s) => s.thief || null;

// once every 20 s on foot in a quiet port at night: the odds of a cutpurse (higher on a cutpurse night; none within THIEF_GAP of the last, none on a thin purse)
export function thiefRoll(s, isl, quiet, ev) {
  if (!quiet || s.thief || !isl?.port || s.gold < THIEF_MIN || !isNight(nowHour(s)) || s.t - (s.thiefT ?? -1e9) < THIEF_GAP) return false;
  return hash(s.seed, isl.id, Math.floor(s.t / 20), 63) % 100 < (ev?.thief ? THIEF_ODDS_EV : THIEF_ODDS);
}

// the bump: he appears at your elbow, the gold leaves your purse, and he runs
export function startThief(s, isl, H) {
  if (s.thief || !isl?.port) return null; const f = s.foot, p = H.near(s, f.x, f.z, 1.4); if (!p) return null;
  const amt = Math.min(s.gold, take(s.gold)); if (amt <= 0) return null;
  const kid = H.kid?.(s); if (kid) { s.thiefT = s.t; H.say(s, `${kid} grabs a wrist at your elbow: "Not this purse, friend." A cutpurse runs off into the dark empty-handed.`); return null; } // one thief knows another
  s.gold -= amt; s.thief = { isl: isl.id, name: isl.port.name, seed: hash(s.seed, isl.id, s.t | 0, 64), x: p.x, z: p.z, y: p.y, hp: THIEF_HP, amt, t0: s.t, face: 0, walk: 0 }; s.thiefT = s.t;
  H.say(s, `Someone bumps you in the dark. Your purse is ${amt} gold lighter! A cutpurse runs for the lanes: after him!`); s.events?.push({ type: 'hit' });
  return s.thief;
}

// a strike from the player: the cutpurse, if he is in reach and in front; true when he was hit
export function hitThief(s, w, f, fx, fz, H) {
  const o = s.thief; if (!o) return false; const dx = o.x - f.x, dz = o.z - f.z, d = Math.hypot(dx, dz);
  if (d >= w.reach + 0.4 || (dx * fx + dz * fz) / (d || 1) < w.cone * 0.6) return false;
  o.hp -= w.dmg; o.hitT = s.t; H.spray(s, o.x, o.y + 1.3, o.z, 3); if (o.hp <= 0) endThief(s, H, 'caught'); return true;
}

// one frame of the chase; the player stands on island `here` (null when off it)
export function stepThief(s, dt, here, H) {
  const o = s.thief; if (!o) return; const f = s.foot;
  if (s.mode !== 'foot' || here?.id !== o.isl) return endThief(s, H, 'away');
  const dx = o.x - f.x, dz = o.z - f.z, d = Math.hypot(dx, dz) || 1;
  if (d > THIEF_FAR || s.t - o.t0 > THIEF_S) return endThief(s, H, 'gone');
  if (s.t - (o.hitT ?? -9) < 0.35) return; // he staggers when struck
  const sp = (s.t - o.t0 < 8 ? THIEF_SPEED : THIEF_TIRED) * dt, a = Math.atan2(dz, dx) + Math.sin((s.t - o.t0) * 0.7 + (o.seed & 7)) * 0.6; // away from you, weaving
  if (!H.walk(s, o, o.x + Math.cos(a) * 6, o.z + Math.sin(a) * 6, sp)) { o.stuck = (o.stuck || 0) + dt; if (o.stuck > 0.4) { o.stuck = 0; o.side = -(o.side || 1); H.walk(s, o, o.x - Math.sin(a) * 6, o.z + Math.cos(a) * 6, sp); } } // cornered: he tries along the wall
}

// how it ends: caught (the purse back, the town's thanks and on a cutpurse night the watch's reward) or gone (the gold with him)
export function endThief(s, H, how) {
  const o = s.thief; if (!o) return; s.thief = null;
  if (how === 'caught') {
    const pay = H.ev?.(s, o.isl)?.thief ? THIEF_REWARD : 0; s.gold += o.amt + pay; s.score += pay; addLocal(s, o.isl, 2); (s.fallen ||= []).push({ x: o.x, y: o.y, z: o.z, seed: o.seed, t: s.t });
    H.say(s, `You bring the cutpurse down and take back your ${o.amt} gold.${pay ? ` The watch pays ${pay} gold for him.` : ''}`); s.events?.push({ type: 'coin' });
  } else H.say(s, `The cutpurse is lost in the dark lanes of ${o.name}, and your ${o.amt} gold with him.`);
  return how;
}
