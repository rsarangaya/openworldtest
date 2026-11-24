// 2D renderer (Canvas 2D, no WebGPU needed). Top-down 3/4 view: the ground is flat, things that stand up are sprites anchored at their feet and
// drawn back-to-front. Cheap by design: sprites are baked once and cached (two detail levels, size-capped), island coastlines are built once,
// only what is on screen is drawn, and per-frame objects are pooled so the garbage collector stays quiet.
import { WALL_R, GATE_HALF, TAU, gatePos, islandTown, townsfolk, zoneAt } from '../gen/world.js';
import { buildContours } from '../gen/terrain.js';
import { islandProps } from '../gen/props.js';
import * as A from './art.js';

const PALS = {
  tropical: { land: [0.99, 0.91, 0.64], grass: [0.47, 0.81, 0.36], high: [0.36, 0.68, 0.33], peak: [0.6, 0.55, 0.5] },
  temperate: { land: [0.92, 0.86, 0.64], grass: [0.52, 0.78, 0.35], high: [0.42, 0.65, 0.32], peak: [0.66, 0.64, 0.62] },
  rocky: { land: [0.8, 0.76, 0.68], grass: [0.62, 0.64, 0.52], high: [0.58, 0.58, 0.56], peak: [0.74, 0.74, 0.76] },
  volcanic: { land: [0.4, 0.35, 0.37], grass: [0.32, 0.28, 0.31], high: [0.28, 0.24, 0.27], peak: [0.55, 0.22, 0.16] },
  sandbar: { land: [0.99, 0.93, 0.7], grass: [0.99, 0.93, 0.7], high: [0.99, 0.93, 0.7], peak: [0.99, 0.93, 0.7] },
  frozen: { land: [0.88, 0.94, 0.99], grass: [0.94, 0.97, 1], high: [0.97, 0.99, 1], peak: [1, 1, 1] },
};
const css = A.rgb, hash = (a, b) => { let h = (a | 0) * 374761393 + (b | 0) * 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function createRenderer2D(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let W = 1, H = 1, ps = 1, vig = null;
  // ---- caches
  const spr = new Map(); let sprPx = 0; const SPR_MAX = 14e6; // sprite cache: key -> baked canvas; least recently used goes first when over ~14M pixels
  const getSpr = (key, box, S, fn) => {
    let s = spr.get(key); if (s) { spr.delete(key); spr.set(key, s); return s; }
    s = A.bake(box, S, fn); spr.set(key, s); sprPx += s.c.width * s.c.height;
    while (sprPx > SPR_MAX && spr.size > 1) { const k = spr.keys().next().value, o = spr.get(k); sprPx -= o.c.width * o.c.height; spr.delete(k); }
    return s;
  };
  const vec = new Map(); // island id -> built vector data
  function ensure(isl) {
    let v = vec.get(isl.id); if (v) return v;
    const c = buildContours(isl), levels = c.levels.map((L) => { const p = new Path2D(); for (const lp of L.loops) { p.moveTo(lp[0], lp[1]); for (let i = 2; i < lp.length; i += 2) p.lineTo(lp[i], lp[i + 1]); p.closePath(); } return { kind: L.kind, path: p, n: L.loops.length }; });
    const town = islandTown(isl); v = { isl, levels, props: islandProps(isl), town, ground: null };
    if (isl.port) { // plaza cobbles, the dirt path and the dock: built once
      const g = new Path2D(), stones = new Path2D(), pl = town.plaza, d = isl.port.dock, len = Math.hypot(d.x1 - d.x0, d.z1 - d.z0), ux = (d.x1 - d.x0) / len, uz = (d.z1 - d.z0) / len, nx = -uz, nz = ux;
      for (let i = 0; i < 46; i++) { const a = hash(i, isl.seed) * TAU, r = Math.sqrt(hash(i + 99, isl.seed)) * 7.3; stones.ellipse(pl.x + Math.cos(a) * r, pl.z + Math.sin(a) * r, 0.5, 0.32, a, 0, TAU); }
      const deck = new Path2D(), planks = new Path2D(), posts = new Path2D(), W2 = 1.9;
      deck.moveTo(d.x0 + nx * W2, d.z0 + nz * W2); deck.lineTo(d.x1 + nx * W2, d.z1 + nz * W2); deck.lineTo(d.x1 - nx * W2, d.z1 - nz * W2); deck.lineTo(d.x0 - nx * W2, d.z0 - nz * W2); deck.closePath();
      for (let k = 0; k <= len / 0.55; k++) { const x = d.x0 + ux * k * 0.55, z = d.z0 + uz * k * 0.55; planks.moveTo(x + nx * W2, z + nz * W2); planks.lineTo(x - nx * W2, z - nz * W2); }
      for (let k = 0; k <= len / 4; k++) for (const s of [-1, 1]) { const x = d.x0 + ux * k * 4 + nx * W2 * s, z = d.z0 + uz * k * 4 + nz * W2 * s; posts.moveTo(x + 0.28, z); posts.arc(x, z, 0.28, 0, TAU); }
      g.moveTo(pl.x, pl.z); g.lineTo(d.x1, d.z1); v.ground = { stones, deck, planks, posts, path: g };
    }
    vec.set(isl.id, v);
    if (vec.size > 160) vec.delete(vec.keys().next().value);
    return v;
  }
  // ---- pooled per-frame draw items
  const pool = [], items = []; let np = 0;
  const item = (spr, x, z, o) => { const it = pool[np] || (pool[np] = {}); np++; it.spr = spr; it.x = x; it.z = z; it.rot = o?.rot || 0; it.alpha = o?.alpha ?? 1; it.dy = o?.dy || 0; it.sh = o?.sh || 0; it.zs = o?.zs ?? z; return it; };
  const byZ = (a, b) => a.zs - b.zs;

  function resize(w, h, cssW) { W = canvas.width = Math.max(1, w | 0); H = canvas.height = Math.max(1, h | 0); ps = W / Math.max(1, cssW); vig = null; }
  function vignette() {
    if (vig) return vig; const c = document.createElement('canvas'); c.width = 256; c.height = 160; const g = c.getContext('2d'), gr = g.createRadialGradient(128, 80, 40, 128, 80, 150);
    gr.addColorStop(0, 'rgba(0,10,30,0)'); gr.addColorStop(1, 'rgba(0,10,30,0.45)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 160); return (vig = c);
  }
  const forget = (id) => vec.delete(id);
  const has = (id) => vec.has(id);

  // frame: { cam:{x,z,zoom}, t, cold, islands:[], s (state|null), face, walk, hop, seed }
  function draw(f) {
    const cam = f.cam, k = cam.zoom * ps, t = f.t, cold = f.cold, s = f.s, hi = cam.zoom > 13;
    const sx = (x) => (x - cam.x) * k + W / 2, sz = (z) => (z - cam.z) * k + H / 2, hw = W / 2 / k + 14, hh = H / 2 / k + 14, x0 = cam.x - hw, x1 = cam.x + hw, z0 = cam.z - hh, z1 = cam.z + hh;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    // ---- sea: a bright flat gradient, white wave marks that stay put in the world
    const top = mix3([0.2, 0.62, 0.9], [0.62, 0.82, 0.94], cold), bot = mix3([0.1, 0.44, 0.78], [0.5, 0.72, 0.88], cold), gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, css(top)); gr.addColorStop(1, css(bot)); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const cs = hi ? 5 : 15, i0 = Math.floor(x0 / cs), i1 = Math.ceil(x1 / cs), j0 = Math.floor(z0 / cs), j1 = Math.ceil(z1 / cs);
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if ((hash(i, j) < 0.5 ? 0 : 1) !== pass || hash(i + 7, j + 3) < 0.25) continue;
        const px = sx((i + hash(i, j + 11)) * cs), pz = sz((j + hash(i + 5, j)) * cs), r = cs * k * (0.18 + 0.12 * hash(i + 2, j + 9)), ph = Math.sin(t * 1.2 + hash(i, j) * 9) * 0.25 * r;
        ctx.moveTo(px - r, pz + ph); ctx.quadraticCurveTo(px, pz - r * 0.55 + ph, px + r, pz + ph); ctx.moveTo(px + r * 0.5, pz + r * 0.5 + ph); ctx.quadraticCurveTo(px + r * 0.9, pz + r * 0.35 + ph, px + r * 1.3, pz + r * 0.5 + ph);
      }
      ctx.lineWidth = Math.max(1.3, k * 0.1); ctx.strokeStyle = `rgba(255,255,255,${pass ? 0.3 + 0.2 * Math.sin(t * 1.4) : 0.3 + 0.2 * Math.cos(t * 1.4)})`; ctx.stroke();
    }
    // ---- islands: layered cel-shaded landmasses, foam first, then sand, grass, uplands
    np = 0;
    const draws = [];
    for (const isl of f.islands) {
      const rad = isl.r * 1.5; if (isl.x + rad < x0 || isl.x - rad > x1 || isl.z + rad < z0 || isl.z - rad > z1 || !has(isl.id)) continue;
      draws.push(vec.get(isl.id));
    }
    const lw = Math.max(0.1, 1.7 / k), P = PALS;
    for (const v of draws) {
      const pal = P[v.isl.biome];
      ctx.setTransform(k, 0, 0, k, W / 2 - cam.x * k, H / 2 - cam.z * k);
      for (const L of v.levels) {
        if (L.kind === 'shelf') { ctx.globalAlpha = 0.5; ctx.fillStyle = css(mix3([0.45, 0.88, 0.88], [0.8, 0.93, 0.97], cold)); ctx.fill(L.path, 'evenodd'); ctx.globalAlpha = 1; continue; }
        if (L.kind === 'land') { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = (hi ? 0.5 : 1.0) * (1 + 0.35 * Math.sin(t * 1.5 + v.isl.seed % 7)); ctx.stroke(L.path); }
        const col = pal[L.kind]; if (!col) continue;
        ctx.save(); ctx.fillStyle = css(col, 0.74); ctx.fill(L.path, 'evenodd'); ctx.clip(L.path, 'evenodd');
        ctx.translate(-0.55, -0.7); ctx.fillStyle = css(col); ctx.fill(L.path, 'evenodd'); ctx.restore();
        ctx.lineWidth = lw; ctx.strokeStyle = css(col, 0.5); ctx.stroke(L.path);
      }
      if (v.ground) { // plaza, path, dock
        const G = v.ground, pl = v.town.plaza;
        ctx.lineCap = 'round'; ctx.strokeStyle = css([0.8, 0.68, 0.48]); ctx.lineWidth = 3.2; ctx.stroke(G.path); ctx.strokeStyle = css([0.88, 0.77, 0.58]); ctx.lineWidth = 2.3; ctx.stroke(G.path);
        ctx.beginPath(); ctx.arc(pl.x, pl.z, 8, 0, TAU); ctx.fillStyle = css([0.8, 0.78, 0.76]); ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = css([0.5, 0.48, 0.5]); ctx.stroke(); ctx.fillStyle = css([0.62, 0.6, 0.6], 1, 0.55); ctx.fill(G.stones);
        ctx.fillStyle = css([0.8, 0.6, 0.38]); ctx.fill(G.deck); ctx.lineWidth = 0.05; ctx.strokeStyle = css([0.5, 0.33, 0.2], 1, 0.6); ctx.stroke(G.planks); ctx.lineWidth = lw; ctx.strokeStyle = A.INK; ctx.stroke(G.deck);
        ctx.fillStyle = css([0.4, 0.28, 0.18]); ctx.fill(G.posts); ctx.stroke(G.posts);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // ---- the ice wall (only drawn when it can be on screen)
    if (Math.hypot(cam.x, cam.z) > WALL_R - hw - hh - 40) wall(f, k, sx, sz, hw, hh);
    // ---- sprites, sorted back to front
    const biomeOf = (isl) => isl.biome;
    const px = s ? (s.mode === 'foot' ? s.foot.x : s.ship?.x ?? cam.x) : cam.x, pz = s ? (s.mode === 'foot' ? s.foot.z : s.ship?.z ?? cam.z) : cam.z;
    let nearNpc = null, nearD = 5.5;
    for (const v of draws) {
      const isl = v.isl, bi = biomeOf(isl), big = cam.zoom > 9;
      for (const p of v.props) {
        if (p.x < x0 || p.x > x1 || p.z < z0 + 0 || p.z > z1 + 7) continue;
        if (!big && (p.k === 'bush' || p.k === 'flower' || p.k === 'tuft' || p.k === 'crate' || p.k === 'barrel' || p.k === 'bench')) continue;
        const sp = propSprite(p, bi, hi); if (sp) item(sp, p.x, p.z, { sh: p.k === 'tree' ? 1.5 : p.k === 'rock' ? 0.9 : 0 });
      }
      const town = v.town;
      for (let bi2 = 0; bi2 < town.buildings.length; bi2++) {
        const b = town.buildings[bi2]; if (b.x < x0 - 6 || b.x > x1 + 6 || b.z < z0 - 6 || b.z > z1 + 12) continue;
        const key = `${isl.id}b${bi2}${hi ? 'h' : 'l'}`, S = hi ? 28 : 8;
        if (b.door) {
          const inside = s && s.mode === 'foot' && Math.abs(s.foot.x - b.x) < b.w / 2 && Math.abs(s.foot.z - b.z) < b.d / 2 + 0.4;
          b.fade = (b.fade ?? 1) + ((inside ? 0.18 : 1) - (b.fade ?? 1)) * 0.2;
          item(getSpr(key + 'k', A.shopBackBox(b), S, (g) => A.paintShopBack(g, b, bi)), b.x, b.z - b.d / 2, { zs: b.z - b.d / 2 - 0.5 });
          item(getSpr(key + 'm', A.shopMidBox, S, (g) => A.paintShopCounter(g, b)), b.x, b.z + 1.3, {});
          item(getSpr(key + 'f', A.houseBox(b), S, (g) => A.paintShopFront(g, b, bi)), b.x, b.z + b.d / 2, { alpha: b.fade, zs: b.z + b.d / 2 });
        } else item(getSpr(key, A.houseBox(b), S, (g) => A.paintHouse(g, b, bi)), b.x, b.z + b.d / 2, {});
      }
      for (const n of town.npcs) {
        if (n.x < x0 - 3 || n.x > x1 + 3 || n.z < z0 - 3 || n.z > z1 + 5) continue;
        const dx = px - n.x, dz = pz - n.z, dir = Math.abs(dz) >= Math.abs(dx) ? (dz > 0 ? 'down' : 'up') : dx > 0 ? 'right' : 'left';
        item(personSprite(n.kind, n.seed, dir, 0, hi), n.x, n.z, { dy: Math.sin(t * 1.7 + n.seed) * 0.02 * k, sh: 0.7 });
        const d = Math.hypot(dx, dz); if (s && s.mode === 'foot' && d < nearD) { nearD = d; nearNpc = n; }
      }
      for (const w of townsfolk(isl)) {
        const an = w.a0 + t * w.speed, x = w.cx + Math.cos(an) * w.rad, z = w.cz + Math.sin(an) * w.rad; if (x < x0 - 3 || x > x1 + 3 || z < z0 - 3 || z > z1 + 5) continue;
        const vx = -Math.sin(an) * Math.sign(w.speed), vz = Math.cos(an) * Math.sign(w.speed), dir = Math.abs(vz) >= Math.abs(vx) ? (vz > 0 ? 'down' : 'up') : vx > 0 ? 'right' : 'left';
        item(personSprite('villager', w.seed, dir, 1 + (((t * 5 + w.seed) | 0) & 1), hi), x, z, { sh: 0.7 });
      }
    }
    if (s) {
      if (s.mode === 'foot') { const g0 = f.ground ?? s.foot.y; item(personSprite('player', 0, f.face || 'down', f.walk ? 1 + (((t * 8) | 0) & 1) : 0, hi), s.foot.x, s.foot.z, { dy: -Math.max(0, s.foot.y - g0) * k, sh: 0.75 }); }
      if (s.ship) item(shipSprite(1, 'player', cam.zoom), s.ship.x, s.ship.z, { rot: s.ship.yaw, dy: s.mode === 'ship' ? 0 : Math.sin(t * 1.3) * 0.12 * k, zs: s.ship.z - 4 });
      for (const e of s.enemies.values()) if (e.x > x0 - 20 && e.x < x1 + 20 && e.z > z0 - 20 && e.z < z1 + 20) item(shipSprite(e.seed, e.kind, cam.zoom), e.x, e.z, { rot: e.yaw, dy: Math.sin(t * 1.1 + e.seed) * 0.1 * k, zs: e.z - 4 });
    }
    items.length = np; for (let i = 0; i < np; i++) items[i] = pool[i]; items.sort(byZ);
    // wakes under the ships
    if (s) { ctx.lineCap = 'round'; wake(s.ship, s.mode === 'ship', k, sx, sz); for (const e of s.enemies.values()) wake(e, false, k, sx, sz); }
    for (const it of items) {
      const sp = it.spr, kk = k / sp.S, X = sx(it.x), Z = sz(it.z) + it.dy;
      if (it.sh) { ctx.fillStyle = 'rgba(20,40,40,0.22)'; ctx.beginPath(); ctx.ellipse(X, sz(it.z), it.sh * k, it.sh * k * 0.38, 0, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = it.alpha;
      if (it.rot) { ctx.save(); ctx.translate(X, Z); ctx.rotate(it.rot); ctx.drawImage(sp.c, -sp.ox * kk, -sp.oy * kk, sp.c.width * kk, sp.c.height * kk); ctx.restore(); }
      else ctx.drawImage(sp.c, X - sp.ox * kk, Z - sp.oy * kk, sp.c.width * kk, sp.c.height * kk);
    }
    ctx.globalAlpha = 1;
    if (s) { // cannonballs, hit bars, and the talk bubble
      for (const b of s.shots) { const X = sx(b.x), Z = sz(b.z); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(X - b.vx * 0.05 * k, Z - b.vz * 0.05 * k, k * 0.34, 0, TAU); ctx.fill(); ctx.fillStyle = '#26202a'; ctx.beginPath(); ctx.arc(X, Z - k * 0.5, Math.max(2.2, k * 0.34), 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(20,40,40,0.25)'; ctx.beginPath(); ctx.ellipse(X, Z, k * 0.3, k * 0.12, 0, 0, TAU); ctx.fill(); }
      for (const e of s.enemies.values()) if (e.hp < e.maxHp) { const X = sx(e.x), Z = sz(e.z) - k * 4.5, w = k * 5; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(X - w / 2, Z, w, 5); ctx.fillStyle = '#ff5a6a'; ctx.fillRect(X - w / 2, Z, w * Math.max(0, e.hp / e.maxHp), 5); }
      if (nearNpc) bubble(sx(nearNpc.x), sz(nearNpc.z) - k * 2.9 + Math.sin(t * 4) * 3, 'F', k);
    }
    ctx.drawImage(vignette(), 0, 0, W, H);
  }
  function bubble(x, y, label, k) {
    const r = Math.max(10, k * 0.55); ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = A.INK; ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.beginPath(); ctx.arc(x, y - r, r, 0, TAU); ctx.moveTo(x - r * 0.3, y - r * 0.15); ctx.lineTo(x, y + r * 0.2); ctx.lineTo(x + r * 0.3, y - r * 0.15); ctx.fill(); ctx.stroke();
    ctx.fillStyle = A.INK; ctx.font = `bold ${r * 1.1}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y - r); ctx.restore();
  }
  function wake(sh, mine, k, sx, sz) {
    if (!sh || Math.abs(sh.speed) < 0.6) return;
    const dx = Math.cos(sh.yaw), dz = Math.sin(sh.yaw), len = Math.min(26, Math.abs(sh.speed) * 3.2), X = sx(sh.x), Z = sz(sh.z);
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(X - dx * k * 7 - dz * k * 2.4 * side, Z - dz * k * 7 + dx * k * 2.4 * side); ctx.quadraticCurveTo(X - dx * k * (7 + len * 0.5) - dz * k * (2.4 + len * 0.18) * side, Z - dz * k * (7 + len * 0.5) + dx * k * (2.4 + len * 0.18) * side, X - dx * k * (7 + len) - dz * k * (2.4 + len * 0.4) * side, Z - dz * k * (7 + len) + dx * k * (2.4 + len * 0.4) * side); ctx.lineWidth = Math.max(1.5, k * 0.35); ctx.strokeStyle = mine ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.5)'; ctx.stroke(); }
  }
  function wall(f, k, sx, sz, hw, hh) {
    const g = gatePos(f.seed), cam = f.cam, a0 = Math.atan2(cam.z, cam.x), span = Math.hypot(hw, hh) / WALL_R + 0.03, step = 7 / WALL_R, WI = WALL_R - 5;
    const pts = []; for (let a = a0 - span; a <= a0 + span; a += step) { const gd = Math.abs(((a - g.angle + Math.PI * 3) % TAU) - Math.PI) * WALL_R, jag = (hash(Math.round(a * WALL_R / 7), 3) - 0.5) * 5; pts.push([a, gd < GATE_HALF, WI + (gd < GATE_HALF ? 3 : jag)]); }
    const P = (a, r) => [sx(Math.cos(a) * r), sz(Math.sin(a) * r)];
    const band = (r0, r1, style, only) => { ctx.beginPath(); let first = true; for (const [a, gate, rj] of pts) { if (only !== undefined && gate !== only) continue; const p = P(a, rj + r0); first ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); first = false; } for (let i = pts.length - 1; i >= 0; i--) { const [a, gate] = pts[i]; if (only !== undefined && gate !== only) continue; const p = P(a, WALL_R + r1); ctx.lineTo(p[0], p[1]); } ctx.closePath(); ctx.fillStyle = style; ctx.fill(); };
    band(0, 4000, '#eaf6ff', false); band(0, 10, '#aad4ee', false); band(-1, 0.5, '#7bb8dc', false);
    band(0, 14, 'rgba(150,230,255,0.85)', true);
    ctx.beginPath(); let first = true; for (const [a, gate, rj] of pts) { const p = P(a, rj); first ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); first = false; } ctx.lineWidth = Math.max(2, k * 0.2); ctx.strokeStyle = A.INK; ctx.stroke();
    ctx.lineWidth = Math.max(3, k * 0.9); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); first = true; for (const [a, , rj] of pts) { const p = P(a, rj - 1.2); first ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); first = false; } ctx.stroke();
  }
  // ---- sprite lookups (baked on first use; two detail levels)
  function propSprite(p, bi, hi) {
    const L = hi ? 'h' : 'l', S = (a, b) => (hi ? a : b);
    switch (p.k) {
      case 'tree': return getSpr(`t${p.v % 8}${bi}${L}`, A.TREE_BOX, S(30, 8), (g) => A.paintTree(g, p.v % 8, bi));
      case 'bush': return getSpr(`b${p.v % 4}${L}`, A.BUSH_BOX, S(30, 9), (g) => A.paintBush(g, p.v));
      case 'rock': return getSpr(`r${p.v % 4}${bi}${L}`, A.ROCK_BOX, S(30, 9), (g) => A.paintRock(g, p.v, bi));
      case 'flower': return getSpr(`f${p.v % 5}${L}`, A.FLOWER_BOX, S(30, 9), (g) => A.paintFlower(g, p.v));
      case 'tuft': return getSpr(`u${p.v % 4}${L}`, A.TUFT_BOX, S(30, 9), (g) => A.paintTuft(g, p.v));
      case 'crate': return getSpr(`c${p.v % 2}${L}`, A.CRATE_BOX, S(30, 9), (g) => A.paintCrate(g, p.v));
      case 'barrel': return getSpr(`a${L}`, A.CRATE_BOX, S(30, 9), (g) => A.paintBarrel(g));
      case 'lamp': return getSpr(`l${L}`, A.LAMP_BOX, S(30, 9), (g) => A.paintLamp(g));
      case 'well': return getSpr(`w${L}`, A.WELL_BOX, S(30, 9), (g) => A.paintWell(g));
      case 'stall': return getSpr(`s${p.v % 4}${L}`, A.STALL_BOX, S(30, 9), (g) => A.paintStall(g, p.v));
      case 'board': return getSpr(`bd${L}`, A.BOARD_BOX, S(30, 9), (g) => A.paintBoard(g));
      case 'bench': return getSpr(`n${L}`, A.BENCH_BOX, S(30, 9), (g) => A.paintBench(g));
      case 'xmark': return getSpr(`x${L}`, A.XMARK_BOX, S(30, 9), (g) => A.paintXMark(g));
    }
    return null;
  }
  const personSprite = (kind, seed, dir, fr, hi) => getSpr(`p${kind}${seed % 16}${dir}${fr}${hi ? 'h' : 'l'}`, A.PERSON_BOX, hi ? 44 : 14, (g) => A.paintPerson(g, A.personSpec(kind, seed % 16), dir, fr));
  const shipSprite = (seed, kind, zoom) => { const sp = A.shipSpec(seed, kind), hi = zoom > 13; return getSpr(`S${kind}${seed}${hi ? 'h' : 'l'}`, A.shipBox(sp), hi ? 24 : 7, (g) => A.paintShip(g, sp)); };
  return { resize, draw, ensure, forget, has, get cacheInfo() { return { sprites: spr.size, px: sprPx, islands: vec.size }; } };
}
