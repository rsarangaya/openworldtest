// Entry point: game loop, input, cameras, and the bridge between the rules (rules/*), the generator (gen/*) and the renderer.
import { createRenderer } from './render/gpu.js';
import { model } from './render/math.js';
import { islandMesh, wallMesh, shipMesh, shipParams, ballMesh, npcMesh } from './gen/mesh.js';
import { sectorOf, sectorIslands, islandTown, townsfolk, SECTOR, WALL_R, gatePos } from './gen/world.js';
import { newGame, step, interact, prompt, standingOn, nearbyIslands, say, camBlocked, DT } from './rules/game.js';
import { wave } from './rules/sea.js';
import { saveGame, loadGame, hasSave, loadOptions, saveOptions } from './rules/save.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';

const SEED = 1717; // the world "Terra": same seed, same sea, every time
const $ = (id) => document.getElementById(id);
const canvas = $('c'), ui = createUI(), audio = createAudio();
let opts = loadOptions(), renderer, s = null, phase = 'boot'; // boot | menu | intro | play | panel | paused | ending | over
const keys = new Set(), view = { yaw: 0, pitch: 0 }, orbit = { yaw: 0, pitch: -0.22, idle: 0 };
const cam = { x: 0, y: 5, z: 0, yaw: 0, pitch: 0, blend: 0 };
let expectUnlock = false, saveT = 0;
const IDENT = model(0, 0, 0);
const wrapPi = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- sectors: built on demand, one per frame, freed when far
const sectors = new Map(), shipMeshes = new Map(), npcMeshes = new Map(), tasks = [];
let ballGpu = null;
const key = (x, z) => `${x},${z}`;
// a sector is created empty and its meshes are built one at a time within a few ms per frame, so sailing never hitches
function queueSector(sx, sz) {
  const k = key(sx, sz); sectors.set(k, { sx, sz, objs: [] });
  for (const isl of sectorIslands(SEED, sx, sz)) tasks.push({ k, build: () => ({ m: renderer.upload(islandMesh(isl)), mat: IDENT, tint: [1, 1, 1], detail: 1 }) });
  tasks.push({ k, build: () => { const w = wallMesh(SEED, sx, sz); return w ? { m: renderer.upload(w), mat: IDENT, tint: [1, 1, 1] } : null; } });
}
function pump(budgetMs) {
  const t0 = performance.now();
  do { const t = tasks.shift(); if (!t) return; const sec = sectors.get(t.k); if (!sec) continue; const o = t.build(); if (o) sec.objs.push(o); } while (performance.now() - t0 < budgetMs);
}
function updateSectors(x, z, all = false) {
  const cx = sectorOf(x), cz = sectorOf(z), R = opts.distance, want = [];
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) if (!sectors.has(key(cx + i, cz + j))) want.push([cx + i, cz + j, i * i + j * j]);
  want.sort((p, q) => p[2] - q[2]);
  for (const w of want) queueSector(w[0], w[1]);
  for (const [k, sec] of sectors) if (Math.max(Math.abs(sec.sx - cx), Math.abs(sec.sz - cz)) > R + 1) { for (const o of sec.objs) renderer.free(o.m); sectors.delete(k); }
  pump(all ? Infinity : 6);
}
const shipGpu = (seed, kind) => { const k = kind + seed; let g = shipMeshes.get(k); if (!g) { g = renderer.upload(shipMesh(shipParams(seed, kind))); shipMeshes.set(k, g); } return g; };
const npcGpu = (kind, seed = 0) => { const v = seed % 16, k = kind + v; let g = npcMeshes.get(k); if (!g) { g = renderer.upload(npcMesh(kind, v)); npcMeshes.set(k, g); } return g; };

