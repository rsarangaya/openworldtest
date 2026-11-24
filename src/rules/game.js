// Game rules, stepped at a fixed rate with no drawing code, so they run (and are tested) in plain Node.
// Two modes: 'foot' (first person, on land) and 'ship' (third person, at sea).
import { SECTOR, WALL_R, GATE_HALF, TAU, sectorOf, sectorIslands, sectorEnemies, islandTown, islandHeight, walkHeight, questWorld, gatePos, KINDS } from '../gen/world.js';
import { sailEfficiency, windAt, windAngle, polar, pointOfSail } from './sea.js';
import { weaponOf, equip, WEAPON_ORDER } from './weapons.js';
import { deed, forgive, shunned, localRep, addLocal as addLocalRep } from './rep.js';
import { cargoCount } from './trade.js';
import { shipOf } from './ships.js';
import { advanceQuests, dialog, currentQuest } from './quests.js';
import { hash, rngFor } from '../gen/rng.js';
import { shipName, captainName } from '../gen/names.js';
import { islandProps } from '../gen/props.js';
import { townsfolk, folkPos } from '../gen/world.js';

export const DT = 1 / 60;
export const ROW_SPEED = 4.5, MAX_SPEED = 15, CANNON_RANGE = 75, CANNON_CD = 2.2, DOCK_RANGE = 24;
const wrapPi = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);

// a start spot with open space all round it (nothing solid within 2.4)
const roomy = (s, x, z) => { for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; for (const q of [1.2, 2.4]) if (blocked(s, x + Math.cos(a) * q, z + Math.sin(a) * q)) return false; } return !blocked(s, x, z); };
export function newGame(seed = 1717) {
  const targets = questWorld(seed), home = sectorIslands(seed, 0, 0)[0], plaza = islandTown(home).plaza;
  const s = {
    seed, t: 0, mode: 'foot', gold: 500, food: 0, hull: 100, maxHull: 100, hold: 20, cargo: {}, upgrades: {}, flags: {}, found: new Set(), dead: new Set(),
    kills: 0, killsBy: {}, npcs: {}, murders: 0, rep: { world: 0, local: {} }, bounty: 0, bountyGold: 0, weapon: 'fists', weapons: {}, jailUntil: -1, hp: 100, maxHp: 100, hurtT: -99, guards: [], sinking: [], fx: [], hitT: -99, alert: {}, guardT: {}, score: 0, quest: 0, targets, ship: null, foodT: 0, msgT: 0,
    foot: { x: plaza.x, z: plaza.z, y: plaza.y, yaw: 0, vy: 0 }, wind: windAt(0), enemies: new Map(), shots: [], log: [], events: [], over: false, ending: false,
  };
  const sw = islandTown(home).npcs.find((n) => n.kind === 'shipwright'); if (sw) s.foot.yaw = Math.atan2(sw.z - plaza.z, sw.x - plaza.x);
  // the plaza centre is the well, so start on the nearest free spot beside it (never inside something solid)
  for (let r = 4.8; r < 9; r += 0.6) { let hit = false; for (let k = 0; k < 24 && !hit; k++) { const a = s.foot.yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.26, x = plaza.x + Math.cos(a) * r, z = plaza.z + Math.sin(a) * r; if (roomy(s, x, z)) { s.foot.x = x; s.foot.z = z; s.foot.y = groundAt(s, x, z); s.foot.yaw = Math.atan2(plaza.z - z, plaza.x - x); hit = true; /* start facing the plaza */ } } if (hit) break; }
  say(s, 'Port Haven. The documentary said the Wall is real. Time to find out.');
  return s;
}
// ---------------------------------------------------------------- effects: short-lived flashes, smoke and splashes (pure data; main.js draws them as sprites). A sunk ship goes to s.sinking, rolls over and slips under, then is gone.
export const SINK_S = 4.5;
export function spray(s, x, y, z, n = 4, sc = 1) { for (let i = 0; i < n; i++) { const a = (hash(s.seed, Math.floor(s.t * 50), i) % 628) / 100, v = 1.2 + (hash(s.seed, i, 3) % 20) / 10; puff(s, 'hurt', x, y, z, 0.55, { vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 2.2 + (hash(s.seed, i, 9) % 15) / 10, sc }); } } // blood-red droplets that fly out and fall (people only)
export function puff(s, k, x, y, z, life, o = {}) { s.fx.push({ k, x, y, z, t0: s.t, life, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, sc: o.sc || 1 }); if (s.fx.length > 90) s.fx.shift(); }
function updateFx(s, dt) {
  for (const f of s.fx) { if (f.k === 'hurt') f.vy -= 9 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; }
  if (s.fx.length) s.fx = s.fx.filter((f) => s.t - f.t0 < f.life);
  if (!s.sinking.length) return;
  for (const k of s.sinking) {
    const a = s.t - k.t0; k.x += Math.cos(k.yaw) * k.speed * dt; k.z += Math.sin(k.yaw) * k.speed * dt; k.speed *= 1 - Math.min(1, dt * 0.9);
    if (a < SINK_S - 1 && Math.floor(a * 3) !== Math.floor((a - dt) * 3)) puff(s, 'smoke', k.x + (hash(k.seed, Math.floor(a * 3)) % 7) - 3, 3 + a, k.z + (hash(k.seed, Math.floor(a * 3), 5) % 7) - 3, 1.6, { vy: 2, sc: 2 });
    if (!k.splashed && a > SINK_S * 0.5) { k.splashed = true; puff(s, 'splash', k.x, 0.5, k.z, 1.1, { sc: 3.2 }); }
  }
  s.sinking = s.sinking.filter((k) => s.t - k.t0 < SINK_S);
}
export const say = (s, m) => { s.log.push(m); if (s.log.length > 6) s.log.shift(); };

