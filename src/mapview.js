// Draws the world map onto a canvas. Everything comes from s.map (what the player found out) and the player's position: no objectives, no unexplored detail.
import { sectorIslands, WALL_R } from './gen/world.js';
import { hash } from './gen/rng.js';
import { CELL, UNKNOWN, HINTED, worldLayout, grandPoint, realmState, mapOf, REALMS } from './rules/map.js';

const INK = '#07080c', SEA = '#2d6a9f', SKETCH = '#1c4466', DEEP = '#0b1624', LAND = { tropical: [92, 170, 70], frozen: [235, 242, 248], sandbar: [222, 200, 140], volcanic: [110, 80, 80], rocky: [140, 140, 140] };
const rgb = (c, k = 1) => `rgb(${c.map((v) => Math.round(Math.min(255, v * k))).join(',')})`;
const px = (ctx, x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };

let islandCache = null;
const islandsOf = (seed) => { if (islandCache?.seed === seed) return islandCache.list; const list = [], n = Math.ceil(WALL_R / 600) + 1; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (const o of sectorIslands(seed, i, j)) list.push(o); islandCache = { seed, list }; return list; };
const where = (s) => (s.mode === 'ship' && s.ship ? s.ship : s.foot);

// the local map of Terra: the discs of sea you have seen, the islands in them, the ice wall where you have seen it, and you
export function drawTerra(ctx, s, size, t = 0) {
  ctx.imageSmoothingEnabled = false; const m = mapOf(s), cells = m.cells.terra || {}, k = size / (2 * WALL_R * 1.04), cx = size / 2, cy = size / 2, cp = CELL * k;
  px(ctx, 0, 0, size, size, DEEP);
  for (const key in cells) { const [gx, gz] = key.split(',').map(Number); px(ctx, cx + gx * CELL * k, cy + gz * CELL * k, cp + 0.6, cp + 0.6, cells[key] >= 2 ? SEA : SKETCH); }
  const cellState = (x, z) => cells[Math.floor(x / CELL) + ',' + Math.floor(z / CELL)] || UNKNOWN;
  for (let a = 0; a < 720; a++) { const an = (a / 720) * Math.PI * 2, x = Math.cos(an) * WALL_R, z = Math.sin(an) * WALL_R; if (cellState(x * 0.97, z * 0.97) > UNKNOWN) px(ctx, cx + x * k - 1, cy + z * k - 1, 3, 3, '#eef5fb'); } // the ice wall shows where you have seen it
  for (const o of islandsOf(s.seed)) { const st = cellState(o.x, o.z); if (st === UNKNOWN) continue; const r = Math.max(2, o.r * k * 2.2), col = LAND[o.biome] || [110, 160, 80], c = rgb(col, st >= 2 ? 1 : 0.6), x = cx + o.x * k, y = cy + o.z * k;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, 7); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    if (m.visited[o.id]) { ctx.fillStyle = '#ffd76a'; ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 3, 3); } }
  ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.fillStyle = '#fff3c4';
  for (const o of islandsOf(s.seed)) if (m.visited[o.id]) { const x = cx + o.x * k, y = cy + o.z * k - Math.max(2, o.r * k * 2.2) - 4; ctx.strokeText(m.visited[o.id], x, y); ctx.fillText(m.visited[o.id], x, y); } // only places you have actually been are named
  marker(ctx, where(s), s, cx, cy, k, t);
}
function marker(ctx, p, s, cx, cy, k, t) {
  const x = cx + p.x * k, y = cy + p.z * k, yaw = p.yaw || 0; ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(yaw);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, 6); ctx.lineTo(-3, 0); ctx.lineTo(-6, -6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = Math.floor(t * 2) % 2 ? '#ff5a4a' : '#ffd0c8'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, 4); ctx.lineTo(-2, 0); ctx.lineTo(-4, -4); ctx.closePath(); ctx.fill(); ctx.restore();
}