// ---------------------------------------------------------------- cameras
const homeIsland = () => sectorIslands(SEED, 0, 0)[0];
const shipMat = (x, z, yaw, t, speed = 0) => {
  const h0 = wave(x, z, t), hf = wave(x + Math.cos(yaw) * 3, z + Math.sin(yaw) * 3, t), hs = wave(x - Math.sin(yaw) * 2, z + Math.cos(yaw) * 2, t);
  return model(x, h0 * 0.8 - 0.1, z, yaw, Math.atan2(hf - h0, 3) * 0.8, Math.atan2(hs - h0, 2) * 0.5 + Math.sin(t * 0.8) * 0.02);
};
const poseFoot = () => ({ x: s.foot.x, y: s.foot.y + 1.7, z: s.foot.z, yaw: view.yaw, pitch: view.pitch });
function poseShip() {
  const p = s.ship, yaw = p.yaw + orbit.yaw, cp = Math.cos(orbit.pitch), fx = cp * Math.cos(yaw), fy = Math.sin(orbit.pitch), fz = cp * Math.sin(yaw), D = 30;
  const tx = p.x, ty = 4, tz = p.z;
  let dist = D; // pull the camera in when terrain or a building would be in the way (e.g. a boat moored beside the town)
  for (let d = 6; d <= D; d += 2) if (camBlocked(s, tx - fx * d, Math.max(3, ty - fy * d), tz - fz * d)) { dist = Math.max(5, d - 3); break; }
  const cy = Math.max(3, ty - fy * dist);
  return { x: tx - fx * dist, y: cy, z: tz - fz * dist, yaw, pitch: Math.atan2(ty - cy, dist * cp) };
}
function menuPose(t) {
  const h = homeIsland(), c = islandTown(h).plaza, a = t * 0.08, R = 150;
  const x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R;
  return { x, y: 38, z, yaw: Math.atan2(c.z - z, c.x - x), pitch: -0.22 };
}
function updateCamera(dt, t) {
  if (!s) { Object.assign(cam, menuPose(t)); return; }
  const target = s.mode === 'ship' && s.ship ? 1 : 0;
  cam.blend += Math.sign(target - cam.blend) * Math.min(Math.abs(target - cam.blend), dt / 1.1);
  const k = cam.blend * cam.blend * (3 - 2 * cam.blend), f = poseFoot(), p = cam.blend > 0 && s.ship ? poseShip() : f;
  cam.x = lerp(f.x, p.x, k); cam.y = lerp(f.y, p.y, k); cam.z = lerp(f.z, p.z, k); cam.pitch = lerp(f.pitch, p.pitch, k); cam.yaw = f.yaw + wrapPi(p.yaw - f.yaw) * k;
  if (s.mode === 'ship') { orbit.idle += dt; if (orbit.idle > 2.5) orbit.yaw *= 1 - Math.min(1, dt * 1.5), orbit.pitch = lerp(orbit.pitch, -0.22, Math.min(1, dt * 1.5)); }
}

// ---------------------------------------------------------------- drawing
function render(t) {
  const zone = Math.hypot(cam.x, cam.z) / WALL_R, cold = Math.max(0, Math.min(1, (zone - 0.5) / 0.4)), R = opts.distance;
  const objects = [];
  for (const sec of sectors.values()) if (Math.max(Math.abs(sec.sx - sectorOf(cam.x)), Math.abs(sec.sz - sectorOf(cam.z))) <= R) objects.push(...sec.objs);
  if (s) {
    if (s.ship) objects.push({ m: shipGpu(1, 'player'), mat: shipMat(s.ship.x, s.ship.z, s.ship.yaw, t), tint: [1, 1, 1] });
    for (const e of s.enemies.values()) objects.push({ m: shipGpu(e.seed, e.kind), mat: shipMat(e.x, e.z, e.yaw, t), tint: [1, 1, 1] });
    if (s.shots.length) { ballGpu ||= renderer.upload(ballMesh()); for (const b of s.shots) objects.push({ m: ballGpu, mat: model(b.x, 2.5 + Math.sin(b.life * 3) * 0.3, b.z), tint: [1, 1, 1] }); }
    const px = s.mode === 'foot' ? s.foot.x : s.ship.x, pz = s.mode === 'foot' ? s.foot.z : s.ship.z;
    for (const isl of nearbyIslands(s, px, pz, 1)) if (Math.hypot(isl.x - px, isl.z - pz) < isl.r * 1.7 + 60) {
      for (const n of islandTown(isl).npcs) objects.push({ m: npcGpu(n.kind, n.seed), mat: model(n.x, n.y + Math.sin(t * 1.7 + n.seed) * 0.012, n.z, Math.atan2(pz - n.z, px - n.x) + Math.sin(t * 0.6 + n.seed) * 0.12), tint: [1, 1, 1] }); // shopkeepers face you and sway a little
      for (const f of townsfolk(isl)) { const an = f.a0 + t * f.speed, yaw = an + (f.speed > 0 ? Math.PI / 2 : -Math.PI / 2); objects.push({ m: npcGpu('villager', f.seed), mat: model(f.cx + Math.cos(an) * f.rad, f.y + Math.abs(Math.sin(t * 7 + f.seed)) * 0.06, f.cz + Math.sin(an) * f.rad, yaw, 0, Math.sin(t * 7 + f.seed) * 0.03), tint: [1, 1, 1] }); } // villagers stroll round the plaza
    }
  }
  const far = R * SECTOR * 1.5 + 600, mix = (a, b) => a.map((v, i) => lerp(v, b[i], cold));
  renderer.draw({
    cam: { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch, fov: 1.05 }, t, far, extent: R * SECTOR * 1.3 + 200, objects,
    pal: { cold, density: 2.4 / (R * SECTOR * 0.8 + 300), fog: mix([0.62, 0.78, 0.9], [0.82, 0.9, 0.96]), deep: mix([0.02, 0.2, 0.32], [0.04, 0.17, 0.27]), shal: mix([0.1, 0.5, 0.55], [0.3, 0.62, 0.72]) },
  });
}
function resize() {
  const d = Math.min(devicePixelRatio || 1, 2) * opts.scale;
  renderer?.resize(innerWidth * d, innerHeight * d);
}

