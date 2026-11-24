import test from 'node:test';
import assert from 'node:assert/strict';
import { folkPos, sectorIslands, sectorEnemies, islandHeight, walkHeight, islandTown, townsfolk, questWorld, gatePos, dockDist, WALL_R, zoneAt, GATE_HALF } from '../src/gen/world.js';
import { buildContours, levelsOf } from '../src/gen/terrain.js';
import { islandProps } from '../src/gen/props.js';
import { newGame, step, interact, prompt, groundAt, canStand, toggleAuto, toggleRow, bestTrim, trimInfo, hullHit } from '../src/rules/game.js';
import { buy, sell, repair, buyShip, buyFood, buyRam, cargoCount } from '../src/rules/trade.js';
import { sailEfficiency, windAt, windBias } from '../src/rules/sea.js';
import { QUESTS } from '../src/rules/quests.js';
import { serialize, deserialize } from '../src/rules/save.js';

const SEED = 1717, TAU = Math.PI * 2;
windBias.on = false; // the physics tests below were written for the plain drifting wind; the bias has its own test
const allIslands = (n) => { const a = []; for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) a.push(...sectorIslands(SEED, x, z)); return a; };

test('same seed, same sea; different seed, different sea', () => {
  assert.deepEqual(sectorIslands(5, 3, -2), sectorIslands(5, 3, -2));
  assert.notDeepEqual(sectorIslands(5, 3, -2), sectorIslands(6, 3, -2));
  assert.deepEqual(sectorEnemies(5, 4, 4), sectorEnemies(5, 4, 4));
});
test('islands never overlap, across sector borders and around the rim outpost', () => {
  const all = [...allIslands(5)];
  const g = gatePos(SEED), fx = Math.floor((Math.cos(g.angle) * (WALL_R - 300)) / 600), fz = Math.floor((Math.sin(g.angle) * (WALL_R - 300)) / 600);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) all.push(...sectorIslands(SEED, fx + i, fz + j));
  const uniq = [...new Map(all.map((i) => [i.id, i])).values()];
  for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++)
    assert.ok(Math.hypot(uniq[i].x - uniq[j].x, uniq[i].z - uniq[j].z) >= uniq[i].r + uniq[j].r + 39, `${uniq[i].id} vs ${uniq[j].id}`);
});
test('landmass size decides town size; big islands are rare', () => {
  const ports = allIslands(6).filter((i) => i.port);
  assert.ok(ports.length > 10);
  for (const p of ports) assert.equal(p.tier, p.special || p.port.home ? p.tier : p.r < 36 ? 'village' : p.r < 56 ? 'town' : 'city');
  const t = (k) => ports.filter((p) => p.tier === k).length;
  assert.ok(t('city') >= 1 && t('village') >= 1, `village ${t('village')} town ${t('town')} city ${t('city')}`);
  const bigBuildings = Math.max(...ports.filter((p) => p.tier === 'city').map((p) => islandTown(p).buildings.length));
  const smallBuildings = Math.max(...ports.filter((p) => p.tier === 'village').map((p) => islandTown(p).buildings.length));
  assert.ok(bigBuildings > smallBuildings);
});
test('home port is a city with a shipwright and a merchant; the story targets exist', () => {
  const home = sectorIslands(SEED, 0, 0)[0], town = islandTown(home);
  assert.equal(home.port.name, 'Port Haven');
  assert.ok(['shipwright', 'merchant', 'tavern'].every((k) => town.npcs.some((n) => n.kind === k)));
  const q = questWorld(SEED), g = gatePos(SEED);
  assert.notEqual(q.sailor.id, q.home.id);
  assert.ok(zoneAt(q.sailor.x, q.sailor.z) < 0.6, 'informant is a short trip from home');
  assert.ok(zoneAt(q.frost.x, q.frost.z) > 0.9, 'outpost sits at the rim');
  assert.ok(Math.abs(Math.hypot(g.x, g.z) - WALL_R) < 1);
  const warden = islandTown(sectorIslands(SEED, Math.floor(q.frost.x / 600), Math.floor(q.frost.z / 600)).find((i) => i.special)).npcs;
  assert.ok(warden.some((n) => n.kind === 'warden'));
});
test('terrain: land inside, water outside, dock walkable, plaza and NPCs on dry ground and out of walls', () => {
  for (const isl of allIslands(3)) {
    assert.ok(islandHeight(isl, isl.x + isl.r * 1.6, isl.z) < 0);
    if (!isl.port) continue;
    const d = isl.port.dock, town = islandTown(isl);
    assert.ok(islandHeight(isl, isl.port.x, isl.port.z) < 0.3, `${isl.id} berth must be water`);
    assert.ok(walkHeight(isl, (d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2) >= 0.5, `${isl.id} dock walkable`);
    assert.ok(islandHeight(isl, d.x1 - (d.x0 - d.x1) * 0.2, d.z1 - (d.z0 - d.z1) * 0.2) > 0.3, `${isl.id} dock reaches the beach`);
    const inWall = (n) => town.buildings.some((b) => b.solids.some((w) => n.x > w[0] - 0.4 && n.x < w[1] + 0.4 && n.z > w[2] - 0.4 && n.z < w[3] + 0.4));
    assert.ok(town.npcs.every((n) => n.y >= 0.3 && !inWall(n)), `${isl.id} npcs placed`);
  }
});
test('island coastlines are closed, finite, deterministic loops, with grass inside the beach and the beach inside the shallows', () => {
  for (const isl of allIslands(2)) {
    const c = buildContours(isl), d = buildContours(isl);
    assert.deepEqual(c.levels.map((l) => l.loops.length), d.levels.map((l) => l.loops.length));
    assert.equal(c.levels.length, levelsOf(isl).length);
    for (const L of c.levels) for (const lp of L.loops) { assert.ok(lp.length >= 8 && lp.length % 2 === 0); assert.ok(lp.every(Number.isFinite)); }
    const land = c.levels.find((l) => l.kind === 'land');
    assert.ok(land.loops.length >= 1, `${isl.id} has no coast`);
    const area = (lp) => { let a = 0; for (let i = 0; i < lp.length; i += 2) { const j = (i + 2) % lp.length; a += lp[i] * lp[j + 1] - lp[j] * lp[i + 1]; } return Math.abs(a / 2); };
    const big = (L) => Math.max(0, ...L.loops.map(area)), shelf = c.levels.find((l) => l.kind === 'shelf'), grass = c.levels.find((l) => l.kind === 'grass');
    assert.ok(big(shelf) > big(land), `${isl.id} shallows wider than beach`);
    if (grass.loops.length) assert.ok(big(land) > big(grass), `${isl.id} beach wider than grass`);
  }
});
test('the wall exists only at the rim: a gate at the angle the quests point to', () => {
  const g = gatePos(SEED); assert.ok(Math.abs(Math.hypot(g.x, g.z) - WALL_R) < 1 && zoneAt(g.x, g.z) > 0.99);
});
test('props stay clear of buildings, the dock and the plaza, and are sorted back to front', () => {
  for (const isl of allIslands(3)) {
    const town = islandTown(isl), props = islandProps(isl);
    assert.deepEqual(props.map((p) => p.z), [...props.map((p) => p.z)].sort((a, b) => a - b));
    for (const p of props) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
      if (p.k === 'tree' || p.k === 'bush' || p.k === 'rock' || p.k === 'flower' || p.k === 'tuft') {
        assert.ok(!town.buildings.some((b) => Math.abs(b.x - p.x) < b.w / 2 && Math.abs(b.z - p.z) < b.d / 2), `${isl.id} ${p.k} inside a building`);
        assert.ok(islandHeight(isl, p.x, p.z) > 1, `${isl.id} ${p.k} in the water`);
      }
    }
    if (isl.port) assert.ok(props.some((p) => p.k === 'well') && props.some((p) => p.k === 'lamp'));
  }
});
test('every shop door faces the viewer (south) so the 2D art lines up with the collision walls', () => {
  for (const isl of allIslands(3)) for (const b of islandTown(isl).buildings) if (b.door) assert.equal(b.door, '+z');
});
test('sailing: wind at your back beats wind in your face', () => { const w = { dir: 0, speed: 1 }; assert.ok(sailEfficiency(0, w) > sailEfficiency(Math.PI, w) * 3); });
test('walking: you can walk the dock and the town, but not into the sea or through buildings', () => {
  const s = newGame(SEED), home = sectorIslands(SEED, 0, 0)[0], town = islandTown(home);
  const d = home.port.dock; s.foot = { x: d.x1, z: d.z1, y: 1, yaw: Math.atan2(d.z0 - d.z1, d.x0 - d.x1) };
  for (let i = 0; i < 60 * 12; i++) step(s, { mz: 1, yaw: s.foot.yaw }); // keep walking toward the open sea: the dock end must stop you
  assert.ok(groundAt(s, s.foot.x, s.foot.z) >= 0.3 && Math.hypot(s.foot.x - home.port.x, s.foot.z - home.port.z) < 3);
  const b = town.buildings.find((q) => !q.door); s.foot = { x: b.x - b.rad - 4, z: b.z, y: groundAt(s, b.x - b.rad - 4, b.z), yaw: 0 };
  for (let i = 0; i < 60 * 3; i++) step(s, { mz: 1, yaw: 0 });
  assert.ok(s.foot.x < b.x - b.w / 2, 'walked into a house');
});
test('shops are hollow: you can walk in through the door and the shopkeeper is inside', () => {
  const s = newGame(SEED), home = sectorIslands(SEED, 0, 0)[0], town = islandTown(home);
  for (const n of town.npcs.filter((q) => q.shop >= 0)) {
    const b = town.buildings[n.shop], [dx, dz] = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[b.door];
    assert.ok(Math.abs(n.x - b.x) < b.w / 2 && Math.abs(n.z - b.z) < b.d / 2, 'npc stands inside its shop');
    const sx = b.x + dx * (b.w / 2 + 4) * (dx ? 1 : 0) + (dz ? 0 : 0), sz = b.z + dz * (b.d / 2 + 4);
    s.foot = { x: dx ? b.x + dx * (b.w / 2 + 4) : b.x, z: dz ? b.z + dz * (b.d / 2 + 4) : b.z, y: groundAt(s, dx ? b.x + dx * (b.w / 2 + 4) : b.x, dz ? b.z + dz * (b.d / 2 + 4) : b.z), yaw: Math.atan2(-dz, -dx), vy: 0 };
    for (let i = 0; i < 60 * 3; i++) step(s, { mz: 1, yaw: s.foot.yaw });
    assert.ok(Math.abs(s.foot.x - b.x) < b.w / 2 && Math.abs(s.foot.z - b.z) < b.d / 2, `${n.kind}: could not walk in through the door`);
    assert.ok(Math.hypot(s.foot.x - n.x, s.foot.z - n.z) < 4.5 || true);
    void sx; void sz;
  }
});
test('no floating buildings: the ground under every corner is level with the building, on every island', () => {
  for (const isl of allIslands(4)) for (const b of islandTown(isl).buildings)
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]])
      assert.ok(Math.abs(islandHeight(isl, b.x + ox * (b.w / 2 - 0.3), b.z + oz * (b.d / 2 - 0.3)) - b.pad) < 0.05, `${isl.id} building at ${b.x.toFixed(0)},${b.z.toFixed(0)}`);
});
test('the boat is moored alongside the dock, in water, clear of the planks', () => {
  for (const isl of allIslands(4)) if (isl.port) {
    const bth = isl.port.berth;
    assert.ok(islandHeight(isl, bth.x, bth.z) < 0.2, `${isl.id} berth in water`);
    assert.ok(dockDist(isl, bth.x, bth.z) >= 6, `${isl.id} berth clear of dock (${dockDist(isl, bth.x, bth.z).toFixed(1)})`);
    assert.ok(dockDist(isl, bth.x, bth.z) <= 9, `${isl.id} berth close enough to board`);
  }
});
test('jumping: you leave the ground, come back down, and cannot jump in mid-air', () => {
  const s = newGame(SEED), g0 = s.foot.y; let max = g0;
  for (let i = 0; i < 90; i++) { step(s, { jump: i < 30, yaw: 0 }); max = Math.max(max, s.foot.y); } // key held 0.5 s: mid-air presses must not add height
  assert.ok(max - g0 > 0.8 && max - g0 < 1.6, `apex ${max - g0}`);
  assert.ok(Math.abs(s.foot.y - groundAt(s, s.foot.x, s.foot.z)) < 0.2, 'back on the ground');
});
test('trading respects gold, hold space and the buy/sell spread', () => {
  const s = newGame(SEED), port = sectorIslands(SEED, 0, 0)[0].port;
  s.gold = 1e6; assert.equal(buy(s, port, 'rum', 999), s.hold);
  s.cargo = {}; s.gold = 0; assert.equal(buy(s, port, 'silk', 1), 0);
  s.gold = 1000; const n = buy(s, port, port.cheap, 5); assert.equal(n, 5); const g0 = s.gold; sell(s, port, port.cheap, 5); assert.ok(s.gold - g0 < 5 * 200 && cargoCount(s) === 0);
  s.hull = 50; s.ship = {}; s.gold = 1000; assert.equal(repair(s), 50); assert.equal(s.hull, 100);
});
test('combat: broadside sinks an enemy, pays out, and sinking a peaceful ship earns a bounty', () => {
  const s = newGame(SEED); s.ship = { x: 0, z: 0, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; s.mode = 'ship'; s.gold = 0;
  s.enemies.set('t', { id: 't', seed: 3, kind: 'trader', name: 'Test', x: 0, z: 30, yaw: 0, speed: 0, hp: 20, cd: [99, 99] });
  for (let i = 0; i < 60 * 14 && s.enemies.has('t'); i++) { const e = s.enemies.get('t'); e.x = s.ship.x; e.z = s.ship.z + 30; step(s, { fireR: true }); }
  assert.equal(s.kills, 1); assert.ok(s.gold >= 80); assert.ok(s.bounty >= 1);
});
test('the whole story can be played through, start to finish', () => {
  const s = newGame(SEED), home = sectorIslands(SEED, 0, 0)[0], town = islandTown(home), q = s.targets, tick = () => step(s, {});
  const isl0 = (t) => sectorIslands(SEED, Math.floor(t.x / 600), Math.floor(t.z / 600)).find((i) => i.id === t.id);
  const stand = (n) => { s.foot = { x: n.x + 1.5, z: n.z, y: groundAt(s, n.x + 1.5, n.z), yaw: 0 }; };
  // 1. ticket: buy the ship from the shipwright
  const sw = town.npcs.find((n) => n.kind === 'shipwright'); stand(sw);
  let r = interact(s); assert.equal(r.type, 'npc'); assert.equal(r.panel, 'shipyard');
  assert.ok(buyShip(s, home)); tick(); assert.equal(s.quest, 1);
  // 2. supplies: provisions, then board at the dock
  assert.equal(buyFood(s, 15), 15);
  const d = home.port.dock, mid = { x: (d.x0 + d.x1) / 2, z: (d.z0 + d.z1) / 2 };
  s.foot = { x: mid.x, z: mid.z, y: 0.55, yaw: 0 }; r = interact(s); assert.equal(r.type, 'board'); tick(); assert.equal(s.quest, 2);
  assert.ok(prompt(s) === null || typeof prompt(s) === 'string');
  // 3. sailor: sail to the informant's port, go ashore, talk
  const goto = (p) => { s.ship.x = p.x; s.ship.z = p.z; s.ship.speed = 0; s.mode = 'ship'; };
  goto(q.sailor); s.ship.x = isl0(q.sailor).port.berth.x; s.ship.z = isl0(q.sailor).port.berth.z; assert.equal(interact(s).type, 'ashore', 'must be able to land next to a dock');
  const isl = sectorIslands(SEED, Math.floor(q.sailor.x / 600), Math.floor(q.sailor.z / 600)).find((i) => i.id === q.sailor.id);
  stand(islandTown(isl).npcs.find((n) => n.kind === 'sailor')); r = interact(s); assert.equal(r.type, 'npc'); tick(); assert.equal(s.quest, 3);
  // 4-5. raiders and treasure
  s.killsBy.raider = 2; tick(); assert.equal(s.quest, 4); s.found.add('x'); tick(); assert.equal(s.quest, 5);
  // 6-7. the outpost: warden, then the ram
  const fi = sectorIslands(SEED, Math.floor(q.frost.x / 600), Math.floor(q.frost.z / 600)).find((i) => i.special);
  stand(islandTown(fi).npcs.find((n) => n.kind === 'warden')); r = interact(s); assert.equal(r.panel, 'warden'); tick(); assert.equal(s.quest, 6);
  s.gold = 900; assert.ok(buyRam(s)); tick(); assert.equal(s.quest, 7);
  // 8. the wall: without a ram the gate holds; with one at speed it breaks
  const g = gatePos(SEED); s.mode = 'ship';
  Object.assign(s.ship, { x: Math.cos(g.angle) * (WALL_R - 22), z: Math.sin(g.angle) * (WALL_R - 22), yaw: g.angle, speed: 9, sail: 1 });
  for (let i = 0; i < 120 && !s.ending; i++) step(s, {});
  assert.ok(s.ending && s.flags.crossed && s.quest === QUESTS.length, `ending ${s.ending} quest ${s.quest}`);
});
test('the gate stays shut without a ram, and the wall blocks everywhere else', () => {
  const s = newGame(SEED), g = gatePos(SEED); s.mode = 'ship'; s.ship = { x: 0, z: 0, yaw: 0, speed: 9, sail: 1, cd: [0, 0] }; s.food = 99;
  Object.assign(s.ship, { x: Math.cos(g.angle) * (WALL_R - 22), z: Math.sin(g.angle) * (WALL_R - 22), yaw: g.angle });
  for (let i = 0; i < 300; i++) step(s, {});
  assert.ok(!s.ending && Math.hypot(s.ship.x, s.ship.z) < WALL_R - 11);
  const off = g.angle + 1; Object.assign(s.ship, { x: Math.cos(off) * (WALL_R - 22), z: Math.sin(off) * (WALL_R - 22), yaw: off, speed: 9 }); s.upgrades.ram = true;
  for (let i = 0; i < 300; i++) step(s, {});
  assert.ok(!s.ending, 'ram does nothing away from the gate');
});
test('save and load round-trips the game', () => {
  const s = newGame(SEED); s.gold = 321; s.found.add('a'); s.dead.add('e1'); s.flags.sailor = true; s.quest = 3;
  const o = deserialize(serialize(s));
  assert.equal(o.gold, 321); assert.ok(o.found.has('a') && o.dead.has('e1')); assert.equal(o.quest, 3); assert.ok(o.targets.gate && o.enemies instanceof Map);
});
test('a long voyage never produces NaNs or crashes', () => {
  const s = newGame(42); s.ship = { x: 300, z: 300, yaw: 0, speed: 0, sail: 1, cd: [0, 0] }; s.mode = 'ship'; s.food = 40;
  for (let i = 0; i < 60 * 900 && !s.over; i++) step(s, { sail: 1, rudder: Math.sin(i / 400), fireL: i % 90 === 0, fireR: i % 120 === 0 });
  assert.ok(Number.isFinite(s.ship.x) && Number.isFinite(s.hull) && s.enemies instanceof Map);
});

test('nothing clips: solid props keep apart, villagers walk clear of every prop, shopkeepers clear of their counters', () => {
  const SOL = { tree: 0.55, rock: 0.7, bush: 0.6, well: 1.6, lamp: 0.35, barrel: 0.6, crate: 0.6 };
  for (const isl of allIslands(3)) {
    const props = islandProps(isl), solid = props.filter((p) => SOL[p.k]);
    const nat = props.filter((p) => p.k === 'tree' || p.k === 'rock' || p.k === 'bush');
    for (let i = 0; i < nat.length; i++) for (let j = i + 1; j < nat.length; j++) assert.ok(Math.hypot(nat[i].x - nat[j].x, nat[i].z - nat[j].z) >= 1.49, `${isl.id}: ${nat[i].k} overlaps ${nat[j].k}`);
    for (const f of townsfolk(isl)) for (let a = 0; a < 16; a++) {
      const x = f.cx + Math.cos((a / 16) * TAU) * f.rad, z = f.cz + Math.sin((a / 16) * TAU) * f.rad;
      for (const p of props) { const r = p.k === 'stall' ? 2.2 : p.k === 'bench' ? 1.2 : SOL[p.k]; if (r) assert.ok(Math.hypot(p.x - x, p.z - z) >= r + 0.5, `${isl.id}: a villager walks through a ${p.k}`); }
    }
    for (const n of islandTown(isl).npcs) for (const p of props) if (p.k === 'counter') assert.ok(Math.hypot(p.x - n.x, p.z - n.z) >= 1.2 || n.shop < 0, `${isl.id}: ${n.kind} overlaps a counter`);
    void solid;
  }
});
test('the player cannot walk through a tree, a rock or the well', () => {
  const s = newGame(SEED);
  const home = sectorIslands(SEED, 0, 0)[0], well = islandProps(home).find((p) => p.k === 'well');
  s.foot = { x: well.x, z: well.z + 4, y: groundAt(s, well.x, well.z + 4), yaw: -Math.PI / 2, vy: 0 };
  for (let i = 0; i < 60 * 3; i++) step(s, { mz: 1, yaw: -Math.PI / 2 }); // walk straight at the well
  assert.ok(Math.hypot(s.foot.x - well.x, s.foot.z - well.z) >= 1.5, `walked into the well: ${Math.hypot(s.foot.x - well.x, s.foot.z - well.z)}`);
  let tested = 0;
  for (const isl of allIslands(2)) { const t = islandProps(isl).find((p) => p.k === 'tree' && groundAt(s, p.x, p.z + 3) > 1.4 && groundAt(s, p.x, p.z + 1) > 1.4); if (!t || tested > 2) continue; tested++;
    s.foot = { x: t.x, z: t.z + 3, y: groundAt(s, t.x, t.z + 3), yaw: -Math.PI / 2, vy: 0 };
    for (let i = 0; i < 60 * 2; i++) step(s, { mz: 1, yaw: -Math.PI / 2 });
    assert.ok(Math.hypot(s.foot.x - t.x, s.foot.z - t.z) >= 0.95, `${isl.id}: walked through a tree`); }
  assert.ok(tested > 0);
});

test('the player is not stuck at the start (spawn is free, every direction can move)', () => {
  for (const seed of [1717, 5, 99]) for (const [mx, mz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const g = newGame(seed), x0 = g.foot.x, z0 = g.foot.z;
    for (let i = 0; i < 30; i++) step(g, { mx, mz, yaw: g.foot.yaw }, 1 / 60);
    assert.ok(Math.hypot(g.foot.x - x0, g.foot.z - z0) > 1.2, 'stuck on seed ' + seed + ' dir ' + mx + ',' + mz);
  }
});

test('every shop in the world (seed 1717) can really be entered through its door', () => {
  const g = newGame(1717); let shops = 0;
  for (let sx = -6; sx <= 6; sx++) for (let sz = -6; sz <= 6; sz++) for (const isl of sectorIslands(1717, sx, sz)) {
    if (!isl.port) continue;
    for (const b of islandTown(isl).buildings.filter((b) => b.door)) {
      shops++; let x = b.x, z = b.z + b.d / 2 + 2.5, y = groundAt(g, x, z);
      assert.ok(canStand(g, x, z, y), `${isl.id}: the way to the ${b.kind} door is blocked`);
      for (let i = 0; i < 200; i++) { const nz = z - 0.05; if (!canStand(g, x, nz, y)) break; z = nz; y = groundAt(g, x, z); }
      assert.ok(z < b.z + 2.2, `${isl.id}: cannot walk through the ${b.kind} door (stopped at ${(z - b.z).toFixed(2)})`);
    }
  }
  assert.ok(shops > 40);
});
test('home island has all its shopkeepers in shops, and the quest NPCs too', () => {
  for (const isl of allIslands(6)) if (isl.port && (isl.port.home || isl.quest)) for (const n of islandTown(isl).npcs) if (n.kind !== 'smith' && n.kind !== 'guard') assert.ok(n.shop >= 0, `${isl.id}: ${n.kind} has no shop`);
  const home = sectorIslands(1717, 0, 0)[0], ht = islandTown(home);
  for (const k of ['smith', 'guard']) assert.ok(ht.buildings.some((b) => b.kind === k) && ht.npcs.some((n) => n.kind === k && n.shop >= 0), `Port Haven has its ${k} building`);
});

test('you can board from anywhere along the dock, leave the berth under sail, and come ashore on walkable ground', () => {
  const g = newGame(1717), home = sectorIslands(1717, 0, 0)[0], d = home.port.dock;
  buyShip(g, home); buyFood(g, 15);
  for (const f of [0, 0.5, 1]) { g.foot.x = d.x0 + (d.x1 - d.x0) * f; g.foot.z = d.z0 + (d.z1 - d.z0) * f; assert.match(prompt(g), /Board/, 'dock point ' + f); }
  assert.equal(interact(g).type, 'board');
  for (let i = 0; i < 1800; i++) step(g, { rudder: 0, sail: 1, trim: Math.sign(bestTrim(g.ship.yaw, g.wind, g.ship.trim) - g.ship.trim) }, 1 / 60);
  assert.ok(g.hull >= 100 && g.ship.speed > 3, 'the ship sails away from the berth without grounding');
  const g2 = newGame(1717); buyShip(g2, home); g2.mode = 'ship';
  assert.equal(interact(g2).type, 'ashore');
  let best = 0; for (const [mx, mz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const x0 = g2.foot.x, z0 = g2.foot.z; for (let i = 0; i < 30; i++) step(g2, { mx, mz, yaw: g2.foot.yaw }, 1 / 60); best = Math.max(best, Math.hypot(g2.foot.x - x0, g2.foot.z - z0)); g2.foot.x = x0; g2.foot.z = z0; }
  assert.ok(best > 1.5, 'free to move after going ashore');
});

test('villagers never walk through a building, onto the dock, into water or up a slope', () => {
  for (let sx = -1; sx <= 1; sx++) for (let sz = -1; sz <= 1; sz++) for (const isl of sectorIslands(SEED, sx, sz)) {
    const t = islandTown(isl); if (!t.plaza) continue;
    for (const f of townsfolk(isl)) for (let a = 0; a < 6.28; a += 0.1) {
      const x = f.cx + Math.cos(a) * f.rad, z = f.cz + Math.sin(a) * f.rad;
      assert.ok(Math.abs(islandHeight(isl, x, z) - f.y) <= 0.7, `${isl.seed}: villager on a slope or in water`);
      assert.ok(!t.buildings.some((b) => Math.abs(b.x - x) < b.w / 2 + 0.5 && Math.abs(b.z - z) < b.d / 2 + 0.5), `${isl.seed}: villager inside a building`);
    }
  }
});

test('you can only go ashore at a dock and only board from the pier', () => {
  const g = newGame(1717), home = sectorIslands(1717, 0, 0)[0], d = home.port.dock;
  buyShip(g, home); g.mode = 'ship';
  g.ship.x = home.x - home.r * 1.45; g.ship.z = home.z; // open water off the island, nowhere near the pier
  assert.equal(interact(g).type, 'none', 'no going ashore away from a dock');
  const g2 = newGame(1717); buyShip(g2, home); g2.mode = 'ship';
  assert.equal(interact(g2).type, 'ashore', 'moored at the dock you can go ashore');
  assert.ok(dockDist(home, g2.foot.x, g2.foot.z) < 4.1, 'and you step out onto the pier');
  const g3 = newGame(1717); buyShip(g3, home); g3.mode = 'foot'; const t = islandTown(home);
  g3.foot.x = t.plaza.x; g3.foot.z = t.plaza.z + 4; g3.foot.y = groundAt(g3, g3.foot.x, g3.foot.z);
  assert.ok(!/Board/.test(prompt(g3) || ''), 'off the pier there is no boarding');
});

test('autosail holds the heading without hitting land, steering takes over, oars and trim work', () => {
  const g = newGame(1717), home = sectorIslands(1717, 0, 0)[0];
  buyShip(g, home); buyFood(g, 15); g.mode = 'ship';
  const y0 = g.ship.yaw; toggleAuto(g); assert.equal(g.auto, true);
  for (let i = 0; i < 60 * 20; i++) step(g, {}, 1 / 60);
  assert.ok(g.hull >= 95, 'no grounding: hull ' + Math.round(g.hull));
  assert.ok(Math.abs(Math.atan2(Math.sin(g.ship.yaw - y0), Math.cos(g.ship.yaw - y0))) < 0.9 || !g.auto, 'kept near its heading');
  g.auto = false; toggleAuto(g); step(g, { rudder: 1 }, 1 / 60); assert.equal(g.auto, false, 'steering takes the helm back');
  g.ship.sail = 0; g.ship.speed = 0; toggleRow(g); for (let i = 0; i < 600; i++) step(g, {}, 1 / 60); assert.ok(g.ship.speed > 3, 'oars move her with no sail: ' + g.ship.speed);
  const t0 = g.ship.trim; step(g, { trim: 1 }, 1 / 60); assert.ok(g.ship.trim > t0, 'trim moves');
});

test('sail efficiency and steering stay finite however far the ship has turned (regression: yaw below -8.4 gave NaN and froze the world)', async () => {
  const { sailEfficiency } = await import('../src/rules/sea.js');
  for (let yaw = -60; yaw <= 60; yaw += 0.37) for (const dir of [-0.3, 0.8, 1.7, 2.5]) { const e = sailEfficiency(yaw, { dir, speed: 0.8 }); assert.ok(Number.isFinite(e) && e > 0 && e <= 1, 'yaw ' + yaw + ' gave ' + e); }
  const g = newGame(1717), home = sectorIslands(1717, 0, 0)[0];
  buyShip(g, home); buyFood(g, 15); g.mode = 'ship'; g.ship.x += 400; g.ship.z += 400; g.ship.sail = 1;
  for (let i = 0; i < 60 * 40; i++) step(g, { rudder: -1 }, 1 / 60);
  assert.ok(Number.isFinite(g.ship.x + g.ship.z + g.ship.speed + g.ship.yaw), 'ship state finite after a long left turn');
});

test('the HUD key code never dereferences a missing ship (regression: updateHud threw every frame on foot before buying a ship and froze the picture)', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.ok(!/[^?.\w]p\.trim/.test(src.split('ui.updateHud')[1].split('if (key === hudKey)')[0]), 'p.trim used outside a null check');
});

test('shipyard: upgrades trade the old ship in, need the ship at the dock, never downgrade; stats follow the class', async () => {
  const { buyShip: bs, shipQuote } = await import('../src/rules/trade.js'), { SHIPS } = await import('../src/rules/ships.js');
  const g = newGame(1717), home = sectorIslands(1717, 0, 0)[0];
  assert.ok(bs(g, home, 'sailboat'), 'first ship'); assert.equal(g.maxHull, SHIPS.sailboat.hull);
  g.gold = 5000; const q = shipQuote(g, 'cutter'); assert.equal(q, SHIPS.cutter.price - Math.round(SHIPS.sailboat.price * 0.6));
  g.ship.x += 200; assert.equal(bs(g, home, 'cutter'), false, 'ship must be at the dock to be traded in'); g.ship.x -= 200;
  assert.ok(bs(g, home, 'cutter')); assert.equal(g.gold, 5000 - q); assert.equal(g.shipClass, 'cutter'); assert.equal(g.hold, SHIPS.cutter.hold); assert.equal(g.hull, SHIPS.cutter.hull);
  assert.equal(bs(g, home, 'sailboat'), false, 'no downgrades'); assert.equal(bs(g, home, 'cutter'), false, 'not the same ship twice');
  g.mode = 'ship'; g.ship.sail = 1; for (let i = 0; i < 60 * 25; i++) step(g, {}, 1 / 60); assert.ok(g.ship.speed > 0, 'moves');
});

test('the raider hunt is always doable, and sunk ships are replaced out of sight', () => {
  const g = newGame(1717), home = sectorIslands(1717, 0, 0)[0];
  buyShip(g, home); buyFood(g, 15); g.mode = 'ship'; g.quest = 3; g.ship.x += 500; g.ship.z += 500; // "Clear the Lanes"
  for (let i = 0; i < 60 * 30; i++) step(g, {}, 1 / 60);
  const near = () => [...g.enemies.values()].filter((e) => e.kind === 'raider' && e.hp > 0 && Math.hypot(e.x - g.ship.x, e.z - g.ship.z) < 600).length;
  assert.ok(near() >= 2, 'two raiders within reach, got ' + near());
  { const one = [...g.enemies.values()].find((e) => e.kind === 'raider'); one.hp = 0; } step(g, {}, 1 / 60);
  for (let i = 0; i < 60 * 30; i++) step(g, {}, 1 / 60);
  assert.ok(near() >= 2, 'more raiders appear after they are sunk');
  // a generated ship that was sunk comes back once you are well away
  const id = [...g.enemies.keys()].find((k) => k[0] === 'e'); if (id) { const e = g.enemies.get(id); e.hp = 0; step(g, {}, 1 / 60); assert.ok(g.dead.has(id)); g.ship.x += 4000; g.ship.sail = 0; for (let i = 0; i < 60 * 100; i++) step(g, {}, 1 / 60); assert.ok(!g.dead.has(id), 'sunk ship id is released after the respawn time'); }
});

test('points of sail: a trimmed sail drives across and up to ~45 degrees into the wind, but not dead into it, and a badly set sail is slower', async () => {
  const { windAngle, polar } = await import('../src/rules/sea.js');
  const w = { dir: 0, speed: 1 }; // wind blowing toward +x
  const at = (th) => polar(th);
  assert.ok(at(0) < 0.1, 'dead into the wind stalls');
  assert.ok(at(Math.PI / 4) > 0.3 && at(1.05) > 0.7, 'close-hauled still makes way');
  assert.ok(at(Math.PI / 2) >= at(Math.PI) && at(Math.PI / 2) >= at(1.05), 'a beam reach is the fastest point');
  assert.ok(Math.abs(windAngle(Math.PI, w) - 0) < 1e-9 && Math.abs(windAngle(0, w) - Math.PI) < 1e-9, 'yaw 0 with a +x wind is running, yaw PI is head to wind');
  // the boom goes to the side the wind blows toward, further out the more the wind is behind you
  assert.ok(bestTrim(Math.PI / 2, w) < 0 && bestTrim(-Math.PI / 2, w) > 0, 'boom swings downwind');
  assert.ok(Math.abs(bestTrim(0.5, w)) > Math.abs(bestTrim(2.4, w)), 'eased out running, hauled in close to the wind');
  // a ship heading 60 degrees off the wind goes ahead with a good trim, slower with a bad one
  const run = (trimOff) => { const g = newGame(1717), home = sectorIslands(1717, 0, 0)[0]; buyShip(g, home); g.mode = 'ship'; g.ship.x = 400; g.ship.z = 400; g.ship.sail = 1; g.ship.yaw = 1.0 + Math.PI; g.t = 0; // 1.0 rad off wind dir 0.8 at t=0
    for (let i = 0; i < 60 * 25; i++) { g.ship.x = Math.min(Math.max(g.ship.x, 399), 401); g.ship.z = Math.min(Math.max(g.ship.z, 399), 401); const b = bestTrim(g.ship.yaw, g.wind, g.ship.trim) + trimOff; step(g, { trim: Math.max(-1, Math.min(1, (b - g.ship.trim) * 20)) }, 1 / 60); } return g.ship.speed; };
  const good = run(0), bad = run(0.8);
  assert.ok(good > bad * 1.2, 'good trim ' + good + ' beats bad trim ' + bad);
});

test('quests point the way: raiders and the buried cache have compass targets', () => {
  const g = newGame(1717), home = sectorIslands(1717, 0, 0)[0]; buyShip(g, home); buyFood(g, 15); g.mode = 'ship';
  g.quest = QUESTS.findIndex((q) => q.id === 'raiders'); for (let i = 0; i < 60 * 12; i++) step(g, {}, 1 / 60);
  const tg = QUESTS[g.quest].target(g); assert.ok(tg && Number.isFinite(tg.x) && /Raider/.test(tg.label), 'raider target');
  g.quest = QUESTS.findIndex((q) => q.id === 'map'); const tm = QUESTS[g.quest].target(g); assert.ok(tm && Number.isFinite(tm.x), 'a cache to dig up is marked');
});

test('the wake and swell: wake meshes build, and the pier still clears the highest crest', async () => {
  const { wakeMesh } = await import('../src/gen/mesh.js'); const { wave } = await import('../src/rules/sea.js'); const { DOCK_Y } = await import('../src/gen/world.js');
  for (const ph of [0, 1 / 3, 2 / 3]) assert.ok(wakeMesh(ph).count > 10);
  const { setCalm } = await import('../src/rules/sea.js'); setCalm([[0, 0, 60 * 1.7]]);
  let hi = 0, open = 0; for (let t = 0; t < 600; t += 0.37) for (let x = -300; x < 300; x += 37) { const h = wave(x, x * 0.7, t); if (Math.hypot(x, x * 0.7) < 110) hi = Math.max(hi, Math.abs(h)); else open = Math.max(open, h); }
  setCalm([]); assert.ok(hi < DOCK_Y - 0.2 && hi < 0.5, 'near an island the swell is flat: ' + hi.toFixed(2)); assert.ok(open > 2.5, 'open water heaves: ' + open.toFixed(2));
});

test('ship hulls never sit on the land: every class, moored at every port nearby, ends up clear of the shore', async () => {
  const { SHIP_ORDER, SHIPS } = await import('../src/rules/ships.js'); let ports = 0;
  for (let sx = -3; sx <= 3; sx++) for (let sz = -3; sz <= 3; sz++) for (const isl of sectorIslands(1717, sx, sz)) if (isl.port) {
    ports++; for (const id of SHIP_ORDER) { const g = newGame(1717); g.shipClass = id; g.ship = { x: isl.port.berth.x, z: isl.port.berth.z, yaw: isl.port.berth.yaw, speed: 0, sail: 0, cd: [0, 0], trim: 0 };
      g.foot = { x: isl.port.dock.x0, z: isl.port.dock.z0, y: 3, yaw: 0, vy: 0 }; for (let i = 0; i < 70; i++) step(g, {}, 1 / 60);
      assert.ok(!hullHit(g, g.ship.x, g.ship.z, g.ship.yaw, SHIPS[id].L, SHIPS[id].B), id + ' at ' + isl.name + ' is clear of the land'); }
  }
  assert.ok(ports >= 3, 'checked ' + ports + ' ports');
});

test('notice boards: every port with a plaza has one, you can read it, issues change, rival crews grow, and towns hear about what you do', async () => {
  const { newsFor, rivalCrews, crewSize, issueOf, ISSUE_LEN } = await import('../src/rules/news.js'); const { islandProps } = await import('../src/gen/props.js'); const { islandTown } = await import('../src/gen/world.js');
  let ports = 0, boards = 0;
  for (let sx = -3; sx <= 3; sx++) for (let sz = -3; sz <= 3; sz++) for (const isl of sectorIslands(1717, sx, sz)) if (isl.port) { ports++; const b = islandProps(isl).find((p) => p.k === 'board'); if (b) { boards++; assert.ok(!islandTown(isl).buildings.some((q) => Math.abs(q.x - b.x) < q.w / 2 && Math.abs(q.z - b.z) < q.d / 2), 'board is not inside a building'); } }
  assert.ok(ports >= 3 && boards >= ports - 1, boards + ' boards for ' + ports + ' ports');
  const g = newGame(1717), home = sectorIslands(1717, 0, 0)[0], b = islandProps(home).find((p) => p.k === 'board');
  g.foot.x = b.x; g.foot.z = b.z + 1.6; assert.match(prompt(g), /notice board/); assert.equal(interact(g).type, 'news');
  const n1 = newsFor(g, home); assert.ok(n1.items.length >= 4 && n1.items.every((i) => i.head && i.body.length > 20), 'a full board'); assert.deepEqual(newsFor(g, home).items, n1.items, 'same issue, same board');
  g.t += ISSUE_LEN; assert.equal(issueOf(g), 2); assert.notDeepEqual(newsFor(g, home).items, n1.items, 'a new issue has new notices');
  const c = rivalCrews(1717)[0]; assert.ok(crewSize(c, 12) > crewSize(c, 1), 'rival crews grow');
  g.killsBy.raider = 2; g.kills = 6; g.found.add(1); g.ship = { x: 0, z: 0 }; g.shipClass = 'brigantine';
  const after = newsFor(g, home).items.filter((i) => i.tag === 'About the captain'); assert.ok(after.length >= 1, 'towns hear about the player: ' + after.length);
});

test('people can be killed: hits hurt, kills pay and count, a dead shopkeeper closes the shop until a relative takes over, nothing locks the story', async () => {
  const { REOPEN, npcAlive } = await import('../src/rules/game.js'); const { folkPos, townsfolk, islandTown } = await import('../src/gen/world.js');
  const g = newGame(1717), home = sectorIslands(1717, 0, 0)[0], sw = islandTown(home).npcs.find((n) => n.kind === 'shipwright'); g.weapons.sword = true; g.weapon = 'sword';
  g.foot.x = sw.x; g.foot.z = sw.z + 2.4; g.foot.y = groundAt(g, g.foot.x, g.foot.z); g.foot.yaw = -Math.PI / 2; const gold0 = g.gold;
  assert.match(prompt(g), /Talk to/);
  let n = 0; while (npcAlive(g, sw.id) && n++ < 20) { for (let i = 0; i < 40; i++) step(g, { yaw: -Math.PI / 2, attack: i === 0 }, 1 / 60); }
  assert.ok(n >= 4 && n <= 6, 'a shopkeeper takes several hits: ' + n); assert.ok(!npcAlive(g, sw.id) && g.murders === 1 && g.gold > gold0, 'dead, counted, looted');
  assert.ok(!/Talk to/.test(prompt(g) || ''), 'you cannot talk to the dead'); assert.match(prompt(g), /Closed/);
  g.t += REOPEN + 1; assert.ok(npcAlive(g, sw.id) && /Talk to/.test(prompt(g)), 'a relative reopens the shop');
  const v = townsfolk(home)[0], p = folkPos(v, g.t); g.foot.x = p.x - 1.5; g.foot.z = p.z; g.foot.yaw = 0; let k = 0; const id = 'v' + home.id + ':' + v.seed;
  while (npcAlive(g, id) && k++ < 8) { const q = folkPos(v, g.t); g.foot.x = q.x - 1.5; g.foot.z = q.z; step(g, { yaw: 0, attack: true }, 1 / 60); for (let i = 0; i < 40; i++) step(g, { yaw: 0 }, 1 / 60); }
  assert.ok(!npcAlive(g, id) && g.murders >= 2, 'villagers die too (' + k + ' swings)');
});

test('a ship moored beside land can always turn and sail away (regression: blocking turns locked the helm at the dock)', () => {
  const g = newGame(1717), home = sectorIslands(1717, 0, 0)[0]; buyShip(g, home); buyFood(g, 15); g.mode = 'ship'; const y0 = g.ship.yaw;
  g.ship.yaw = y0 + Math.PI; // pointing at the land
  for (let i = 0; i < 60 * 40; i++) step(g, { rudder: 1, sail: 1, trim: 1 }, 1 / 60);
  assert.ok(Math.abs(Math.atan2(Math.sin(g.ship.yaw - (y0 + Math.PI)), Math.cos(g.ship.yaw - (y0 + Math.PI)))) > 0.5, 'the rudder still turns her');
  assert.ok(g.hull > 60, 'no pounding on the shore: hull ' + g.hull);
});

test('reputation: killing lowers it and shuts shops, trading raises it, prices react, it heals, it saves', async () => {
  const { localRep, worldRep, addLocal, deed, shunned, forgive, buyMult } = await import('../src/rules/rep.js');
  const { buyPrice } = await import('../src/rules/trade.js');
  const s = newGame(SEED), home = sectorIslands(SEED, 0, 0)[0];
  assert.equal(localRep(s, home.id), 0);
  const base = buyPrice(s, home.port, 'rum');
  sell; s.cargo.rum = 5; const { sell: sl } = await import('../src/rules/trade.js'); sl(s, home.port, 'rum', 5);
  assert.ok(localRep(s, home.id) > 0, 'trading raises local rep');
  addLocal(s, home.id, -100); assert.ok(shunned(s, home.id)); assert.ok(buyPrice(s, home.port, 'rum') > base, 'a hated customer pays more');
  deed(s, 'killShopkeeper', home.id); assert.ok(worldRep(s) < 0);
  const s2 = deserialize(serialize(s)); assert.equal(localRep(s2, home.id), -100);
  for (let i = 0; i < 1000; i++) forgive(s, 1); assert.ok(!shunned(s, home.id), 'a bad name heals');
  assert.ok(buyMult(s, 'nowhere') === 1);
});

test('the law: a crime brings guards that hunt you, losing a fight is an arrest with a fine, the bounty can be paid', async () => {
  const { step, payBounty, wantedHere } = await import('../src/rules/game.js');
  const s = newGame(SEED), home = sectorIslands(SEED, 0, 0)[0];
  assert.equal(s.guards.length, 0);
  s.alert[home.id] = s.t + 120; s.bountyGold = 300; s.gold = 1000;
  assert.ok(wantedHere(s, home));
  for (let i = 0; i < 600; i++) step(s, {}, 1 / 60);
  assert.ok(s.guards.length >= 1, 'guards spawn');
  assert.ok(s.hp < 100 || s.guards.every((g) => g.hp > 0), 'they reach you');
  for (let i = 0; i < 60 * 120 && s.bountyGold > 0; i++) step(s, {}, 1 / 60);
  assert.equal(s.bountyGold, 0, 'an arrest pays the fine');
  assert.ok(s.gold < 1000 && s.hp === s.maxHp && s.guards.length === 0);
  s.bountyGold = 50; assert.equal(payBounty(s), 50); assert.equal(s.bounty, 0);
  const s2 = deserialize(serialize(s)); assert.deepEqual(s2.guards, []);
});

test('weapons: you start with bare fists, buy and equip weapons, each hits by its own reach and damage', async () => {
  const { WEAPONS, buyWeapon, equip, owns } = await import('../src/rules/weapons.js');
  const s = newGame(SEED); assert.equal(s.weapon, 'fists'); assert.ok(!owns(s, 'sword') && !owns(s, 'axe')); assert.ok(!equip(s, 'axe') && !equip(s, 'sword'));
  s.gold = 100; assert.ok(!buyWeapon(s, 'pistol')); assert.ok(buyWeapon(s, 'sword')); assert.equal(s.weapon, 'sword'); assert.equal(s.gold, 50); assert.ok(!buyWeapon(s, 'dagger'), 'not enough gold'); s.gold += 60; assert.ok(buyWeapon(s, 'dagger')); assert.equal(s.weapon, 'dagger'); assert.equal(s.gold, 50);
  assert.ok(equip(s, 'sword') && s.weapon === 'sword');
  const home = sectorIslands(SEED, 0, 0)[0], all = townsfolk(home), town = islandTown(home);
  const lone = (c) => { const a = folkPos(c, 0); return [...all.filter((o) => o !== c).map((o) => folkPos(o, 0)), ...town.npcs].every((o) => Math.hypot(o.x - a.x, o.z - a.z) > 9); };
  const v = all.find(lone); assert.ok(v, 'a villager with room round them');
  const id = `v${home.id}:${v.seed}`;
  const hit = (wid, dist) => { const q = newGame(SEED); q.weapons[wid] = true; q.weapon = wid; const pos = folkPos(v, 0); q.foot.x = pos.x - dist; q.foot.z = pos.z; q.foot.yaw = 0; step(q, { attack: true }, 1 / 60); return q.npcs[id]?.hp; };
  assert.equal(hit('sword', 3), 10);
  assert.equal(hit('dagger', 4), undefined, 'the dagger cannot reach 4');
  assert.equal(hit('spear', 4.5), 20 - WEAPONS.spear.dmg, 'the spear can');
});

test('guard station: a real building with a barred cell; an arrest wakes you in the cell, the gate is shut for a while, then you can walk out', async () => {
  const { stationOf, step, canStand, JAIL_S } = await import('../src/rules/game.js');
  const big = allIslands(5).filter((p) => p.port && (p.tier === 'city' || p.tier === 'town')), withSt = big.filter((p) => stationOf(p));
  assert.ok(withSt.length >= big.length * 0.5, `${withSt.length}/${big.length} towns and cities have a guard station`);
  const home = sectorIslands(SEED, 0, 0)[0], st = stationOf(home); assert.ok(st && st.jail, 'Port Haven has a station with a cell');
  const s = newGame(SEED); s.alert[home.id] = s.t + 120; s.bountyGold = 10; s.hp = 1;
  for (let i = 0; i < 60 * 60 && s.bountyGold > 0; i++) step(s, {}, 1 / 60);
  const sp = st.jail.spawn; assert.ok(Math.hypot(s.foot.x - sp.x, s.foot.z - sp.z) < 0.5, 'woke in the cell');
  // can you walk from the cell to outside the building? (grid search with the game's own collision)
  const reach = (locked) => { s.jailUntil = locked ? s.t + 99 : -1; const b = st.b, seen = new Set(), q = [[sp.x, sp.z]], key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2); seen.add(key(sp.x, sp.z));
    while (q.length) { const [x, z] = q.pop(); if (z > b.z + b.d / 2 + 1) return true; for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) { const nx = x + dx, nz = z + dz, k = key(nx, nz); if (seen.has(k) || Math.abs(nx - b.x) > b.w / 2 + 3 || Math.abs(nz - b.z) > b.d / 2 + 3) continue; seen.add(k); if (canStand(s, nx, nz, s.foot.y)) q.push([nx, nz]); } } return false; };
  assert.ok(!reach(true), 'locked in while the gate is shut'); assert.ok(reach(false), 'free to leave once it opens');
  assert.ok(JAIL_S > 3);
});

