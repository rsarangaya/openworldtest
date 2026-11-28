// Clothing for fishing villages, trade ports and fortress towns (looks only, like miners and priests): half a fishing village's
// people wear oilskins and a sou'wester with a string of fish, a third of a trade port's are traders in a waistcoat and feathered cap,
// a third of a fortress town's are militia in a quilted coat and kettle hat with a spear. A scripted player walks from the dock to
// the plaza of one of each and looks at who strolls there; every sprite is painted on a recording canvas and must stay in its box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, groundAt } from '../src/rules/game.js';
import { sectorIslands, islandTown, townsfolk } from '../src/gen/world.js';
import { townsKind, isFisher, isTrader, isMilitia } from '../src/gen/style.js';
import { personSpec, paintPerson, PERSON_BOX } from '../src/render2d/art.js';

const islands = (seed, n = 4) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push(...sectorIslands(seed, i, j)); return out; };
const LOOK = { fishing: 'fisher', trade: 'trader', fortress: 'militia' };

test('each kind of town dresses its own share of people; other towns and hamlets do not', () => {
  const share = (f, style) => { let n = 0; for (let k = 0; k < 300; k++) if (f({ style }, k)) n++; return n; };
  assert.equal(share(isFisher, 'fishing'), 150); assert.equal(share(isTrader, 'trade'), 100); assert.equal(share(isMilitia, 'fortress'), 100);
  for (const st of ['plain', 'mining', 'smuggler', 'temple', undefined]) for (let k = 0; k < 60; k++) assert.ok(!['fisher', 'trader', 'militia'].includes(townsKind({ style: st }, k)), st);
  for (const [st, kind] of Object.entries(LOOK)) for (let k = 0; k < 60; k++) assert.ok(['villager', kind].includes(townsKind({ style: st }, k)));
  assert.equal(townsKind({ style: 'mining' }, 1), 'miner'); assert.equal(townsKind({ style: 'temple' }, 3), 'priest'); // the older looks are unchanged
  for (const kind of Object.values(LOOK)) for (const th of ['terra', 'asgard', 'atlantis', 'olympus']) for (let k = 0; k < 16; k++) { const P = personSpec(kind, k, th); assert.equal(P.kind, kind); assert.ok(!P.axe, 'no axes for town looks'); }
});

// a canvas that records every point drawn, through the same transforms the sprite uses
function recorder() {
  let m = [1, 0, 0, 1, 0, 0]; const stack = [], pts = []; let cur = [0, 0];
  let clipAt = -1; const put = (x, y) => clipAt < 0 && pts.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const g = { save: () => stack.push(m.slice()), restore: () => { m = stack.pop(); if (stack.length < clipAt) clipAt = -1; }, clip: () => { clipAt = stack.length; }, // what is drawn inside a clip (the cel shading) cannot spill out scale: (a, b) => { m = [m[0] * a, m[1] * a, m[2] * b, m[3] * b, m[4], m[5]]; }, translate: (x, y) => { m = [m[0], m[1], m[2], m[3], m[4] + m[0] * x + m[2] * y, m[5] + m[1] * x + m[3] * y]; },
    moveTo: (x, y) => { put(x, y); cur = [x, y]; }, lineTo: (x, y) => { put(x, y); cur = [x, y]; }, // curves are sampled (their control points may lie outside)
    quadraticCurveTo: (a, b, x, y) => { for (let u = 0.1; u <= 1.001; u += 0.1) { const v = 1 - u; put(v * v * cur[0] + 2 * u * v * a + u * u * x, v * v * cur[1] + 2 * u * v * b + u * u * y); } cur = [x, y]; },
    bezierCurveTo: (a, b, c, d, x, y) => { for (let u = 0.1; u <= 1.001; u += 0.1) { const v = 1 - u; put(v * v * v * cur[0] + 3 * u * v * v * a + 3 * u * u * v * c + u * u * u * x, v * v * v * cur[1] + 3 * u * v * v * b + 3 * u * u * v * d + u * u * u * y); } cur = [x, y]; },
    ellipse: (x, y, rx, ry) => { put(x - rx, y - ry); put(x + rx, y + ry); }, roundRect: (x, y, w, h) => { put(x, y); put(x + w, y + h); } };
  return { g: new Proxy(g, { get: (o, k) => (k in o ? o[k] : () => {}), set: () => true }), pts };
}

test('every new look paints in all directions and frames inside the person box', () => {
  for (const kind of Object.values(LOOK)) for (const th of ['terra', 'atlantis', 'olympus']) for (const dir of ['down', 'up', 'left', 'right']) for (const fr of [0, 1, 2, 3, 4]) for (const k of [0, 5]) {
    const { g, pts } = recorder(); paintPerson(g, personSpec(kind, k, th), dir, fr); assert.ok(pts.length > 50, kind);
    for (const [x, y] of pts) assert.ok(x >= PERSON_BOX.x0 - 0.05 && x <= PERSON_BOX.x1 + 0.05 && y >= PERSON_BOX.y0 - 0.05 && y <= PERSON_BOX.y1 + 0.05, `${kind} ${dir} ${fr}: ${x.toFixed(2)},${y.toFixed(2)}`);
  }
});

test('a scripted player walks from the dock into a fishing village, a trade port and a fortress town and sees their people', () => {
  for (const [style, kind] of Object.entries(LOOK)) {
    let isl = null, seed = 0; for (const sd of [1717, 7, 42, 99]) { isl = islands(sd).find((i) => i.style === style && islandTown(i).plaza && townsfolk(i).some((f) => townsKind(i, f.seed) === kind)); if (isl) { seed = sd; break; } }
    assert.ok(isl, 'a ' + style + ' town with its look');
    const S = newGame(seed); S.mode = 'foot'; const t = islandTown(isl), d = isl.port.dock;
    S.foot = { x: d.x1, z: d.z1, y: groundAt(S, d.x1, d.z1), yaw: 0, vy: 0 };
    for (let i = 0; i < 60 * 25 && Math.hypot(S.foot.x - t.plaza.x, S.foot.z - t.plaza.z) > 8.5; i++) { S.foot.yaw = Math.atan2(t.plaza.z - S.foot.z, t.plaza.x - S.foot.x) + (i % 240 < 30 ? 0.9 : 0); step(S, { mz: 1 }, 1 / 60); S.events.length = 0; }
    assert.ok(Math.hypot(S.foot.x - t.plaza.x, S.foot.z - t.plaza.z) <= 8.5, style + ': reached the plaza');
    const kinds = townsfolk(isl).map((f) => townsKind(isl, f.seed));
    assert.ok(kinds.includes(kind) && kinds.every((k) => k === kind || k === 'villager'), style + ': ' + kinds.join(','));
  }
});
