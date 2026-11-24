// Entry point: game loop, input, the 2D camera, and the bridge between the rules (rules/*), the generator (gen/*) and the 2D renderer (render2d/*).
import { createRenderer2D } from './render2d/draw.js';
import { sectorOf, sectorIslands, islandTown, SECTOR, WALL_R, gatePos } from './gen/world.js';
import { newGame, step, interact, prompt, standingOn, groundAt, say, DT } from './rules/game.js';
import { saveGame, loadGame, hasSave, loadOptions, saveOptions } from './rules/save.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';

const SEED = 1717; // the world "Terra": same seed, same sea, every time
const $ = (id) => document.getElementById(id);
const canvas = $('c'), ui = createUI(), audio = createAudio();
let opts = loadOptions(), renderer, s = null, phase = 'boot'; // boot | menu | intro | play | panel | paused | ending | over
const keys = new Set(), NORTH = -Math.PI / 2; // the camera is fixed north-up: "forward" on foot is screen-up
const cam = { x: 0, z: 0, zoom: 5.5, blend: 0, snap: true };
let face = 'down', walking = false, saveT = 0;
const ZOOM_FOOT = 30, ZOOM_SEA = 5.5; // pixels per world unit
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- sectors: islands are built on demand within a few ms per frame, and freed when far
const sectors = new Map(), tasks = [], vis = [];
const key = (x, z) => `${x},${z}`;
function updateSectors(x, z, all = false) {
  const cx = sectorOf(x), cz = sectorOf(z), R = opts.distance, want = [];
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) if (!sectors.has(key(cx + i, cz + j))) want.push([cx + i, cz + j, i * i + j * j]);
  want.sort((p, q) => p[2] - q[2]);
  for (const w of want) { const islands = sectorIslands(SEED, w[0], w[1]); sectors.set(key(w[0], w[1]), { sx: w[0], sz: w[1], islands }); for (const isl of islands) tasks.push(isl); }
  for (const [k, sec] of sectors) if (Math.max(Math.abs(sec.sx - cx), Math.abs(sec.sz - cz)) > R + 1) { for (const isl of sec.islands) renderer.forget(isl.id); sectors.delete(k); }
  const t0 = performance.now(), budget = all ? Infinity : 6;
  do { const isl = tasks.shift(); if (!isl) break; if (!renderer.has(isl.id)) renderer.ensure(isl); } while (performance.now() - t0 < budget);
}

// ---------------------------------------------------------------- camera: follows the player; zooms smoothly out to the sea map when you board and in to the town when you land
const homeIsland = () => sectorIslands(SEED, 0, 0)[0];
function updateCamera(dt, t) {
  if (!s) { const c = islandTown(homeIsland()).plaza, a = t * 0.05; cam.x = c.x + Math.cos(a) * 40; cam.z = c.z + Math.sin(a) * 28; cam.zoom = ZOOM_SEA * 1.1 * uiScale(); cam.snap = true; return; }
  const target = s.mode === 'ship' && s.ship ? 1 : 0;
  cam.blend += Math.sign(target - cam.blend) * Math.min(Math.abs(target - cam.blend), dt / 1.1);
  const k = cam.blend * cam.blend * (3 - 2 * cam.blend), shipX = s.ship ? s.ship.x : s.foot.x, shipZ = s.ship ? s.ship.z : s.foot.z;
  const tx = lerp(s.foot.x, shipX, k), tz = lerp(s.foot.z, shipZ, k), zoom = Math.exp(lerp(Math.log(ZOOM_FOOT), Math.log(ZOOM_SEA), k)) * uiScale(), f = cam.snap ? 1 : Math.min(1, dt * 7);
  cam.x += (tx - cam.x) * f; cam.z += (tz - cam.z) * f; cam.zoom = zoom; cam.snap = false;
}
function render(t) {
  const cold = Math.max(0, Math.min(1, (Math.hypot(cam.x, cam.z) / WALL_R - 0.5) / 0.4)), cx = sectorOf(cam.x), cz = sectorOf(cam.z);
  vis.length = 0; for (const sec of sectors.values()) if (Math.max(Math.abs(sec.sx - cx), Math.abs(sec.sz - cz)) <= 1) for (const isl of sec.islands) vis.push(isl);
  renderer.draw({ cam, t, cold, islands: vis, s, face, walk: walking, ground: s ? groundAt(s, s.foot.x, s.foot.z) : 0, seed: SEED });
}
// the canvas is capped at ~2.4 million pixels (the browser scales it up to the window): big or high-DPI screens stay smooth
function resize() {
  const d = Math.min(devicePixelRatio || 1, 2) * opts.scale, w = innerWidth * d, h = innerHeight * d, f = Math.min(1, Math.sqrt(2.4e6 / (w * h)));
  renderer?.resize(w * f, h * f, innerWidth);
}
const uiScale = () => Math.max(0.8, Math.min(2, innerHeight / 760)); // keep things the same size on screen whatever the window size