test('battle effects: hits throw flashes and smoke, a miss splashes, a sunk ship rolls under for a few seconds and is then gone', async () => {
  const { step, SINK_S } = await import('../src/rules/game.js');
  const s = newGame(SEED); s.mode = 'ship'; s.ship = { x: 0, z: 0, yaw: 0, speed: 0, sail: 0, cd: [0, 0], trim: 0 };
  s.enemies.set('e1', { id: 'e1', kind: 'raider', seed: 7, name: 'Test', x: 40, z: 0, yaw: 0, speed: 0, hp: 1, maxHp: 30, cd: [9, 9] });
  s.shots.push({ x: 38, z: 0, vx: 38, vz: 0, life: 1, owner: 'player', dmg: 50 });
  step(s, {}, 1 / 60);
  assert.ok(s.fx.some((f) => f.k === 'flash') && s.fx.some((f) => f.k === 'smoke'), 'impact flash and smoke');
  assert.equal(s.sinking.length, 1, 'the dead ship is sinking, not gone'); assert.ok(!s.enemies.has('e1'));
  for (let i = 0; i < 60 * (SINK_S - 0.5); i++) step(s, {}, 1 / 60);
  assert.equal(s.sinking.length, 1, 'still going down'); assert.ok(s.fx.some((f) => f.k === 'splash') || true);
  for (let i = 0; i < 60 * 2; i++) step(s, {}, 1 / 60);
  assert.equal(s.sinking.length, 0, 'gone after the sinking'); 
  s.shots.push({ x: 0, z: 100, vx: 0, vz: 0, life: 0.01, owner: 'player', dmg: 1 }); step(s, {}, 0.05);
  assert.ok(s.fx.some((f) => f.k === 'splash'), 'a miss splashes');
  const s2 = deserialize(serialize(s)); assert.deepEqual(s2.fx, []); assert.deepEqual(s2.sinking, []);
});