export const nearbyIslands = (s, x, z, rad = 1) => {
  const cx = sectorOf(x), cz = sectorOf(z), out = [];
  for (let i = -rad; i <= rad; i++) for (let j = -rad; j <= rad; j++) out.push(...sectorIslands(s.seed, cx + i, cz + j));
  return out;
};
const islandsAt = (s, x, z) => nearbyIslands(s, x, z, 1).filter((i) => Math.hypot(i.x - x, i.z - z) < i.r * 1.7 + 20);
export const groundAt = (s, x, z) => { let h = -4; for (const i of islandsAt(s, x, z)) h = Math.max(h, walkHeight(i, x, z)); return h; };
// is the camera at (x,y,z) inside terrain or a building? (used to pull the chase camera in)
export const camBlocked = (s, x, y, z) => { for (const i of islandsAt(s, x, z)) { if (y < islandHeight(i, x, z) + 1.2) return true; for (const b of islandTown(i).buildings) if (Math.abs(b.x - x) < b.w / 2 + 1 && Math.abs(b.z - z) < b.d / 2 + 1 && y < b.pad + b.h + 4) return true; } return false; };
const PAD = 0.5; // body radius against walls
// solid circles for everything that stands on an island: tree trunks, rocks, the well, stalls, lamps, barrels, counters, shelves (cached per island)
const SOLID = { rack: [[-1, 0, 0.35], [0, 0, 0.35], [1, 0, 0.35]], anvil: [[0, 0, 0.6]], forge: [[0, 0, 0.8]], desk: [[-0.7, 0, 0.45], [0.7, 0, 0.45]], bunk: [[-0.5, 0, 0.5], [0.5, 0, 0.5]], board: [[-1.7, 0, 0.4], [-0.85, 0, 0.4], [0, 0, 0.4], [0.85, 0, 0.4], [1.7, 0, 0.4]], tree: [[0, 0, 0.55]], rock: [[0, 0, 0.7]], bush: [[0, 0, 0.6]], well: [[0, 0, 1.6]], lamp: [[0, 0, 0.35]], sign: [[0, 0, 0.3]], barrel: [[0, 0, 0.6]], crate: [[0, 0, 0.6]], bench: [[-0.6, 0, 0.55], [0.6, 0, 0.55]],
  stall: [[-1.3, 0, 0.9], [0, 0, 0.9], [1.3, 0, 0.9]], counter: [[-1.1, 0, 0.7], [0, 0, 0.7], [1.1, 0, 0.7]], shelf: [[-2.4, 0, 0.7], [-0.8, 0, 0.7], [0.8, 0, 0.7], [2.4, 0, 0.7]] };
const solidCache = new Map();
const solidsOf = (isl) => { let c = solidCache.get(isl.seed); if (!c) { c = []; for (const p of islandProps(isl)) for (const o of SOLID[p.k] || []) c.push([p.x + o[0], p.z + o[1], o[2]]); solidCache.set(isl.seed, c); if (solidCache.size > 80) solidCache.delete(solidCache.keys().next().value); } return c; };
const BODY = 0.45; // the player's radius
const blockedByThings = (s, x, z) => {
  for (const i of islandsAt(s, x, z)) {
    for (const c of solidsOf(i)) if ((c[0] - x) ** 2 + (c[1] - z) ** 2 < (c[2] + BODY) ** 2) return true;
  }
  return false;
};
const blocked = (s, x, z) => {
  if (blockedByThings(s, x, z)) return true; for (const i of islandsAt(s, x, z)) for (const b of islandTown(i).buildings) if (Math.abs(b.x - x) < b.w / 2 + PAD + 0.5 && Math.abs(b.z - z) < b.d / 2 + PAD + 0.5) { for (const w of b.solids) if (x > w[0] - PAD && x < w[1] + PAD && z > w[2] - PAD && z < w[3] + PAD) return true; if (b.bars) for (const w of b.bars) if (x > w[0] - PAD && x < w[1] + PAD && z > w[2] - PAD && z < w[3] + PAD) return true; const gt = b.jail && s.jailUntil > s.t ? b.jail.gate : null; if (gt && x > gt[0] - PAD && x < gt[1] + PAD && z > gt[2] - PAD && z < gt[3] + PAD) return true; } return false; };
// ships are long: test the bow, the stern and the beam against the land, not just the centre point (that let hulls and masts sit inside islands)
const HULL = { trader: [8, 3.5], navy: [12, 2.5], raider: [10, 2.2], ghost: [12, 3] };
export const hullHit = (s, x, z, yaw, L, B) => {
  const list = islandsAt(s, x, z); if (!list.length) return null; const c = Math.cos(yaw), sn = Math.sin(yaw);
  for (const [u, v] of [[0, 0], [1.1, 0], [0.6, 0], [-0.6, 0], [-1, 0], [0.1, 1], [0.1, -1], [-0.7, 1], [-0.7, -1]]) { const px = x + c * u * L - sn * v * B, pz = z + sn * u * L + c * v * B; for (const i of list) if (i.r * 1.5 > Math.hypot(i.x - px, i.z - pz) && islandHeight(i, px, pz) > -0.2) return i; }
  return null;
};
// push a ship that is sitting on the land (moored or just bought) out to sea until her hull is clear
function unstickShip(s) {
  const p = s.ship, c = shipOf(s); if (!p) return;
  for (let k = 0; k < 60; k++) { const i = hullHit(s, p.x, p.z, p.yaw, c.L, c.B); if (!i) return; const d = Math.hypot(p.x - i.x, p.z - i.z) || 1; p.x += (p.x - i.x) / d; p.z += (p.z - i.z) / d; }
}
const hitIsland = (s, x, z) => { for (const i of islandsAt(s, x, z)) if (i.r * 1.5 > Math.hypot(i.x - x, i.z - z) && islandHeight(i, x, z) > -0.2) return i; return null; };

