// Game rules, stepped at a fixed rate with no drawing code, so they run (and are tested) in plain Node.
// Two modes: 'foot' (first person, on land) and 'ship' (third person, at sea).
import { GOODS, SECTOR, WALL_R, GATE_HALF, TAU, sectorOf, sectorIslands, sectorEnemies, islandTown, islandHeight, walkHeight, questWorld, gatePos, KINDS } from '../gen/world.js';
import { sailEfficiency, windAt, windAngle, polar, pointOfSail, setRough, calm } from './sea.js';
import { weatherAt, isCold, roughOf, windMul, gust } from './weather.js';
import { weaponOf, equip, WEAPON_ORDER } from './weapons.js';
import { deed, forgive, shunned, localRep, addLocal as addLocalRep, addWorld } from './rep.js';
import { board, byId, SUBDUED_AT, payBonus, rankOf } from './hunt.js';
import { shipParams } from '../gen/mesh.js';
import { explore, visit, learn, mapOf } from './map.js';
import { stepContracts, offers as contractOffers, accept as acceptContract, settle as settleContracts, abandon as abandonContract, active as activeContracts, progress as contractProgress } from './contracts.js';
import { realmOf, enterRealm, destinationAt, OUTER_EDGE, EDGE_HINT, RIM_EXIT, CINE_S, CINE_BREAK, WARP_S } from './realm.js';
import { REALMS } from './map.js';
import { clearWorldCaches } from '../gen/world.js';
import { extraGuards, STYLES } from '../gen/style.js';
import { clearHuntCaches } from './hunt.js';
import { fleetOf, cycleOrder, canKeep, addPrize } from './fleet.js';
import { crewOf, stepCrew, sailorMul, reloadMul, trimFloor, lose, cheer, ALLY_MAX } from './crew.js';
import { speedMul, gunMul, rowMul, level, shotNow, ammoOf, AMMO, SWIVEL_RANGE, SWIVEL_DMG, SWIVEL_CD } from './parts.js';
import { cargoCount } from './trade.js';
import { shipOf } from './ships.js';
import { advanceQuests, dialog, currentQuest } from './quests.js';
import { trackedQuest } from './track.js';
import { hash, rngFor } from '../gen/rng.js';
import { shipName, captainName } from '../gen/names.js';
import { islandProps } from '../gen/props.js';
import { townsfolk, folkPos } from '../gen/world.js';
import { eventFor } from './events.js';
import { stepSerpent, shotSerpent, nearLair } from './serpent.js';
import { stepDraugr, nearBarrow, shotMul } from './draugr.js';
import { runeLine } from './lore.js';
import { stepSide, sideShip, swingSide, nearActor, useActor, sideOffers, acceptSide, chooseSide, abandonSide } from './sidequests.js';

export const DT = 1 / 60;
export const ROW_SPEED = 9, MAX_SPEED = 30, CANNON_RANGE = 75, CANNON_CD = 2.2, DOCK_RANGE = 24;
const wrapPi = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);

// a start spot with open space all round it (nothing solid within 2.4)
const roomy = (s, x, z) => { for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; for (const q of [1.2, 2.4]) if (blocked(s, x + Math.cos(a) * q, z + Math.sin(a) * q)) return false; } return !blocked(s, x, z); };
export function newGame(seed = 1717) {
  const targets = questWorld(seed), home = sectorIslands(seed, 0, 0)[0], plaza = islandTown(home).plaza;
  const s = {
    seed, t: 0, mode: 'foot', gold: 500, food: 0, hull: 100, maxHull: 100, hold: 20, cargo: {}, upgrades: {}, flags: {}, found: new Set(), dead: new Set(),
    kills: 0, killsBy: {}, npcs: {}, murders: 0, rep: { world: 0, local: {} }, bounty: 0, bountyGold: 0, weapon: 'fists', weapons: {}, jailUntil: -1, fleet: [], fleetOrder: 'follow', crew: [], payT: 0, towns: {}, bombard: false, foes: [], side: [], sdone: {}, comp: null, qa: null, fallen: [], ev: null, parts: {}, ammo: { chain: 0, fire: 0 }, shot: 'round', deck: null, hunts: {}, handed: 0, jailed: {}, prisoner: null, hp: 100, maxHp: 100, hurtT: -99, guards: [], sinking: [], fx: [], hitT: -99, alert: {}, guardT: {}, score: 0, quest: 0, targets, ship: null, foodT: 0, msgT: 0,
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
export const groundAt = (s, x, z) => { if (s.deck && onDeck(s, x, z)) return DECK_Y; let h = -4; for (const i of islandsAt(s, x, z)) h = Math.max(h, walkHeight(i, x, z)); return h; };
// is the camera at (x,y,z) inside terrain or a building? (used to pull the chase camera in)
export const camBlocked = (s, x, y, z) => { for (const i of islandsAt(s, x, z)) { if (y < islandHeight(i, x, z) + 1.2) return true; for (const b of islandTown(i).buildings) if (Math.abs(b.x - x) < b.w / 2 + 1 && Math.abs(b.z - z) < b.d / 2 + 1 && y < b.pad + b.h + 4) return true; } return false; };
const PAD = 0.5; // body radius against walls
// solid circles for everything that stands on an island: tree trunks, rocks, the well, stalls, lamps, barrels, counters, shelves (cached per island)
const SOLID = { rack: [[-1, 0, 0.35], [0, 0, 0.35], [1, 0, 0.35]], anvil: [[0, 0, 0.6]], forge: [[0, 0, 0.8]], desk: [[-0.7, 0, 0.45], [0.7, 0, 0.45]], bunk: [[-0.5, 0, 0.5], [0.5, 0, 0.5]], board: [[-1.7, 0, 0.4], [-0.85, 0, 0.4], [0, 0, 0.4], [0.85, 0, 0.4], [1.7, 0, 0.4]], tree: [[0, 0, 0.55]], rock: [[0, 0, 0.7]], bush: [[0, 0, 0.6]], well: [[0, 0, 1.6]], lamp: [[0, 0, 0.35]], sign: [[0, 0, 0.3]], barrel: [[0, 0, 0.6]], crate: [[0, 0, 0.6]], bench: [[-0.6, 0, 0.55], [0.6, 0, 0.55]], rune: [[0, 0, 0.6]], hearth: [[-0.8, 0, 0.6], [0.8, 0, 0.6]], feast: [[-1.2, 0, 0.6], [0, 0, 0.6], [1.2, 0, 0.6]],
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
  if (blockedByThings(s, x, z)) return true; for (const i of islandsAt(s, x, z)) for (const m of islandTown(i).marks || []) for (const w of m.solids) if (x > w[0] - PAD && x < w[1] + PAD && z > w[2] - PAD && z < w[3] + PAD) return true;
  for (const i of islandsAt(s, x, z)) for (const b of islandTown(i).buildings) if (Math.abs(b.x - x) < b.w / 2 + PAD + 0.5 && Math.abs(b.z - z) < b.d / 2 + PAD + 0.5) { for (const w of b.solids) if (x > w[0] - PAD && x < w[1] + PAD && z > w[2] - PAD && z < w[3] + PAD) return true; if (b.bars) for (const w of b.bars) if (x > w[0] - PAD && x < w[1] + PAD && z > w[2] - PAD && z < w[3] + PAD) return true; const gt = b.jail && s.jailUntil > s.t ? b.jail.gate : null; if (gt && x > gt[0] - PAD && x < gt[1] + PAD && z > gt[2] - PAD && z < gt[3] + PAD) return true; } return false; };
// ships are long: test the bow, the stern and the beam against the land, not just the centre point (that let hulls and masts sit inside islands)
const HULL = { trader: [8, 3.5], navy: [12, 2.5], raider: [10, 2.2], ghost: [12, 3], draugr: [12, 2.6] };
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
export const canStand = (s, x, z, fromY) => { if (s.deck) return onDeck(s, x, z, 0.35) && Math.abs(fromY - DECK_Y) < 1.6; const h = groundAt(s, x, z); return h >= 0.3 && Math.abs(h - fromY) < 1.6 && !blocked(s, x, z); };
// ---------------------------------------------------------------- people can be hurt and killed. Nothing stops you: every deed is remembered (murders feed the reputation system later).
// A dead shopkeeper's shop is shut until a relative takes over (REOPEN seconds), so the story can never be locked by a murder.
export const REOPEN = 240, PLAYER_HIT = 10;
export const npcMax = (kind) => (kind === 'villager' ? 20 : kind === 'warden' ? 80 : 45);
export const npcAlive = (s, id) => { if (s.towns && id[0] === 'v') { const c = id.indexOf(':'); if (c > 0 && s.towns[id.slice(1, c)]) { const st = townState(s, id.slice(1, c)); if (st >= 2 || (st === 1 && (+id.slice(c + 1) & 1))) return false; } } const q = s.npcs?.[id]; if (q?.away && !q.dead) return false; if (!q || !q.dead) return true; if (s.t - q.t >= REOPEN) { delete s.npcs[id]; return true; } return false; };
export const CORPSE_S = 9; // how long a body lies where it fell before it is gone
function hurtNpc(s, id, kind, name, seed, dmg, isl, px = 0, pz = 0) {
  s.npcs ||= {}; const was = (s.npcs[id] || {}).dead; deed(s, 'hurt', isl?.id); crime(s, isl, 5, false); const q = (s.npcs[id] ||= { hp: npcMax(kind) }); q.hp -= dmg; q.hit = s.t;
  if (q.hp > 0) { if (isl && fighterOf(s.seed, id, kind) && !q.away) { spawnFoe(s, id, kind, name, seed, isl, px, pz, false); return; } if (kind !== 'villager' && s.t - (s.callT || -99) > 6) { s.callT = s.t; say(s, name + ': "Stop! Someone help!"'); } return; }
  deed(s, kind === 'villager' ? 'killVillager' : kind === 'warden' ? 'killWarden' : 'killShopkeeper', isl?.id); crime(s, isl, kind === 'villager' ? 60 : kind === 'warden' ? 200 : 120, true); if (shunned(s, isl?.id)) say(s, 'The whole town turns against you.');
  q.dead = true; q.t = s.t; q.x = px; q.z = pz; q.y = groundAt(s, px, pz); q.kind = kind; q.seed = seed; spray(s, px, q.y + 1.2, pz, 8, 1.2); s.murders = (s.murders || 0) + 1; const loot = kind === 'villager' ? 3 + (seed % 8) : kind === 'warden' ? 60 : 20 + (seed % 40); s.gold += loot;
  say(s, `You killed ${name}. You take ${loot} gold from the body.`); if (kind !== 'villager') say(s, 'The shop is shut. Someone will take it over in time.'); s.events.push({ type: 'kill' });
}

// ---------------------------------------------------------------- the law: a crime on a port island raises the alarm; guards (the island's wardens) hunt you on foot, a lost fight is an arrest.
export const GUARD_HP = 60, GUARD_HIT = 6, GUARD_SPEED = 3.5, ALERT_S = 120, WANTED_AT = -25;
const guardCount = (isl) => Math.max(1, (isl.tier === 'city' ? 4 : isl.tier === 'town' ? 3 : 2) + extraGuards(isl.style));
export function crime(s, isl, gold, serious) {
  if (!isl || !isl.port) return; s.bountyGold = (s.bountyGold || 0) + gold; if (serious) s.bounty = Math.max(s.bounty, 1);
  s.alert[isl.id] = s.t + ALERT_S; if (!s.alerted) { s.alerted = true; say(s, 'Guards! Guards!'); }
}
export const wantedHere = (s, isl) => !!isl?.port && ((s.alert[isl.id] || 0) > s.t || localRep(s, isl.id) <= WANTED_AT);
// the guard station is a real building (kind 'guard') with a barred cell inside; stationOf gives its front door spot and its jail
const stationCache = new Map();
export const JAIL_S = 8; // how long the cell gate stays shut after an arrest
export const stationOf = (isl) => { let v = stationCache.get(isl.seed); if (v === undefined) { const b = islandTown(isl).buildings.find((q) => q.kind === 'guard'); v = b ? { x: b.x, z: b.z + b.d / 2 + 2.4, b, jail: b.jail } : null; stationCache.set(isl.seed, v); if (stationCache.size > 200) stationCache.delete(stationCache.keys().next().value); } return v; };
// a save made before a town was laid out differently can leave you inside a wall: step out to the nearest free ground
export function freeFoot(s) {
  const f = s.foot; if (s.mode !== 'foot' || !f) return;
  if (canStand(s, f.x, f.z, groundAt(s, f.x, f.z))) { f.y = groundAt(s, f.x, f.z); return; }
  const p = freeSpotNear(s, f.x, f.z, f.x, f.z + 1, 1, 30); if (p) Object.assign(f, { x: p.x, z: p.z, y: groundAt(s, p.x, p.z), vy: 0 });
}
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
  freePrisoner(s, 'The prisoner slips away while you are locked up.'); let jailed = false; const pay = payBounty(s); s.hp = s.maxHp; s.guards = []; s.alert = {}; s.alerted = false;
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
    s.guardT[isl.id] = s.t + 4; for (let k = 0; k < 12; k++) { const a = hash(s.seed, isl.id, s.t | 0, k) % (stationOf(isl) ? 314 : 628) / 100, /* the station's own side only: guards come out of its front door, never from inside it */ x = pl.x + Math.cos(a) * rad, z = pl.z + Math.sin(a) * rad; if (Math.hypot(x - f.x, z - f.z) > (Math.hypot(pl.x - f.x, pl.z - f.z) < 7 ? 2.5 : 9) /* at their own door they may step out close by */ && canStand(s, x, z, groundAt(s, x, z))) { s.guards.push({ id: hash(s.seed, isl.id, s.t | 0, k), seed: hash(isl.id, k, 9), isl: isl.id, x, z, y: groundAt(s, x, z), hp: GUARD_HP, cd: 1 }); break; } }
  }
  for (const g of s.guards) {
    const dx = f.x - g.x, dz = f.z - g.z, d = Math.hypot(dx, dz) || 1; g.cd = Math.max(0, g.cd - dt); g.face = Math.atan2(dz, dx);
    const reach = shareRoom(s, g, f) ? 3.2 : 2; // inside the same shop he can strike across the counter
    if (d > reach) { // walk at you; a wall in the way makes them steer round it (turn one way, and keep to that side until the way is clear)
      if (!(d > g.best - 1)) { g.best = d; g.bestT = s.t; } else if (g.best === undefined) { g.best = d; g.bestT = s.t; } else if (s.t - g.bestT > 5) { comeRound(s, g, f); g.best = undefined; } // no headway: he takes another way round
      const [wx, wz] = viaDoor(s, g, f.x, f.z), sp = GUARD_SPEED * dt, base = Math.atan2(wz - g.z, wx - g.x); let moved = false;
      for (const m of [0, 0.5, 1, 1.6, 2.2]) { for (const sg of m ? [g.side || 1, -(g.side || 1)] : [1]) { const an = base + m * sg, mx = Math.cos(an) * sp, mz = Math.sin(an) * sp; if (canStand(s, g.x + mx, g.z + mz, g.y)) { g.x += mx; g.z += mz; if (m) g.side = sg; moved = true; break; } } if (moved) break; }
      g.y = groundAt(s, g.x, g.z); g.walk = (g.walk || 0) + dt; }
    else if (g.cd <= 0) { g.cd = 1; g.atk = s.t; s.hp -= GUARD_HIT; s.hurtT = s.t; s.events.push({ type: 'hit' }); }
  }
  if (s.hp <= 0) arrest(s, isl);
}