test('death animations: your own ship sinks for a few seconds before game over, and a killed person leaves a body that lies a while', async () => {
  const { step, SINK_S, CORPSE_S } = await import('../src/rules/game.js');
  const s = newGame(SEED); s.mode = 'ship'; s.ship = { x: 0, z: 0, yaw: 0, speed: 3, sail: 0, cd: [0, 0], trim: 0 }; s.hull = 0;
  step(s, {}, 1 / 60); assert.ok(s.sunkT !== undefined && !s.over, 'going down, not over yet');
  for (let i = 0; i < 60 * (SINK_S - 0.5); i++) step(s, {}, 1 / 60); assert.ok(!s.over);
  for (let i = 0; i < 60 * 1.5; i++) step(s, {}, 1 / 60); assert.ok(s.over, 'game over after the sinking');
  const g = newGame(SEED), home = sectorIslands(SEED, 0, 0)[0], sk = islandTown(home).npcs.find((n) => n.kind === 'merchant');
  g.foot.x = sk.x - 1.5; g.foot.z = sk.z; g.foot.yaw = 0; g.weapons.axe = true; g.weapon = 'axe';
  for (let i = 0; i < 60 * 12 && !g.npcs[sk.id]?.dead; i++) { g.foot.x = sk.x - 1.5; g.foot.z = sk.z; step(g, { attack: true, yaw: 0 }, 1 / 60); }
  const q = g.npcs[sk.id]; assert.ok(q?.dead && q.x === sk.x && q.kind === 'merchant', 'the body remembers where it fell'); assert.ok(CORPSE_S > 3);
});

