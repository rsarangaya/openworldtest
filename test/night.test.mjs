// Night rules, played: a scripted player walks up to a town's shopkeepers by the game's own collision. By day the market opens;
// after 20:00 every shop (market, shipyard, armoury) is shut until dawn while the tavern stays open and rents a bed; sleeping
// moves the clock to 06:00 and the shops open again; a crime at night brings out one more guard (the night watch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, interact, canStand, groundAt, crime } from '../src/rules/game.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { hourAt, nowHour, sleepTillDawn, shopsShut, BED } from '../src/rules/daynight.js';
import { sectorIslands, islandTown } from '../src/gen/world.js';

const islands = (seed, n = 2) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
function reach(s, x0, z0, tx, tz, rMax = 16) { // breadth-first walk with the game's collision to a spot within talking range
  const seen = new Set(), q = [[x0, z0]], key = (x, z) => Math.round(x * 4) + ',' + Math.round(z * 4); seen.add(key(x0, z0));
  for (let h = 0; h < q.length; h++) {
    const [x, z] = q[h]; if (Math.hypot(x - tx, z - tz) < 2.4) return [x, z];
    for (const [dx, dz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) { const nx = x + dx, nz = z + dz, k = key(nx, nz); if (seen.has(k) || Math.hypot(nx - x0, nz - z0) > rMax) continue; seen.add(k); if (canStand(s, nx, nz, groundAt(s, x, z))) q.push([nx, nz]); }
  }
  return null;
}
const tAt = (h) => { for (let t = 0; t < 1200; t += 0.5) if (hourAt(t) === h) return t; };
// stand in front of the shop door, find a way in, then walk to that spot with the real game step (steering each step)
function walkTo(s, npc) {
  const b = islandTown(s.isl).buildings.find((q) => q.door && Math.abs(npc.x - q.x) < q.w / 2 && Math.abs(npc.z - q.z) < q.d / 2) || { x: npc.x, z: npc.z + 4, d: 0 };
  const x0 = b.x, z0 = b.z + b.d / 2 + 2; s.foot = { x: x0, z: z0, y: groundAt(s, x0, z0), yaw: 0, vy: 0 };
  const p = reach(s, x0, z0, npc.x, npc.z); if (!p) return false;
  for (let i = 0; i < 60 * 10 && Math.hypot(s.foot.x - npc.x, s.foot.z - npc.z) > 2.6; i++) { s.foot.yaw = Math.atan2(npc.z - s.foot.z, npc.x - s.foot.x); step(s, { mz: 1 }, 1 / 60); s.events.length = 0; }
  return Math.hypot(s.foot.x - npc.x, s.foot.z - npc.z) <= 2.6;
}

test('shops shut at night and open at dawn; the tavern rents a bed that moves the clock to 06:00', () => {
  const s = newGame(1717); s.mode = 'foot'; s.gold = 100;
  const isl = islands(s.seed).find((i) => { const n = islandTown(i).npcs; return i.port && n.some((q) => q.kind === 'merchant') && n.some((q) => q.kind === 'tavern'); }); s.isl = isl;
  const T = islandTown(isl), merchant = T.npcs.find((n) => n.kind === 'merchant'), keeper = T.npcs.find((n) => n.kind === 'tavern');
  s.t = tAt(12); assert.ok(walkTo(s, merchant), 'walked to the merchant by day');
  let r = interact(s); assert.equal(r.panel, 'market', 'open at noon');
  s.t = tAt(21); assert.ok(shopsShut(nowHour(s))); assert.ok(walkTo(s, merchant), 'walked to the merchant at night');
  r = interact(s); assert.equal(r.type, 'npc'); assert.equal(r.panel, null, 'shut at 21:00'); assert.ok(/shut for the night/.test(r.lines[0]), r.lines[0]);
  for (const kind of ['smith', 'shipwright']) { const n = islands(s.seed).flatMap((i) => islandTown(i).npcs.map((q) => [i, q])).find(([, q]) => q.kind === kind); s.isl = n[0]; if (walkTo(s, n[1])) assert.equal(interact(s).panel, null, kind + ' shut at night'); }
  s.isl = isl; assert.ok(walkTo(s, keeper), 'walked to the tavern keeper at night');
  r = interact(s); assert.equal(r.panel, 'tavern', 'the tavern stays open');
  s.hp = 20; const line = sleepTillDawn(s); assert.ok(/sleep/.test(line), line);
  assert.equal(nowHour(s), 6); assert.equal(s.gold, 100 - BED); assert.equal(s.hp, s.maxHp); assert.ok(!shopsShut(nowHour(s)));
  assert.ok(/after dark/.test(sleepTillDawn(s)) && s.gold === 100 - BED, 'no bed by day, nothing paid');
  const back = deserialize(serialize(s)); assert.equal(nowHour(back), 6, 'the morning survives a save');
  s.isl = isl; assert.ok(walkTo(s, merchant)); assert.equal(interact(s).panel, 'market', 'open again at dawn');
  s.t = tAt(23); s.dayOff = 0; s.gold = 2; assert.ok(/do not have/.test(sleepTillDawn(s)) && s.gold === 2 && nowHour(s) === 23, 'too poor to sleep');
});

test('the night watch: a crime after dark brings out one more guard than by day', () => {
  const count = (h) => {
    const s = newGame(1717); s.mode = 'foot'; const isl = islands(s.seed).find((i) => i.port && i.tier === 'town'), pl = islandTown(isl).plaza;
    s.t = tAt(h); s.foot = { x: pl.x + 3, z: pl.z + 3, y: groundAt(s, pl.x + 3, pl.z + 3), yaw: 0, vy: 0 }; crime(s, isl, 50, false);
    let most = 0; for (let i = 0; i < 60 * 40; i++) { step(s, {}, 1 / 60); s.events.length = 0; s.hp = s.maxHp; most = Math.max(most, s.guards.length); }
    return most;
  };
  const day = count(12), night = count(23); assert.ok(day >= 1); assert.equal(night, day + 1, `day ${day}, night ${night}`);
});