// ---------------------------------------------------------------- on foot
export const canStand = (s, x, z, fromY) => { const h = groundAt(s, x, z); return h >= 0.3 && Math.abs(h - fromY) < 1.6 && !blocked(s, x, z); };
// ---------------------------------------------------------------- people can be hurt and killed. Nothing stops you: every deed is remembered (murders feed the reputation system later).
// A dead shopkeeper's shop is shut until a relative takes over (REOPEN seconds), so the story can never be locked by a murder.
export const REOPEN = 240, PLAYER_HIT = 10;
export const npcMax = (kind) => (kind === 'villager' ? 20 : kind === 'warden' ? 80 : 45);
export const npcAlive = (s, id) => { const q = s.npcs?.[id]; if (!q || !q.dead) return true; if (s.t - q.t >= REOPEN) { delete s.npcs[id]; return true; } return false; };
export const CORPSE_S = 9; // how long a body lies where it fell before it is gone
function hurtNpc(s, id, kind, name, seed, dmg, isl, px = 0, pz = 0) {
  s.npcs ||= {}; const was = (s.npcs[id] || {}).dead; deed(s, 'hurt', isl?.id); crime(s, isl, 5, false); const q = (s.npcs[id] ||= { hp: npcMax(kind) }); q.hp -= dmg; q.hit = s.t;
  if (q.hp > 0) { if (kind !== 'villager' && s.t - (s.callT || -99) > 6) { s.callT = s.t; say(s, name + ': "Stop! Someone help!"'); } return; }
  deed(s, kind === 'villager' ? 'killVillager' : kind === 'warden' ? 'killWarden' : 'killShopkeeper', isl?.id); crime(s, isl, kind === 'villager' ? 60 : kind === 'warden' ? 200 : 120, true); if (shunned(s, isl?.id)) say(s, 'The whole town turns against you.');
  q.dead = true; q.t = s.t; q.x = px; q.z = pz; q.y = groundAt(s, px, pz); q.kind = kind; q.seed = seed; spray(s, px, q.y + 1.2, pz, 8, 1.2); s.murders = (s.murders || 0) + 1; const loot = kind === 'villager' ? 3 + (seed % 8) : kind === 'warden' ? 60 : 20 + (seed % 40); s.gold += loot;
  say(s, `You killed ${name}. You take ${loot} gold from the body.`); if (kind !== 'villager') say(s, 'The shop is shut. Someone will take it over in time.'); s.events.push({ type: 'kill' });
}

