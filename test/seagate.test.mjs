// Atlantis's sea gate, played: white coral cliffs on Atlantis's rim facing Olympus, with a curtain of falling water that stays shut until you have read
// enough crystal pillars; then a short scene opens it and sailing on through takes you to Olympus. Driven through the real game rules (step with helm, sail and oars).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, toggleRow, readRune, warpNow } from '../src/rules/game.js';
import { enterRealm, gateOf, gateAngleOf, bearing, RIM_EXIT, runeGateAngle } from '../src/rules/realm.js';
import { serialize, deserialize } from '../src/rules/save.js';
import { sectorIslands, sectorOf, WALL_R, GATE_HALF } from '../src/gen/world.js';
import { islandProps } from '../src/gen/props.js';
import { wallMesh } from '../src/gen/mesh.js';

const wrapPi = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
function inAtlantis(seed) {
  const s = newGame(seed); s.flags.crossed = true; s.ship = { x: 0, z: 0, yaw: 0, speed: 0, sail: 1, cd: [0, 0] }; s.shipClass = 'sailboat';
  enterRealm(s, 'atlantis'); s.mode = 'ship'; return s;
}
function sailAt(s, a, secs = 60) {
  const r0 = WALL_R - 230; Object.assign(s.ship, { x: Math.cos(a) * r0, z: Math.sin(a) * r0, yaw: a, speed: 0, sail: 1 }); s.row = false; toggleRow(s);
  const said = [], ev = []; let maxD = 0;
  for (let i = 0; i < secs * 60; i++) {
    const p = s.ship, want = Math.atan2(Math.sin(a) * (WALL_R + 200) - p.z, Math.cos(a) * (WALL_R + 200) - p.x);
    step(s, { rudder: Math.max(-1, Math.min(1, wrapPi(want - p.yaw) * 2)), sail: 1 }, 1 / 60);
    for (const e of s.events) ev.push(e); s.events.length = 0; for (const m of s.log || []) if (!said.includes(m.text || m)) said.push(m.text || m);
    maxD = Math.max(maxD, Math.hypot(p.x, p.z));
    if (s.warp) break;
  }
  return { said: said.join(' | '), ev, maxD };
}
const pillarIslands = (s, n = 4) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(s.seed, i, j).filter((isl) => islandProps(isl).some((p) => p.k === 'pillar'))); return out; };

test('the sea gate faces Olympus from Atlantis, is drawn only near it in coral and water colours, and leads in on the Atlantis side of Olympus', () => {
  const g = gateOf('atlantis'), a = gateAngleOf('atlantis'); assert.equal(g.to, 'olympus'); assert.ok(Math.abs(wrapPi(a - bearing('atlantis', 'olympus'))) < 1e-9);
  assert.equal(gateOf('olympus'), null, 'Olympus has no gate (yet)'); assert.equal(gateOf('terra'), null);
  const s = inAtlantis(2424), gx = Math.cos(a) * WALL_R, gz = Math.sin(a) * WALL_R, gate = { ang: a, arc: g.arc, realm: 'atlantis' };
  const m = wallMesh(s.seed, sectorOf(gx), sectorOf(gz), false, gate); assert.ok(m && m.count > 0, 'cliffs at the gate');
  const rune = wallMesh(s.seed, sectorOf(gx), sectorOf(gz), false, { ...gate, realm: 'asgard' }); assert.equal(rune.count, m.count, 'same shape as the rune gate');
  assert.notDeepEqual(m.v.slice(6, 9), rune.v.slice(6, 9), 'but its own colours');
  const far = a + 1.2; assert.equal(wallMesh(s.seed, sectorOf(Math.cos(far) * WALL_R), sectorOf(Math.sin(far) * WALL_R), false, gate), null, 'no cliffs elsewhere on the rim');
  s.warp = { to: 'olympus', ang: a }; assert.ok(warpNow(s)); assert.equal(s.realm, 'olympus');
  assert.ok(Math.abs(wrapPi(Math.atan2(s.ship.z, s.ship.x) - bearing('olympus', 'atlantis'))) < 0.01, 'arrived on the Atlantis side of Olympus');
  assert.ok(Math.hypot(s.ship.x, s.ship.z) < RIM_EXIT);
});

test('a scripted player: shut curtain, read pillars (they point the way), the scene opens the gate, sail through to Olympus; saved; the rune gate is untouched', () => {
  const s = inAtlantis(2424), a = gateAngleOf('atlantis');
  let r = sailAt(s, a, 50);
  assert.equal(s.warp, null, 'no warp at the shut curtain'); assert.ok(r.maxD < WALL_R && r.maxD > WALL_R - 20, 'stopped at it');
  assert.match(r.said, /falling water.*read more crystal pillars/);
  r = sailAt(s, a + (GATE_HALF + 200) / WALL_R, 50); assert.equal(s.warp, null); assert.match(r.said, /White coral cliffs/);
  const isl = pillarIslands(s); assert.ok(isl.length >= 4, `pillars found: ${isl.length}`);
  const lines = isl.slice(0, 4).map((i) => readRune(s, i).lines.join(' '));
  assert.match(lines[0], /pillars speak of a gate of falling water .* far to the (north|south|east|west)/); assert.match(lines[0], /Read 3 more/); assert.match(lines[3], /enough to make its curtain answer/);
  assert.equal(readRune(s, isl[0]).lines.length, 3, 'a pillar read again still points the way');
  r = sailAt(s, a, 60);
  const types = r.ev.map((e) => e.type); assert.ok(types.includes('cine') && types.includes('break') && types.includes('banner'), types.join(','));
  assert.ok(s.flags.seaGate); assert.ok(!s.flags.runeGate, 'the rune gate stays shut'); assert.match(r.said, /parts like a curtain/);
  assert.ok(r.ev.some((e) => e.type === 'banner' && /Sea Gate is open/.test(e.text) && /Olympus/.test(e.sub)));
  assert.equal(s.warp?.to, 'olympus');
  assert.equal(readRune(s, isl[1]).lines.length, 2, 'once open the pillars stop pointing the way');
  const t = deserialize(serialize(s)); assert.ok(t.flags.seaGate);
  s.warp = null; r = sailAt(s, a, 40); assert.ok(!r.ev.some((e) => e.type === 'cine')); assert.equal(s.warp?.to, 'olympus');
  // the rest of Atlantis's rim still leads home to Terra, and in Asgard the rune gate still asks for runes
  s.warp = null; r = sailAt(s, a + Math.PI / 2, 40); assert.equal(s.warp?.to, 'terra');
  const u = inAtlantis(2424); u.pillars = ['a', 'b', 'c', 'd']; enterRealm(u, 'asgard'); u.mode = 'ship';
  r = sailAt(u, runeGateAngle(), 50); assert.equal(u.warp, null); assert.match(r.said, /read more rune stones/);
});
