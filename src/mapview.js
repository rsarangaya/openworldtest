// Draws the world map onto a canvas as a sea chart. Everything comes from s.map (what the player found out) and the player's own position and ship: no objectives, no unexplored detail.
// view = { zoom, x, z }: how far in you are and which world point sits in the middle (see makeView / zoomView / panView).
import { sectorIslands, WALL_R } from './gen/world.js';
import { hash } from './gen/rng.js';
import { chartWrecks } from './rules/salvage.js';
import { CELL, UNKNOWN, HINTED, worldLayout, grandPoint, mapOf, REALMS } from './rules/map.js';

const INK = '#2b1d12', PAPER = '#d8c08e', PAPER_D = '#c4a874', SEA = '#5d93a6', SEA_L = '#7fb0bd', SKETCH = '#b9a57c', ICE = '#f2f8fb';
const LAND = { tropical: '#8fae52', frozen: '#e8eef0', sandbar: '#e2cd8d', volcanic: '#8d6a5c', rocky: '#a59c8c' };
export const MIN_ZOOM = 1, MAX_ZOOM = 10, SPAN = 2 * WALL_R * 1.06;
export const makeView = () => ({ zoom: 1, x: 0, z: 0 });
const clampView = (v) => { v.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom)); const room = (SPAN / 2) * (1 - 1 / v.zoom); v.x = Math.max(-room, Math.min(room, v.x)); v.z = Math.max(-room, Math.min(room, v.z)); return v; };
// zoom by factor f keeping the point under (px, py) of a size-pixel canvas where it is
export function zoomView(v, size, px, py, f) {
  const k = (size / SPAN) * v.zoom, wx = v.x + (px - size / 2) / k, wz = v.z + (py - size / 2) / k;
  v.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * f)); const k2 = (size / SPAN) * v.zoom; v.x = wx - (px - size / 2) / k2; v.z = wz - (py - size / 2) / k2; return clampView(v);
}
export const panView = (v, size, dx, dy) => { const k = (size / SPAN) * v.zoom; v.x -= dx / k; v.z -= dy / k; return clampView(v); };
export const centreView = (v, p) => { v.zoom = Math.max(v.zoom, 4); v.x = p.x; v.z = p.z; return clampView(v); };

let islandCache = null;
const islandsOf = (seed) => { if (islandCache?.seed === seed) return islandCache.list; const list = [], n = Math.ceil(WALL_R / 600) + 1; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (const o of sectorIslands(seed, i, j)) list.push(o); islandCache = { seed, list }; return list; };
export const where = (s) => (s.mode === 'ship' && s.ship ? s.ship : s.foot);
// aged paper, painted once per size
let paper = null;
function paperFor(size) {
  if (paper?.width === size) return paper;
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) { const h = hash(7, i, 1), x = h % size, y = hash(7, i, 2) % size, w = 1 + (h % 3); g.fillStyle = h % 5 ? PAPER_D : '#e5d2a6'; g.fillRect(x, y, w * 2, w); }
  const v = g.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.75); v.addColorStop(0, 'rgba(90,60,25,0)'); v.addColorStop(1, 'rgba(90,60,25,.38)'); g.fillStyle = v; g.fillRect(0, 0, size, size);
  return (paper = c);
}
const dot = (ctx, x, y, r) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 7); };
// an island outline: a lumpy ring, the same every time for the same island
function coast(ctx, x, y, r, seed) {
  ctx.beginPath();
  for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.283, rr = r * (0.72 + (hash(seed >>> 0, i, 3) % 1000) / 1800), X = x + Math.cos(a) * rr, Y = y + Math.sin(a) * rr; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
  ctx.closePath();
}
function label(ctx, text, x, y, font = '13px Georgia, serif', col = INK) {
  ctx.font = font; ctx.textAlign = 'center'; ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.strokeStyle = '#eddcb0'; ctx.strokeText(text, x, y); ctx.fillStyle = col; ctx.fillText(text, x, y);
}
function rose(ctx, x, y, r) {
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283 - 1.5708, len = i % 2 ? r * 0.55 : r; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.lineTo(x + Math.cos(a + 0.5) * r * 0.18, y + Math.sin(a + 0.5) * r * 0.18); ctx.lineTo(x, y); ctx.lineTo(x + Math.cos(a - 0.5) * r * 0.18, y + Math.sin(a - 0.5) * r * 0.18); ctx.closePath(); ctx.fillStyle = i ? INK : '#a3341f'; ctx.fill(); }
  label(ctx, 'N', x, y - r - 5, 'bold 13px Georgia, serif', '#a3341f');
}
function frame(ctx, size) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(5.5, 5.5, size - 11, size - 11); ctx.lineWidth = 1; ctx.strokeRect(10.5, 10.5, size - 21, size - 21); }