// ---------------------------------------------------------------- the law: a crime on a port island raises the alarm; guards (the island's wardens) hunt you on foot, a lost fight is an arrest.
export const GUARD_HP = 60, GUARD_HIT = 6, GUARD_SPEED = 3.5, ALERT_S = 120, WANTED_AT = -25;
const guardCount = (isl) => (isl.tier === 'city' ? 4 : isl.tier === 'town' ? 3 : 2);
export function crime(s, isl, gold, serious) {
  if (!isl || !isl.port) return; s.bountyGold = (s.bountyGold || 0) + gold; if (serious) s.bounty = Math.max(s.bounty, 1);
  s.alert[isl.id] = s.t + ALERT_S; if (!s.alerted) { s.alerted = true; say(s, 'Guards! Guards!'); }
}
export const wantedHere = (s, isl) => !!isl?.port && ((s.alert[isl.id] || 0) > s.t || localRep(s, isl.id) <= WANTED_AT);
// the guard station is a real building (kind 'guard') with a barred cell inside; stationOf gives its front door spot and its jail
const stationCache = new Map();
export const JAIL_S = 8; // how long the cell gate stays shut after an arrest
export const stationOf = (isl) => { let v = stationCache.get(isl.seed); if (v === undefined) { const b = islandTown(isl).buildings.find((q) => q.kind === 'guard'); v = b ? { x: b.x, z: b.z + b.d / 2 + 2.4, b, jail: b.jail } : null; stationCache.set(isl.seed, v); if (stationCache.size > 200) stationCache.delete(stationCache.keys().next().value); } return v; };
function freeSpotNear(s, cx, cz, tx, tz, r0 = 3.2, r1 = 12) {
  const a0 = Math.atan2(tz - cz, tx - cx);
  for (let r = r0; r < r1; r += 0.6) for (let k = 0; k < 24; k++) { const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.26, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (roomy(s, x, z)) return { x, z }; }
  return null;
}
// an arrested player wakes in the cell of the town's guard station, the gate shut for JAIL_S seconds; with no station, in the plaza
function placeAtPlaza(s, isl) {
  const st = stationOf(isl), pl = islandTown(isl).plaza;
  if (st?.jail) { const sp = st.jail.spawn; s.foot = { x: sp.x, z: sp.z, y: groundAt(s, sp.x, sp.z), yaw: Math.PI / 2, vy: 0 }; s.jailUntil = s.t + JAIL_S; return true; }
  const sp = freeSpotNear(s, pl.x, pl.z, pl.x, pl.z + 1, 4.8, 12);
  if (sp) s.foot = { x: sp.x, z: sp.z, y: groundAt(s, sp.x, sp.z), yaw: Math.atan2(pl.z - sp.z, pl.x - sp.x), vy: 0 };
  return false;
}
export function payBounty(s) {
  const pay = Math.min(Math.floor(s.gold), Math.ceil(s.bountyGold || 0)); if (pay <= 0) return 0;
  s.gold -= pay; s.bountyGold = Math.max(0, s.bountyGold - pay); if (s.bountyGold <= 0) { s.bountyGold = 0; s.bounty = 0; s.alert = {}; s.guards = []; } return pay;
}
function arrest(s, isl) {
  let jailed = false; const pay = payBounty(s); s.hp = s.maxHp; s.guards = []; s.alert = {}; s.alerted = false;
  if (isl) { addLocalRep(s, isl.id, Math.max(0, -10 - localRep(s, isl.id)) ); jailed = placeAtPlaza(s, isl); }
  s.foot.vy = 0; s.events.push({ type: 'arrest', yaw: s.foot.yaw }); say(s, `You were beaten and arrested and thrown in ${jailed ? 'the cell at the guard station' : 'the street'}. You paid ${pay} gold in fines${s.bountyGold > 0 ? `, and still owe ${s.bountyGold}` : ''}.`);
}
function stepGuards(s, dt) {
  s.hp = Math.min(s.maxHp, s.hp + (s.t - s.hurtT > 6 ? 2 * dt : 0));
  if (s.mode !== 'foot') { if (s.guards.length) s.guards = []; s.alerted = false; return; }
  const f = s.foot, isl = islandsAt(s, f.x, f.z).find((i) => i.port && Math.hypot(i.x - f.x, i.z - f.z) < i.r * 1.3);
  s.guards = s.guards.filter((g) => g.isl === isl?.id && g.hp > 0);
  if (!isl || !wantedHere(s, isl)) { if (s.guards.length) s.guards = []; if (!isl) s.alerted = false; return; }
  const pl = stationOf(isl) || islandTown(isl).plaza, rad = stationOf(isl) ? 4.5 : 14;
  if (s.guards.length < guardCount(isl) && s.t >= (s.guardT[isl.id] || 0)) {
    s.guardT[isl.id] = s.t + 4; for (let k = 0; k < 12; k++) { const a = hash(s.seed, isl.id, s.t | 0, k) % (stationOf(isl) ? 314 : 628) / 100, /* the station's own side only: guards come out of its front door, never from inside it */ x = pl.x + Math.cos(a) * rad, z = pl.z + Math.sin(a) * rad; if (Math.hypot(x - f.x, z - f.z) > 9 && canStand(s, x, z, groundAt(s, x, z))) { s.guards.push({ id: hash(s.seed, isl.id, s.t | 0, k), seed: hash(isl.id, k, 9), isl: isl.id, x, z, y: groundAt(s, x, z), hp: GUARD_HP, cd: 1 }); break; } }
  }
  for (const g of s.guards) {
    const dx = f.x - g.x, dz = f.z - g.z, d = Math.hypot(dx, dz) || 1; g.cd = Math.max(0, g.cd - dt); g.face = Math.atan2(dz, dx);
    if (d > 2) { // walk at you; a wall in the way makes them steer round it (turn one way, and keep to that side until the way is clear)
      const sp = GUARD_SPEED * dt, base = Math.atan2(dz, dx); let moved = false;
      for (const m of [0, 0.5, 1, 1.6, 2.2]) { for (const sg of m ? [g.side || 1, -(g.side || 1)] : [1]) { const an = base + m * sg, mx = Math.cos(an) * sp, mz = Math.sin(an) * sp; if (canStand(s, g.x + mx, g.z + mz, g.y)) { g.x += mx; g.z += mz; if (m) g.side = sg; moved = true; break; } } if (moved) break; }
      g.y = groundAt(s, g.x, g.z); g.walk = (g.walk || 0) + dt; }
    else if (g.cd <= 0) { g.cd = 1; g.atk = s.t; s.hp -= GUARD_HIT; s.hurtT = s.t; s.events.push({ type: 'hit' }); }
  }
  if (s.hp <= 0) arrest(s, isl);
}
// a sword swing: hits the nearest person in front of you within reach
function swing(s) {
  const w = weaponOf(s), f = s.foot, fx = Math.cos(f.yaw), fz = Math.sin(f.yaw); let best = null, bd = 1e9;
  let bi = null, bx = 0, bz = 0; const consider = (x, z, id, kind, name, seed) => { const dx = x - f.x, dz = z - f.z, d = Math.hypot(dx, dz); if (d < w.reach && d < bd && (dx * fx + dz * fz) / (d || 1) > w.cone) { bd = d; best = [id, kind, name, seed]; bx = x; bz = z; } };
  for (const isl of islandsAt(s, f.x, f.z)) { const b0 = bd;
    for (const n of islandTown(isl).npcs) if (npcAlive(s, n.id)) consider(n.x, n.z, n.id, n.kind, n.name, n.seed);
    for (const v of townsfolk(isl)) { const id = `v${isl.id}:${v.seed}`; if (npcAlive(s, id)) { const p = folkPos(v, s.t); consider(p.x, p.z, id, 'villager', 'the villager', v.seed); } }
    if (bd < b0) bi = isl;
  }
  for (const g of s.guards) { const dx = g.x - f.x, dz = g.z - f.z, d = Math.hypot(dx, dz); if (d < w.reach && d < bd && (dx * fx + dz * fz) / (d || 1) > w.cone * 0.6) { bd = d; g.hp -= w.dmg; g.hitT = s.t; spray(s, g.x, g.y + 1.3, g.z, 4); s.events.push({ type: 'slash', hit: true, w: s.weapon, swing: true }); if (g.hp <= 0) { deed(s, 'killWarden', g.isl, 0.5); s.bountyGold += 150; s.bounty = Math.max(s.bounty, 1); say(s, 'You cut down a guard.'); s.events.push({ type: 'kill' }); } return; } }
  if (w.ranged) s.events.push({ type: 'cannon', x: f.x, z: f.z });
  if (best) { spray(s, bx, groundAt(s, bx, bz) + 1.3, bz, 4); hurtNpc(s, ...best, w.dmg, bi, bx, bz); } s.events.push({ type: 'slash', hit: !!best, w: s.weapon, swing: true });
}
function stepFoot(s, inp, dt) {
  const f = s.foot;
  if (inp.yaw !== undefined) f.yaw = inp.yaw;
  if (inp.wsel) equip(s, WEAPON_ORDER[inp.wsel - 1]);
  f.cd = Math.max(0, (f.cd || 0) - dt); if (inp.attack && f.cd <= 0) { f.cd = weaponOf(s).cd; swing(s); }
  const sp = (inp.run ? 7.5 : 4) * dt, fx = Math.cos(f.yaw), fz = Math.sin(f.yaw);
  let dx = fx * (inp.mz || 0) - fz * (inp.mx || 0), dz = fz * (inp.mz || 0) + fx * (inp.mx || 0);
  const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
  dx *= sp; dz *= sp;
  const gy = groundAt(s, f.x, f.z), air = f.y > gy + 0.08 || (f.vy || 0) > 0, base = air ? f.y : gy;
  if (canStand(s, f.x + dx, f.z + dz, base)) { f.x += dx; f.z += dz; }
  else if (canStand(s, f.x + dx, f.z, base)) f.x += dx;
  else if (canStand(s, f.x, f.z + dz, base)) f.z += dz;
  const g2 = groundAt(s, f.x, f.z);
  if (inp.jump && !air) f.vy = 7.2;
  if ((f.vy || 0) !== 0 || f.y > g2 + 0.02) { f.vy = (f.vy || 0) - 22 * dt; f.y += f.vy * dt; if (f.y <= g2) { f.y = g2; f.vy = 0; } }
  else f.y += (g2 - f.y) * Math.min(1, dt * 12);
}