// ---------------------------------------------------------------- bombarding towns from the sea: a toggle (B), off by default so a ship fight beside a port never hurts it. With it on, cannonballs that land on a building
// wear the town down: calm -> damaged (half the villagers run indoors) -> burning (fires, shops shut, nobody on the streets) -> pillaged (your crew plunder it once). Towns heal when left alone.
export const TOWN_MAX = { village: 100, town: 200, city: 400 }, TOWN_REGEN_AFTER = 30, TOWN_HEAL_S = 600, PLUNDER = { village: 150, town: 300, city: 600 };
export const townState = (s, id) => { const t = s.towns?.[id]; if (!t) return 0; const f = t.hp / t.max; return f > 0.75 ? 0 : f > 0.4 ? 1 : f > 0 ? 2 : 3; };
export const TOWN_STATE = ['calm', 'damaged', 'burning', 'pillaged'];
export function toggleBombard(s) { if (s.mode !== 'ship' || !s.ship) return; s.bombard = !s.bombard; say(s, s.bombard ? 'Bombardment ON: your cannonballs will hit town buildings. Ports will not forgive it.' : 'Bombardment off: shot passes harmlessly over the towns.'); }
const townHit = (s, x, z) => { for (const i of islandsAt(s, x, z)) if (i.port && Math.hypot(i.x - x, i.z - z) < i.r * 1.5) for (const b of islandTown(i).buildings) if (Math.abs(b.x - x) < b.w / 2 + 1.5 && Math.abs(b.z - z) < b.d / 2 + 1.5) return { isl: i, b }; return null; };
function bombardTown(s, isl, b, dmg, x, z) {
  const t = (s.towns ||= {})[isl.id] ||= { hp: TOWN_MAX[isl.tier] || 100, max: TOWN_MAX[isl.tier] || 100, t: s.t }, before = townState(s, isl.id);
  t.hp = Math.max(0, t.hp - dmg * 1.5); t.t = s.t; puff(s, 'flash', x, 4, z, 0.3, { sc: 2.2 }); puff(s, 'smoke', x, 4, z, 1.6, { vy: 2, sc: 2 });
  crime(s, isl, 15, true); deed(s, 'bombard', isl.id); s.alert[isl.id] = s.t + ALERT_S; const st = townState(s, isl.id);
  if (st !== before) say(s, st === 1 ? `${isl.port.name}: buildings are scorched and people run indoors.` : st === 2 ? `${isl.port.name} is burning! The shops are shut and the streets empty.` : `${isl.port.name} is pillaged. ${t.plundered ? '' : 'Your crew plunder what is left.'}`);
  if (st === 3 && !t.plundered) { t.plundered = true; const g = PLUNDER[isl.tier] || 150; s.gold += g; s.score += g; s.bountyGold += 300; addWorld(s, -10); s.events.push({ type: 'coin' }); }
}
function stepTowns(s, dt) {
  if (!s.towns) return; const p = s.mode === 'ship' && s.ship ? s.ship : s.foot, tick = Math.floor(s.t * 2) !== Math.floor((s.t - dt) * 2);
  for (const id in s.towns) { const t = s.towns[id]; if (t.hp < t.max && s.t - t.t > TOWN_REGEN_AFTER) { t.hp = Math.min(t.max, t.hp + (t.max / TOWN_HEAL_S) * dt); if (t.hp > t.max * 0.5) t.plundered = false; } if (t.hp >= t.max) { delete s.towns[id]; continue; }
    if (tick && townState(s, id) >= 2) { const isl = nearbyIslands(s, p.x, p.z, 1).find((i) => i.id === id); if (isl && Math.hypot(isl.x - p.x, isl.z - p.z) < 500) { const bs = islandTown(isl).buildings, b = bs[hash(s.seed, Math.floor(s.t * 2), 41) % bs.length]; if (b) { puff(s, 'flash', b.x + (hash(b.x | 0, Math.floor(s.t * 2)) % 5) - 2, b.pad + b.h, b.z, 0.35, { sc: 1.6 }); puff(s, 'smoke', b.x, b.pad + b.h + 1, b.z, 2.4, { vy: 2.5, sc: 2.6 }); } } } }
}
// ---------------------------------------------------------------- hidden fighters: a few people (no visual tell) carry a weapon and fight back when hit, or even strike first if you look rich or wanted
export const FOE_HIT = 8, FOE_SPEED = 3.2;
const strHash = (str) => { let h = 7; for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0; return h >>> 0; };
export const fighterOf = (seed, id, kind) => kind === 'warden' ? false : (hash(seed, strHash(String(id)), 77) % 1000) < (kind === 'villager' ? 70 : 110);
function spawnFoe(s, id, kind, name, seed, isl, x, z, pre) {
  if (s.foes.some((f) => f.id === id)) return; const q = (s.npcs[id] ||= { hp: npcMax(kind) }); q.away = true;
  s.foes.push({ id, kind, name, seed, isl: isl.id, x, z, y: groundAt(s, x, z), cd: 0.6 }); s.events.push({ type: 'hit' });
  say(s, pre ? `${name[0].toUpperCase() + name.slice(1)} pulls a blade and comes for your purse!` : `${name[0].toUpperCase() + name.slice(1)} was not as harmless as they looked. They fight back!`);
}
function stepFoes(s, dt) {
  const f = s.foot; if (s.mode !== 'foot') { for (const o of s.foes) { const q = s.npcs[o.id]; if (q) q.away = false; } s.foes = []; return; }
  s.foes = s.foes.filter((o) => { const q = s.npcs[o.id]; if (!q || q.dead || Math.hypot(o.x - f.x, o.z - f.z) > 70) { if (q) q.away = false; return false; } return true; });
  for (const o of s.foes) { const q = s.npcs[o.id], d = Math.hypot(f.x - o.x, f.z - o.z); o.face = Math.atan2(f.z - o.z, f.x - o.x); o.cd = Math.max(0, o.cd - dt); if (s.jailUntil > s.t) continue; if (d > 1.9) walkToward(s, o, f.x, f.z, FOE_SPEED * dt); else if (o.cd <= 0) { o.cd = 1.2; o.atk = s.t; s.hp -= FOE_HIT; s.hurtT = s.t; s.events.push({ type: 'hit' }); } void q; }
  if ((s.gold >= 1500 || s.bountyGold > 0) && Math.floor(s.t * 2) !== Math.floor((s.t - dt) * 2) && s.t - (s.foeT || -99) > 20) { // the rich and the wanted attract it
    for (const isl of islandsAt(s, f.x, f.z)) if (isl.port) for (const v of townsfolk(isl)) { const id = `v${isl.id}:${v.seed}`, p = folkPos(v, s.t); if (npcAlive(s, id) && fighterOf(s.seed, id, 'villager') && Math.hypot(p.x - f.x, p.z - f.z) < 6) { s.foeT = s.t; spawnFoe(s, id, 'villager', 'a villager', v.seed, isl, p.x, p.z, true); return; } }
  }
}
// ---------------------------------------------------------------- bounty missions (the law's side): wanted people hide on islands; kill them, or subdue and bind them and hand them in at any guard station
export const huntOf = (s, w) => ((s.hunts ||= {})[w.id] ||= { st: 'free', hp: w.hp });
export const HUNT_HIT = 5, HUNT_SPEED = 3.4, PRISONER_SPEED = 4.6;
function placeTarget(s, w, h) {
  const isl = w.island, pl = isl.port ? islandTown(isl).plaza : isl.landing, r = rngFor(s.seed, 8400 + w.i);
  for (let k = 0; k < 160; k++) { const a = r() * TAU, d = isl.port ? 9 + r() * Math.max(6, isl.r * 0.45) : 5 + r() * 10, x = pl.x + Math.cos(a) * d, z = pl.z + Math.sin(a) * d, g = groundAt(s, x, z); if (g >= 0.8 && canStand(s, x, z, g) && roomy(s, x, z)) { h.x = x; h.z = z; h.y = g; return; } }
  const sp = freeSpotNear(s, pl.x, pl.z, pl.x, pl.z + 1, 6, 22); if (sp) { h.x = sp.x; h.z = sp.z; } else { h.x = pl.x + 6; h.z = pl.z; } h.y = groundAt(s, h.x, h.z);
}
const shareRoom = (s, a, b) => islandsAt(s, b.x, b.z).some((i) => islandTown(i).buildings.some((h) => [a, b].every((p) => Math.abs(p.x - h.x) < h.w / 2 && Math.abs(p.z - h.z) < h.d / 2)));
// a guard hung up on walls or props comes up the clear approach in front of the door you are behind (steering alone cannot plan a way there)
function comeRound(s, g, f) {
  for (const i of islandsAt(s, f.x, f.z)) for (const b of islandTown(i).buildings) if (Math.abs(f.x - b.x) < b.w / 2 && Math.abs(f.z - b.z) < b.d / 2) for (const k of [5, 4, 3, 2]) { const z = b.z + b.d / 2 + k, y = groundAt(s, b.x, z); if (canStand(s, b.x, z, y)) { g.x = b.x; g.z = z; g.y = y; return; } }
  const p = freeSpotNear(s, f.x, f.z, f.x - Math.cos(f.yaw), f.z - Math.sin(f.yaw), 5, 11); if (p) { g.x = p.x; g.z = p.z; g.y = groundAt(s, p.x, p.z); } // in the open: he turns up behind you
}
// someone chasing a target indoors goes by the door (every door is in the middle of the building's front, +z)
function viaDoor(s, e, tx, tz) {
  const inside = (b, x, z) => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2;
  for (const i of islandsAt(s, tx, tz)) for (const b of islandTown(i).buildings) if (inside(b, tx, tz) && !inside(b, e.x, e.z)) { const front = b.z + b.d / 2; return [b.x, Math.abs(e.x - b.x) > 0.6 || e.z < front ? front + 1.2 : front - 1.4]; }
  return [tx, tz];
}
function walkToward(s, e, gx, gz, sp) {
  const [tx, tz] = viaDoor(s, e, gx, gz);
  const base = Math.atan2(tz - e.z, tx - e.x);
  for (const m of [0, 0.5, 1, 1.6, 2.2]) for (const sg of m ? [e.side || 1, -(e.side || 1)] : [1]) { const an = base + m * sg, mx = Math.cos(an) * sp, mz = Math.sin(an) * sp; if (canStand(s, e.x + mx, e.z + mz, e.y ?? 0)) { e.x += mx; e.z += mz; if (m) e.side = sg; e.y = groundAt(s, e.x, e.z); e.walk = (e.walk || 0) + sp; e.face = base; return true; } }
  return false;
}
function claimKill(s, w, isl) {
  const h = huntOf(s, w); h.st = 'killed'; h.deadT = s.t; h.seed = w.seed;
  if (w.aliveOnly) { addWorld(s, -6); if (isl) addLocalRep(s, isl.id, -10); say(s, `${w.name} was wanted ALIVE. The realm pays nothing for a corpse, and notes it.`); }
  else { const g = Math.round(w.dead * payBonus(s.handed || 0)); s.gold += g; s.score += g; deed(s, 'lawKill', isl?.id); say(s, `${w.name} is dead. Bounty collected: ${g} gold.`); }
  if (s.prisoner === w.id) s.prisoner = null; s.events.push({ type: 'kill' });
}
function hitTarget(s, w, h, dmg, isl) {
  h.hitT = s.t; spray(s, h.x, (h.y || 0) + 1.3, h.z, 4);
  if (h.st === 'sub') return claimKill(s, w, isl); // a blow on a beaten man finishes him
  h.hp -= dmg; if (h.hp <= 0) return claimKill(s, w, isl);
  if (h.hp <= w.hp * SUBDUED_AT) { h.st = 'sub'; say(s, `${w.name} drops, beaten. Walk up and press F to bind them, or finish the job.`); }
}
function freePrisoner(s, msg) { if (!s.prisoner) return; const h = s.hunts[s.prisoner]; if (h) { h.st = 'free'; h.aboard = false; h.hp = Math.max(h.hp || 0, 12); } s.prisoner = null; say(s, msg); }
export const nearSub = (s) => { if (s.mode !== 'foot') return null; if (s.deck?.wid) { const c = s.deck.defs.find((d) => d.captain && d.st === 'sub'); if (c && Math.hypot(c.x - s.foot.x, c.z - s.foot.z) < 3.4) return byId(s, s.deck.wid); } for (const t of board(s)) { const h = s.hunts[t.id]; if (t.kind === 'foot' && h && h.st === 'sub' && h.x !== undefined && Math.hypot(h.x - s.foot.x, h.z - s.foot.z) < 3.4) return t; } return null; };
export function handIn(s, isl) {
  const w = byId(s, s.prisoner); if (!w) return 0; const h = huntOf(s, w), pay = Math.round(w.reward * payBonus(s.handed || 0));
  const before = rankOf(s.handed || 0); s.gold += pay; s.score += pay; s.handed = (s.handed || 0) + 1; deed(s, 'handIn', isl?.id);
  h.st = 'jailed'; h.isl = isl?.id; h.aboard = false; if (isl) (s.jailed[isl.id] ||= []).push(w.id); s.prisoner = null;
  say(s, `${w.name} is locked in the cell. The realm pays you ${pay} gold.`); const after = rankOf(s.handed); if (after !== before) say(s, `You are made ${after}.`); s.events.push({ type: 'coin' });
  return pay;
}
function stepHunts(s, dt) {
  const f = s.foot, pr = s.prisoner && s.hunts[s.prisoner];
  if (pr) {
    if (s.mode !== 'foot') pr.aboard = true;
    else {
      if (pr.aboard || pr.x === undefined || Math.hypot(f.x - pr.x, f.z - pr.z) > 30) { pr.aboard = false; const sp = freeSpotNear(s, f.x, f.z, f.x - Math.cos(f.yaw), f.z - Math.sin(f.yaw), 1.6, 6); pr.x = sp ? sp.x : f.x; pr.z = sp ? sp.z : f.z; pr.y = groundAt(s, pr.x, pr.z); }
      else if (Math.hypot(f.x - pr.x, f.z - pr.z) > 2.6) walkToward(s, pr, f.x, f.z, PRISONER_SPEED * dt);
    }
  }
  if (s.mode !== 'foot') return;
  const here = islandsAt(s, f.x, f.z);
  for (const w of board(s)) {
    if (w.kind !== 'foot') continue; const h = huntOf(s, w); if (h.st !== 'free' && h.st !== 'sub') continue;
    const isl = here.find((i) => i.id === w.island.id); if (!isl) continue; if (h.x === undefined) placeTarget(s, w, h);
    if (h.st !== 'free') continue;
    const d = Math.hypot(f.x - h.x, f.z - h.z); h.face = Math.atan2(f.z - h.z, f.x - h.x); h.cd = Math.max(0, (h.cd ?? 0.8) - dt);
    if (s.jailUntil > s.t || (d > 16 && h.hp >= w.hp)) continue; // a wanted man minds his own business until you come close or hit him
    if (d > 1.9) walkToward(s, h, f.x, f.z, HUNT_SPEED * dt);
    else if (h.cd <= 0) { h.cd = 1.2; h.atk = s.t; s.hp -= HUNT_HIT; s.hurtT = s.t; s.events.push({ type: 'hit' }); }
  }
  if (s.hp <= 0 && !s.guards.length && !s.deck) { for (const o of s.foes) { if (s.npcs[o.id]) s.npcs[o.id].away = false; } s.foes = []; // knocked senseless by a wanted man or a hidden fighter: you wake in the street, lighter in the purse
    const isl = here.find((i) => i.port), lost = Math.floor(s.gold * 0.1); s.gold -= lost; s.hp = s.maxHp * 0.5; freePrisoner(s, 'Your prisoner escapes while you lie senseless.');
    for (const w of board(s)) { const h = s.hunts[w.id]; if (h && h.st === 'free') { h.hp = w.hp; h.x = undefined; } }
    const pl = isl ? islandTown(isl).plaza : f, sp = freeSpotNear(s, pl.x, pl.z, pl.x, pl.z + 1, 4.8, 14); if (sp) s.foot = { x: sp.x, z: sp.z, y: groundAt(s, sp.x, sp.z), yaw: f.yaw, vy: 0 };
    say(s, `You were beaten senseless. You wake ${isl ? 'in the street' : 'where you fell'}, ${lost} gold lighter.`); s.events.push({ type: 'arrest', yaw: s.foot.yaw });
  }
}