// the local chart of Terra: the waters you have seen, the islands in them, the ice wall where you have seen it, your ship and you
export function drawTerra(ctx, s, size, t = 0, view = makeView()) {
  ctx.imageSmoothingEnabled = false;
  const m = mapOf(s), cells = m.cells.terra || {}, seed = s.baseSeed || s.seed, k = (size / SPAN) * view.zoom, ox = size / 2 - view.x * k, oy = size / 2 - view.z * k;
  const X = (x) => ox + x * k, Y = (z) => oy + z * k, seen = (x, y, pad) => x > -pad && y > -pad && x < size + pad && y < size + pad;
  ctx.drawImage(paperFor(size), 0, 0);
  // faint chart lines every 1000
  ctx.strokeStyle = 'rgba(80,55,25,.18)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let v = -WALL_R; v <= WALL_R; v += 1000) { ctx.moveTo(X(v), 0); ctx.lineTo(X(v), size); ctx.moveTo(0, Y(v)); ctx.lineTo(size, Y(v)); }
  ctx.stroke();
  // explored water: overlapping rounds, so its edge is soft rather than a staircase
  const list = [];
  for (const key in cells) { const i = key.indexOf(','), x = X((+key.slice(0, i) + 0.5) * CELL), y = Y((+key.slice(i + 1) + 0.5) * CELL); if (seen(x, y, CELL * k)) list.push([x, y, cells[key]]); }
  const water = (min, col, r) => { ctx.fillStyle = col; ctx.beginPath(); for (const [x, y, st] of list) if (st >= min) dot(ctx, x, y, r); ctx.fill(); };
  ctx.save(); ctx.beginPath(); ctx.arc(X(0), Y(0), WALL_R * k, 0, 7); ctx.clip();
  water(1, SKETCH, CELL * k * 0.82); water(2, SEA_L, CELL * k * 0.8); water(2, SEA, CELL * k * 0.66);
  ctx.strokeStyle = 'rgba(235,245,240,.45)'; ctx.lineWidth = 1; ctx.beginPath(); // little waves
  for (const [x, y, st] of list) { if (st < 2) continue; const h = hash(5, Math.round((x - ox) / k), Math.round((y - oy) / k)); if (h % 3) continue; const wx = x + (h % 9) - 4, wy = y + ((h >> 4) % 9) - 4; ctx.moveTo(wx - 5, wy); ctx.quadraticCurveTo(wx - 2.5, wy - 3, wx, wy); ctx.quadraticCurveTo(wx + 2.5, wy - 3, wx + 5, wy); }
  ctx.stroke(); ctx.restore();
  // the ice wall, only where you have seen it
  const known = (x, z) => cells[Math.floor(x / CELL) + ',' + Math.floor(z / CELL)] || UNKNOWN;
  for (const [w, col] of [[11, INK], [8, ICE]]) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); let pen = false;
    for (let a = 0; a <= 360; a++) { const an = (a / 360) * 6.283, c = Math.cos(an), sn = Math.sin(an), r = WALL_R + (hash(11, a % 360) % 60) - 30; if (known(c * WALL_R * 0.97, sn * WALL_R * 0.97) === UNKNOWN) { pen = false; continue; } if (pen) ctx.lineTo(X(c * r), Y(sn * r)); else ctx.moveTo(X(c * r), Y(sn * r)); pen = true; }
    ctx.stroke();
  }
  // islands, towns, names
  const named = [], grow = Math.max(1.15, 2.1 - view.zoom * 0.3);
  for (const o of islandsOf(seed)) {
    const st = known(o.x, o.z); if (st === UNKNOWN) continue; const x = X(o.x), y = Y(o.z), r = Math.max(2.5, o.r * k * grow); if (!seen(x, y, r + 40)) continue;
    if (st >= 2) { ctx.fillStyle = 'rgba(214,236,226,.55)'; coast(ctx, x, y, r * 1.4 + 2, o.seed); ctx.fill(); }
    coast(ctx, x, y, r, o.seed); ctx.fillStyle = st >= 2 ? LAND[o.biome] || LAND.tropical : PAPER_D; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke();
    if (st >= 2 && r > 9) { ctx.fillStyle = 'rgba(40,50,20,.35)'; ctx.beginPath(); for (let i = 0; i < 3; i++) { const h = hash(o.seed >>> 0, i, 9), px = x + ((h % 100) / 100 - 0.5) * r, py = y + (((h >> 8) % 100) / 100 - 0.5) * r; ctx.moveTo(px - 3, py + 2); ctx.lineTo(px, py - 4); ctx.lineTo(px + 3, py + 2); } ctx.fill(); }
    if (!m.visited[o.id]) continue;
    if (o.port) { ctx.fillStyle = '#a3341f'; ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#f3e3bd'; ctx.fillRect(x - 3.5, y, 7, 5); ctx.strokeRect(x - 3.5, y, 7, 5); }
    named.push([m.visited[o.id], x, y - Math.max(r, 7) - 4, o.port ? 1 : 0]);
  }
  // only places you have been are named, ports first, and a name is left out rather than printed over another
  const used = [];
  ctx.font = '13px Georgia, serif';
  for (const [name, x, y] of named.sort((a, b) => b[3] - a[3])) { const w = ctx.measureText(name).width / 2 + 3; if (used.some((u) => Math.abs(u[0] - x) < u[2] + w && Math.abs(u[1] - y) < 14)) continue; used.push([x, y, w]); label(ctx, name, x, y); }
  // old wrecks: heard of (a dashed ring roughly where she lies), dived on (her mark and name), stripped (faded and struck through)
  for (const w of chartWrecks(s)) {
    if (!w.dives) { const R = 260, a = (hash(seed >>> 0, w.x | 0, 31) % 628) / 100, x = X(w.x + Math.cos(a) * R * 0.55), y = Y(w.z + Math.sin(a) * R * 0.55), r = Math.max(9, R * k); if (!seen(x, y, r)) continue; ctx.setLineDash([4, 3]); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]); label(ctx, '?', x, y + 5, 'bold 13px Georgia, serif'); continue; }
    const x = X(w.x), y = Y(w.z); if (seen(x, y, 20)) wreckMark(ctx, x, y, w.stripped, view.zoom >= 3 && w.name.replace(/^The /, ''));
  }
  // your ship (when you are ashore) and you
  if (s.ship && (s.realm || 'terra') === 'terra' && s.mode !== 'ship') { const x = X(s.ship.x), y = Y(s.ship.z); ctx.fillStyle = '#fff3c4'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x, y); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e3b73e'; ctx.beginPath(); ctx.moveTo(x - 9, y + 2); ctx.lineTo(x + 9, y + 2); ctx.lineTo(x + 5, y + 7); ctx.lineTo(x - 5, y + 7); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  if ((s.realm || 'terra') === 'terra') marker(ctx, X(where(s).x), Y(where(s).z), where(s).yaw || 0, t);
  // furniture: frame, compass rose, scale
  frame(ctx, size); rose(ctx, size - 46, size - 48, 28);
  const unit = [2000, 1000, 500, 250, 100].find((v) => v * k < size * 0.25) || 100, len = unit * k;
  ctx.fillStyle = INK; ctx.fillRect(22, size - 26, len, 3); ctx.fillRect(22, size - 30, 2, 11); ctx.fillRect(20 + len, size - 30, 2, 11); label(ctx, unit >= 1000 ? unit / 1000 + ' km' : unit + ' m', 22 + len / 2, size - 32, '12px Georgia, serif');
}
function wreckMark(ctx, x, y, stripped, name) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.globalAlpha = stripped ? 0.5 : 1; ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
  ctx.rotate(-0.35); ctx.beginPath(); ctx.moveTo(-8, -1); ctx.lineTo(8, -1); ctx.lineTo(5, 4); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fillStyle = '#6d5134'; ctx.fill(); ctx.stroke(); // a hull, listing
  ctx.beginPath(); ctx.moveTo(1, -1); ctx.lineTo(3, -10); ctx.lineTo(-2, -6); ctx.stroke(); ctx.rotate(0.35); // her broken mast
  if (stripped) { ctx.strokeStyle = '#a3341f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(9, 7); ctx.stroke(); }
  ctx.restore(); if (name) label(ctx, name, x, y + 17, 'italic 11px Georgia, serif');
}
function marker(ctx, x, y, yaw, t) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y));
  ctx.strokeStyle = 'rgba(163,52,31,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 11 + (Math.floor(t * 2) % 2) * 3, 0, 7); ctx.stroke();
  ctx.rotate(yaw); ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, 7); ctx.lineTo(-3, 0); ctx.lineTo(-7, -7); ctx.closePath(); ctx.fillStyle = '#d5452c'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
}