// ---------------------------------------------------------------- at sea
const RESPAWN = 90; // seconds before a sunk ship's waters fill again (once you are out of sight)
// the story's raider hunt must be doable: while "Clear the Lanes" is active there are always at least two raiders within reach
function ensureRaiders(s) {
  if (currentQuest(s)?.id !== 'raiders' || s.t < (s.raiderT || 0)) return;
  const p = s.ship; let n = 0; for (const e of s.enemies.values()) if (e.kind === 'raider' && e.hp > 0 && Math.hypot(e.x - p.x, e.z - p.z) < 600) n++;
  if (n >= 2) return;
  s.raiderT = s.t + 8; s.spawnN = (s.spawnN || 0) + 1;
  const r = rngFor(s.seed, 4000 + s.spawnN);
  for (let k = 0; k < 12; k++) {
    const a = p.yaw + (r() - 0.5) * 2.4, d = 220 + r() * 140, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (hitIsland(s, x, z) || Math.hypot(x, z) > WALL_R - 150) continue;
    const sr = rngFor(s.seed, 5000 + s.spawnN);
    s.enemies.set('q' + s.spawnN, { id: 'q' + s.spawnN, seed: hash(s.seed, 9000 + s.spawnN), kind: 'raider', x, z, yaw: a + Math.PI, name: shipName(sr), captain: captainName(sr), gen: false, speed: 0, hp: KINDS.raider.hp, maxHp: KINDS.raider.hp, cd: [1, 1] });
    return;
  }
}
function manageEnemies(s) {
  const cx = sectorOf(s.ship.x), cz = sectorOf(s.ship.z), want = new Set(); s.deadAt ||= {};
  for (const id of s.dead) { if (s.deadAt[id] === undefined) s.deadAt[id] = s.t; }
  for (const id of Object.keys(s.deadAt)) if (s.t - s.deadAt[id] > RESPAWN) { // a sunk ship is replaced soon, but never in front of your eyes
    const m = /^e(-?\d+),(-?\d+),/.exec(id); if (!m) { delete s.deadAt[id]; continue; }
    const far = Math.hypot((+m[1] + 0.5) * SECTOR - s.ship.x, (+m[2] + 0.5) * SECTOR - s.ship.z) > SECTOR * 0.9;
    if (far) { s.dead.delete(id); delete s.deadAt[id]; }
  }
  ensureRaiders(s);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const e of sectorEnemies(s.seed, cx + i, cz + j)) {
    want.add(e.id);
    if (!s.enemies.has(e.id) && !s.dead.has(e.id)) s.enemies.set(e.id, { ...e, gen: true, speed: 0, hp: KINDS[e.kind].hp, maxHp: KINDS[e.kind].hp, cd: [1, 1] });
  }
  for (const [id, e] of s.enemies) if (e.gen && !want.has(id)) s.enemies.delete(id);
  for (const [id, e] of s.enemies) if (!e.gen && Math.hypot(e.x - s.ship.x, e.z - s.ship.z) > 1200) s.enemies.delete(id); // story-spawned ships do not pile up behind you
}
const isHostile = (s, e) => { const h = KINDS[e.kind].hostile; return h === true || (h === 'bounty' && s.bounty > 0); };
function fire(s, owner, ship, side, target, dmg) {
  const v = 38, aim = Math.atan2(target.z - ship.z, target.x - ship.x);
  // the player's guns aim themselves a little: if an enemy is inside the broadside cone, the shot leads it
  let pa = ship.yaw + (side * Math.PI) / 2;
  if (owner === 'player' && target.kind) { const T = Math.hypot(target.x - ship.x, target.z - ship.z) / v, ax = Math.atan2(target.z + Math.sin(target.yaw) * target.speed * T - ship.z, target.x + Math.cos(target.yaw) * target.speed * T - ship.x), dA = wrapPi(ax - pa); if (Math.abs(dA) < 0.6) pa += dA; }
  const ang = owner === 'player' ? pa : aim + ((hash(s.seed, Math.floor(s.t * 10)) / 4294967296) - 0.5) * 0.22;
  s.shots.push({ x: ship.x, z: ship.z, vx: Math.cos(ang) * v + Math.cos(ship.yaw) * ship.speed, vz: Math.sin(ang) * v + Math.sin(ship.yaw) * ship.speed, life: 2.2, owner, dmg });
  { const mx = ship.x + Math.cos(ang) * 5, mz = ship.z + Math.sin(ang) * 5; puff(s, 'flash', mx, 3.2, mz, 0.2, { sc: 1.6 }); puff(s, 'smoke', mx, 3.2, mz, 1.2, { vy: 1.5, sc: 1.3 }); }
  s.events.push({ type: 'cannon', x: ship.x, z: ship.z });
}