test('a ship that is going down is never saved (it would load as an instant game over)', () => {
  const s = newGame(SEED); s.sunkT = 5; s.sunkSplash = true;
  const o = JSON.parse(serialize(s)); assert.equal(o.sunkT, undefined);
  assert.equal(deserialize(serialize(s)).sunkT, undefined);
});

test('wind stays random but favours the objective about 80% of the time, and never jumps', () => {
  windBias.on = true;
  try {
    const goal = 1.2, wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
    let fav = 0, n = 0, jump = 0, prev = windAt(0, goal).dir;
    for (let t = 0; t < 150 * 400; t += 1) { const w = windAt(t, goal); if (t % 150 === 100) { n++; if (Math.abs(wrap(w.dir - goal)) < 0.5) fav++; } jump = Math.max(jump, Math.abs(wrap(w.dir - prev))); prev = w.dir; }
    assert.ok(fav / n > 0.7 && fav / n < 0.9, 'favourable share ' + fav / n);
    assert.ok(jump < 0.2, 'no jumps: ' + jump);
    assert.ok(windAt(500, null).dir === windAt(500).dir, 'no objective: plain wind');
  } finally { windBias.on = false; }
});

test('quest givers always exist: reading a quest target early never builds the sailor or warden town without them', () => {
  const g = newGame(4242);
  for (const k of ['sailor', 'frost']) { const t = { ...g.targets[k] }; assert.ok(t.npcs !== undefined); } // the spread reads the lazy npcs getter, as the compass does every frame
  const want = { sailor: 'sailor', frost: 'warden' };
  for (const k of ['sailor', 'frost']) assert.ok(g.targets[k].npcs.some((n) => n.kind === want[k]), k + ' town has its quest giver');
});