// a lumpy landmass for a realm: stable from its id
function blob(ctx, x, y, r, id, fill, line) {
  const pts = []; for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2, n = (hash(id.length * 977 + id.charCodeAt(0), i, id.charCodeAt(id.length - 1)) % 1000) / 1000; pts.push([x + Math.cos(a) * r * (0.7 + 0.35 * n), y + Math.sin(a) * r * (0.7 + 0.35 * n) * 0.9]); }
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = line; ctx.stroke();
}
const rgb = (c) => `rgb(${c.join(',')})`;
// the grand chart: Terra in the middle inside its ice wall, the other worlds round it (hidden until you hear of them), the mountain ring round everything
export function drawWorld(ctx, s, size, t = 0, view = makeView()) {
  ctx.imageSmoothingEnabled = false; const L = worldLayout(s, size), m = mapOf(s);
  ctx.drawImage(paperFor(size), 0, 0);
  const mx = size / 2 + (view.x / (SPAN / 2)) * (size / 2), my = size / 2 + (view.z / (SPAN / 2)) * (size / 2);
  ctx.save(); ctx.translate(size / 2, size / 2); ctx.scale(view.zoom, view.zoom); ctx.translate(-mx, -my);
  const mt = L.rings.find((r) => r.id === 'mountains'), ice = L.rings.find((r) => r.id === 'ice'), ring = (r, w, col) => { ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(L.cx, L.cy, r, 0, 7); ctx.stroke(); };
  ctx.fillStyle = SEA; ctx.beginPath(); ctx.arc(L.cx, L.cy, mt.r, 0, 7); ctx.fill();
  ring(mt.r + mt.w / 2, mt.w, '#8f6f47'); ctx.fillStyle = '#6d5134'; ctx.strokeStyle = INK; ctx.lineWidth = 1;
  for (let i = 0; i < 90; i++) { const a = (i / 90) * 6.283, r = mt.r + mt.w * 0.65, x = L.cx + Math.cos(a) * r, y = L.cy + Math.sin(a) * r, h = 7 + (hash(3, i) % 7); ctx.beginPath(); ctx.moveTo(x - 6, y + 4); ctx.lineTo(x, y - h); ctx.lineTo(x + 6, y + 4); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  // Terra: blank paper until explored, then the seas and islands you know
  ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(L.cx, L.cy, ice.r, 0, 7); ctx.fill(); const k = L.unit / WALL_R, cells = m.cells.terra || {};
  ctx.save(); ctx.clip();
  ctx.fillStyle = SEA_L; ctx.beginPath(); for (const key in cells) { const [gx, gz] = key.split(',').map(Number); dot(ctx, L.cx + (gx + 0.5) * CELL * k, L.cy + (gz + 0.5) * CELL * k, CELL * k * 0.8); } ctx.fill();
  for (const o of islandsOf(s.baseSeed || s.seed)) { const st = cells[Math.floor(o.x / CELL) + ',' + Math.floor(o.z / CELL)] || 0; if (st) { ctx.fillStyle = st >= 2 ? LAND[o.biome] || LAND.tropical : PAPER_D; coast(ctx, L.cx + o.x * k, L.cy + o.z * k, Math.max(1.4, o.r * k * 1.5), o.seed); ctx.fill(); } }
  ctx.restore();
  ring(ice.r + ice.w / 2, ice.w + 2, INK); ring(ice.r + ice.w / 2, ice.w, ICE);
  for (const r of L.realms) {
    if (r.home) { label(ctx, 'TERRA', L.cx, L.cy - ice.r - ice.w - 6, 'bold 14px Georgia, serif'); continue; }
    if (r.state === UNKNOWN) continue; const sure = r.state > HINTED;
    blob(ctx, r.x, r.y, r.r, r.id, sure ? rgb(r.color) : 'rgba(216,192,142,.85)', INK);
    label(ctx, sure ? r.name.toUpperCase() : r.name.toUpperCase() + ' ?', r.x, r.y + 4, 'bold 13px Georgia, serif');
  }
  if ((s.realm || 'terra') === 'terra') { const p = where(s), g = grandPoint(L, p.x, p.z); marker(ctx, g.x, g.y, p.yaw || 0, t); }
  else { const r = L.realms.find((q) => q.id === s.realm); if (r) marker(ctx, r.x, r.y + 18, 0, t); }
  ctx.restore();
  frame(ctx, size); rose(ctx, size - 46, size - 48, 28);
  return REALMS.length;
}