// ---------------------------------------------------------------- input (keyboard only: the 2D game needs no mouse capture)
const lock = () => {}, unlock = () => {};
// While playing, browser shortcuts (Ctrl+W, Ctrl+B, Ctrl+D, F5...) are blocked. In fullscreen, Chrome/Edge let us capture the
// reserved ones too (Keyboard Lock); everywhere else a "leave site?" prompt is the safety net for Ctrl+W. Escape (pause) releases it all.
let guard = false, kbLocked = false;
const LOCK_KEYS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => 'Key' + c).concat(['Tab', 'F5', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']);
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
  if (e.code === 'Escape' && phase === 'play') { pause(); return; }
  if (e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);
  if (phase === 'panel' && e.code === 'Escape') { ui.closePanel(); phase = 'play'; return; }
  if (phase !== 'play') return;
  if (e.code === 'KeyF') onInteract();
  else if (e.code === 'Tab') { phase = 'panel'; ui.questLog(s, () => { phase = 'play'; }); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('click', () => { audio.init(); if (phase === 'play') goFullscreen(); });
addEventListener('resize', resize);

function onInteract() {
  const r = interact(s);
  if (r.type === 'npc') {
    phase = 'panel';
    ui.dialog(s, r, { island: standingOn(s), audio, say: (m) => say(s, m), onChange: () => saveGame(s), onClose: () => { phase = 'play'; saveGame(s); } });
  } else if (r.type === 'ashore' || r.type === 'board') saveGame(s);
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
    updateSectors(px, pz, true); cam.blend = s.mode === 'ship' ? 1 : 0; cam.snap = true; face = 'down';
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
  phase = 'paused';
  ui.pause({ getOptions, setOptions, onResume: () => { phase = 'play'; }, onSave: () => saveGame(s), onQuit: () => { saveGame(s); showMenu(); } });
}

// ---------------------------------------------------------------- main loop
let last = performance.now(), acc = 0, T = 0, fpsN = 0, fpsT = 0;
const inFoot = { mx: 0, mz: 0, run: false, jump: false, yaw: NORTH }, inShip = { rudder: 0, sail: 0, fireL: false, fireR: false }; // reused every tick: no per-frame allocation
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; T += dt;
  applyGuard();
  if (s && phase === 'play') {
    acc += dt;
    const on = (k) => (keys.has(k) ? 1 : 0);
    inShip.rudder = on('KeyD') - on('KeyA'); inShip.sail = on('KeyW') - on('KeyS'); inShip.fireL = keys.has('KeyQ'); inShip.fireR = keys.has('KeyE');
    inFoot.mx = on('KeyD') - on('KeyA'); inFoot.mz = on('KeyW') - on('KeyS'); inFoot.run = keys.has('ShiftLeft') || keys.has('ShiftRight'); inFoot.jump = keys.has('Space');
    walking = s.mode === 'foot' && (inFoot.mx !== 0 || inFoot.mz !== 0);
    if (walking) face = Math.abs(inFoot.mz) >= Math.abs(inFoot.mx) && inFoot.mz !== 0 ? (inFoot.mz > 0 ? 'up' : 'down') : inFoot.mx > 0 ? 'right' : 'left';
    for (let n = 0; acc >= DT && n < 5; n++, acc -= DT) step(s, s.mode === 'ship' ? inShip : inFoot, DT);
    for (const ev of s.events) {
      if (ev.type === 'cannon') audio.boom(1 / (1 + Math.hypot(ev.x - (s.ship?.x || 0), ev.z - (s.ship?.z || 0)) / 60));
      else if (ev.type === 'hit') audio.hit(); else if (ev.type === 'coin' || ev.type === 'sunk') audio.coin(); else if (ev.type === 'quest') { audio.quest(); saveGame(s); }
    }
    s.events.length = 0;
    saveT += dt; if (saveT > 30) { saveT = 0; saveGame(s); }
    if (s.ending) { phase = 'ending'; saveGame(s); ui.ending({ onReturn: () => { const g = gatePos(SEED); s.ending = false; s.ship.x = g.x * (1 - 140 / WALL_R); s.ship.z = g.z * (1 - 140 / WALL_R); s.ship.speed = 0; s.mode = 'ship'; phase = 'play'; }, onMenu: showMenu }); }
    else if (s.over) { phase = 'over'; ui.gameOver({ hasSave: hasSave(), onLoad: continueFlow, onMenu: showMenu }); }
  }
  updateCamera(dt, T);
  const fx = s ? (s.mode === 'ship' && s.ship ? s.ship.x : s.foot.x) : cam.x, fz = s ? (s.mode === 'ship' && s.ship ? s.ship.z : s.foot.z) : cam.z;
  updateSectors(fx, fz);
  render(T);
  if (s && phase === 'play') {
    ui.updateHud(s, { prompt: prompt(s), yaw: NORTH });
    audio.update(s.ship?.speed || 0, Math.max(0, Math.min(1, (Math.hypot(cam.x, cam.z) / WALL_R - 0.5) / 0.4)));
  }
  fpsN++; fpsT += dt; if (fpsT > 1) { window.__fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
}

(() => {
  try { renderer = createRenderer2D(canvas); } catch (e) { ui.error(e.message); return; }
  audio.setVolume(opts.volume); resize();
  window.__pk = { home: homeIsland, town: islandTown, get s() { return s; }, get phase() { return phase; }, cam, opts, sectors, newGame: () => startPlay(newGame(SEED)), updateSectors, interact: onInteract, T: () => T, get cache() { return renderer.cacheInfo; } };
  updateSectors(homeIsland().x, homeIsland().z, true); // warm the sea behind the menu
  showMenu(); requestAnimationFrame(loop);
})();
void SECTOR;