// ---------------------------------------------------------------- boarding: grapple a ship alongside, fight on her deck on foot, then loot, claim or scuttle her. A wanted captain can be subdued and bound like any outlaw.
export const GRAPPLE_RANGE = 22, DECK_Y = 0.95, DEF_HP = 25, CAPTAIN_HP = 60;
const NDEF = { trader: 2, raider: 4, navy: 5, ghost: 4, draugr: 4 };
const deckShip = (s) => (s.deck ? s.enemies.get(s.deck.id) : null);
const dims = (e) => { const p = shipParams(e.seed, e.kind); return { L: p.L, B: p.B }; };
const toLocal = (e, x, z) => { const c = Math.cos(e.yaw), sn = Math.sin(e.yaw), dx = x - e.x, dz = z - e.z; return [dx * c + dz * sn, -dx * sn + dz * c]; };
const toWorld = (e, u, v) => { const c = Math.cos(e.yaw), sn = Math.sin(e.yaw); return [e.x + u * c - v * sn, e.z + u * sn + v * c]; };
const inDeck = (e, u, v, pad) => { const { L, B } = dims(e); return u > -0.78 * L + pad && u < 0.82 * L - pad && Math.abs(v) < 0.6 * B - pad * 0.4; };
const mastU = (e) => { const p = shipParams(e.seed, e.kind), L = p.L; return p.masts === 1 ? [0.1 * L] : Array.from({ length: p.masts }, (_, k) => (-0.35 + 0.85 * (k / (p.masts - 1))) * L); };
export const onDeck = (s, x, z, pad = 0) => { const e = deckShip(s); if (!e) return false; const [u, v] = toLocal(e, x, z); return inDeck(e, u, v, pad) && (pad === 0 || !mastU(e).some((m) => Math.hypot(u - m, v) < 0.55 + pad * 0.3)); };
const nearestShip = (s) => { let best = null, bd = GRAPPLE_RANGE; if (!s.ship) return null; for (const e of s.enemies.values()) { if (e.hp <= 0) continue; const d = Math.hypot(e.x - s.ship.x, e.z - s.ship.z); if (d < bd) { bd = d; best = e; } } return best; };
export function grapple(s) {
  if (s.mode !== 'ship' || !s.ship || s.deck || s.sunkT !== undefined) return { type: 'none' };
  const e = nearestShip(s); if (!e) { say(s, 'No ship close enough to grapple. Come alongside (within ' + GRAPPLE_RANGE + ').'); return { type: 'none' }; }
  if (e.kind === 'draugr') { say(s, 'Your boarders will not go near her: the dead crew stand at the rail and stare. Burn her instead.'); return { type: 'none' }; }
  const k = KINDS[e.kind], lawful = isHostile(s, e), { L, B } = dims(e), c = shipOf(s), p = s.ship;
  if (!lawful) { s.bounty = Math.max(s.bounty, 1); s.bountyGold = (s.bountyGold || 0) + 150; deed(s, 'piracy'); say(s, 'Piracy! Boarding a peaceful ship is a crime.'); } else deed(s, 'boardHostile');
  const [, pv] = toLocal(e, p.x, p.z), side = pv < 0 ? -1 : 1, off = 0.6 * B + c.B + 1.6, [wx, wz] = toWorld(e, 0, side * off);
  p.x = wx; p.z = wz; p.yaw = e.yaw; p.speed = 0; e.speed = 0; e.grappled = true; s.auto = false;
  const [fx, fz] = toWorld(e, -0.66 * L, 0), w = board(s).find((t) => t.kind === 'ship' && t.enemyId === e.id), n = NDEF[e.kind] || 3, defs = [];
  for (let i = 0; i < n; i++) defs.push({ id: i, seed: hash(e.seed, i, 5), hp: DEF_HP, max: DEF_HP, u: -0.1 * L + (0.55 * L * i) / Math.max(1, n - 1), v: (i % 2 ? 1 : -1) * 0.18 * B, cd: 1 + i * 0.3, st: 'free' });
  defs.push({ id: n, captain: true, seed: hash(e.seed, 99, 5), hp: CAPTAIN_HP, max: CAPTAIN_HP, u: 0.62 * L, v: 0, cd: 1, st: 'free', name: w ? w.name : e.captain });
  for (const d of defs) { const [x, z] = toWorld(e, d.u, d.v); d.x = x; d.z = z; d.y = DECK_Y; }
  if (w) { const h = huntOf(s, w); if (h.st === 'free') h.hp = CAPTAIN_HP; }
  const allies = crewOf(s).filter((c) => !c.captain).slice(0, ALLY_MAX).map((c, i) => ({ cid: c.id, name: c.name, seed: c.seed, hp: 30, max: 30, u: -0.6 * L - 0.1 * i, v: (i % 2 ? 1 : -1) * 0.22 * B, cd: 1, st: 'free' }));
  for (const a of allies) { const [x, z] = toWorld(e, a.u, a.v); a.x = x; a.z = z; a.y = DECK_Y; }
  s.deck = { id: e.id, defs, allies, wid: w ? w.id : null, won: false, lawful, t0: s.t };
  s.mode = 'foot'; s.foot = { x: fx, z: fz, y: DECK_Y, yaw: e.yaw, vy: 0 };
  say(s, `Grapples thrown! You leap aboard the ${k.label.toLowerCase()} ${e.name}. Captain ${s.deck.defs[n].name} and ${n} crew.`); s.events.push({ type: 'grapple', yaw: e.yaw });
  return { type: 'deck' };
}
function leaveDeck(s) { s.deck = null; s.mode = 'ship'; if (s.ship) s.ship.speed = 0; s.foot.vy = 0; }
export function retreat(s) {
  const e = deckShip(s); if (e) e.grappled = false; leaveDeck(s); say(s, 'You cut the grapples and swing back to your ship.'); return { type: 'board' };
}
function hitDefender(s, d, dmg) {
  d.hp -= dmg; d.hitT = s.t; d.aggro = true; spray(s, d.x, DECK_Y + 1.3, d.z, 4);
  if (d.hp > 0) { if (d.captain && d.hp <= d.max * SUBDUED_AT) { d.st = 'sub'; say(s, `Captain ${d.name} drops his sword and surrenders.${s.deck.wid ? ' Press F to bind him, or finish the job.' : ''}`); } return; }
  if (d.captain && s.deck.wid) { const w = byId(s, s.deck.wid); if (w) claimKill(s, w, null); }
  d.st = 'dead'; d.deadT = s.t; s.events.push({ type: 'kill' });
}
function stepDeck(s, dt) {
  const D = s.deck; if (!D) return; const e = deckShip(s); if (!e) { leaveDeck(s); return; }
  const f = s.foot, [pu, pv] = toLocal(e, f.x, f.z); e.speed = 0;
  const live = D.defs.filter((d) => d.st === 'free');
  for (const d of D.defs) {
    if (d.st === 'free') {
      d.cd = Math.max(0, d.cd - dt); let tg = { u: pu, v: pv, a: null }, tgd = Math.hypot(pu - d.u, pv - d.v); for (const a of D.allies) if (a.st === 'free') { const dd = Math.hypot(a.u - d.u, a.v - d.v); if (dd < tgd) { tgd = dd; tg = { u: a.u, v: a.v, a }; } }
      const du = tg.u - d.u, dv = tg.v - d.v, dist = Math.hypot(du, dv) || 1, others = live.filter((q) => q !== d && !q.captain).length;
      if (!d.captain || d.aggro || dist < 6 || others === 0) {
        if (dist > 1.7) { let nu = d.u + (du / dist) * 3 * dt, nv = d.v + (dv / dist) * 3 * dt; for (const q of live) if (q !== d && Math.hypot(q.u - nu, q.v - nv) < 0.8) { nu = d.u; nv = d.v; break; } if (inDeck(e, nu, nv, 0.3)) { d.u = nu; d.v = nv; } d.walk = (d.walk || 0) + 3 * dt; }
        else if (d.cd <= 0) { d.cd = 1.2; d.atk = s.t; const dm = e.kind === 'navy' || d.captain ? 6 : 5; if (tg.a) { tg.a.hp -= dm; tg.a.hitT = s.t; if (tg.a.hp <= 0) { tg.a.st = 'dead'; lose(s, tg.a.cid, say); } } else { s.hp -= dm; s.hurtT = s.t; s.events.push({ type: 'hit' }); } }
      }
      d.face = Math.atan2(f.z - d.z, f.x - d.x);
    }
    const [x, z] = toWorld(e, d.u, d.v); d.x = x; d.z = z; d.y = DECK_Y;
  }
  for (const a of D.allies) { // your hands fight beside you: each goes for the nearest crewman (the captain last)
    if (a.st === 'free') { a.cd = Math.max(0, a.cd - dt); let tg = null, td = 1e9; for (const d of D.defs) if (d.st === 'free') { const dd = Math.hypot(d.u - a.u, d.v - a.v) + (d.captain ? 50 : 0); if (dd < td) { td = dd; tg = d; } }
      if (tg) { const du = tg.u - a.u, dv = tg.v - a.v, dist = Math.hypot(du, dv) || 1; if (dist > 1.7) { const nu = a.u + (du / dist) * 3 * dt, nv = a.v + (dv / dist) * 3 * dt; if (inDeck(e, nu, nv, 0.3)) { a.u = nu; a.v = nv; } a.walk = (a.walk || 0) + 3 * dt; } else if (a.cd <= 0) { a.cd = 1.2; a.atk = s.t; hitDefender(s, tg, 6); } a.face = Math.atan2(tg.z - a.z, tg.x - a.x); } }
    const [x, z] = toWorld(e, a.u, a.v); a.x = x; a.z = z; a.y = DECK_Y;
  }
  if (s.hp <= 0) { // beaten back: you wake aboard your own ship, a tenth poorer, the fight is over for now
    const lost = Math.floor(s.gold * 0.1); s.gold -= lost; s.hp = s.maxHp * 0.5; e.grappled = false; freePrisoner(s, 'Your prisoner is lost in the scramble.'); leaveDeck(s); say(s, `They throw you back onto your own deck, ${lost} gold lighter.`); s.events.push({ type: 'arrest', yaw: s.foot.yaw }); return;
  }
  if (!D.won && !D.defs.some((d) => d.st === 'free')) { D.won = true; cheer(s); say(s, 'The deck is yours! Press F to decide her fate.'); s.events.push({ type: 'won' }); }
}

