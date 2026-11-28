// Street plans per kind of town (looks and layout only): a fishing village strung along the shore, a trade port on a grid round its
// plaza, a fortress town in rings inside a curtain wall with gates, a temple town along an avenue to its temple, a mining town up one
// street. A scripted player floods out on foot from the dock end: the plaza, every shop door and (in a fortress) the ground outside
// the wall must all be reachable on foot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, canStand, groundAt } from '../src/rules/game.js';
import { sectorIslands, islandTown, islandHeight } from '../src/gen/world.js';

const ports = (() => { const out = []; for (const sd of [1717, 7, 42]) for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) for (const isl of sectorIslands(sd, i, j)) if (isl.port) out.push([sd, isl]); return out; })();
const houses = (isl) => islandTown(isl).buildings.filter((b) => !b.kind);
const share = (style, f) => { let n = 0, k = 0; for (const [, isl] of ports) if (isl.style === style) for (const b of houses(isl)) { n++; if (f(isl, b)) k++; } return n ? k / n : 1; };

test('each kind of town lays its houses out on its own plan; plain towns keep the scatter', () => {
  const on = (v) => [0, 13, 25, 37, 49, 61].some((g) => Math.abs(Math.abs(v) - g) < 0.01);
  assert.ok(share('trade', (isl, b) => { const P = islandTown(isl).plaza; return on(b.x - P.x) && on(b.z - P.z); }) > 0.85, 'trade: a grid');
  assert.ok(share('fortress', (isl, b) => { const P = islandTown(isl).plaza, d = Math.hypot(b.x - P.x, b.z - P.z); return [15, 26, 37, 48, 59].some((R) => Math.abs(d - R) < 0.01); }) > 0.85, 'fortress: rings');
  assert.ok(share('fishing', (isl, b) => { const d = Math.hypot(b.x - isl.x, b.z - isl.z), a = Math.atan2(b.z - isl.z, b.x - isl.x); let rad = isl.r * 1.3; while (rad > 4 && islandHeight(isl, isl.x + Math.cos(a) * rad, isl.z + Math.sin(a) * rad) < 1.6) rad -= 1.5; return rad - d < 15; }) > 0.75, 'fishing: along the shore');
  assert.ok(share('plain', (isl, b) => { const P = islandTown(isl).plaza; return [15, 26, 37].some((R) => Math.abs(Math.hypot(b.x - P.x, b.z - P.z) - R) < 0.01); }) < 0.1, 'plain: scattered');
});

test('a fortress wall rings the houses, has gates, and stays off doorways, the dock road and the water', () => {
  let n = 0;
  for (const [, isl] of ports) if (isl.style === 'fortress') {
    const t = islandTown(isl), w = t.marks.filter((m) => m.k === 'wall'); if (!w.length) continue; n++;
    const R = Math.hypot(w[0].x - t.plaza.x, w[0].z - t.plaza.z);
    assert.ok(R > 20 && houses(isl).some((b) => Math.hypot(b.x - t.plaza.x, b.z - t.plaza.z) < R - 3), isl.id + ' the wall rings at least the inner houses'); // on a point of the coast only the old core is walled in
    for (const m of w) { assert.ok(islandHeight(isl, m.x, m.z) > 0.5, 'on dry land'); for (const b of t.buildings) if (b.door) assert.ok(!(Math.abs(m.x - b.x) < 2.5 && m.z > b.z && m.z - b.z < b.d / 2 + 7), isl.id + ' clear of a doorway'); }
    const gaps = w.map((m) => Math.atan2(m.z - t.plaza.z, m.x - t.plaza.x)).sort((a, b) => a - b); let big = 0;
    for (let i = 0; i < gaps.length; i++) if (((gaps[(i + 1) % gaps.length] - gaps[i] + Math.PI * 2) % (Math.PI * 2)) * R > 4) big++;
    assert.ok(big >= 1, isl.id + ' has a way through');
  }
  assert.ok(n >= 10, 'fortress towns with walls: ' + n);
});

test('a scripted player can walk from the dock to the plaza, every shop door and (past a fortress wall) the country outside', () => {
  const seen = {};
  for (const [sd, isl] of ports) {
    if (seen[isl.style] >= 2 || isl.style === 'plain') continue; seen[isl.style] = (seen[isl.style] || 0) + 1;
    const s = newGame(sd); s.mode = 'foot'; const t = islandTown(isl), d = isl.port.dock, key = (x, z) => Math.round(x) * 100003 + Math.round(z);
    const lim = 75, got = new Set(), q = [[Math.round(d.x1), Math.round(d.z1), groundAt(s, d.x1, d.z1)]]; got.add(key(d.x1, d.z1));
    while (q.length) { const [x, z, y] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz, k = key(nx, nz); if (got.has(k) || Math.hypot(nx - t.plaza.x, nz - t.plaza.z) > lim) continue; if (canStand(s, nx, nz, y)) { got.add(k); q.push([nx, nz, groundAt(s, nx, nz)]); } } }
    const near = (x, z, r = 1.5) => { for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (got.has(key(x + i, z + j))) return true; return false; };
    assert.ok(near(t.plaza.x, t.plaza.z), isl.id + ' ' + isl.style + ': the plaza');
    for (const b of t.buildings) if (b.door) assert.ok(near(b.x, b.z + b.d / 2 + 2), `${isl.id} ${isl.style}: the ${b.kind} door`);
    const w = t.marks.filter((m) => m.k === 'wall');
    if (w.length) { const R = Math.hypot(w[0].x - t.plaza.x, w[0].z - t.plaza.z); let out = 0; for (const k of got) { const x = Math.round(k / 100003), z = k - x * 100003; if (Math.hypot(x - t.plaza.x, z - t.plaza.z) > R + 4 && islandHeight(isl, x, z) > 1) out++; } assert.ok(out > 20, isl.id + ': outside the wall'); }
  }
  for (const st of ['fishing', 'trade', 'fortress', 'temple', 'mining', 'smuggler']) assert.ok(seen[st] >= 1, st);
});