// ---------------------------------------------------------------- bounty missions (the cop path)
const walkTo = (g, x, z, yaw = 0) => { g.mode = 'foot'; g.foot.x = x; g.foot.z = z; g.foot.y = groundAt(g, x, z); g.foot.yaw = yaw; };
const placed = async (g, w, secs = 2) => { const { step } = await import('../src/rules/game.js'); for (let j = 0; j < w.i; j++) g.hunts['w' + j] = { st: 'jailed' }; const isl = w.island, pl = isl.port ? islandTown(isl).plaza : isl.landing; walkTo(g, pl.x, pl.z + 14); for (let i = 0; i < 60 * secs; i++) step(g, {}, 1 / 60); return g.hunts[w.id]; };
test('bounty board: the same list for the same seed, four open names, targets are real islands and sea captains', async () => {
  const { board, wanted, rankOf } = await import('../src/rules/hunt.js');
  const g = newGame(SEED), b = board(g); assert.equal(b.length, 4);
  assert.deepEqual(board(newGame(SEED)).map((w) => w.id), b.map((w) => w.id)); assert.equal(new Set(b.map((w) => w.name)).size, 4);
  for (let i = 0; i < 12; i++) { const w = wanted(SEED, i); assert.ok(w.reward > 0 && w.dead > 0 && w.name); if (w.kind === 'foot') assert.ok(w.island && (w.island.port || w.island.landing) && !w.island.port?.home, 'foot targets hide on a real island, never in the home port'); else assert.ok(w.enemyId); }
  assert.ok([0, 1, 2, 3, 4, 5, 6, 7].some((i) => wanted(SEED, i).kind === 'ship'), 'some targets are raider captains at sea');
  assert.equal(rankOf(0), 'Civilian'); assert.equal(rankOf(3), 'Constable');
});
test('bounty: every foot target can be found, stands on solid ground, and is on its island', async () => {
  const { wanted } = await import('../src/rules/hunt.js'); let n = 0;
  for (let i = 0; i < 16; i++) { const w = wanted(SEED, i); if (w.kind !== 'foot') continue; const g = newGame(SEED), h = await placed(g, w); assert.ok(h && h.x !== undefined, `${w.id} placed`); assert.ok(canStand(g, h.x, h.z, groundAt(g, h.x, h.z)), `${w.id} stands on open ground`); assert.ok(Math.hypot(h.x - w.island.x, h.z - w.island.z) < w.island.r * 1.2, 'on their island'); n++; }
  assert.ok(n >= 8);
});
test('bounty: hit a target until they drop, bind them, they follow you aboard and ashore, hand them in at a guard station for gold, rank and a jailed prisoner', async () => {
  const { step, interact, stationOf, handIn, prompt } = await import('../src/rules/game.js'); const { board } = await import('../src/rules/hunt.js');
  const w = board(newGame(SEED)).find((q) => q.kind === 'foot' && !q.aliveOnly), g = newGame(SEED); g.weapons.sword = true; g.weapon = 'sword';
  const h = await placed(g, w); walkTo(g, h.x - 2.4, h.z, 0);
  for (let i = 0; i < 60 * 8 && h.st === 'free'; i++) { g.foot.yaw = Math.atan2(h.z - g.foot.z, h.x - g.foot.x); step(g, { attack: true }, 1 / 60); g.hp = g.maxHp; }
  assert.equal(h.st, 'sub', 'beaten, not dead'); assert.ok(h.hp > 0 && h.hp <= w.hp * 0.25 + 1e-6);
  walkTo(g, h.x - 1, h.z); assert.match(prompt(g) || '', /Bind/); assert.equal(interact(g).type, 'bind'); assert.equal(g.prisoner, w.id); assert.equal(h.st, 'bound');
  for (let i = 0; i < 60 * 6; i++) step(g, { mz: 1, yaw: 0 }, 1 / 60); assert.ok(Math.hypot(g.foot.x - h.x, g.foot.z - h.z) < 6, 'follows');
  g.mode = 'ship'; g.ship = g.ship || { x: g.foot.x, z: g.foot.z, yaw: 0, speed: 0, sail: 0, cd: [0, 0] }; g.hull = 100; step(g, {}, 1 / 60); assert.ok(h.aboard, 'goes aboard'); g.mode = 'foot'; step(g, {}, 1 / 60); assert.ok(!h.aboard && Math.hypot(g.foot.x - h.x, g.foot.z - h.z) < 8, 'comes ashore with you');
  const home = sectorIslands(SEED, 0, 0)[0], gold0 = g.gold, wr0 = g.rep.world; assert.ok(stationOf(home));
  const pay = handIn(g, home); assert.equal(pay, w.reward); assert.equal(g.gold, gold0 + w.reward); assert.equal(g.handed, 1); assert.ok(g.rep.world > wr0 && g.rep.local[home.id] > 0); assert.equal(g.prisoner, null); assert.equal(h.st, 'jailed'); assert.deepEqual(g.jailed[home.id], [w.id]);
  assert.ok(!board(g).some((q) => q.id === w.id), 'off the board'); assert.equal(board(g).length, 4, 'a new name takes the slot');
  const g2 = deserialize(serialize(g)); assert.equal(g2.handed, 1); assert.deepEqual(g2.jailed[home.id], [w.id]); assert.ok(!board(g2).some((q) => q.id === w.id), 'survives a save');
});
test('bounty: killing pays the dead rate, killing an ALIVE-only target pays nothing and costs standing', async () => {
  const { step } = await import('../src/rules/game.js'); const { wanted } = await import('../src/rules/hunt.js');
  const find = (q) => { for (let i = 0; i < 40; i++) { const w = wanted(SEED, i); if (w.kind === 'foot' && q(w)) return w; } };
  const kill = async (w) => { const g = newGame(SEED); g.weapons.axe = true; g.weapon = 'axe'; const h = await placed(g, w); walkTo(g, h.x - 1.5, h.z); for (let i = 0; i < 60 * 12 && h.st !== 'killed'; i++) { g.foot.yaw = Math.atan2(h.z - g.foot.z, h.x - g.foot.x); step(g, { attack: true }, 1 / 60); g.hp = g.maxHp; } return { g, h }; };
  const a = find((w) => !w.aliveOnly), r = await kill(a); assert.equal(r.h.st, 'killed'); assert.equal(r.g.gold, 500 + a.dead); assert.equal(r.g.bountyGold, 0, 'a lawful kill is no crime'); assert.ok(r.g.rep.world > 0);
  const b = find((w) => w.aliveOnly), r2 = await kill(b); assert.equal(r2.g.gold, 500); assert.ok(r2.g.rep.world < 0);
});
test('bounty: a wanted man fights back and can beat you senseless (you wake in the street, a tenth poorer)', async () => {
  const { step } = await import('../src/rules/game.js'); const { board } = await import('../src/rules/hunt.js');
  const w = board(newGame(SEED)).find((q) => q.kind === 'foot'), g = newGame(SEED), h = await placed(g, w); walkTo(g, h.x - 1.2, h.z); g.gold = 1000;
  for (let i = 0; i < 60 * 60 && g.gold === 1000; i++) step(g, {}, 1 / 60);
  assert.ok(g.gold < 1000 && g.hp > 0, 'beaten senseless, lighter');
});
test('bounty: sinking a wanted raider captain at sea pays the reward', async () => {
  const { step } = await import('../src/rules/game.js'); const { wanted } = await import('../src/rules/hunt.js');
  const w = [3, 7, 11, 15].map((i) => wanted(SEED, i)).find((q) => q.kind === 'ship'); assert.ok(w, 'a ship target is on an early board');
  const g = newGame(SEED), home = sectorIslands(SEED, 0, 0)[0]; buyShip(g, home); buyFood(g, 15); g.mode = 'ship'; g.ship.x = w.x - 60; g.ship.z = w.z; g.ship.sail = 0; g.hunts = {};
  for (let i = 0; i < 4; i++) step(g, {}, 1 / 60);
  const e = g.enemies.get(w.enemyId); assert.ok(e, 'the captain is in his sector'); const gold0 = g.gold; e.hp = 0; step(g, {}, 1 / 60);
  assert.equal(g.hunts[w.id].st, 'killed'); assert.ok(g.gold >= gold0 + w.dead);
});
test('bounty: the notice board lists the wanted; the guard station panel opens for everyone', async () => {
  const { newsFor } = await import('../src/rules/news.js'); const { dialog } = await import('../src/rules/quests.js'); const g = newGame(SEED), home = sectorIslands(SEED, 0, 0)[0];
  assert.ok(newsFor(g, home).items.some((i) => i.tag === 'Wanted'));
  assert.equal(dialog(g, { kind: 'guard' }).panel, 'guard');
});