// ---------------------------------------------------------------- fleet ships: your captured prizes sail with you under one fleet-wide order (T cycles it)
// another captain's ship against land or the Wall: stop short (or ease out if already overlapping), turn away at a sailor's pace and hold that course for a moment.
// (The old code flicked the bow round at several radians a second, so a ship that could not get free spun for ever.)
const AVOID_S = 2.5;
function keepOffLand(s, e, ox, oz, hh, dt) {
  const wall = Math.hypot(e.x, e.z) > WALL_R - 60 && realmOf(s) === 'terra' && Math.hypot(ox, oz) <= WALL_R + 20, hit = wall ? { x: e.x * 2, z: e.z * 2 } : hullHit(s, e.x, e.z, e.yaw, hh[0], hh[1]);
  if (!hit) return;
  const away = Math.atan2(oz - hit.z, ox - hit.x);
  if (!wall && hullHit(s, ox, oz, e.yaw, hh[0], hh[1])) { e.x = ox + Math.cos(away) * 6 * dt; e.z = oz + Math.sin(away) * 6 * dt; } else { e.x = ox; e.z = oz; }
  e.avoid = s.t + AVOID_S; e.away = away; e.speed *= 1 - Math.min(0.5, dt * 2);
}
const turnTo = (e, want, rate, dt) => { e.yaw = wrapPi(e.yaw + Math.max(-rate * dt, Math.min(rate * dt, wrapPi(want - e.yaw)))); };
export function stepFleet(s, dt) {
  const fl = s.fleet; if (!fl || !fl.length) return; const p = s.mode === 'ship' && s.ship ? s.ship : null, order = s.fleetOrder || 'follow';
  for (let i = fl.length - 1; i >= 0; i--) {
    const f = fl[i]; const k = KINDS[f.kind];
    if (f.hp <= 0) { s.sinking.push({ id: f.id, kind: f.kind, seed: f.seed, x: f.x, z: f.z, yaw: f.yaw, speed: f.speed || 0, t0: s.t }); puff(s, 'flash', f.x, 4, f.z, 0.4, { sc: 4 }); fl.splice(i, 1); const c = crewOf(s).find((m) => m.captain === f.id); if (c) { delete c.captain; lose(s, c.id, say); } say(s, 'Your ship ' + f.name + ' goes down with all hands.'); s.events.push({ type: 'sunk' }); continue; }
    if (!p) { f.speed *= 1 - Math.min(1, dt); continue; } // you are ashore: she rides at anchor
    f.cd = Math.max(0, (f.cd || 0) - dt);
    const slotA = p.yaw + Math.PI + (i % 2 ? 1 : -1) * (0.55 + 0.3 * Math.floor(i / 2)), slotD = 40 + 18 * i, sx = p.x + Math.cos(slotA) * slotD, sz = p.z + Math.sin(slotA) * slotD;
    if (Math.hypot(f.x - p.x, f.z - p.z) > 1000) { f.x = sx; f.z = sz; f.yaw = p.yaw; f.speed = 0; }
    let tg = null, td = order === 'attack' ? 400 : order === 'escort' || order === 'guard' ? 180 : 0;
    if (td) for (const e of s.enemies.values()) { if (e.hp <= 0 || !isHostile(s, e)) continue; const d = Math.hypot(e.x - f.x, e.z - f.z); if (d < td) { td = d; tg = e; } }
    let want, spd;
    if (tg) { const a = Math.atan2(tg.z - f.z, tg.x - f.x); want = td < 70 ? a + (Math.sin(a - f.yaw) >= 0 ? -Math.PI / 2 : Math.PI / 2) : a; spd = Math.min(k.speed * 2.4, 22); }
    else if (order === 'guard') { const d = Math.hypot(f.ax - f.x, f.az - f.z); want = Math.atan2(f.az - f.z, f.ax - f.x); spd = d > 50 ? k.speed * 1.5 : 0; }
    else { const d = Math.hypot(sx - f.x, sz - f.z); want = Math.atan2(sz - f.z, sx - f.x); spd = d > 14 ? Math.min(k.speed * 4, p.speed + d * 0.55, 36) : p.speed * 0.9; if (d <= 14 || (d < 30 && p.speed < 1)) want = p.yaw; }
    const dodging = f.avoid > s.t; turnTo(f, dodging ? f.away : want, dodging ? 1.4 : 1, dt);
    f.speed += (spd - f.speed) * Math.min(1, dt * 1.2);
    const ox = f.x, oz = f.z; f.x += Math.cos(f.yaw) * f.speed * dt; f.z += Math.sin(f.yaw) * f.speed * dt; const hh = HULL[f.kind] || HULL.trader;
    keepOffLand(s, f, ox, oz, hh, dt);
    if (tg && f.cd <= 0 && td < CANNON_RANGE) { const a = Math.atan2(tg.z - f.z, tg.x - f.x), dA = wrapPi(a - f.yaw); if (Math.abs(Math.abs(dA) - Math.PI / 2) < 0.5) { fire(s, 'player', f, dA > 0 ? 1 : -1, tg, k.dmg * 1.2); f.cd = CANNON_CD * 1.5; } }
  }
}
export function prizeInfo(s) {
  const e = deckShip(s); if (!e) return null; const k = KINDS[e.kind], gold = k.gold[0] + (e.seed % (k.gold[1] - k.gold[0])), room = Math.max(0, s.hold - cargoCount(s)), n = Math.min(room, 3 + (e.seed % 5)), g = GOODS[e.seed % 6];
  return { name: e.name, kind: e.kind, label: k.label, gold, claim: Math.round(gold * 2), scuttle: Math.round(gold * 0.5), good: g, n, lawful: s.deck.lawful, captain: s.deck.defs.find((d) => d.captain), keep: canKeep(s), fleetFull: fleetOf(s).length >= 3 };
}
export function finishBoarding(s, how) {
  const e = deckShip(s), P = prizeInfo(s); if (!e || !P || !s.deck.won) return false;
  if (how === 'keep' && !canKeep(s)) return false;
  sideShip(s, e, true, G);
  const gold = how === 'claim' ? P.claim : how === 'scuttle' ? P.scuttle : P.gold; s.gold += gold; s.score += gold;
  if (how !== 'scuttle' && P.n) s.cargo[P.good] = (s.cargo[P.good] || 0) + P.n;
  if (how === 'keep') { addPrize(s, e); s.gold -= gold; s.score -= gold; if (!P.lawful) { s.bountyGold = (s.bountyGold || 0) + 300; s.bounty = Math.max(s.bounty, 1); } s.kills++; s.killsBy[e.kind] = (s.killsBy[e.kind] || 0) + 1; if (P.lawful) deed(s, 'sunkHostile'); s.dead.add(e.id); s.enemies.delete(e.id); say(s, `${e.name} joins your fleet under ${s.crew.find((c) => c.captain)?.name || 'a new captain'}. Press T to give the fleet orders.`); leaveDeck(s); s.events.push({ type: 'coin' }); return true; }
  if (how === 'claim' && !P.lawful) { s.bountyGold = (s.bountyGold || 0) + 300; s.bounty = Math.max(s.bounty, 1); }
  if (how === 'scuttle') s.sinking.push({ id: e.id, kind: e.kind, seed: e.seed, x: e.x, z: e.z, yaw: e.yaw, speed: 0, t0: s.t });
  s.enemies.delete(e.id); s.dead.add(e.id); s.kills++; s.killsBy[e.kind] = (s.killsBy[e.kind] || 0) + 1; if (P.lawful) deed(s, 'sunkHostile');
  say(s, `${how === 'claim' ? 'Prize crew take her' : how === 'scuttle' ? 'You scuttle her' : 'You strip her hold'}: +${gold} gold${how !== 'scuttle' && P.n ? `, ${P.n} ${P.good}` : ''}.`);
  leaveDeck(s); s.events.push({ type: 'coin' }); return true;
}
// a sword swing: hits the nearest person in front of you within reach
function swing(s) {
  const w = weaponOf(s), f = s.foot, fx = Math.cos(f.yaw), fz = Math.sin(f.yaw); let best = null, bd = 1e9;
  let bi = null, bx = 0, bz = 0; const consider = (x, z, id, kind, name, seed) => { const dx = x - f.x, dz = z - f.z, d = Math.hypot(dx, dz); if (d < w.reach && d < bd && (dx * fx + dz * fz) / (d || 1) > w.cone) { bd = d; best = [id, kind, name, seed]; bx = x; bz = z; } };
  for (const isl of islandsAt(s, f.x, f.z)) { const b0 = bd;
    for (const n of islandTown(isl).npcs) if (npcAlive(s, n.id)) consider(n.x, n.z, n.id, n.kind, n.name, n.seed);
    for (const v of townsfolk(isl)) { const id = `v${isl.id}:${v.seed}`; if (npcAlive(s, id)) { const p = folkPos(v, s.t); consider(p.x, p.z, id, 'villager', 'the villager', v.seed); } }
    for (const o of s.foes) if (o.isl === isl.id) consider(o.x, o.z, o.id, o.kind, o.name, o.seed);
    if (bd < b0) bi = isl;
  }
  for (const t of board(s)) { const h = s.hunts[t.id]; if (t.kind !== 'foot' || !h || h.x === undefined || (h.st !== 'free' && h.st !== 'sub')) continue; const dx = h.x - f.x, dz = h.z - f.z, d = Math.hypot(dx, dz); if (d < w.reach && d < bd && (dx * fx + dz * fz) / (d || 1) > w.cone * 0.6) { hitTarget(s, t, h, w.dmg, islandsAt(s, f.x, f.z).find((i) => i.id === t.island.id)); s.events.push({ type: 'slash', hit: true, w: s.weapon, swing: true }); return; } }
  if (s.deck && !s.deck.won) for (const d of s.deck.defs) { if (d.st !== 'free') continue; const dx = d.x - f.x, dz = d.z - f.z, dd = Math.hypot(dx, dz); if (dd < w.reach && dd < bd && (dx * fx + dz * fz) / (dd || 1) > w.cone * 0.6) { hitDefender(s, d, w.dmg); s.events.push({ type: 'slash', hit: true, w: s.weapon, swing: true }); return; } }
  for (const g of s.guards) { const dx = g.x - f.x, dz = g.z - f.z, d = Math.hypot(dx, dz); if (d < w.reach && d < bd && (dx * fx + dz * fz) / (d || 1) > w.cone * 0.6) { bd = d; g.hp -= w.dmg; g.hitT = s.t; spray(s, g.x, g.y + 1.3, g.z, 4); s.events.push({ type: 'slash', hit: true, w: s.weapon, swing: true }); if (g.hp <= 0) { deed(s, 'killWarden', g.isl, 0.5); s.bountyGold += 150; s.bounty = Math.max(s.bounty, 1); say(s, 'You cut down a guard.'); s.events.push({ type: 'kill' }); } return; } }
  if (swingSide(s, G)) return;
  if (w.ranged) s.events.push({ type: 'cannon', x: f.x, z: f.z });
  if (best) { spray(s, bx, groundAt(s, bx, bz) + 1.3, bz, 4); hurtNpc(s, ...best, w.dmg, bi, bx, bz); } s.events.push({ type: 'slash', hit: !!best, w: s.weapon, swing: true });
}
function unfreeze(s, f) {
  for (let r = 0.2; r < 2.5; r += 0.2) for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r; if (canStand(s, x, z, f.y)) { f.x = x; f.z = z; return; } }
}
function stepFoot(s, inp, dt) {
  const f = s.foot;
  if (inp.yaw !== undefined) f.yaw = inp.yaw;
  if (inp.wsel) equip(s, WEAPON_ORDER[inp.wsel - 1]);
  f.cd = Math.max(0, (f.cd || 0) - dt); if (inp.attack && f.cd <= 0) { f.cd = weaponOf(s).cd; swing(s); }
  const sp = (inp.run ? 7.5 : 4) * dt, fx = Math.cos(f.yaw), fz = Math.sin(f.yaw);
  if (!s.deck && blocked(s, f.x, f.z)) unfreeze(s, f);
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
// jobs against raiders must be doable: while "Clear the Lanes" or a cull contract is unfinished there are always raiders within RAIDER_REACH of you
export const RAIDER_REACH = 400;
export const raiderJob = (s) => currentQuest(s)?.id === 'raiders' || activeContracts(s).some((c) => c.type === 'cull' && contractProgress(s, c) < c.n);
function ensureRaiders(s) {
  if (!raiderJob(s) || s.t < (s.raiderT || 0)) return;
  const p = s.ship; let n = 0; for (const e of s.enemies.values()) if (e.kind === 'raider' && e.hp > 0 && Math.hypot(e.x - p.x, e.z - p.z) < RAIDER_REACH) n++;
  if (n >= 2) return;
  s.raiderT = s.t + 8; s.spawnN = (s.spawnN || 0) + 1;
  const r = rngFor(s.seed, 4000 + s.spawnN);
  for (let k = 0; k < 40; k++) { // mostly ahead of you; any open water round you if the way ahead is blocked
    const a = p.yaw + (r() - 0.5) * (k < 12 ? 2.4 : TAU), d = 200 + r() * 150, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (hitIsland(s, x, z) || hullHit(s, x, z, a + Math.PI, 8, 3) || (realmOf(s) === 'terra' && Math.abs(Math.hypot(x, z) - WALL_R) < 150)) continue;
    const sr = rngFor(s.seed, 5000 + s.spawnN);
    s.enemies.set('q' + s.spawnN, { id: 'q' + s.spawnN, seed: hash(s.seed, 9000 + s.spawnN), kind: 'raider', x, z, yaw: a + Math.PI, name: shipName(sr, realmOf(s)), captain: captainName(sr, realmOf(s)), gen: false, speed: 0, hp: KINDS.raider.hp, maxHp: KINDS.raider.hp, cd: [1, 1] });
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
  ensureRaiders(s); manageHunters(s);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const e of sectorEnemies(s.seed, cx + i, cz + j)) {
    want.add(e.id);
    if (!s.enemies.has(e.id) && !s.dead.has(e.id) && !nearLair(s, e.x, e.z) && !nearBarrow(s, e.x, e.z)) s.enemies.set(e.id, { ...e, gen: true, speed: 0, hp: KINDS[e.kind].hp, maxHp: KINDS[e.kind].hp, cd: [1, 1] });
  }
  for (const [id, e] of s.enemies) if (e.gen && !want.has(id)) s.enemies.delete(id);
  for (const [id, e] of s.enemies) if (!e.gen && Math.hypot(e.x - s.ship.x, e.z - s.ship.z) > 1200) s.enemies.delete(id); // story-spawned ships do not pile up behind you
}
const isHostile = (s, e) => { const h = KINDS[e.kind].hostile; return h === true || (h === 'bounty' && s.bounty > 0) || (e.hunter && s.bountyGold > 0); };
// the navy hunts a bad record, but not right away: from HUNT_AT gold of bounty, hunters appear round you (more and more as the record worsens) and vanish when it is cleared
export const HUNT_AT = 300, HUNT_RANGE = 650;
export const hunterCount = (s) => ((s.bountyGold || 0) >= HUNT_AT ? Math.min(4, 1 + Math.floor((s.bountyGold - HUNT_AT) / 300)) : 0);
function manageHunters(s) {
  const p = s.ship, want = hunterCount(s); let n = 0;
  for (const [id, e] of s.enemies) if (e.hunter) { if (!want || Math.hypot(e.x - p.x, e.z - p.z) > 1500) s.enemies.delete(id); else n++; }
  if (n >= want || s.t < (s.hunterT || 0) || Math.hypot(p.x, p.z) > WALL_R - 400) return;
  s.hunterT = s.t + 25; s.hunterN = (s.hunterN || 0) + 1; const r = rngFor(s.seed, 6000 + s.hunterN);
  for (let k = 0; k < 14; k++) { const a = r() * TAU, d = 300 + r() * 120, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; if (hitIsland(s, x, z) || Math.hypot(x, z) > WALL_R - 150) continue; const sr = rngFor(s.seed, 6500 + s.hunterN);
    s.enemies.set('n' + s.hunterN, { id: 'n' + s.hunterN, seed: hash(s.seed, 6600 + s.hunterN), kind: 'navy', hunter: true, x, z, yaw: a + Math.PI, name: shipName(sr, realmOf(s)), captain: captainName(sr, realmOf(s)), gen: false, speed: 0, hp: KINDS.navy.hp, maxHp: KINDS.navy.hp, cd: [1, 1] }); if (!n) say(s, 'Navy sails on the horizon: they are hunting you.'); return; }
}
function fire(s, owner, ship, side, target, dmg, kind = 'round') {
  const v = 38, aim = Math.atan2(target.z - ship.z, target.x - ship.x);
  // the player's guns aim themselves a little: if an enemy is inside the broadside cone, the shot leads it
  let pa = ship.yaw + (side * Math.PI) / 2;
  if (owner === 'player' && target.kind) { const T = Math.max(0.3, Math.hypot(target.x - ship.x, target.z - ship.z) / v), lx = target.x + Math.cos(target.yaw) * target.speed * T, lz = target.z + Math.sin(target.yaw) * target.speed * T, wx = (lx - ship.x) / T - Math.cos(ship.yaw) * ship.speed, wz = (lz - ship.z) / T - Math.sin(ship.yaw) * ship.speed, ax = Math.atan2(wz, wx), dA = wrapPi(ax - pa); if (Math.abs(dA) < 0.6) pa += dA; } // the guns lead the target and allow for your own way (a moving ship throws her shot sideways)
  const ang = owner === 'player' ? pa : aim + ((hash(s.seed, Math.floor(s.t * 10)) / 4294967296) - 0.5) * 0.22;
  s.shots.push({ x: ship.x, z: ship.z, vx: Math.cos(ang) * v + Math.cos(ship.yaw) * ship.speed, vz: Math.sin(ang) * v + Math.sin(ship.yaw) * ship.speed, life: 2.2, owner, dmg, kind });
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
const windGoal = (s) => { const tg = trackedQuest(s)?.target(), f = s.mode === 'ship' ? s.ship : s.foot; return tg && f ? Math.atan2(tg.z - f.z, tg.x - f.x) : null; };
// the breakthrough scene: the ram bites, the ice cracks (ship held), the wall gives way (flash, spray), she surges through the breach, then control returns
function stepCine(s, dt) {
  const c = s.cine; if (!c) return; const a = s.t - c.t0, X = Math.cos(c.ang) * WALL_R, Z = Math.sin(c.ang) * WALL_R;
  if (!c.broke && Math.floor(a * 7) !== Math.floor((a - dt) * 7)) puff(s, 'splash', X + (hash(s.seed, Math.floor(a * 7)) % 40) - 20, 8 + (a * 6), Z + (hash(s.seed, Math.floor(a * 7), 4) % 40) - 20, 1.2, { vy: 3, sc: 2.4 });
  if (!c.broke && a >= CINE_BREAK) { c.broke = true; s.events.push({ type: 'break' }); say(s, 'The Wall breaks! A breach opens in the ice.'); for (let i = 0; i < 12; i++) puff(s, i % 3 ? 'splash' : 'smoke', X + (hash(s.seed, i, 8) % 50) - 25, 6 + (i % 4) * 5, Z + (hash(s.seed, i, 9) % 50) - 25, 1.8, { vy: 4, sc: 3.4 }); }
  if (a >= CINE_S) { s.cine = null; s.flags.beyond = true; s.events.push({ type: 'banner', text: 'Beyond the Wall', sub: 'The sea goes on. The map is yours now (M).' }); }
}
// the fade is done: swap worlds and put the ship on the matching edge of the new one
export function warpNow(s) {
  const w = s.warp; if (!w || !s.ship) return false; const from = realmOf(s), to = w.to;
  if (!enterRealm(s, to)) { s.warp = null; return false; }
  solidCache.clear(); stationCache.clear(); clearWorldCaches(); clearHuntCaches(); s.targets = questWorld(s.seed);
  const p = s.ship; p.speed = 2;
  if (to === 'terra') { const th = REALMS.find((r) => r.id === from)?.grand.ang ?? w.ang; p.x = Math.cos(th) * (OUTER_EDGE - 260); p.z = Math.sin(th) * (OUTER_EDGE - 260); p.yaw = th + Math.PI; }
  else { const th = (REALMS.find((r) => r.id === to)?.grand.ang ?? 0) + Math.PI; let r = WALL_R - 200; for (; r > 3000; r -= 150) if (!hullHit(s, Math.cos(th) * r, Math.sin(th) * r, th + Math.PI, 12, 5)) break; p.x = Math.cos(th) * r; p.z = Math.sin(th) * r; p.yaw = th + Math.PI; }
  s.mode = 'ship'; s.foot = { ...s.foot, x: p.x, z: p.z }; s.edgeT = s.t; s.wind = windAt(s.t, null);
  say(s, to === 'terra' ? 'Back in the Outer Sea. The Wall lies ahead.' : 'You have crossed into a new world.'); return true;
}
// the weather where you are (see rules/weather.js)
export const weatherNow = (s) => { const p = s.mode === 'ship' && s.ship ? s.ship : s.foot; return weatherAt(s.seed, s.t, isCold(realmOf(s), p.x, p.z, WALL_R)); };
const WEATHER_SAY = { rain: 'Rain sweeps in.', storm: 'A storm is breaking. Shorten sail or stay close to land.', fog: 'Fog rolls over the water.', snow: 'Snow begins to fall.', clear: 'The sky clears.' };
function stepWeather(s) { const w = weatherNow(s); setRough(roughOf(w)); if (s.wxKind && w.kind !== s.wxKind && WEATHER_SAY[w.kind]) say(s, WEATHER_SAY[w.kind]); s.wxKind = w.kind; }
function stepShip(s, inp, dt) {
  const p = s.ship, gate = gatePos(s.baseSeed || s.seed);
  s.wind = windAt(s.t, windGoal(s)); const wx = weatherNow(s); s.wind = { dir: s.wind.dir + gust(wx, s.t), speed: Math.min(1.35, s.wind.speed * windMul(wx)) }; // storms blow harder and swing about
  if (s.cine) inp = {}; // the breakthrough scene drives the ship
  let rudder = inp.rudder || 0, sailIn = inp.sail || 0;
  if (s.cine) { rudder = Math.max(-1, Math.min(1, wrapPi(s.cine.ang - p.yaw) * 2.5)); sailIn = 1; p.sail = 1; s.row = false; s.auto = false; }
  if (s.auto) { if (rudder || sailIn || inp.trim) { s.auto = false; say(s, 'Autosail off: you have the helm.'); } else { const a = autoSail(s, p); rudder = a.rudder; sailIn = 1; p.trim = bestTrim(p.yaw, s.wind, p.trim); } }
  p.trim = Math.max(-1, Math.min(1, (p.trim || 0) + (inp.trim || 0) * 1.2 * dt));
  p.turn = (p.turn || 0) + (rudder - (p.turn || 0)) * Math.min(1, dt * 3); // how hard the ship is turning: the renderer heels her over
  p.sail = Math.min(1, Math.max(0, p.sail + sailIn * 0.5 * dt));
  const cls = shipOf(s);
  p.yaw = wrapPi(p.yaw + rudder * cls.turn * (0.3 + 0.55 * Math.min(1, Math.abs(p.speed) / 5)) * dt);
  const trimMul = Math.max(trimFloor(s), trimQuality(p.trim, bestTrim(p.yaw, s.wind, p.trim))); // a badly trimmed sail spills the wind
  if (windAngle(p.yaw, s.wind) < 0.5 && p.sail > 0.2 && !s.row && s.t - (s.irT || -99) > 14) { s.irT = s.t; say(s, 'Head to wind: the sail flaps and you stall. Turn away from the wind, or take the oars.'); }
  const target = Math.max(s.row ? ROW_SPEED * cls.row * rowMul(s) * sailorMul(s) : 0, MAX_SPEED * cls.speed * speedMul(s) * sailorMul(s) * p.sail * trimMul * sailEfficiency(p.yaw, s.wind)) * (1 - 0.35 * (1 - s.hull / s.maxHull)) * (1 - cargoCount(s) * 0.01);
  p.speed += ((s.cine ? (s.cine.broke ? Math.max(target, 11) : 0) : target) - p.speed) * Math.min(1, dt * (s.cine ? 1.6 : 0.8));
  const ox = p.x, oz = p.z;
  p.x += Math.cos(p.yaw) * p.speed * dt; p.z += Math.sin(p.yaw) * p.speed * dt;
  const hitNow = hullHit(s, p.x, p.z, p.yaw, cls.L, cls.B);
  if (hitNow && hullHit(s, ox, oz, p.yaw, cls.L, cls.B)) { // turning swung the hull over the shore (or she was already inside): never lock the helm, just shoulder her out to sea
    const d = Math.hypot(p.x - hitNow.x, p.z - hitNow.z) || 1; p.x += ((p.x - hitNow.x) / d) * 4 * dt; p.z += ((p.z - hitNow.z) / d) * 4 * dt;
  } else if (hitNow) { // moving into land: stop
    if (p.speed > 6) { s.hull -= p.speed * 0.35; say(s, 'Aground! The hull groans.'); }
    p.x = ox; p.z = oz; p.speed = -p.speed * 0.3;
    if (s.auto) { s.auto = false; say(s, 'Autosail off.'); }
  }
  const d = Math.hypot(p.x, p.z), od = Math.hypot(ox, oz), terra = realmOf(s) === 'terra';
  if (s.warp) p.speed *= 1 - Math.min(1, dt * 1.5); // crossing to another world: she slows as the fade comes
  if (terra) {
    if (d > WALL_R - 12 && d < WALL_R + 14) { // inside the ice itself: only the weak spot, once broken, lets you through
      const gd = Math.abs(wrapPi(Math.atan2(p.z, p.x) - gate.angle)) * WALL_R, weak = gd < GATE_HALF, c = s.cine;
      if (!s.flags.crossed && weak && s.upgrades.ram && p.speed > 3.2 && od <= WALL_R - 12) { // the ram bites: the breakthrough scene starts here
        s.flags.crossed = true; s.cine = { t0: s.t, ang: Math.atan2(p.z, p.x) }; p.x = ox; p.z = oz; p.speed = Math.min(p.speed, 2.5); s.events.push({ type: 'cine' });
        say(s, 'The ram bites into the ice. A crack runs up the Wall...');
      } else if (s.flags.crossed && weak && (!c || c.broke)) { /* the breach: open water */ }
      else {
        p.x = ox; p.z = oz; p.speed = c ? p.speed * 0.5 : -Math.abs(p.speed) * 0.3;
        if (!c && s.t - s.msgT > 6) { s.msgT = s.t; say(s, weak ? (s.upgrades.ram ? 'Not fast enough! Back off, drop cargo or wait for a fair wind, and charge the pale ice (oars help).' : 'The ice here is thin and cracked, but only an icebreaker ram will break it.') : 'A sheer wall of ice. Look for a stretch that is paler and cracked.'); }
      }
    } else if (d >= WALL_R + 14 && !s.warp) { // the Outer Sea: open water beyond the Wall, and at its edge the next world
      if (d > OUTER_EDGE - EDGE_HINT && s.t - (s.edgeT || -99) > 60) { s.edgeT = s.t; say(s, 'The water changes ahead. The sea seems to go on forever.'); }
      if (d >= OUTER_EDGE) { const a = Math.atan2(p.z, p.x), dest = destinationAt(a); if (dest) { s.warp = { to: dest.id, t0: s.t, ang: a }; s.events.push({ type: 'warp', to: dest.id }); } }
    }
  } else if (d > RIM_EXIT && !s.warp) { s.warp = { to: 'terra', t0: s.t, ang: Math.atan2(p.z, p.x) }; s.events.push({ type: 'warp', to: 'terra' }); }
  if (wx.storm > 0.6 && p.sail > 0.55 && !s.cine && calm(p.x, p.z) > 0.8 && s.t - (s.stormT || 0) > 8) { s.stormT = s.t; if (s.hull > 10) { s.hull = Math.max(10, s.hull - 2); s.hitT = s.t; say(s, 'The storm batters her! Reef your sails (S) or find the lee of an island.'); } } // in open water under too much sail; weather alone never sinks you
  if (Math.abs(p.speed) > 0.5) { s.foodT += dt; if (s.foodT > 45) { s.foodT = 0; if (s.food > 0) s.food--; } }
  if (s.food <= 0 && Math.abs(p.speed) > 0.5) { s.hull -= 0.25 * dt; if (s.t - s.msgT > 12) { s.msgT = s.t; say(s, 'You are starving! Buy provisions.'); } }
  p.cd[0] = Math.max(0, p.cd[0] - dt); p.cd[1] = Math.max(0, p.cd[1] - dt);
  manageEnemies(s);
  let near = null, nd = 1e9;
  for (const e of s.enemies.values()) { const dd = Math.hypot(e.x - p.x, e.z - p.z); if (dd < nd) { nd = dd; near = e; } }
  stepDraugr(s, dt, say, puff); const sp = stepSerpent(s, dt, say, puff); if (sp && Math.hypot(sp.x - p.x, sp.z - p.z) < nd) near = sp; // the guns lay for the serpent when it is the nearest thing up
  for (const [side, key, i] of [[-1, 'fireL', 0], [1, 'fireR', 1]]) if (inp[key] && p.cd[i] <= 0) { const sh = shotNow(s); if (sh !== 'round') { ammoOf(s)[sh]--; if (!ammoOf(s)[sh]) say(s, AMMO[sh].name + ' is spent: back to round shot.'); } fire(s, 'player', p, side, near || { x: p.x, z: p.z }, cls.dmg * gunMul(s) * AMMO[sh].dmg, sh); p.cd[i] = CANNON_CD * cls.cd * reloadMul(s); }
  for (const e of s.enemies.values()) {
    const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz), kind = KINDS[e.kind], hostile = isHostile(s, e), chase = hostile && dist < (e.hunter ? HUNT_RANGE : 240);
    const want = chase ? Math.atan2(dz, dx) + (dist < 60 && e.kind !== 'draugr' ? Math.PI / 2 : 0) : e.yaw + Math.sin(s.t * 0.1 + e.seed) * 0.05;
    const dodging = e.avoid > s.t; turnTo(e, dodging ? e.away : want, dodging ? 1.2 : 0.6, dt);
    const tgt = (chase ? kind.speed : kind.speed * 0.55) * Math.max(0.35, sailEfficiency(e.yaw, s.wind)) * (e.slow > s.t ? 0.4 : 1);
    if (e.burn > s.t) { e.hp -= (e.kind === 'draugr' ? 4.5 : 3) * dt; if (Math.floor(s.t * 4) !== Math.floor((s.t - dt) * 4)) { puff(s, 'flash', e.x + (hash(e.seed, Math.floor(s.t * 4)) % 5) - 2, 4, e.z, 0.3, { sc: 1.4 }); puff(s, 'smoke', e.x, 4.5, e.z, 1.2, { vy: 2, sc: 1.6 }); } }
    e.speed += (tgt - e.speed) * Math.min(1, dt * 0.5);
    const ex = e.x, ez = e.z; e.x += Math.cos(e.yaw) * e.speed * dt; e.z += Math.sin(e.yaw) * e.speed * dt;
    keepOffLand(s, e, ex, ez, HULL[e.kind] || HULL.trader, dt);
    e.cd[0] = Math.max(0, e.cd[0] - dt);
    const rel = Math.abs(wrapPi(Math.atan2(dz, dx) - e.yaw));
    if (hostile && dist < CANNON_RANGE && Math.abs(rel - Math.PI / 2) < 0.5 && e.cd[0] <= 0) { fire(s, 'enemy', e, 1, p, kind.dmg); e.cd[0] = CANNON_CD * 1.6; }
    if (hostile && e.cd[0] <= 0) for (const f of s.fleet) { const fx = f.x - e.x, fz = f.z - e.z; if (Math.hypot(fx, fz) < CANNON_RANGE && Math.abs(Math.abs(wrapPi(Math.atan2(fz, fx) - e.yaw)) - Math.PI / 2) < 0.5) { fire(s, 'enemy', e, 1, f, kind.dmg); e.cd[0] = CANNON_CD * 1.6; break; } }
  }
  if (level(s, 'swivel')) { p.sw = Math.max(0, (p.sw || 0) - dt); if (p.sw <= 0) { let te = null, td = SWIVEL_RANGE; for (const e of s.enemies.values()) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (e.hp > 0 && d < td && isHostile(s, e)) { td = d; te = e; } } if (te) { p.sw = SWIVEL_CD; te.hp -= SWIVEL_DMG; te.hitT = s.t; puff(s, 'flash', (te.x + p.x) / 2, 3, (te.z + p.z) / 2, 0.15, { sc: 0.8 }); } } }
  for (const b of s.shots) {
    b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
    if (b.owner !== 'player' && b.life > 0) for (const f of s.fleet) if (Math.hypot(f.x - b.x, f.z - b.z) < 5) { b.life = 0; b.hit = true; f.hp -= b.dmg; f.hitT = s.t; puff(s, 'flash', b.x, 3.2, b.z, 0.25, { sc: 1.8 }); puff(s, 'smoke', b.x, 3.2, b.z, 1.2, { vy: 2, sc: 1.4 }); break; }
    if (b.owner === 'player') {
      if (b.life > 0 && shotSerpent(s, b)) { b.life = 0; b.hit = true; puff(s, 'flash', b.x, 2.5, b.z, 0.25, { sc: 2 }); puff(s, 'splash', b.x, 0.6, b.z, 0.7, { sc: 1.6 }); continue; }
      if (s.bombard && b.life > 0) { const th = townHit(s, b.x, b.z); if (th) { b.life = 0; b.hit = true; bombardTown(s, th.isl, th.b, b.dmg, b.x, b.z); continue; } }
      for (const e of s.enemies.values()) if (Math.hypot(e.x - b.x, e.z - b.z) < 6 && b.life > 0) { b.life = 0; b.hit = true; e.hp -= b.dmg * shotMul(e, b.kind); e.hitT = s.t; if (b.kind === 'chain') { e.slow = s.t + 8; puff(s, 'splash', b.x, 3, b.z, 0.5, { sc: 1 }); } if (b.kind === 'fire') e.burn = s.t + 6; puff(s, 'flash', b.x, 3.5, b.z, 0.25, { sc: 2 }); puff(s, 'smoke', b.x, 3.5, b.z, 1.4, { vy: 2, sc: 1.6 }); puff(s, 'splash', b.x, 0.4, b.z, 0.7, { sc: 1.4 }); if (!isHostile(s, e) && KINDS[e.kind].dmg > 0) s.bounty = Math.max(s.bounty, 1); }
    } else if (Math.hypot(p.x - b.x, p.z - b.z) < 4.5 && b.life > 0) { b.life = 0; b.hit = true; s.hull -= b.dmg; s.hitT = s.t; puff(s, 'flash', b.x, 3.2, b.z, 0.25, { sc: 1.8 }); puff(s, 'smoke', b.x, 3.2, b.z, 1.2, { vy: 2, sc: 1.4 }); say(s, 'We are hit!'); s.events.push({ type: 'hit' }); }
  }
  for (const b of s.shots) if (b.life <= 0 && !b.hit) puff(s, 'splash', b.x, 0.3, b.z, 0.6, { sc: 1.1 }); // a miss throws up a splash
  s.shots = s.shots.filter((b) => b.life > 0);
  for (const e of [...s.enemies.values()]) if (e.hp <= 0) {
    const k = KINDS[e.kind];
    s.sinking.push({ id: e.id, kind: e.kind, seed: e.seed, x: e.x, z: e.z, yaw: e.yaw, speed: e.speed || 0, t0: s.t }); puff(s, 'flash', e.x, 4, e.z, 0.4, { sc: 4 }); for (let q = 0; q < 3; q++) puff(s, 'smoke', e.x + q * 2 - 2, 4, e.z - q + 1, 1.8, { vy: 2.5, sc: 2.4 });
    s.enemies.delete(e.id); s.dead.add(e.id); sideShip(s, e, false, G); for (const t of board(s)) if (t.kind === 'ship' && t.enemyId === e.id) claimKill(s, t, null); s.kills++; s.killsBy[e.kind] = (s.killsBy[e.kind] || 0) + 1;
    if (!k.hostile) { s.bounty++; s.bountyGold += 150; deed(s, 'sunkPeaceful'); } else deed(s, 'sunkHostile');
    const gold = k.gold[0] + (e.seed % (k.gold[1] - k.gold[0])), room = Math.max(0, s.hold - cargoCount(s)), n = e.kind === 'draugr' ? 0 : Math.min(room, 3), g = ['rum', 'sugar', 'timber', 'cannon', 'spice', 'silk'][e.seed % 6];
    s.gold += gold; s.cargo[g] = (s.cargo[g] || 0) + n; s.score += gold; say(s, `Sank ${e.name}! +${gold} gold${n ? `, ${n} ${g}` : ''}.`);
    s.events.push({ type: 'sunk' });
  }
}