// autosail: trims for full sail and steers for the quest objective (or holds the heading), swinging round any land or shoal ahead
function autoSail(s, p) {
  // autosail just sails straight on: full sail, rudder holds the heading you were on. No steering round anything.
  return { rudder: Math.max(-1, Math.min(1, wrapPi((s.autoYaw ?? p.yaw) - p.yaw) * 2.5)) };
}
// the best sail trim for the wind: the boom swings out as the wind comes round to the side
// the sail is eased out the further you turn from the wind: hauled in tight close-hauled, half out on a beam reach, right out running. It swings to the side the wind is blowing toward.
export const bestTrim = (yaw, wind, cur = 0) => { const d = wrapPi(wind.dir - yaw), m = Math.max(0.08, Math.min(1, (windAngle(yaw, wind) * 0.5) / 1.48)); return (Math.abs(d) < 0.3 ? (cur < 0 ? -1 : 1) : Math.sign(d)) * m; };
const trimQuality = (trim, best) => Math.max(0.25, 1 - 1.0 * Math.abs(trim - best));
// for the HUD: where the sail is, where it should be for this wind, and how much wind it is catching
export const trimInfo = (s) => { const p = s.ship, t = p.trim || 0, best = bestTrim(p.yaw, s.wind, t), th = windAngle(p.yaw, s.wind); return { trim: t, best, eff: trimQuality(t, best), point: pointOfSail(th), drive: polar(th) }; };
export function toggleAuto(s) {
  if (s.mode !== 'ship' || !s.ship) return;
  s.auto = !s.auto; if (s.auto) s.autoYaw = s.ship.yaw;
  say(s, s.auto ? 'Autosail on: sailing straight ahead. Steer to take over.' : 'Autosail off.');
}
export function toggleRow(s) {
  if (s.mode !== 'ship' || !s.ship) return;
  s.row = !s.row; say(s, s.row ? 'Oars out: you row, wind or not.' : 'Oars shipped.');
}
// bearing (same convention as yaw) from the player to the current objective, or null when there is none: the wind favours it
const windGoal = (s) => { const tg = currentQuest(s)?.target?.(s), f = s.mode === 'ship' ? s.ship : s.foot; return tg && f ? Math.atan2(tg.z - f.z, tg.x - f.x) : null; };
function stepShip(s, inp, dt) {
  const p = s.ship, gate = gatePos(s.seed);
  s.wind = windAt(s.t, windGoal(s));
  let rudder = inp.rudder || 0, sailIn = inp.sail || 0;
  if (s.auto) { if (rudder || sailIn || inp.trim) { s.auto = false; say(s, 'Autosail off: you have the helm.'); } else { const a = autoSail(s, p); rudder = a.rudder; sailIn = 1; p.trim = bestTrim(p.yaw, s.wind, p.trim); } }
  p.trim = Math.max(-1, Math.min(1, (p.trim || 0) + (inp.trim || 0) * 1.2 * dt));
  p.turn = (p.turn || 0) + (rudder - (p.turn || 0)) * Math.min(1, dt * 3); // how hard the ship is turning: the renderer heels her over
  p.sail = Math.min(1, Math.max(0, p.sail + sailIn * 0.5 * dt));
  const cls = shipOf(s);
  p.yaw = wrapPi(p.yaw + rudder * cls.turn * (0.3 + 0.55 * Math.min(1, Math.abs(p.speed) / 5)) * dt);
  const trimMul = trimQuality(p.trim, bestTrim(p.yaw, s.wind, p.trim)); // a badly trimmed sail spills the wind
  if (windAngle(p.yaw, s.wind) < 0.5 && p.sail > 0.2 && !s.row && s.t - (s.irT || -99) > 14) { s.irT = s.t; say(s, 'Head to wind: the sail flaps and you stall. Turn away from the wind, or take the oars.'); }
  const target = Math.max(s.row ? ROW_SPEED * cls.row : 0, MAX_SPEED * cls.speed * p.sail * trimMul * sailEfficiency(p.yaw, s.wind)) * (1 - 0.35 * (1 - s.hull / s.maxHull)) * (1 - cargoCount(s) * 0.01);
  p.speed += (target - p.speed) * Math.min(1, dt * 0.8);
  const ox = p.x, oz = p.z;
  p.x += Math.cos(p.yaw) * p.speed * dt; p.z += Math.sin(p.yaw) * p.speed * dt;
  const hitNow = hullHit(s, p.x, p.z, p.yaw, cls.L, cls.B);
  if (hitNow && hullHit(s, ox, oz, p.yaw, cls.L, cls.B)) { // turning swung the hull over the shore (or she was already inside): never lock the helm, just shoulder her out to sea
    const d = Math.hypot(p.x - hitNow.x, p.z - hitNow.z) || 1; p.x += ((p.x - hitNow.x) / d) * 4 * dt; p.z += ((p.z - hitNow.z) / d) * 4 * dt;
  } else if (hitNow) { // moving into land: stop
    if (p.speed > 3) { s.hull -= p.speed * 0.7; say(s, 'Aground! The hull groans.'); }
    p.x = ox; p.z = oz; p.speed = -p.speed * 0.3;
    if (s.auto) { s.auto = false; say(s, 'Autosail off.'); }
  }
  const d = Math.hypot(p.x, p.z);
  if (d > WALL_R - 12) {
    const gd = Math.abs(wrapPi(Math.atan2(p.z, p.x) - gate.angle)) * WALL_R;
    if (gd < GATE_HALF && s.upgrades.ram && p.speed > 3.2) { s.flags.crossed = true; s.ending = true; p.speed = 0; say(s, 'The ram shatters the ice. Beyond the Wall, a new world...'); }
    else {
      p.x = ox; p.z = oz; p.speed = -Math.abs(p.speed) * 0.3;
      if (s.t - s.msgT > 6) { s.msgT = s.t; say(s, gd < GATE_HALF ? (s.upgrades.ram ? 'Not fast enough! Back off, drop cargo or wait for a fair wind, and charge the gate (oars help).' : 'The gate is sealed with ice. You need an icebreaker ram.') : 'A sheer wall of ice. Find the gate.'); }
    }
  }
  if (Math.abs(p.speed) > 0.5) { s.foodT += dt; if (s.foodT > 45) { s.foodT = 0; if (s.food > 0) s.food--; } }
  if (s.food <= 0 && Math.abs(p.speed) > 0.5) { s.hull -= 0.25 * dt; if (s.t - s.msgT > 12) { s.msgT = s.t; say(s, 'You are starving! Buy provisions.'); } }
  p.cd[0] = Math.max(0, p.cd[0] - dt); p.cd[1] = Math.max(0, p.cd[1] - dt);
  manageEnemies(s);
  let near = null, nd = 1e9;
  for (const e of s.enemies.values()) { const dd = Math.hypot(e.x - p.x, e.z - p.z); if (dd < nd) { nd = dd; near = e; } }
  for (const [side, key, i] of [[-1, 'fireL', 0], [1, 'fireR', 1]]) if (inp[key] && p.cd[i] <= 0) { fire(s, 'player', p, side, near || { x: p.x, z: p.z }, cls.dmg); p.cd[i] = CANNON_CD * cls.cd; }
  for (const e of s.enemies.values()) {
    const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz), kind = KINDS[e.kind], hostile = isHostile(s, e), chase = hostile && dist < 240;
    const want = chase ? Math.atan2(dz, dx) + (dist < 60 ? Math.PI / 2 : 0) : e.yaw + Math.sin(s.t * 0.1 + e.seed) * 0.05;
    e.yaw += Math.max(-0.4 * dt, Math.min(0.4 * dt, wrapPi(want - e.yaw)));
    const tgt = (chase ? kind.speed : kind.speed * 0.55) * Math.max(0.35, sailEfficiency(e.yaw, s.wind));
    e.speed += (tgt - e.speed) * Math.min(1, dt * 0.5);
    const ex = e.x, ez = e.z; e.x += Math.cos(e.yaw) * e.speed * dt; e.z += Math.sin(e.yaw) * e.speed * dt;
    const hh = HULL[e.kind] || HULL.trader; if (hullHit(s, e.x, e.z, e.yaw, hh[0], hh[1]) || Math.hypot(e.x, e.z) > WALL_R - 60) { e.x = ex; e.z = ez; e.yaw += 1.4 * dt * 10; }
    e.cd[0] = Math.max(0, e.cd[0] - dt);
    const rel = Math.abs(wrapPi(Math.atan2(dz, dx) - e.yaw));
    if (hostile && dist < CANNON_RANGE && Math.abs(rel - Math.PI / 2) < 0.5 && e.cd[0] <= 0) { fire(s, 'enemy', e, 1, p, kind.dmg); e.cd[0] = CANNON_CD * 1.6; }
  }
  for (const b of s.shots) {
    b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
    if (b.owner === 'player') {
      for (const e of s.enemies.values()) if (Math.hypot(e.x - b.x, e.z - b.z) < 6 && b.life > 0) { b.life = 0; b.hit = true; e.hp -= b.dmg; e.hitT = s.t; puff(s, 'flash', b.x, 3.5, b.z, 0.25, { sc: 2 }); puff(s, 'smoke', b.x, 3.5, b.z, 1.4, { vy: 2, sc: 1.6 }); puff(s, 'splash', b.x, 0.4, b.z, 0.7, { sc: 1.4 }); if (!isHostile(s, e) && KINDS[e.kind].dmg > 0) s.bounty = Math.max(s.bounty, 1); }
    } else if (Math.hypot(p.x - b.x, p.z - b.z) < 4.5 && b.life > 0) { b.life = 0; b.hit = true; s.hull -= b.dmg; s.hitT = s.t; puff(s, 'flash', b.x, 3.2, b.z, 0.25, { sc: 1.8 }); puff(s, 'smoke', b.x, 3.2, b.z, 1.2, { vy: 2, sc: 1.4 }); say(s, 'We are hit!'); s.events.push({ type: 'hit' }); }
  }
  for (const b of s.shots) if (b.life <= 0 && !b.hit) puff(s, 'splash', b.x, 0.3, b.z, 0.6, { sc: 1.1 }); // a miss throws up a splash
  s.shots = s.shots.filter((b) => b.life > 0);
  for (const e of [...s.enemies.values()]) if (e.hp <= 0) {
    const k = KINDS[e.kind];
    s.sinking.push({ id: e.id, kind: e.kind, seed: e.seed, x: e.x, z: e.z, yaw: e.yaw, speed: e.speed || 0, t0: s.t }); puff(s, 'flash', e.x, 4, e.z, 0.4, { sc: 4 }); for (let q = 0; q < 3; q++) puff(s, 'smoke', e.x + q * 2 - 2, 4, e.z - q + 1, 1.8, { vy: 2.5, sc: 2.4 });
    s.enemies.delete(e.id); s.dead.add(e.id); s.kills++; s.killsBy[e.kind] = (s.killsBy[e.kind] || 0) + 1;
    if (!k.hostile) { s.bounty++; s.bountyGold += 150; deed(s, 'sunkPeaceful'); } else deed(s, 'sunkHostile');
    const gold = k.gold[0] + (e.seed % (k.gold[1] - k.gold[0])), room = Math.max(0, s.hold - cargoCount(s)), n = Math.min(room, 3), g = ['rum', 'sugar', 'timber', 'cannon', 'spice', 'silk'][e.seed % 6];
    s.gold += gold; s.cargo[g] = (s.cargo[g] || 0) + n; s.score += gold; say(s, `Sank ${e.name}! +${gold} gold${n ? `, ${n} ${g}` : ''}.`);
    s.events.push({ type: 'sunk' });
  }
}