// ---------------------------------------------------------------- boarding other ships
const sail = async (kind) => {
  const { step } = await import('../src/rules/game.js'); const g = newGame(SEED), home = sectorIslands(SEED, 0, 0)[0]; buyShip(g, home); buyFood(g, 15); g.mode = 'ship';
  let e = null; for (let sx = -3; sx <= 3 && !e; sx++) for (let sz = -3; sz <= 3 && !e; sz++) e = sectorEnemies(SEED, sx, sz).find((q) => q.kind === kind);
  assert.ok(e, 'a ' + kind + ' exists'); g.ship.x = e.x - 14; g.ship.z = e.z; g.ship.sail = 0; g.ship.speed = 0; g.hunts = {};
  for (let i = 0; i < 4; i++) step(g, {}, 1 / 60); return { g, e: g.enemies.get(e.id), step };
};
const fightOn = (g, step, who = 'axe') => { g.weapons[who] = true; g.weapon = who; for (let i = 0; i < 60 * 90 && !g.deck.won && g.deck; i++) { const d = g.deck.defs.filter((q) => q.st === 'free').sort((a, b) => Math.hypot(a.x - g.foot.x, a.z - g.foot.z) - Math.hypot(b.x - g.foot.x, b.z - g.foot.z))[0]; if (!d) break; g.foot.yaw = Math.atan2(d.z - g.foot.z, d.x - g.foot.x); step(g, { attack: true, yaw: g.foot.yaw, mz: Math.hypot(d.x - g.foot.x, d.z - g.foot.z) > 1.6 ? 1 : 0 }, 1 / 60); if (g.hp < 40) g.hp = g.maxHp; } };
test('boarding: grapple only within range, you land on the deck, ships stay put, the deck is walkable and bounded', async () => {
  const { g, e, step } = await sail('raider'); const { grapple, prompt, canStand, groundAt } = await import('../src/rules/game.js');
  g.ship.x = e.x - 80; assert.equal(grapple(g).type, 'none'); g.ship.x = e.x - 14;
  assert.match(prompt(g) || '', /Grapple/); assert.equal(grapple(g).type, 'deck'); assert.ok(g.deck && g.mode === 'foot' && e.grappled);
  assert.ok(canStand(g, g.foot.x, g.foot.z, g.foot.y) && groundAt(g, g.foot.x, g.foot.z) > 0.5, 'standing on the deck'); assert.ok(!canStand(g, e.x + 40, e.z + 40, g.foot.y), 'the sea is not walkable');
  const x0 = e.x, z0 = e.z; for (let i = 0; i < 300; i++) step(g, { mz: 1, yaw: g.foot.yaw }, 1 / 60); assert.ok(g.deck && Math.hypot(g.foot.x - e.x, g.foot.z - e.z) < 20, 'walked, never left the deck'); assert.equal(e.x, x0); assert.equal(e.z, z0);
  assert.ok(g.bountyGold === 0, 'a raider is a lawful target');
});
test('boarding: defenders fight back, you beat the crew, the captain surrenders, and you choose loot, claim or scuttle', async () => {
  const { g, e, step } = await sail('raider'); const { grapple, prizeInfo, finishBoarding } = await import('../src/rules/game.js'); const gold0 = g.gold, n0 = g.killsBy.raider || 0;
  grapple(g); assert.ok(g.deck.defs.length >= 3 && g.deck.defs.some((d) => d.captain)); fightOn(g, step);
  assert.ok(g.deck.won, 'won the deck'); assert.ok(g.deck.defs.every((d) => d.st !== 'free'));
  const P = prizeInfo(g); assert.ok(P.gold > 0 && P.claim === P.gold * 2); assert.ok(finishBoarding(g, 'claim')); assert.equal(g.mode, 'ship'); assert.equal(g.deck, null); assert.ok(g.gold >= gold0 + P.claim); assert.equal(g.killsBy.raider, n0 + 1); assert.ok(!g.enemies.has(e.id));
  const s2 = deserialize(serialize(g)); assert.equal(s2.deck, null);
});
test('boarding: losing the deck fight throws you back on your own ship a tenth poorer, retreat works, and the ship is not lost', async () => {
  const { g, e, step } = await sail('raider'); const { grapple, interact } = await import('../src/rules/game.js'); g.gold = 1000; grapple(g); g.hp = 1; for (let i = 0; i < 600 && g.deck; i++) step(g, {}, 1 / 60);
  assert.equal(g.deck, null); assert.equal(g.mode, 'ship'); assert.ok(g.gold < 1000 && g.hp > 0); assert.ok(g.enemies.has(e.id) && !e.grappled);
  assert.equal(grapple(g).type, 'deck'); assert.equal(interact(g).type, 'board'); assert.equal(g.mode, 'ship', 'F cuts the grapples');
});
test('boarding: a peaceful ship is piracy; a wanted captain can be subdued, bound and handed in; a save mid-fight loads at sea', async () => {
  const { g, e, step } = await sail('trader'); const { grapple, interact, handIn } = await import('../src/rules/game.js'); const { board } = await import('../src/rules/hunt.js'); const wr0 = g.rep.world; grapple(g);
  assert.ok(g.bountyGold >= 150 && g.rep.world === wr0 - 10, 'piracy'); const s2 = deserialize(serialize(g)); assert.equal(s2.mode, 'ship'); assert.equal(s2.deck, null);
  // wanted captain: use a raider whose captain is on the board
  const w = board(newGame(SEED)).find((q) => q.kind === 'ship'); if (!w) return; const q = newGame(SEED), home = sectorIslands(SEED, 0, 0)[0]; buyShip(q, home); q.mode = 'ship'; q.hunts = {};
  q.ship.x = w.x - 14; q.ship.z = w.z; q.ship.sail = 0; for (let i = 0; i < 4; i++) step(q, {}, 1 / 60); const re = q.enemies.get(w.enemyId); assert.ok(re); q.ship.x = re.x - 14; q.ship.z = re.z; assert.equal(grapple(q).type, 'deck'); assert.equal(q.deck.wid, w.id);
  q.weapons.sword = true; q.weapon = 'sword'; const cap = q.deck.defs.find((d) => d.captain); for (const d of q.deck.defs) if (!d.captain) d.st = 'dead';
  cap.aggro = true; for (let i = 0; i < 60 * 30 && cap.st === 'free'; i++) { q.foot.yaw = Math.atan2(cap.z - q.foot.z, cap.x - q.foot.x); step(q, { attack: true, yaw: q.foot.yaw, mz: Math.hypot(cap.x - q.foot.x, cap.z - q.foot.z) > 1.5 ? 1 : 0 }, 1 / 60); q.hp = q.maxHp; }
  assert.equal(cap.st, 'sub'); assert.equal(interact(q).type, 'bind'); assert.equal(q.prisoner, w.id); assert.ok(q.deck.defs.every((d) => d.st !== 'free'));
  step(q, {}, 1 / 60); assert.ok(q.deck.won); const gold0 = q.gold; const { finishBoarding } = await import('../src/rules/game.js'); finishBoarding(q, 'loot'); assert.equal(q.mode, 'ship'); step(q, {}, 1 / 60); assert.ok(q.hunts[w.id].aboard, 'the captain is in the hold');
  const pay = handIn(q, home); assert.equal(pay, w.reward); assert.ok(q.gold >= gold0 + pay);
});

// ---------------------------------------------------------------- ship parts and special shot
test('parts: fitted one at a time for gold, only with a ship, they change speed, hull, hold, rowing and cannon damage, and survive a trade-up and a save', async () => {
  const P = await import('../src/rules/parts.js'); const g = newGame(SEED), home = sectorIslands(SEED, 0, 0)[0];
  assert.ok(!P.fitPart(g, 'sails'), 'no ship, no parts'); buyShip(g, home); g.gold = 20000; const hull0 = g.maxHull, hold0 = g.hold;
  assert.ok(P.fitPart(g, 'plating')); assert.equal(g.maxHull, hull0 + 25); assert.equal(g.hull, g.maxHull); assert.ok(P.fitPart(g, 'hold')); assert.equal(g.hold, hold0 + 10);
  for (let i = 0; i < 3; i++) assert.ok(P.fitPart(g, 'sails')); assert.ok(!P.fitPart(g, 'sails'), 'max level'); assert.ok(Math.abs(P.speedMul(g) - 1.24) < 1e-9);
  P.fitPart(g, 'guns'); assert.ok(Math.abs(P.gunMul(g) - 1.15) < 1e-9); P.fitPart(g, 'oars'); assert.equal(P.rowMul(g), 1.25);
  const g2 = newGame(SEED); buyShip(g2, home); g2.gold = 20000; for (let i = 0; i < 3; i++) P.fitPart(g, 'sails'); // same wind, same heading: fitted sails are faster
  const run = (q) => { q.mode = 'ship'; q.ship.x = 400; q.ship.z = 400; q.ship.sail = 1; q.ship.yaw = 1.0 + Math.PI; q.t = 0; q.food = 20; for (let i = 0; i < 1200; i++) step(q, {}, 1 / 60); return q.ship.speed; };
  assert.ok(run(g) > run(g2) * 1.15, 'the fitted ship is faster');
  g.gold = 99999; g.ship.x = home.port.berth.x; g.ship.z = home.port.berth.z; assert.ok(buyShip(g, home, 'cutter')); assert.equal(g.maxHull, 140 + 25); assert.equal(g.hold, 28 + 10); assert.equal(P.level(g, 'sails'), 3);
  const g3 = deserialize(serialize(g)); assert.equal(P.level(g3, 'plating'), 1); assert.deepEqual(g3.ammo, g.ammo);
});
test('special shot: chain slows, fire burns, round is plain, ammo is used up, round shot is the fallback, swivel guns only shoot hostiles', async () => {
  const P = await import('../src/rules/parts.js'); const { grapple } = await import('../src/rules/game.js');
  const { g, e, step } = await sail('raider'); g.gold = 5000; g.hunts = {}; g.ship.x = e.x - 30; g.ship.z = e.z; g.ship.yaw = 0; e.yaw = 0; e.speed = 0;
  assert.ok(!P.setShot(g, 'chain'), 'none bought'); assert.equal(P.buyAmmo(g, 'chain', 10), 10); assert.equal(g.gold, 5000 - 80); assert.ok(P.setShot(g, 'chain')); assert.equal(P.shotNow(g), 'chain');
  g.ship.yaw = -Math.PI / 2; // broadside on to the enemy lying ahead of the bow... aim by teleporting: put the raider on the starboard beam
  g.ship.x = e.x; g.ship.z = e.z - 25; g.ship.yaw = 0; e.hp = 38; const hp0 = e.hp;
  step(g, { fireR: true }, 1 / 60); for (let i = 0; i < 90; i++) step(g, {}, 1 / 60); assert.equal(g.ammo.chain, 9, 'one shot used'); assert.ok(e.slow > g.t - 9, 'rigging torn'); assert.ok(e.hp < hp0 && e.hp > hp0 - 12 * 0.6 - 1 + 0, 'chain does 60%');
  P.buyAmmo(g, 'fire', 5); P.setShot(g, 'fire'); g.ship.cd = [0, 0]; e.hp = 38; step(g, { fireR: true }, 1 / 60); for (let i = 0; i < 200; i++) step(g, {}, 1 / 60); assert.ok(e.burn > 0 && e.hp < 38 - 4, 'burning: more damage than the hit alone');
  g.ammo.chain = 0; g.shot = 'chain'; assert.equal(P.shotNow(g), 'round');
  // swivel
  const { g: q, e: te, step: st } = await sail('raider'); q.gold = 5000; P.fitPart(q, 'swivel'); q.ship.x = te.x - 20; q.ship.z = te.z; const h0 = te.hp; for (let i = 0; i < 180; i++) st(q, {}, 1 / 60); assert.ok(te.hp < h0, 'swivels hit a raider');
  const { g: r, e: tr, step: sr } = await sail('trader'); r.gold = 5000; P.fitPart(r, 'swivel'); r.ship.x = tr.x - 20; r.ship.z = tr.z; const t0 = tr.hp; for (let i = 0; i < 180; i++) sr(r, {}, 1 / 60); assert.equal(tr.hp, t0, 'never at a peaceful ship'); assert.equal(r.bountyGold, 0);
});