// side stories, town events and companions get the ground helpers they need
const G = { ship: (s, q, kind, name, at) => { // a story ship, put in open water near its place
    const r = rngFor(q.seed, 31), id = 's' + q.id;
    for (let k = 0; k < 80; k++) { const a = r() * TAU, d = 120 + k * 5, x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
      if (hitIsland(s, x, z) || hullHit(s, x, z, a, 10, 4) || (realmOf(s) === 'terra' && Math.abs(Math.hypot(x, z) - WALL_R) < 150)) continue;
      s.enemies.set(id, { id, quest: q.id, seed: hash(q.seed, 41), kind, x, z, yaw: a, name, captain: captainName(r, realmOf(s)), gen: false, speed: 0, hp: KINDS[kind].hp, maxHp: KINDS[kind].hp, cd: [1, 1] }); return;
    }
  }, islandsAt: (s, x, z) => islandsAt(s, x, z), nearby: (s, x, z, r) => nearbyIslands(s, x, z, r), walk: (s, e, x, z, d) => walkToward(s, e, x, z, d), ground: (s, x, z) => groundAt(s, x, z), say, spray,
  near: (s, x, z, r) => { const y0 = groundAt(s, x, z); for (let d = r; d < r + 8; d += 0.6) for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU + r, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, y = groundAt(s, px, pz); if (y >= 0.8 && Math.abs(y - y0) < 1.6 && roomy(s, px, pz)) return { x: px, z: pz, y }; } return null; }, // dry land beside a point
  spot: (s, isl, seed) => { const pl = isl.port ? islandTown(isl).plaza : isl.landing || isl, r = rngFor(seed, 77); for (let k = 0; k < 120; k++) { const a = r() * TAU, d = (isl.port ? 8 : 4) + r() * (isl.port ? 12 : 10), x = pl.x + Math.cos(a) * d, z = pl.z + Math.sin(a) * d, y = groundAt(s, x, z); if (y >= 0.8 && roomy(s, x, z)) return { x, z, y }; } const p = freeSpotNear(s, pl.x, pl.z, pl.x, pl.z + 1, 3, 26); return p && { x: p.x, z: p.z, y: groundAt(s, p.x, p.z) }; } };