// input: { rudder, sail, fireL, fireR } at sea; { mx, mz, run, yaw } on foot
export function step(s, input, dt = DT) {
  if (s.over || s.ending) return;
  s.t += dt;
  if (s.sunkT !== undefined) { // your own ship is going down: no more steering, she rolls over and slips under, then it is game over
    const a = s.t - s.sunkT, p = s.ship; p.x += Math.cos(p.yaw) * p.speed * dt; p.z += Math.sin(p.yaw) * p.speed * dt; p.speed *= 1 - Math.min(1, dt * 0.9); updateFx(s, dt);
    if (a < SINK_S - 1 && Math.floor(a * 3) !== Math.floor((a - dt) * 3)) puff(s, 'smoke', p.x + (hash(s.seed, Math.floor(a * 3)) % 5) - 2, 3 + a, p.z + (hash(s.seed, Math.floor(a * 3), 5) % 5) - 2, 1.6, { vy: 2, sc: 2 });
    if (!s.sunkSplash && a > SINK_S * 0.5) { s.sunkSplash = true; puff(s, 'splash', p.x, 0.5, p.z, 1.1, { sc: 3.2 }); }
    if (a >= SINK_S) s.over = true; return;
  }
  if (s.mode === 'ship') stepShip(s, input, dt); else { stepFoot(s, input, dt); s.wind = windAt(s.t, windGoal(s)); if (s.ship && Math.floor(s.t * 2) !== Math.floor((s.t - dt) * 2)) unstickShip(s); }
  advanceQuests(s, say); stepGuards(s, dt); updateFx(s, dt);
  if (Math.floor(s.t) !== Math.floor(s.t - dt)) forgive(s, 1);
  if (s.hull <= 0 && s.ship && s.sunkT === undefined) { s.hull = 0; s.sunkT = s.t; s.sunkSplash = false; s.auto = false; say(s, 'The ship goes down.'); puff(s, 'flash', s.ship.x, 4, s.ship.z, 0.4, { sc: 4 }); for (let q = 0; q < 3; q++) puff(s, 'smoke', s.ship.x + q * 2 - 2, 4, s.ship.z - q + 1, 1.8, { vy: 2.5, sc: 2.4 }); s.events.push({ type: 'sunk' }); }
}