// ---------------------------------------------------------------- input
const locked = () => document.pointerLockElement === canvas;
function lock() { try { const p = canvas.requestPointerLock(); p?.catch?.(() => {}); } catch {} }
function unlock() { if (locked()) { expectUnlock = true; document.exitPointerLock(); } }
// While playing, browser shortcuts (Ctrl+W, Ctrl+B, Ctrl+D, F5...) are blocked. In fullscreen, Chrome/Edge let us capture the
// reserved ones too (Keyboard Lock); everywhere else a "leave site?" prompt is the safety net for Ctrl+W. Escape (pause) releases it all.
let guard = false;
const LOCK_KEYS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => 'Key' + c).concat(['Tab', 'F5', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']);
let kbLocked = false;
function applyGuard() {
  guard = phase === 'play' || phase === 'panel';
  const wantLock = guard && !!document.fullscreenElement;
  if (wantLock === kbLocked) return;
  kbLocked = wantLock;
  try { if (wantLock) navigator.keyboard?.lock?.(LOCK_KEYS); else navigator.keyboard?.unlock?.(); } catch {}
}
function goFullscreen() { if (opts.fullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch?.(() => {}); }
addEventListener('beforeunload', (e) => { if (guard) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('fullscreenchange', () => { kbLocked = false; applyGuard(); resize(); });
addEventListener('keydown', (e) => {
  audio.init();
  if (guard && ((e.ctrlKey || e.metaKey) || (/^F\d+$/.test(e.code) && e.code !== 'F12'))) e.preventDefault();
  if (e.code === 'Tab' || (e.code === 'Space' && phase === 'play')) e.preventDefault();
  if (e.code === 'Escape' && phase === 'play' && !locked()) { pause(); return; }
  if (e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);
  if (phase === 'panel' && e.code === 'Escape') { ui.closePanel(); phase = 'play'; return; }
  if (phase !== 'play') return;
  if (e.code === 'KeyF') onInteract();
  else if (e.code === 'Tab') { phase = 'panel'; unlock(); ui.questLog(s, () => { phase = 'play'; lock(); }); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('mousemove', (e) => {
  if (phase !== 'play' || !locked()) return;
  const k = 0.0022 * opts.sens;
  if (s.mode === 'foot') { view.yaw += e.movementX * k; view.pitch = Math.max(-1.45, Math.min(1.45, view.pitch - e.movementY * k)); }
  else { orbit.yaw += e.movementX * k; orbit.pitch = Math.max(-0.9, Math.min(0.15, orbit.pitch - e.movementY * k)); orbit.idle = 0; }
});
canvas.addEventListener('click', () => { audio.init(); if (phase === 'play') { goFullscreen(); if (!locked()) lock(); } });
document.addEventListener('pointerlockchange', () => {
  ui.crosshair(locked() && s?.mode === 'foot');
  if (locked()) return;
  if (expectUnlock) { expectUnlock = false; return; }
  if (phase === 'play') pause();
});
addEventListener('resize', resize);

function onInteract() {
  const r = interact(s);
  if (r.type === 'npc') {
    phase = 'panel'; unlock();
    ui.dialog(s, r, { island: standingOn(s), audio, say: (m) => say(s, m), onChange: () => saveGame(s), onClose: () => { phase = 'play'; lock(); saveGame(s); } });
  } else if (r.type === 'ashore') { view.yaw = s.foot.yaw; view.pitch = 0; saveGame(s); }
  else if (r.type === 'board') { orbit.yaw = 0; orbit.pitch = -0.22; orbit.idle = 0; saveGame(s); }
  else if (r.type === 'dig') { audio.coin(); saveGame(s); }
}

// ---------------------------------------------------------------- flow: menu -> intro -> play -> pause / ending / game over
const getOptions = () => opts;
const setOptions = (o) => { opts = o; saveOptions(o); audio.setVolume(o.volume); resize(); };
function showMenu() {
  phase = 'menu'; s = null; ui.hud(false); ui.crosshair(false); ui.loading(false);
  ui.menu({ hasSave: hasSave(), getOptions, setOptions, onNew: newGameFlow, onContinue: continueFlow });
}
function startPlay(game) {
  s = game; ui.fade(true);
  setTimeout(() => {
    const px = s.mode === 'ship' ? s.ship.x : s.foot.x, pz = s.mode === 'ship' ? s.ship.z : s.foot.z;
    updateSectors(px, pz, true); view.yaw = s.foot.yaw; view.pitch = 0; cam.blend = s.mode === 'ship' ? 1 : 0; orbit.yaw = 0; orbit.pitch = -0.22;
    ui.hud(true); phase = 'play'; ui.fade(false); saveT = 0;
  }, 850);
}
async function newGameFlow() {
  goFullscreen(); phase = 'intro';
  await ui.intro([
    'Tuesday night. A documentary murmurs in a quiet apartment.',
    '“…the Wall. A cliff of ice ringing the whole world. Every map ends at it. No expedition has returned to say what lies beyond.”',
    'The narrator calls it a legend. You cannot stop thinking about it.',
    'By morning your savings are spent and you are standing in Port Haven, the last harbour on the maps, with a one-way ticket and a lot of questions.',
    'Time to find out if the Wall is real.',
  ]);
  startPlay(newGame(SEED));
}
function continueFlow() { goFullscreen(); const g = loadGame(); if (!g) return newGameFlow(); startPlay(g); }
function pause() {
  phase = 'paused'; unlock();
  ui.pause({ getOptions, setOptions, onResume: () => { phase = 'play'; lock(); }, onSave: () => saveGame(s), onQuit: () => { saveGame(s); showMenu(); } });
}

// ---------------------------------------------------------------- main loop
let last = performance.now(), acc = 0, T = 0, fpsN = 0, fpsT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; T += dt;
  applyGuard();
  if (renderer.lost) { ui.error('The graphics device was lost: ' + renderer.lost + '. Reload the page.'); return; }
  if (s && phase === 'play') {
    acc += dt;
    for (let n = 0; acc >= DT && n < 5; n++, acc -= DT) {
      const on = (k) => (keys.has(k) ? 1 : 0);
      step(s, s.mode === 'ship'
        ? { rudder: on('KeyD') - on('KeyA'), sail: on('KeyW') - on('KeyS'), fireL: keys.has('KeyQ'), fireR: keys.has('KeyE') }
        : { mx: on('KeyD') - on('KeyA'), mz: on('KeyW') - on('KeyS'), run: keys.has('ShiftLeft') || keys.has('ShiftRight'), jump: keys.has('Space'), yaw: view.yaw }, DT);
    }
    for (const ev of s.events) {
      if (ev.type === 'cannon') audio.boom(1 / (1 + Math.hypot(ev.x - (s.ship?.x || 0), ev.z - (s.ship?.z || 0)) / 60));
      else if (ev.type === 'hit') audio.hit(); else if (ev.type === 'coin' || ev.type === 'sunk') audio.coin(); else if (ev.type === 'quest') { audio.quest(); saveGame(s); }
    }
    s.events.length = 0;
    saveT += dt; if (saveT > 30) { saveT = 0; saveGame(s); }
    if (s.ending) { phase = 'ending'; unlock(); saveGame(s); ui.ending({ onReturn: () => { const g = gatePos(SEED); s.ending = false; s.ship.x = g.x * (1 - 140 / WALL_R); s.ship.z = g.z * (1 - 140 / WALL_R); s.ship.speed = 0; s.mode = 'ship'; phase = 'play'; lock(); }, onMenu: showMenu }); }
    else if (s.over) { phase = 'over'; unlock(); ui.gameOver({ hasSave: hasSave(), onLoad: continueFlow, onMenu: showMenu }); }
  }
  updateCamera(dt, T);
  const fx = s ? (s.mode === 'ship' && s.ship ? s.ship.x : s.foot.x) : cam.x, fz = s ? (s.mode === 'ship' && s.ship ? s.ship.z : s.foot.z) : cam.z;
  updateSectors(fx, fz);
  render(T);
  if (s && phase === 'play') {
    const pr = prompt(s) || (!locked() ? 'Click to capture the mouse' : null);
    ui.updateHud(s, { prompt: pr, yaw: cam.yaw });
    audio.update(s.ship?.speed || 0, Math.max(0, Math.min(1, (Math.hypot(cam.x, cam.z) / WALL_R - 0.5) / 0.4)));
  }
  fpsN++; fpsT += dt; if (fpsT > 1) { window.__fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
}

(async () => {
  try {
    renderer = await createRenderer(canvas);
  } catch (e) { ui.error(e.message); return; }
  audio.setVolume(opts.volume); resize();
  window.__pk = { home: homeIsland, town: islandTown, get s() { return s; }, get phase() { return phase; }, cam, view, opts, sectors, newGame: () => startPlay(newGame(SEED)), updateSectors, interact: onInteract, T: () => T };
  updateSectors(homeIsland().x, homeIsland().z, true); // warm the sea behind the menu
  showMenu(); requestAnimationFrame(loop);
})();
