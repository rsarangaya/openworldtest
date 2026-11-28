// Wrecks and salvage, the first pass at "underwater". A few old wrecks lie in open water in every world, rumoured on notice boards and in
// taverns with a bearing. Floating barrels and crates mark the spot. Stop over one, press F, and a diver goes down; a few seconds later
// they come up with gold and sometimes cargo. Each wreck gives DIVES dives (the last brings up the strongbox), then it is stripped (saved
// in s.salvage, per world). No diving in a storm, under way, or with enemies about; trouble while the diver is down hauls them back up.
// A dive can go wrong: the two far-out wrecks lie deep, and a rough swell makes any dive risky. Then the diver either comes up empty
// (the dive does not count) or comes up hurt with half the coins and no cargo, and has to rest before going down again. Calm water
// over a shallow wreck is safe.
import { GOODS } from '../gen/world.js';
import { rngFor, hash } from '../gen/rng.js';
import { shipName } from '../gen/names.js';
import { seaSpots, compassWord } from './serpent.js';
import { cargoCount } from './trade.js';

export const DIVES = 3, DIVE_S = 6, DIVE_R = 35, STILL = 2, SAFE_R = 200, BOX = [160, 260], REST_S = 90;
const realm = (s) => s.realm || 'terra';
// the wrecks of a world: [{ id, x, z, name, good }], deterministic per world seed
const memo = new Map();
export const wrecks = (seed, th = '') => memo.get(seed) || memo.set(seed, seaSpots(seed, [[0.16, 0.36], [0.4, 0.6], [0.62, 0.8], [0.82, 0.94]], 9100, 'wreck').map((w, i) => ({ ...w, name: shipName(rngFor(seed, 9150 + i), th), good: GOODS[hash(seed, 9160 + i) % GOODS.length], deep: i >= 2 }))).get(seed);
const keyOf = (s, w) => realm(s) + ':' + w.id;
export const divesLeft = (s, w) => DIVES - ((s.salvage || {})[keyOf(s, w)] || 0);
// the chance dive n goes wrong: deep water (the strongbox more so) and the swell (rough 0..1)
export const diveRisk = (w, n, rough) => (w.deep ? 0.12 + (n >= DIVES ? 0.06 : 0) : 0) + 0.3 * Math.max(0, Math.min(1, rough));
const HURT = { terra: 'bitten by a moray eel', asgard: 'numb with the cold', atlantis: 'stung by a jellyfish', olympus: 'spiked on a sea urchin bed' };
const all = (s) => wrecks(s.seed, realm(s) === 'terra' ? '' : realm(s)), live = (s) => all(s).filter((w) => divesLeft(s, w) > 0);
// the wreck under the ship (within reach of a diver), or null
export function wreckHere(s) { const p = s.ship; return (p && all(s).find((w) => Math.hypot(w.x - p.x, w.z - p.z) < DIVE_R && divesLeft(s, w) > 0)) || null; }
// wrecks worth drawing near (x, z): their floating debris
export const wrecksNear = (s, x, z, r) => live(s).filter((w) => Math.hypot(w.x - x, w.z - z) < r);
export function wreckRumour(s, x, z) {
  let best = null, bd = 1e9; for (const w of live(s)) { const d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; best = w; } }
  if (!best) return null; (s.salvage ||= {})[keyOf(s, best)] ??= 0; // heard of: the chart map marks roughly where she lies
  return `${realm(s) === 'asgard' ? 'A trader swears' : realm(s) === 'atlantis' ? 'A pearl diver swears' : realm(s) === 'olympus' ? 'A sponge diver swears' : 'An old diver swears'} the ${best.name.replace(/^The /, '')} went down ${bd > 2500 ? 'far out' : bd > 1200 ? 'a long sail' : 'not far'} to the ${compassWord(best.x - x, best.z - z)} with ${best.good} in her hold. Barrels still float over the spot. Heave to above her and send a diver down.`;
}
// the wrecks of the world you are in, for its chart map: the ones you have heard of (dives 0) or dived on, with how many dives they have had
export const chartWrecks = (s) => all(s).flatMap((w) => { const n = (s.salvage || {})[keyOf(s, w)]; return n === undefined ? [] : [{ ...w, dives: n, stripped: n >= DIVES }]; });
// F at sea over a wreck: send the diver down, or say why not. danger(s) is true while a foe is close.
// says why a diver cannot go down right now and returns true, or returns false when they can
export function diveBlocked(s, say, stormy, danger) {
  if (s.dive) return true;
  if (s.t < (s.diveRest || 0)) { say(s, `Your diver is still getting over the last dive: ${Math.ceil(s.diveRest - s.t)} s more.`); return true; }
  if (stormy) { say(s, 'Too rough to dive: wait for the storm to pass.'); return true; }
  if (danger(s, SAFE_R)) { say(s, 'Not with enemies about. Deal with them first.'); return true; }
  if (Math.abs(s.ship.speed) > STILL) { say(s, 'Heave to first: take in the sail (S) until she barely drifts.'); return true; }
  return false;
}
export function startDive(s, w, say, stormy, danger, rough = 0) {
  const p = s.ship;
  if (diveBlocked(s, say, stormy, danger)) return;
  s.dive = { id: w.id, t0: s.t }; s.auto = false; s.row = false; p.sail = 0;
  const r = diveRisk(w, DIVES - divesLeft(s, w) + 1, rough), sw = rough > 0.15;
  say(s, `Your diver goes over the side and down to the ${w.name.replace(/^The /, '')}...${r <= 0 ? '' : w.deep && sw ? ' Deep water and a heavy swell: a risky dive.' : w.deep ? ' She lies deep: a risky dive.' : ' The swell makes it a risky dive.'}`); s.events.push({ type: 'splash' });
}
const DEN = { name: "The kraken's den", deep: true }; // a diver sent down to the kraken's den (kraken.js) is drawn like any other dive
// what the dive view shows: the wreck (or the den), how far through the dive (k 0..1), the diver's depth (0 surface .. 1 at the bottom) and what they are doing
export function diveStage(s) {
  const d = s.dive, w = d && (d.den ? DEN : all(s).find((q) => q.id === d.id)); if (!w) return null;
  if (d.swim) return { w, k: 0.5, phase: 'swim', depth: Math.max(0, Math.min(1, d.swim.y / d.swim.floor)), realm: realm(s), last: divesLeft(s, w) === 1, den: false, swim: d.swim };
  const k = Math.max(0, Math.min(1, (s.t - d.t0) / DIVE_S)), phase = k < 0.4 ? 'down' : k < 0.75 ? 'search' : 'up';
  return { w, k, phase, depth: phase === 'down' ? k / 0.4 : phase === 'search' ? 1 : 1 - (k - 0.75) / 0.25, realm: realm(s), last: !d.den && divesLeft(s, w) === 1, den: !!d.den };
}
// a step at sea while a diver is down: hold the ship still, haul them up on trouble, pay out when they surface
export function stepDive(s, dt, say, puff, danger, rough = 0, swim) {
  const d = s.dive; if (!d) return; const p = s.ship, w = live(s).find((q) => q.id === d.id);
  p.speed *= 1 - Math.min(1, dt * 2); p.sail = 0;
  if (!w || danger(s, SAFE_R * 0.75)) { s.dive = null; say(s, 'Trouble! Your diver is hauled back up empty-handed.'); return; }
  if (d.swim) return stepSwim(s, w, dt, say, puff, swim);
  if (s.t - d.t0 < DIVE_S) return;
  s.dive = null; const k = keyOf(s, w), n = ((s.salvage ||= {})[k] || 0) + 1, name = w.name.replace(/^The /, '');
  const risk = diveRisk(w, n, rough), roll = (hash(s.seed, 9200 + n, (d.t0 * 10) | 0) % 1000) / 1000, hurt = roll < risk / 2;
  if (roll < risk && !hurt) { say(s, `The line fouls on the ${name} and your diver has to cut free. They come up empty-handed; the haul is still down there.`); s.events.push({ type: 'splash' }); return; }
  s.salvage[k] = n; if (hurt) s.diveRest = s.t + REST_S;
  const last = n >= DIVES, gold = (last ? BOX[0] + (hash(s.seed, 9170 + w.id.length + n) % (BOX[1] - BOX[0])) : 40 + (hash(s.seed, 9180 + n, w.x | 0) % 70)) >> (hurt ? 1 : 0);
  const room = Math.max(0, s.hold - cargoCount(s)), c = last || hurt ? 0 : Math.min(room, 1 + (hash(s.seed, 9190 + n, w.z | 0) % 2));
  s.gold += gold; s.score += gold; if (c) s.cargo[w.good] = (s.cargo[w.good] || 0) + c;
  if (last) s.killsBy.wreck = (s.killsBy.wreck || 0) + 1;
  puff(s, 'splash', p.x + Math.cos(p.yaw + 1.57) * 3, 0.6, p.z + Math.sin(p.yaw + 1.57) * 3, 0.8, { sc: 1.6 });
  if (hurt) say(s, `Your diver comes up ${HURT[realm(s)] || HURT.terra}, clutching ${last ? `the ${name}'s strongbox` : 'a few coins'}. +${gold} gold.${last ? ' The wreck is stripped.' : ''} They need ${REST_S} s to recover before the next dive.`);
  else say(s, last ? `Your diver comes up with the ${name}'s strongbox! +${gold} gold. Nothing more down there: the wreck is stripped.` : `Your diver surfaces with coins${c ? ` and ${c} ${w.good}` : room ? '' : ' (the hold is full, so the cargo stays down there)'}. +${gold} gold. ${DIVES - n} more dive${DIVES - n > 1 ? 's' : ''} should strip her.`);
  s.events.push({ type: 'coin' });
}
// Going down with the diver (round 131): where the diver is in the water and what they look at, for the first-person view under the surface.
// The line runs from the ship's side to the wreck (or the den) on the sea floor; the diver circles her while searching, then climbs the line again.
export const FLOOR = { near: 16, deep: 26 }; // how far down the sea floor lies under a near wreck and a deep one (and the den)
export function diverAt(s, d = diveStage(s)) {
  if (!d || !s.ship) return null;
  if (d.swim) { const q = d.swim; return { x: q.x, y: q.y, z: q.z, wx: d.w.x, wz: d.w.z, floor: q.floor, yaw: q.yaw || 0, pitch: 0, swim: q }; }
  const p = s.ship, m = d.den && s.kraken, wx = d.den ? (m ? m.lx : p.x) : d.w.x, wz = d.den ? (m ? m.lz : p.z) : d.w.z, fy = -(d.w.deep ? FLOOR.deep : FLOOR.near);
  const sx = p.x - Math.sin(p.yaw) * 3, sz = p.z + Math.cos(p.yaw) * 3, a0 = Math.atan2(sz - wz, sx - wx), e = (u) => u * u * (3 - 2 * u);
  let x, y, z;
  if (d.phase === 'search') { const a = a0 + ((d.k - 0.4) / 0.35) * 2.4; x = wx + Math.cos(a) * 16; z = wz + Math.sin(a) * 16; y = fy + 4.5; }
  else { const u = e(d.depth), bx = wx + Math.cos(d.phase === 'up' ? a0 + 2.4 : a0) * 16, bz = wz + Math.sin(d.phase === 'up' ? a0 + 2.4 : a0) * 16; x = sx + (bx - sx) * u; z = sz + (bz - sz) * u; y = -2.4 + (fy + 4.5 + 2.4) * u; }
  return { x, y, z, wx, wz, floor: fy, yaw: Math.atan2(wz - z, wx - x), pitch: Math.atan2(fy + 1.5 - y, Math.hypot(wx - x, wz - z) || 1) };
}
// Swimming the dive yourself (round 132, underwater in 3D, step 2). Going down with the diver (V) hands you the diver: swim where you look
// with W/S, A/D to the side, Space up, and pick up the casks of coins and cargo crates lying round the wreck (the strongbox by her hull on the
// last dive) by swimming to them. Air runs out in AIR_S seconds (less in a swell); come up beside the ship to bank what you carry. Out of air,
// the crew hauls you up gasping: half the coins, the cargo dropped, and a rest before the next dive. A swim dive with nothing found does not count.
export const AIR_S = 45, SWIM_V = 4.2, GRAB_R = 2.4, SURF_R = 12, ROAM_R = 44;
// what lies on the floor for dive n of a wreck: [{ x, z, k: 'coin' | 'crate' | 'box', v }]
export function swimLoot(s, w, n) {
  const last = n >= DIVES, r = (i, q) => hash(s.seed, 9300 + n * 7 + i, q) % 1000 / 1000, at = (i, r0, r1) => { const a = r(i, 1) * 6.283, d = r0 + r(i, 2) * (r1 - r0); return { x: w.x + Math.cos(a) * d, z: w.z + Math.sin(a) * d }; };
  if (last) return [{ ...at(0, 3, 5), k: 'box', v: BOX[0] + (hash(s.seed, 9170 + w.id.length + n) % (BOX[1] - BOX[0])) }];
  const gold = 40 + (hash(s.seed, 9180 + n, w.x | 0) % 70), out = [];
  for (let i = 0; i < 3; i++) out.push({ ...at(i, 6, 26), k: 'coin', v: Math.round(gold * (i < 2 ? 0.4 : 0.2)) });
  for (let i = 0, c = 1 + (hash(s.seed, 9190 + n, w.z | 0) % 2); i < c; i++) out.push({ ...at(3 + i, 8, 30), k: 'crate', v: 1 });
  return out;
}
// hand the diver to the player: from where the diver is now, or from the ship's side at the start
export function startSwim(s, rough = 0) {
  const d = s.dive; if (!d || d.den || d.swim) return false; const w = all(s).find((q) => q.id === d.id); if (!w) return false;
  const v = diverAt(s), n = DIVES - divesLeft(s, w) + 1;
  d.swim = { x: v.x, y: v.y, z: v.z, floor: v.floor, air: AIR_S * (1 - 0.3 * Math.max(0, Math.min(1, rough))), loot: swimLoot(s, w, n), gold: 0, crates: 0, box: 0, n };
  return true;
}
// one step of a swim dive. inp: { mx, mz, up, yaw, pitch } (the look sets the way W swims)
function stepSwim(s, w, dt, say, puff, inp = {}) {
  const d = s.dive, sw = d.swim, p = s.ship, yaw = inp.yaw ?? 0, pitch = inp.pitch ?? 0, cp = Math.cos(pitch), mz = inp.mz || 0, mx = inp.mx || 0;
  let vx = Math.cos(yaw) * cp * mz - Math.sin(yaw) * mx, vy = Math.sin(pitch) * mz + (inp.up ? 1 : 0), vz = Math.sin(yaw) * cp * mz + Math.cos(yaw) * mx; const l = Math.hypot(vx, vy, vz);
  if (l > 1) { vx /= l; vy /= l; vz /= l; } sw.yaw = yaw;
  sw.x += vx * SWIM_V * dt; sw.y = Math.max(sw.floor + 1, Math.min(-0.8, sw.y + vy * SWIM_V * dt)); sw.z += vz * SWIM_V * dt;
  const ox = sw.x - w.x, oz = sw.z - w.z, od = Math.hypot(ox, oz); if (od > ROAM_R) { sw.x = w.x + ox / od * ROAM_R; sw.z = w.z + oz / od * ROAM_R; } // the line holds you to the wreck
  for (const it of sw.loot) if (!it.got && Math.hypot(it.x - sw.x, it.z - sw.z, sw.floor + 0.6 - sw.y) < GRAB_R) {
    if (it.k === 'crate' && cargoCount(s) + sw.crates >= s.hold) { if (s.t - (sw.fullT || -9) > 4) { sw.fullT = s.t; say(s, 'A crate of ' + w.good + ', but the hold is full: leave it.'); } continue; }
    it.got = true; if (it.k === 'crate') sw.crates++; else { sw.gold += it.v; if (it.k === 'box') sw.box = it.v; }
    say(s, it.k === 'box' ? `The ${w.name.replace(/^The /, '')}'s strongbox! Swim it up to the ship.` : it.k === 'crate' ? `A crate of ${w.good}, roped to your belt.` : `A little cask of coins: ${it.v} gold.`); s.events.push({ type: 'coin' });
  }
  sw.air -= dt;
  const atShip = sw.y >= -1.2 && Math.hypot(sw.x - p.x, sw.z - p.z) < SURF_R;
  if (atShip || sw.leave) return endSwim(s, w, say, puff, false);
  if (sw.air <= 0) return endSwim(s, w, say, puff, true);
}
// the swim ends: at the ship (or V back on deck sets leave: up the line), or out of air
function endSwim(s, w, say, puff, gasp) {
  const sw = s.dive.swim, p = s.ship, name = w.name.replace(/^The /, ''), k = keyOf(s, w); s.dive = null; s.salvage ||= {};
  const gold = gasp ? (sw.gold - (sw.box || 0)) >> 1 : sw.gold, crates = gasp ? 0 : sw.crates, any = gold > 0 || crates > 0;
  puff(s, 'splash', p.x + Math.cos(p.yaw + 1.57) * 3, 0.6, p.z + Math.sin(p.yaw + 1.57) * 3, 0.8, { sc: 1.6 });
  if (gasp) s.diveRest = s.t + REST_S;
  if (!any) { say(s, gasp ? `Out of air! The crew hauls you up the line, coughing, with nothing. You need ${REST_S} s before the next dive.` : `Back on deck with nothing from the ${name}: the haul is still down there.`); s.events.push({ type: 'splash' }); return; }
  const box = sw.box && !gasp; s.salvage[k] = box ? DIVES : Math.min(DIVES - 1, sw.n); // the strongbox dropped in a gasp stays down: she is not stripped yet
  s.gold += gold; s.score += gold; if (crates) s.cargo[w.good] = (s.cargo[w.good] || 0) + crates;
  if (box) s.killsBy.wreck = (s.killsBy.wreck || 0) + 1;
  const left = DIVES - s.salvage[k], what = `${gold} gold${crates ? ` and ${crates} ${w.good}` : ''}`;
  say(s, gasp ? `Out of air! The crew hauls you up the line, coughing; you let go of ${sw.box ? 'the strongbox, ' : ''}${sw.crates ? 'the crates and ' : ''}half the coins. +${gold} gold. You need ${REST_S} s before the next dive.`
    : box ? `You haul the ${name}'s strongbox up beside the ship! +${gold} gold. The wreck is stripped.` : `You surface beside the ship with ${what}. ${left} more dive${left > 1 ? 's' : ''} should strip her.`);
  s.events.push({ type: 'coin' });
}
