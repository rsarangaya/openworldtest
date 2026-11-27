// Asgard's rune gate, played: black cliffs on Asgard's rim facing Olympus; the veil in the middle stays shut until you have read enough rune stones,
// then a short scene opens it, and sailing on through takes you to the next world. Driven through the real game rules (step with helm, sail and oar inputs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, toggleRow, readRune, warpNow } from '../src/rules/game.js';
import { enterRealm, runeGateAngle, bearing, RUNE_GATE, RUNES_NEEDED, RIM_EXIT, CINE_S } from '../src/rules/realm.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { sectorIslands, sectorOf, WALL_R, GATE_HALF } from '../src/gen/world.js';
import { islandProps } from '../src/gen/props.js';
import { wallMesh } from '../src/gen/mesh.js';

const wrapPi = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
function inAsgard(seed) {
  const s = newGame(seed); s.flags.crossed = true; s.ship = { x: 0, z: 0, yaw: 0, speed: 0, sail: 1, cd: [0, 0] }; s.shipClass = 'sailboat';
  enterRealm(s, 'asgard'); s.mode = 'ship'; return s;
}
// put the ship off the rim at angle a, pointing out, then steer for the point on the rim at angle a with the oars out; returns what happened
function sailAt(s, a, secs = 60) {
  const r0 = WALL_R - 230; Object.assign(s.ship, { x: Math.cos(a) * r0, z: Math.sin(a) * r0, yaw: a, speed: 0, sail: 1 }); s.row = false; toggleRow(s);
  const said = [], ev = []; let maxD = 0;
  for (let i = 0; i < secs * 60; i++) {
    const p = s.ship, tx = Math.cos(a) * (WALL_R + 200), tz = Math.sin(a) * (WALL_R + 200), want = Math.atan2(tz - p.z, tx - p.x);
    step(s, { rudder: Math.max(-1, Math.min(1, wrapPi(want - p.yaw) * 2)), sail: 1 }, 1 / 60);
    for (const e of s.events) ev.push(e); s.events.length = 0; for (const m of s.log || []) if (!said.includes(m.text || m)) said.push(m.text || m);
    maxD = Math.max(maxD, Math.hypot(p.x, p.z));
    if (s.warp) break;
  }
  return { said: said.join(' | '), ev, maxD };
}
const runeIslands = (s, n = 4) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(s.seed, i, j).filter((isl) => islandProps(isl).some((p) => p.k === 'rune'))); return out; };

test('the gate faces Olympus, its cliffs are drawn only near it in Asgard, and entering a world puts you on the edge facing where you came from', () => {
  const a = runeGateAngle(); assert.ok(Math.abs(wrapPi(a - bearing('asgard', 'olympus'))) < 1e-9);
  const s = inAsgard(1717), gx = Math.cos(a) * WALL_R, gz = Math.sin(a) * WALL_R, rune = { ang: a, arc: RUNE_GATE.arc };
  const m = wallMesh(s.seed, sectorOf(gx), sectorOf(gz), false, rune); assert.ok(m && m.count > 0, 'cliffs at the gate');
  const far = a + 1.2, fx = Math.cos(far) * WALL_R, fz = Math.sin(far) * WALL_R; assert.equal(wallMesh(s.seed, sectorOf(fx), sectorOf(fz), false, rune), null, 'no cliffs elsewhere on the rim');
  const open = wallMesh(s.seed, sectorOf(gx), sectorOf(gz), true, rune); assert.ok(open.count < m.count, 'the open gate has less wall');
  // the entry side: Terra -> Asgard comes in on the side facing Terra (as before), Asgard -> Olympus on Olympus's side facing Asgard
  s.warp = { to: 'olympus', ang: a }; assert.ok(warpNow(s)); assert.equal(s.realm, 'olympus');
  assert.ok(Math.abs(wrapPi(Math.atan2(s.ship.z, s.ship.x) - bearing('olympus', 'asgard'))) < 0.01, 'arrived on the Asgard side of Olympus');
  assert.ok(Math.hypot(s.ship.x, s.ship.z) < RIM_EXIT, 'inside the rim');
});

test('a scripted player: shut veil without runes, read the stones, the scene opens the gate, sail through to Olympus, and the open gate is saved', () => {
  const s = inAsgard(1717), a = runeGateAngle();
  // 1. no runes read: the veil holds, the ship is stopped at it and told why (and is not sent home to Terra)
  let r = sailAt(s, a, 50);
  assert.equal(s.warp, null, 'no warp at the shut veil'); assert.ok(r.maxD < WALL_R, 'stopped at the veil'); assert.ok(r.maxD > WALL_R - 20, 'but reached it');
  assert.match(r.said, /read more rune stones/);
  // 2. the cliffs either side of the veil hold too
  r = sailAt(s, a + (GATE_HALF + 200) / WALL_R, 50); assert.equal(s.warp, null); assert.match(r.said, /Black cliffs/);
  // 3. read rune stones on Asgard's islands: each one says where the gate lies, and how many more it wants
  const isl = runeIslands(s); assert.ok(isl.length >= RUNES_NEEDED);
  const lines = isl.slice(0, RUNES_NEEDED).map((i) => readRune(s, i).lines.join(' '));
  assert.match(lines[0], /gate of runes .* far to the (north|south|east|west)/); assert.match(lines[0], /Read 3 more/); assert.match(lines[3], /enough/);
  // 4. sail at the veil again: the scene plays (cine, break, banner), then she carries on through and the fade to Olympus starts
  r = sailAt(s, a, 60);
  const types = r.ev.map((e) => e.type); assert.ok(types.includes('cine') && types.includes('break') && types.includes('banner'), types.join(','));
  assert.ok(s.flags.runeGate); assert.match(r.said, /veil parts/);
  assert.equal(s.warp?.to, 'olympus', 'sailing on through takes you to Olympus');
  // 5. saved: the gate stays open after a reload, and sailing out again goes straight through without a scene
  const t = deserialize(serialize(s)); assert.ok(t.flags.runeGate);
  s.warp = null; r = sailAt(s, a, 40); assert.ok(!r.ev.some((e) => e.type === 'cine')); assert.equal(s.warp?.to, 'olympus');
});

test('a ship already resting against the shut veil opens it as soon as enough runes are known (no need to back off and charge)', () => {
  const s = inAsgard(1717), a = runeGateAngle(); sailAt(s, a, 50); assert.equal(s.warp, null);
  s.runes = ['a', 'b', 'c', 'd']; const ev = [];
  for (let i = 0; i < 60 * 30 && !s.warp; i++) { step(s, { sail: 1 }, 1 / 60); ev.push(...s.events.map((e) => e.type)); s.events.length = 0; }
  assert.ok(ev.includes('cine') && ev.includes('break')); assert.equal(s.warp?.to, 'olympus');
});

test('the rest of Asgard\'s rim still leads home to Terra', () => {
  const s = inAsgard(7), a = runeGateAngle() + Math.PI / 2, r = sailAt(s, a, 40);
  assert.equal(s.warp?.to, 'terra'); assert.ok(r.maxD < WALL_R);
  assert.ok(CINE_S > 0);
});