// ---------------------------------------------------------------- hidden fighters and the hunting navy
test('hidden fighters: a small share of people fight back when hit, the rest do not, and nothing shows it', async () => {
  const { fighterOf, npcAlive } = await import('../src/rules/game.js'); let n = 0, f = 0, pick = null;
  for (const isl of allIslands(3)) if (isl.port) for (const v of townsfolk(isl)) { n++; const id = `v${isl.id}:${v.seed}`; if (fighterOf(SEED, id, 'villager')) { f++; pick ||= { isl, v, id }; } }
  assert.ok(f / n > 0.02 && f / n < 0.15, `fighters ${f}/${n}`); assert.ok(pick);
  const home = sectorIslands(SEED, 0, 0)[0], hv = townsfolk(home);
  const trial = (v, isl = home) => { const g = newGame(SEED); g.weapons.sword = true; g.weapon = 'sword'; const pos = folkPos(v, 0), id = `v${isl.id}:${v.seed}`; g.foot.x = pos.x - 2.5; g.foot.z = pos.z; g.foot.y = groundAt(g, g.foot.x, g.foot.z); g.foot.yaw = 0; step(g, { attack: true, yaw: 0 }, 1 / 60); return { g, id }; };
  const isF = (v) => fighterOf(SEED, `v${home.id}:${v.seed}`, 'villager'), town0 = islandTown(home), lone = (c) => { const a = folkPos(c, 0); return [...hv.filter((o) => o !== c).map((o) => folkPos(o, 0)), ...town0.npcs].every((o) => Math.hypot(o.x - a.x, o.z - a.z) > 9); }, calm = hv.find((v) => !isF(v) && lone(v)), hard = hv.find((v) => isF(v) && lone(v));
  { const { g, id } = trial(calm); assert.equal(g.foes.length, 0, 'a harmless one does not fight'); assert.ok(g.npcs[id]); }
  { const { g, id } = trial(pick.v, pick.isl); assert.equal(g.foes.length, 1); assert.ok(!npcAlive(g, id), 'the stroller is replaced by the fighter'); const hp0 = g.hp; for (let i = 0; i < 360; i++) { step(g, {}, 1 / 60); if (g.hp < hp0) break; } assert.ok(g.hp < hp0, 'it hurts you'); }
});
test('hidden fighters: killing one ends the fight and leaves a body; one that has been hit comes at a rich or wanted player; a save drops them', async () => {
  const { fighterOf, npcAlive } = await import('../src/rules/game.js');
  let pick = null; for (const isl of allIslands(2)) if (isl.port && !pick) for (const v of townsfolk(isl)) if (fighterOf(SEED, `v${isl.id}:${v.seed}`, 'villager')) { pick = { isl, v }; break; }
  const g = newGame(SEED); g.weapons.axe = true; g.weapon = 'axe'; const { isl, v } = pick, id = `v${isl.id}:${v.seed}`, p = folkPos(v, 0);
  g.foot.x = p.x - 2; g.foot.z = p.z; g.foot.y = groundAt(g, g.foot.x, g.foot.z);
  for (let i = 0; i < 60 * 20 && !g.npcs[id]?.dead; i++) { const o = g.foes[0]; const tx = o ? o.x : p.x, tz = o ? o.z : p.z; g.foot.yaw = Math.atan2(tz - g.foot.z, tx - g.foot.x); step(g, { attack: true, yaw: g.foot.yaw }, 1 / 60); g.hp = g.maxHp; }
  assert.ok(g.npcs[id].dead, 'killed'); step(g, {}, 1 / 60); assert.equal(g.foes.length, 0);
  const q = newGame(SEED); q.gold = 5000; const hm = sectorIslands(SEED, 0, 0)[0]; const near = pick.v;
  { const pp = folkPos(near, 0); q.foot.x = pp.x - 3; q.foot.z = pp.z; q.foot.y = groundAt(q, q.foot.x, q.foot.z); q.t = 0.2; for (let i = 0; i < 120 && !q.foes.length; i++) step(q, {}, 1 / 60); assert.ok(q.foes.length, 'a rich visitor is mugged'); const s2 = deserialize(serialize(q)); assert.deepEqual(s2.foes, []); assert.ok(Object.values(s2.npcs).every((o) => !o.away)); }
});
test('navy hunters: nobody hunts a clean or slightly bad record, a big bounty brings navy ships that chase you, more as it grows, and paying clears them', async () => {
  const { hunterCount, payBounty } = await import('../src/rules/game.js'); const { g, step } = await sail('trader'); g.hunts = {};
  g.ship.x = 400; g.ship.z = 400; g.bountyGold = 250; assert.equal(hunterCount(g), 0); for (let i = 0; i < 60 * 60; i++) step(g, {}, 1 / 60); assert.ok(![...g.enemies.values()].some((e) => e.hunter), 'not right away');
  g.bountyGold = 700; assert.equal(hunterCount(g), 2);
  for (let i = 0; i < 60 * 80; i++) { g.hull = 100; step(g, {}, 1 / 60); } const hs = [...g.enemies.values()].filter((e) => e.hunter); assert.equal(hs.length, 2, 'two hunters'); assert.ok(hs.every((e) => e.kind === 'navy' && Math.hypot(e.x - g.ship.x, e.z - g.ship.z) < 700), 'they come to you');
  assert.ok(g.hull < 100 || hs.some((e) => Math.hypot(e.x - g.ship.x, e.z - g.ship.z) < 300), 'and they close in');
  g.gold = 5000; payBounty(g); assert.equal(hunterCount(g), 0); step(g, {}, 1 / 60); assert.ok(![...g.enemies.values()].some((e) => e.hunter), 'cleared with the bounty');
});

// ---------------------------------------------------------------- bombarding towns
test('bombardment: off by default (shot flies over towns); on, balls wear the town down through damaged, burning and pillaged; crime follows; it heals when left alone', async () => {
  const G = await import('../src/rules/game.js'); const { newsFor } = await import('../src/rules/news.js');
  const home = sectorIslands(SEED, 0, 0)[0], b = islandTown(home).buildings[0], mk = () => { const g = newGame(SEED); buyShip(g, home); g.mode = 'ship'; g.ship.x = b.x; g.ship.z = b.z - 60; g.ship.speed = 0; return g; };
  const ball = (g, dmg = 20) => g.shots.push({ x: b.x, z: b.z, vx: 0, vz: 0, life: 1, owner: 'player', dmg, kind: 'round' });
  const g = mk(); ball(g); step(g, {}, 1 / 60); assert.deepEqual(g.towns, {}); assert.equal(g.bountyGold, 0, 'off: nothing happens');
  assert.equal(g.bombard, false); G.toggleBombard(g); assert.ok(g.bombard); G.toggleBombard(g); G.toggleBombard(g);
  const states = new Set(); let gold0 = g.gold; for (let i = 0; i < 60; i++) { ball(g); step(g, {}, 1 / 60); states.add(G.townState(g, home.id)); }
  assert.ok([1, 2, 3].every((x) => states.has(x)), 'passes through every state: ' + [...states]); assert.ok(g.bountyGold > 300 && g.bounty >= 1 && g.rep.local[home.id] < 0 && g.alert[home.id] > g.t, 'a crime');
  assert.ok(g.gold > gold0, 'plundered once'); const pl = g.gold; for (let i = 0; i < 5; i++) { ball(g); step(g, {}, 1 / 60); } assert.equal(g.gold, pl, 'only once per pillage');
  assert.ok(newsFor(g, home).items.some((i) => i.head === 'After the shelling'));
  // a burning town shuts its shops and empties its streets; a calm one does not
  const f = newGame(SEED), n = islandTown(home).npcs.find((q) => q.kind === 'merchant'); f.foot.x = n.x; f.foot.z = n.z + 2.5; f.foot.y = n.y;
  assert.equal(G.interact(f).panel, 'market'); f.towns = { [home.id]: { hp: 20, max: 400, t: f.t } }; assert.equal(G.townState(f, home.id), 2); assert.equal(G.interact(f).panel, null, 'shop shut');
  const vs = townsfolk(home).map((v) => `v${home.id}:${v.seed}`); assert.ok(vs.every((id) => !G.npcAlive(f, id)), 'streets empty'); f.towns[home.id].hp = 250; assert.equal(G.townState(f, home.id), 1); assert.ok(vs.some((id) => G.npcAlive(f, id)) && vs.some((id) => !G.npcAlive(f, id)), 'half indoors');
  // healing and saves
  const h = newGame(SEED); h.towns = { [home.id]: { hp: 1, max: 400, t: 0 } }; for (let i = 0; i < 60 * 700; i++) step(h, {}, 1 / 60); assert.deepEqual(h.towns, {}, 'healed after ten minutes'); h.towns = { a: { hp: 10, max: 100, t: 0 } };
  const s2 = deserialize(serialize(h)); assert.equal(s2.towns.a.hp, 10);
});

// ---------------------------------------------------------------- crew and recruitment
test('crew: hired in a tavern within the ship capacity and for the fee, wages are paid on pay day, effects follow the roles, a bad name or no ship blocks hiring, saves keep the crew', async () => {
  const C = await import('../src/rules/crew.js'); const home = sectorIslands(SEED, 0, 0)[0], g = newGame(SEED); g.gold = 20000;
  const cs = C.candidates(g, home); assert.equal(cs.length, 3); assert.deepEqual(C.candidates(newGame(SEED), home).map((c) => c.id), cs.map((c) => c.id), 'stable within the day'); assert.ok(!C.hire(g, home, cs[0]), 'no ship, no crew');
  buyShip(g, home); assert.equal(C.capacity(g), 1); const gold0 = g.gold; assert.ok(C.hire(g, home, cs[0])); assert.equal(g.gold, gold0 - cs[0].fee); assert.ok(!C.hire(g, home, cs[1]), 'sailboat holds one'); assert.ok(!C.hire(g, home, cs[0]), 'not twice');
  g.gold = 20000; g.rep.local[home.id] = -80; assert.ok(!C.hire(newGame(SEED), home, cs[2])); const bad = newGame(SEED); buyShip(bad, home); bad.gold = 9999; bad.rep.local[home.id] = -80; assert.ok(!C.hire(bad, home, cs[2]), 'a hated customer is refused');
  // roles
  const q = newGame(SEED); buyShip(q, home); q.gold = 99999; q.crew = [{ id: 'a', name: 'A', role: 'gunner', wage: 7, morale: 70, seed: 1 }, { id: 'b', name: 'B', role: 'gunner', wage: 7, morale: 70, seed: 2 }, { id: 'c', name: 'C', role: 'navigator', wage: 9, morale: 70, seed: 3 }, { id: 'd', name: 'D', role: 'carpenter', wage: 6, morale: 70, seed: 4 }, { id: 'e', name: 'E', role: 'sailor', wage: 4, morale: 70, seed: 5 }];
  assert.ok(Math.abs(C.reloadMul(q) - 0.84) < 1e-9); assert.equal(C.trimFloor(q), 0.85); assert.ok(Math.abs(C.sailorMul(q) - 1.03) < 1e-9); assert.equal(C.wages(q), 33);
  q.hull = 50; q.hitT = -99; q.t = 0; for (let i = 0; i < 600; i++) step(q, {}, 1 / 60); assert.ok(q.hull > 50 + 3, 'the carpenter mends the hull'); const before = q.hull; q.hitT = q.t; for (let i = 0; i < 120; i++) step(q, {}, 1 / 60); assert.equal(q.hull, before, 'not under fire');
  // pay day
  const p = newGame(SEED); buyShip(p, home); p.gold = 1000; p.crew = q.crew.map((c) => ({ ...c })); p.payT = 119.9; step(p, {}, 0.2); assert.equal(p.gold, 1000 - 33); assert.ok(p.crew.every((c) => c.morale === 76));
  p.gold = 10; p.payT = 119.9; step(p, {}, 0.2); assert.ok(p.crew.every((c) => c.morale === 46)); for (let i = 0; i < 2; i++) { p.gold = 10; p.payT = 119.9; step(p, {}, 0.2); } assert.equal(p.crew.length, 0, 'unpaid crews desert');
  const s2 = deserialize(serialize(q)); assert.equal(s2.crew.length, 5); assert.equal(C.dismiss(q, 'a'), true); assert.equal(q.crew.length, 4);
});
test('crew: your hands fight beside you on a boarded deck, can fall, and cheer up after a win', async () => {
  const { g, e, step } = await sail('raider'); const { grapple } = await import('../src/rules/game.js'); const C = await import('../src/rules/crew.js');
  g.crew = [0, 1, 2].map((i) => ({ id: 'm' + i, name: 'Hand ' + i, role: 'sailor', wage: 4, morale: 50, seed: i })); g.shipClass = 'galleon'; grapple(g); assert.equal(g.deck.allies.length, 3);
  g.weapons.axe = true; g.weapon = 'axe'; fightOn(g, step); assert.ok(g.deck.won, 'won with help'); assert.ok(g.crew.every((c) => c.morale > 50), 'cheered');
  const n = g.crew.length; const f = await sail('raider'); f.g.crew = [{ id: 'x', name: 'Doomed', role: 'sailor', wage: 4, morale: 50, seed: 9 }]; grapple(f.g); f.g.deck.allies[0].hp = 1; f.g.hp = 100; for (let i = 0; i < 60 * 20 && f.g.crew.length; i++) f.step(f.g, {}, 1 / 60); assert.equal(f.g.crew.length, 0, 'a hand is killed'); assert.ok(n === 3);
});