export const sideOffersFor = (s, isl) => sideOffers(s, isl, G);
export const takeSide = (s, offer) => acceptSide(s, offer, G);
export const pickSide = (s, id, i) => chooseSide(s, id, i, G);
export const dropSide = (s, id) => abandonSide(s, id, G);
const crowdSpots = (s, isl, n) => { const P = islandTown(isl).plaza, out = []; for (let r = 4.2; r < 8 && out.length < n; r += 0.9) for (let k = 0; k < 12 && out.length < n; k++) { const a = (k * 5 % 12) * (TAU / 12) + r, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r, y = groundAt(s, x, z); if (y >= 0.8 && !blocked(s, x, z) && Math.hypot(x - s.foot.x, z - s.foot.z) > 1.5 && out.every((q) => Math.hypot(q[0] - x, q[2] - z) > 1.3)) out.push([x, y, z]); } return out; };
// once a second on foot: what is going on in the town you are in
function stepEvents(s) {
  if (s.mode !== 'foot' || s.deck) return;
  const isl = islandsAt(s, s.foot.x, s.foot.z).find((i) => i.port); if (!isl) { s.ev = null; return; }
  const ev = townState(s, isl.id) >= 2 ? null : eventFor(s, isl);
  if (ev && (s.ev?.iid !== isl.id || s.ev.key !== ev.key)) say(s, `${isl.port.name}: ${ev.name}. ${ev.line}`);
  if (!ev) s.ev = null; else if (s.ev?.iid !== isl.id || s.ev.key !== ev.key) s.ev = { iid: isl.id, key: ev.key, crowd: crowdSpots(s, isl, ev.folk || 0) };
  if (ev?.smoke) { const bs = islandTown(isl).buildings, b = bs[(isl.seed >>> 0) % bs.length]; if (b) puff(s, 'smoke', b.x + (Math.floor(s.t) % 3) - 1, b.pad + b.h + 1, b.z, 2.2, { vy: 2.4, sc: 2.2 }); }
}
// input: { rudder, sail, fireL, fireR } at sea; { mx, mz, run, yaw } on foot
function stepMap(s) { if (realmOf(s) !== 'terra') { if (s.mode === 'foot' && !s.deck && Math.floor(s.t) !== Math.floor(s.t - DT)) { const isl = standingOn(s); if (isl && isl.port) visit(s, isl, realmOf(s)); } return; } const sea = s.mode === 'ship' || !!s.deck, p = sea && s.ship ? s.ship : s.foot; if (explore(s, 'terra', p.x, p.z, !sea) && !sea) { const isl = standingOn(s); if (isl && (isl.port || isl.landing) && visit(s, isl) && STYLES[isl.style]?.label && s.mode === 'foot') say(s, `${isl.port.name}, a ${STYLES[isl.style].label}. ${STYLES[isl.style].perk}`); } }
export function step(s, input, dt = DT) {
  if (s.over || s.ending) return;
  s.t += dt; stepWeather(s);
  if (s.sunkT !== undefined) { // your own ship is going down: no more steering, she rolls over and slips under, then it is game over
    const a = s.t - s.sunkT, p = s.ship; p.x += Math.cos(p.yaw) * p.speed * dt; p.z += Math.sin(p.yaw) * p.speed * dt; p.speed *= 1 - Math.min(1, dt * 0.9); updateFx(s, dt);
    if (a < SINK_S - 1 && Math.floor(a * 3) !== Math.floor((a - dt) * 3)) puff(s, 'smoke', p.x + (hash(s.seed, Math.floor(a * 3)) % 5) - 2, 3 + a, p.z + (hash(s.seed, Math.floor(a * 3), 5) % 5) - 2, 1.6, { vy: 2, sc: 2 });
    if (!s.sunkSplash && a > SINK_S * 0.5) { s.sunkSplash = true; puff(s, 'splash', p.x, 0.5, p.z, 1.1, { sc: 3.2 }); }
    if (a >= SINK_S) s.over = true; return;
  }
  if (s.mode === 'ship') stepShip(s, input, dt); else { stepFoot(s, input, dt); s.wind = windAt(s.t, windGoal(s)); if (s.ship && Math.floor(s.t * 2) !== Math.floor((s.t - dt) * 2)) unstickShip(s); }
  advanceQuests(s, say); stepFleet(s, dt); stepMap(s); stepCrew(s, dt, say); stepTowns(s, dt); stepFoes(s, dt); stepDeck(s, dt); stepSide(s, dt, G); stepHunts(s, dt); stepCine(s, dt); if (Math.floor(s.t) !== Math.floor(s.t - dt)) { stepContracts(s, say); stepEvents(s); } stepGuards(s, dt); updateFx(s, dt);
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
// an Asgard rune stone within reach (its island), or null
const nearRune = (s) => { for (const i of islandsAt(s, s.foot.x, s.foot.z)) if (i.theme === 'asgard') for (const p of islandProps(i)) if (p.k === 'rune' && Math.hypot(p.x - s.foot.x, p.z - s.foot.z) < 3.2) return i; return null; };
// read a rune stone: its line of lore; the first read of each stone counts (s.runes, saved) and adds a little to your score
export function readRune(s, isl) {
  const seen = (s.runes ||= []), fresh = !seen.includes(isl.id); if (fresh) { seen.push(isl.id); s.score += 20; }
  return { type: 'npc', npc: { name: 'Rune stone', kind: isl.name }, lines: [runeLine(isl), `${fresh ? 'You copy the runes into your log.' : 'You have read this stone before.'} Rune stones read: ${seen.length}.`], panel: null };
}
const nearTreasure = (s) => { for (const i of islandsAt(s, s.foot.x, s.foot.z)) if (i.treasure && !s.found.has(i.id) && Math.hypot(i.treasure.x - s.foot.x, i.treasure.z - s.foot.z) < 5) return i; return null; };
export const standingOn = (s) => islandsAt(s, s.foot.x, s.foot.z)[0] || null;

// what pressing F would do right now (for the on-screen prompt)
export function prompt(s) {
  if (s.mode === 'ship') { const g = nearestShip(s); return g ? `G  Grapple the ${KINDS[g.kind].label.toLowerCase()} ${g.name}${findLand(s) ? '   ·   F  Dock' : ''}` : findLand(s) ? 'F  Dock and go ashore' : null; }
  if (s.deck && !nearSub(s)) return s.deck.won ? 'F  Decide the ship\'s fate' : 'F  Cut the grapples and retreat';
  const sb = nearSub(s); if (sb) return s.prisoner ? 'You are already holding a prisoner' : `F  Bind ${sb.name} (${sb.crime})`;
  const qa = nearActor(s); if (qa) return qa.kind === 'find' ? 'F  Search here' : `F  Speak with ${qa.name}`;
  const n = nearNpc(s); if (n) return `F  Talk to ${n.name} (${n.kind})`;
  for (const i of islandsAt(s, s.foot.x, s.foot.z)) for (const q of islandTown(i).npcs) if (!npcAlive(s, q.id) && Math.hypot(q.x - s.foot.x, q.z - s.foot.z) < 4.5) return 'Closed: the owner is gone';
  if (nearBoard(s)) return 'F  Read the notice board';
  if (nearRune(s)) return 'F  Read the rune stone';
  if (nearTreasure(s)) return 'F  Dig';
  if (s.ship && onPier(s) && Math.hypot(s.ship.x - s.foot.x, s.ship.z - s.foot.z) < DOCK_RANGE) return 'F  Board your ship';
  return null;
}
// returns what happened, so the UI can react: { type: 'npc'|'ashore'|'board'|'dig'|'none', ... }
export function interact(s) {
  if (s.over || s.ending) return { type: 'none' };
  if (s.deck && !nearSub(s)) return s.deck.won ? { type: 'prize' } : retreat(s);
  if (s.mode === 'ship') {
    const l = findLand(s); if (!l) { say(s, 'You can only go ashore at a dock or a beach landing.'); return { type: 'none' }; }
    unstickShip(s); s.mode = 'foot'; s.foot = { x: l.x, z: l.z, y: l.y, yaw: l.yaw }; s.ship.speed = 0; say(s, 'Ashore.'); return { type: 'ashore' };
  }
  const sb = nearSub(s); if (sb) { if (s.prisoner) { say(s, 'You are already holding a prisoner. Hand them in first.'); return { type: 'none' }; } { const hb = huntOf(s, sb); hb.st = 'bound'; hb.hp = 12; hb.x = undefined; } s.prisoner = sb.id; if (s.deck) { const c = s.deck.defs.find((d) => d.captain); if (c) c.st = 'taken'; } say(s, `You bind ${sb.name}. Take them to any guard station in this realm and hand them in (${sb.aliveOnly ? 'alive only' : 'alive pays more'}).`); return { type: 'bind' }; }
  const qa = nearActor(s); if (qa) return useActor(s, qa, G);
  const n = nearNpc(s); if (n && ['merchant', 'shipwright', 'smith', 'tavern'].includes(n.kind)) { const bi = islandsAt(s, s.foot.x, s.foot.z).find((i) => islandTown(i).npcs.includes(n)); if (bi && townState(s, bi.id) >= 2) return { type: 'npc', npc: n, lines: [townState(s, bi.id) === 2 ? 'The shop is on fire! Get away from here, or help with the buckets.' : 'There is nothing left to sell. Look what you did.'], panel: null }; }
  if (n) { const isl = islandsAt(s, s.foot.x, s.foot.z).find((i) => islandTown(i).npcs.includes(n)); if (isl && shunned(s, isl.id) && ['merchant', 'shipwright', 'warden', 'smith'].includes(n.kind)) return { type: 'npc', npc: n, lines: ['I know what you did here. Get out. I will not serve you.'], panel: null }; const dl = dialog(s, n), tip = learn(s, n, isl); if (tip) dl.lines = [...dl.lines, tip]; return { type: 'npc', npc: n, island: isl, ...dl }; }
  const nb = nearBoard(s); if (nb) return { type: 'news', island: nb };
  const rn = nearRune(s); if (rn) return readRune(s, rn);
  const t = nearTreasure(s);
  if (t) { s.found.add(t.id); s.gold += t.treasure.gold; s.score += t.treasure.gold; say(s, `Buried treasure! ${t.treasure.gold} gold.`); s.events.push({ type: 'coin' }); return { type: 'dig' }; }
  if (s.ship && onPier(s) && Math.hypot(s.ship.x - s.foot.x, s.ship.z - s.foot.z) < DOCK_RANGE) { s.mode = 'ship'; s.ship.speed = 0; s.ship.trim = bestTrim(s.ship.yaw, s.wind, 0); say(s, 'Aboard! W lets the sail out; Z and C swing the boom.'); return { type: 'board' }; }
  return { type: 'none' };
}
export const contractsFor = (s, isl) => contractOffers(s, isl, nearbyIslands(s, isl.x, isl.z, 3).filter((i) => i.port && i.id !== isl.id));
export const signContract = (s, o) => acceptContract(s, o, say);
export const settleBoard = (s, isl) => settleContracts(s, isl, say);
export const dropContract = (s, id) => abandonContract(s, id, say);
// ---------------------------------------------------------------- fast travel (after the Wall is broken): to any port you have walked, within this world
export const TRAVEL_SPEED = 20, TRAVEL_MIN = 20;
function placesOf(s) {
  const m = mapOf(s), realm = realmOf(s), pl = ((m.places ||= {})[realm] ||= {});
  if (realm === 'terra') { const miss = Object.keys(m.visited).filter((id) => !pl[id]); if (miss.length) { // old saves: find the docks of the ports already visited
    for (let i = -11; i <= 11 && miss.length; i++) for (let j = -11; j <= 11; j++) for (const isl of sectorIslands(s.seed, i, j)) if (m.visited[isl.id] && isl.port?.berth && !pl[isl.id]) pl[isl.id] = { n: m.visited[isl.id], x: isl.x, z: isl.z, b: { x: isl.port.berth.x, z: isl.port.berth.z, yaw: isl.port.berth.yaw } }; } }
  return pl;
}
const hereOf = (s) => (s.mode === 'ship' && s.ship ? s.ship : s.foot);
// why you cannot travel now, or null
export function travelBlock(s) {
  if (!s.flags?.crossed) return 'You have not broken through the Wall yet.';
  if (s.cine || s.warp) return 'Not now.';
  if (!s.ship) return 'You need your ship.';
  if (s.deck) return 'Not in the middle of a boarding.';
  if (s.mode === 'foot' && !onPier(s)) return 'Walk back to your ship or to a pier to set off.';
  for (const e of s.enemies.values()) if (KINDS[e.kind].hostile && Math.hypot(e.x - s.ship.x, e.z - s.ship.z) < 260 && (KINDS[e.kind].hostile === true || s.bounty)) return 'Enemy ships are too close.';
  if (s.guards?.length || s.foes?.length || s.qa?.some((a) => a.awake)) return 'Not while someone is after you.';
  if (s.sinking?.length || s.sunkT !== undefined) return 'Not now.';
  return null;
}
// every port you have visited in this world with the cost of getting there: sea time (a day of provisions per 45 s), nothing else
export function travelList(s) {
  const p = hereOf(s), out = [];
  for (const [id, q] of Object.entries(placesOf(s))) { const d = Math.hypot(q.b.x - p.x, q.b.z - p.z); if (d < 60) continue; const time = Math.max(TRAVEL_MIN, d / TRAVEL_SPEED); out.push({ id, name: q.n, dist: d, time, food: Math.ceil(time / 45) }); }
  return out.sort((a, b) => a.dist - b.dist);
}
export function travelTo(s, id) {
  const why = travelBlock(s); if (why) { say(s, why); return false; }
  const q = travelList(s).find((t) => t.id === id), spot = placesOf(s)[id]; if (!q || !spot) return false;
  if (s.food < q.food) { say(s, `Not enough provisions for the voyage (need ${q.food}).`); return false; }
  s.food -= q.food; s.t += q.time;
  const b = spot.b, p = s.ship; p.x = b.x; p.z = b.z; p.yaw = b.yaw; p.speed = 0; p.sail = 0.5; s.auto = false; s.row = false; s.enemies = new Map(); s.shots = []; s.fx = []; s.mode = 'ship';
  fleetOf(s).forEach((f, i) => { // each ship anchors in open water near the dock, never on the island
    let px = b.x, pz = b.z; for (let k = 0; k < 40; k++) { const a = b.yaw + (k % 20) * 0.63, d = 22 + 14 * i + 12 * Math.floor(k / 20), x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d; if (!hullHit(s, x, z, b.yaw, 12, 5)) { px = x; pz = z; break; } }
    f.x = px; f.z = pz; f.ax = px; f.az = pz; f.speed = 0; f.yaw = b.yaw; });
  const l = findLand(s); if (l) { unstickShip(s); s.mode = 'foot'; s.foot = { x: l.x, z: l.z, y: l.y, yaw: l.yaw, vy: 0 }; }
  s.wind = windAt(s.t, null); say(s, `You sail to ${spot.n}. ${Math.round(q.time / 60) || 1} min at sea, ${q.food} provisions.`); return true;
}
export { cycleOrder };
export { SECTOR };