// a lumpy landmass for a realm: stable from its id
function blob(ctx, x, y, r, id, fill, line) {
  const pts = []; for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2, n = (hash(id.length * 977 + id.charCodeAt(0), i, id.charCodeAt(id.length - 1)) % 1000) / 1000; pts.push([x + Math.cos(a) * r * (0.7 + 0.35 * n), y + Math.sin(a) * r * (0.7 + 0.35 * n) * 0.9]); }
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = line; ctx.stroke();
}
// the grand map: Terra in the middle inside its ice wall, the other worlds round it (hidden until you hear of them), the mountains ring round everything
export function drawWorld(ctx, s, size, t = 0) {
  ctx.imageSmoothingEnabled = false; const L = worldLayout(s, size), m = mapOf(s);
  px(ctx, 0, 0, size, size, DEEP);
  const mt = L.rings.find((r) => r.id === 'mountains'), ice = L.rings.find((r) => r.id === 'ice');
  ctx.fillStyle = '#16405f'; ctx.beginPath(); ctx.arc(L.cx, L.cy, mt.r, 0, 7); ctx.fill();
  ctx.lineWidth = mt.w; ctx.strokeStyle = rgb(mt.color, 0.8); ctx.beginPath(); ctx.arc(L.cx, L.cy, mt.r + mt.w / 2, 0, 7); ctx.stroke();
  // Terra: dark until explored, then the seas and islands you know
  ctx.fillStyle = DEEP; ctx.beginPath(); ctx.arc(L.cx, L.cy, ice.r, 0, 7); ctx.fill(); const k = L.unit / WALL_R, cells = m.cells.terra || {};
  ctx.save(); ctx.beginPath(); ctx.arc(L.cx, L.cy, ice.r, 0, 7); ctx.clip();
  for (const key in cells) { const [gx, gz] = key.split(',').map(Number); px(ctx, L.cx + gx * CELL * k, L.cy + gz * CELL * k, CELL * k + 0.6, CELL * k + 0.6, cells[key] >= 2 ? SEA : SKETCH); }
  for (const o of islandsOf(s.seed)) { const st = cells[Math.floor(o.x / CELL) + ',' + Math.floor(o.z / CELL)] || 0; if (st) px(ctx, L.cx + o.x * k - 1, L.cy + o.z * k - 1, 3, 3, rgb(LAND[o.biome] || [110, 160, 80], st >= 2 ? 1 : 0.6)); }
  ctx.restore();
  ctx.lineWidth = ice.w; ctx.strokeStyle = rgb(ice.color); ctx.beginPath(); ctx.arc(L.cx, L.cy, ice.r + ice.w / 2, 0, 7); ctx.stroke();
  ctx.font = '13px Georgia, serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = INK;
  for (const r of L.realms) {
    if (r.home) { ctx.fillStyle = '#fff3c4'; ctx.strokeText('TERRA', L.cx, L.cy - ice.r - ice.w - 6); ctx.fillText('TERRA', L.cx, L.cy - ice.r - ice.w - 6); continue; }
    if (r.state === UNKNOWN) continue; const known = r.state > HINTED;
    blob(ctx, r.x, r.y, r.r, r.id, known ? rgb(r.color) : '#0a1420', known ? INK : '#3b5e80');
    ctx.fillStyle = known ? '#fff3c4' : '#8fb4d4'; const label = known ? r.name.toUpperCase() : r.name.toUpperCase() + ' ?'; ctx.strokeText(label, r.x, r.y + 4); ctx.fillText(label, r.x, r.y + 4);
  }
  const p = where(s), g = grandPoint(L, p.x, p.z); ctx.fillStyle = INK; ctx.fillRect(Math.round(g.x - 4), Math.round(g.y - 4), 8, 8); ctx.fillStyle = Math.floor(t * 2) % 2 ? '#ff5a4a' : '#ffd0c8'; ctx.fillRect(Math.round(g.x - 3), Math.round(g.y - 3), 6, 6);
  return REALMS.length;
}