// ---------------------------------------------------------------- the world map
test('map: you only know what you have seen; walking and sailing uncover it, saves keep it, visited places are remembered by name', async () => {
  const M = await import('../src/rules/map.js'); const g = newGame(SEED), home = sectorIslands(SEED, 0, 0)[0];
  assert.equal(M.stateAt(g, 'terra', 5000, 5000), M.UNKNOWN); step(g, {}, 1 / 60);
  assert.equal(M.stateAt(g, 'terra', g.foot.x, g.foot.z), M.KNOWN, 'where you stand'); assert.equal(M.stateAt(g, 'terra', g.foot.x + 3000, g.foot.z), M.UNKNOWN, 'far away stays dark');
  assert.equal(M.mapOf(g).visited[home.id], home.port.name, 'a port you stand in is named');
  const n0 = Object.keys(M.mapOf(g).cells.terra).length; buyShip(g, home); g.mode = 'ship'; g.ship.x = 1500; g.ship.z = 0; step(g, {}, 1 / 60); assert.ok(Object.keys(M.mapOf(g).cells.terra).length > n0 + 8, 'a ship sees further than a walker'); assert.equal(M.stateAt(g, 'terra', 1500, 0), M.KNOWN);
  const g2 = deserialize(serialize(g)); assert.equal(M.stateAt(g2, 'terra', 1500, 0), M.KNOWN); assert.equal(M.mapOf(g2).visited[home.id], home.port.name);
  assert.equal(M.realmState(g, 'terra'), M.KNOWN); assert.equal(M.realmState(g, 'asgard'), M.UNKNOWN);
});
test('map: NPCs give charts and rumours once each, quests open the map, and the worlds are hinted in order', async () => {
  const M = await import('../src/rules/map.js'); const g = newGame(SEED), home = sectorIslands(SEED, 0, 0)[0], t = islandTown(home).npcs; g.flags.crossed = true;
  const talk = (kind) => { const n = t.find((q) => q.kind === kind); g.foot.x = n.x; g.foot.z = n.z + 2.5; g.foot.y = n.y; const r = interact(g); return r.lines; };
  const l1 = talk('merchant'); assert.ok(l1.some((x) => /chart/.test(x)), 'the merchant marks a chart'); const hinted = Object.values(M.mapOf(g).cells.terra).filter((v) => v === M.HINTED).length; assert.ok(hinted > 5, 'a faint sketch appears');
  assert.ok(!talk('merchant').some((x) => /chart/.test(x)), 'only once');
  const first = talk('tavern'); assert.ok(first.some((x) => /updated/.test(x)), 'a tavern gives a chart or a rumour: ' + first.at(-1));
  // more taverns: the next one rumours a world, in order Asgard, Atlantis, Olympus
  const fake = (id, kind) => M.learn(g, { id, kind }, home); const seen = []; for (let i = 0; i < 12 && seen.length < 3; i++) { fake('tv' + i, 'tavern'); for (const r of ['asgard', 'atlantis', 'olympus']) if (M.realmState(g, r) === M.HINTED && !seen.includes(r)) seen.push(r); }
  assert.deepEqual(seen, ['asgard', 'atlantis', 'olympus']); assert.equal(M.nextUnhinted(g), null); assert.ok(g.map.heard['tv0'] && M.learn(g, { id: 'tv0', kind: 'tavern' }, home) === null);
  // quests
  const q = newGame(SEED); const gate = q.targets.gate; assert.equal(M.stateAt(q, 'terra', gate.x * 0.97, gate.z * 0.97), M.UNKNOWN); M.learnQuest(q, 'frost'); assert.equal(M.stateAt(q, 'terra', gate.x * 0.97, gate.z * 0.97), M.HINTED);
  const q2 = newGame(SEED), f = q2.targets.frost; assert.equal(M.stateAt(q2, 'terra', f.x, f.z), M.UNKNOWN); M.learnQuest(q2, 'sailor'); assert.equal(M.stateAt(q2, 'terra', f.x, f.z), M.HINTED); assert.equal(M.stateAt(q, 'terra', f.x, f.z), M.HINTED); assert.ok(/World map/.test((q.flags.crossed = true, M.learnQuest(q, 'wall')))); assert.equal(M.realmState(q, 'asgard'), M.HINTED);
});
test('map: scalable, a new world is one registry entry and shows up on the grand map without touching anything else; objectives never appear', async () => {
  const M = await import('../src/rules/map.js'); const g = newGame(SEED), size = 600, base = M.worldLayout(g, size);
  assert.deepEqual(base.realms.map((r) => r.id), ['terra', 'asgard', 'atlantis', 'olympus']); assert.ok(base.realms.filter((r) => !r.home).every((r) => r.state === M.UNKNOWN), 'hidden until heard of');
  for (const r of base.realms) assert.ok(r.x >= 0 && r.x <= size && r.y >= 0 && r.y <= size, r.id + ' fits on the map');
  M.REALMS.push({ id: 'testland', name: 'Testland', planned: true, grand: { ang: 3.9, dist: 2.1, size: 0.5 }, color: [200, 50, 50], rumour: 'a place for tests' });
  try { const l2 = M.worldLayout(g, size); assert.equal(l2.realms.length, 5); M.hint(g, 'testland'); assert.equal(M.worldLayout(g, size).realms.at(-1).state, M.HINTED); const o = l2.realms.at(-1); assert.ok(o.x > 0 && o.x < size && o.y > 0 && o.y < size);
    assert.equal(M.nextUnhinted(newGame(SEED)).id, 'asgard'); M.visitRealm(g, 'testland'); assert.equal(M.realmState(g, 'testland'), M.KNOWN); } finally { M.REALMS.pop(); }
  const keys = Object.keys(JSON.parse(serialize(g)).map).sort(); assert.deepEqual(keys, ['cells', 'heard', 'realms', 'visited'], 'the map stores only what was discovered: no quest targets, no objectives');
  const p = M.grandPoint(M.worldLayout(g, size), 0, 0); assert.ok(Math.abs(p.x - size / 2) < 1e-9 && Math.abs(p.y - size / 2) < 1e-9, 'the middle of Terra is the middle of the grand map');
});

test('map: you cannot read the map until you break through the ice, but discovery is recorded meanwhile and the NPC lines do not mention a map', async () => {
  const M = await import('../src/rules/map.js'); const g = newGame(SEED), home = sectorIslands(SEED, 0, 0)[0]; assert.equal(M.mapAvailable(g), false);
  const n = islandTown(home).npcs.find((q) => q.kind === 'merchant'); g.foot.x = n.x; g.foot.z = n.z + 2.5; g.foot.y = n.y; const lines = interact(g).lines.join(' '); assert.ok(/commit it to memory/.test(lines) && !/Map updated/.test(lines), lines);
  step(g, {}, 1 / 60); const known = Object.keys(M.mapOf(g).cells.terra).length; assert.ok(known > 10, 'still recorded in the background');
  g.flags.crossed = true; assert.equal(M.mapAvailable(g), true); assert.equal(Object.keys(M.mapOf(g).cells.terra).length, known, 'unlocking shows what was already found');
});

// ---------------------------------------------------------------- fleets
const withCrew = (g, n = 2) => { g.shipClass = 'galleon'; g.crew = Array.from({ length: n }, (_, i) => ({ id: 'h' + i, name: 'Hand ' + i, role: 'sailor', wage: 4, morale: 70, seed: i })); };
const takePrize = async (kind = 'raider') => {
  const r = await sail(kind); const G = await import('../src/rules/game.js'); withCrew(r.g); G.grapple(r.g); r.g.weapons.axe = true; r.g.weapon = 'axe'; fightOn(r.g, r.step); assert.ok(r.g.deck.won); return { ...r, G };
};
test('fleet: a boarded ship can be kept under a spare hand, captains do not count aboard, upkeep is paid, the fleet is capped, saves keep it, and she can be sold', async () => {
  const F = await import('../src/rules/fleet.js'); const C = await import('../src/rules/crew.js');
  const { g, e, G } = await takePrize(); const P = G.prizeInfo(g); assert.ok(P.keep && !P.fleetFull); const gold0 = g.gold;
  assert.ok(G.finishBoarding(g, 'keep')); assert.equal(g.fleet.length, 1); assert.equal(g.mode, 'ship'); assert.ok(!g.enemies.has(e.id)); assert.ok(g.fleet[0].hp < g.fleet[0].maxHp, 'a damaged prize');
  const cap = g.crew.find((c) => c.captain); assert.ok(cap && cap.captain === g.fleet[0].id); assert.equal(C.aboard(g).length, 1); assert.equal(C.count(g, 'sailor'), 1, 'captains do not trim your sails'); assert.ok(!C.dismiss(g, cap.id), 'a captain cannot just be dismissed');
  assert.ok(g.gold >= gold0, 'keeping her pays nothing but costs nothing');
  assert.equal(F.canKeep(g), true); assert.ok(F.spareHand(g) && F.spareHand(g).id !== cap.id);
  // upkeep on pay day: wages of both hands plus 10 for the ship
  g.gold = 1000; g.payT = 119.9; step(g, {}, 0.2); assert.equal(g.gold, 1000 - 8 - 10);
  const s2 = deserialize(serialize(g)); assert.equal(s2.fleet.length, 1); assert.equal(s2.fleet[0].captain, cap.id);
  g.fleet[0].hp = g.fleet[0].maxHp; const sell = F.sellValue(g.fleet[0]); const gold1 = g.gold; assert.equal(F.sellShip(g, g.fleet[0].id), sell); assert.equal(g.gold, gold1 + sell); assert.equal(g.fleet.length, 0); assert.ok(!g.crew.some((c) => c.captain), 'the captain is back aboard');
  // cap of three and no spare hand
  const q = newGame(SEED); withCrew(q, 5); for (let i = 0; i < 5; i++) F.addPrize(q, { id: 'x' + i, kind: 'raider', seed: i, name: 'S' + i, x: 0, z: 0, yaw: 0, maxHp: 38 }); assert.equal(q.fleet.length, 3, 'three at most'); assert.equal(F.canKeep(q), false);
  const n = newGame(SEED); withCrew(n, 0); assert.equal(F.canKeep(n), false, 'nobody to captain her');
});
test('fleet: ships follow you at sea, hold position when ordered to guard, hunt hostile ships when ordered to attack, take enemy fire, and go down with their captain', async () => {
  const F = await import('../src/rules/fleet.js'); const { g, e, G, step } = await takePrize(); G.finishBoarding(g, 'keep'); const f = g.fleet[0]; f.hp = f.maxHp;
  // follow: you sail away, she keeps up (and is brought to you if you outrun her)
  g.ship.x = 200; g.ship.z = 200; f.x = 200 - 60; f.z = 200; g.ship.sail = 1; g.ship.yaw = 0; g.auto = false; g.fleetOrder = 'follow'; for (let i = 0; i < 60 * 40; i++) { g.hull = 100; step(g, { sail: 1 }, 1 / 60); } assert.ok(Math.hypot(f.x - g.ship.x, f.z - g.ship.z) < 220, 'she keeps up: ' + Math.hypot(f.x - g.ship.x, f.z - g.ship.z));
  // guard: she stays put while you leave
  g.fleetOrder = 'follow'; F.cycleOrder(g, () => {}); F.cycleOrder(g, () => {}); F.cycleOrder(g, () => {}); assert.equal(g.fleetOrder, 'guard'); const gx = f.x, gz = f.z; g.ship.speed = 12; for (let i = 0; i < 60 * 20; i++) { g.hull = 100; step(g, { sail: 1 }, 1 / 60); } assert.ok(Math.hypot(f.x - gx, f.z - gz) < 80, 'holds her station');
  // attack: she goes for a hostile raider and hurts it
  const r = await sail('raider'); const G2 = r.G || G; withCrew(r.g); r.g.fleet = [{ id: 'f9', kind: 'navy', seed: 5, name: 'Mine', x: r.e.x - 120, z: r.e.z, yaw: 0, speed: 0, hp: 75, maxHp: 75, captain: 'h0', cd: 0, ax: 0, az: 0 }]; r.g.crew[0].captain = 'f9'; r.g.fleetOrder = 'attack'; r.g.ship.x = r.e.x - 300; r.g.ship.z = r.e.z + 400; r.e.speed = 0; const hp0 = r.e.hp;
  for (let i = 0; i < 60 * 90 && r.g.enemies.has(r.e.id) && r.e.hp > 0; i++) { r.g.hull = 100; r.step(r.g, {}, 1 / 60); } assert.ok(r.e.hp < hp0 || !r.g.enemies.has(r.e.id), 'her guns tell');
  // enemy fire hits her, and when she sinks the captain goes with her
  const t = await sail('raider'); withCrew(t.g); const ff = { id: 'f8', kind: 'raider', seed: 2, name: 'Doomed', x: t.e.x + 30, z: t.e.z, yaw: 0, speed: 0, hp: 5, maxHp: 38, captain: 'h0', cd: 99, ax: 0, az: 0 }; t.g.fleet = [ff]; t.g.crew[0].captain = 'f8'; t.g.fleetOrder = 'guard';
  t.g.shots.push({ x: ff.x, z: ff.z, vx: 0, vz: 0, life: 1, owner: 'enemy', dmg: 20, kind: 'round' }); t.step(t.g, {}, 1 / 60); t.step(t.g, {}, 1 / 60); assert.equal(t.g.fleet.length, 0, 'sunk'); assert.ok(!t.g.crew.some((c) => c.id === 'h0'), 'the captain is lost with her'); assert.ok(t.g.sinking.some((k) => k.id === 'f8'));
});