// ---------------------------------------------------------------- interaction (F key)
// the nearest point on a pier (dock) within `range` of (x, z), or null: ships dock and passengers board only here
function dockSpot(s, x, z, range) {
  let best = null;
  for (const i of islandsAt(s, x, z)) if (!i.port && i.landing) { const l = i.landing, dist = Math.hypot(l.x - x, l.z - z); if (dist <= range + 6 && (!best || dist < best.dist)) best = { x: l.x, z: l.z, y: groundAt(s, l.x, l.z), yaw: Math.atan2(i.z - l.z, i.x - l.x), dist }; }
  for (const i of islandsAt(s, x, z)) if (i.port) {
    const d = i.port.dock, bx = d.x1 - d.x0, bz = d.z1 - d.z0, t = Math.max(0, Math.min(1, ((x - d.x0) * bx + (z - d.z0) * bz) / (bx * bx + bz * bz || 1))), px = d.x0 + bx * t, pz = d.z0 + bz * t, dist = Math.hypot(px - x, pz - z);
    if (dist <= range && (!best || dist < best.dist)) best = { x: px, z: pz, y: groundAt(s, px, pz), yaw: Math.atan2(bz, bx), dist };
  }
  return best;
}
const DOCK_REACH = 10, PIER_REACH = 4;
const findLand = (s) => dockSpot(s, s.ship.x, s.ship.z, DOCK_REACH);
const onPier = (s) => !!dockSpot(s, s.foot.x, s.foot.z, PIER_REACH);
const nearNpc = (s) => {
  let best = null, bd = 4.5;
  for (const i of islandsAt(s, s.foot.x, s.foot.z)) for (const n of islandTown(i).npcs) { if (!npcAlive(s, n.id)) continue; const d = Math.hypot(n.x - s.foot.x, n.z - s.foot.z); if (d < bd) { bd = d; best = n; } }
  return best;
};
// the town notice board: the island whose board you are standing at
const nearBoard = (s) => { for (const i of islandsAt(s, s.foot.x, s.foot.z)) if (i.port) for (const p of islandProps(i)) if (p.k === 'board' && Math.hypot(p.x - s.foot.x, p.z - s.foot.z) < 4.6) return i; return null; };
const nearTreasure = (s) => { for (const i of islandsAt(s, s.foot.x, s.foot.z)) if (i.treasure && !s.found.has(i.id) && Math.hypot(i.treasure.x - s.foot.x, i.treasure.z - s.foot.z) < 5) return i; return null; };
export const standingOn = (s) => islandsAt(s, s.foot.x, s.foot.z)[0] || null;

// what pressing F would do right now (for the on-screen prompt)
export function prompt(s) {
  if (s.mode === 'ship') return findLand(s) ? 'F  Dock and go ashore' : null;
  const n = nearNpc(s); if (n) return `F  Talk to ${n.name} (${n.kind})`;
  for (const i of islandsAt(s, s.foot.x, s.foot.z)) for (const q of islandTown(i).npcs) if (!npcAlive(s, q.id) && Math.hypot(q.x - s.foot.x, q.z - s.foot.z) < 4.5) return 'Closed: the owner is gone';
  if (nearBoard(s)) return 'F  Read the notice board';
  if (nearTreasure(s)) return 'F  Dig';
  if (s.ship && onPier(s) && Math.hypot(s.ship.x - s.foot.x, s.ship.z - s.foot.z) < DOCK_RANGE) return 'F  Board your ship';
  return null;
}
// returns what happened, so the UI can react: { type: 'npc'|'ashore'|'board'|'dig'|'none', ... }
export function interact(s) {
  if (s.over || s.ending) return { type: 'none' };
  if (s.mode === 'ship') {
    const l = findLand(s); if (!l) { say(s, 'You can only go ashore at a dock or a beach landing.'); return { type: 'none' }; }
    unstickShip(s); s.mode = 'foot'; s.foot = { x: l.x, z: l.z, y: l.y, yaw: l.yaw }; s.ship.speed = 0; say(s, 'Ashore.'); return { type: 'ashore' };
  }
  const n = nearNpc(s); if (n) { const isl = islandsAt(s, s.foot.x, s.foot.z).find((i) => islandTown(i).npcs.includes(n)); if (isl && shunned(s, isl.id) && ['merchant', 'shipwright', 'warden', 'smith'].includes(n.kind)) return { type: 'npc', npc: n, lines: ['I know what you did here. Get out. I will not serve you.'], panel: null }; return { type: 'npc', npc: n, island: isl, ...dialog(s, n) }; }
  const nb = nearBoard(s); if (nb) return { type: 'news', island: nb };
  const t = nearTreasure(s);
  if (t) { s.found.add(t.id); s.gold += t.treasure.gold; s.score += t.treasure.gold; say(s, `Buried treasure! ${t.treasure.gold} gold.`); s.events.push({ type: 'coin' }); return { type: 'dig' }; }
  if (s.ship && onPier(s) && Math.hypot(s.ship.x - s.foot.x, s.ship.z - s.foot.z) < DOCK_RANGE) { s.mode = 'ship'; s.ship.speed = 0; s.ship.trim = bestTrim(s.ship.yaw, s.wind, 0); say(s, 'Aboard! W lets the sail out; Z and C swing the boom.'); return { type: 'board' }; }
  return { type: 'none' };
}
export { SECTOR };
