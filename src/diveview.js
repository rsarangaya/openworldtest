// The dive view: while your diver is down, a small flat pixel window shows them going down the line to the wreck, searching her and coming
// back up. One 2D canvas, 112x64 pixels scaled up with hard edges and drawn only while a diver is down; flat palette tones, no gradients.
// The wreck is a flat sprite of a few rects, its tilt and holes picked from its name. Nothing in the 3D scene changes.
import { PAL } from './render/palette.js';
import { diveStage } from './rules/salvage.js';

const W = 112, H = 64, SURF = 6, FLOOR = 53, LINE_X = 46;
const c = (f, l) => PAL[1 + f * 6 + Math.max(0, Math.min(5, l))], GREY = (k) => PAL[84 + k], SKIN = PAL[96];
// per world: water hue family, sea-floor colour pair, fish colour
const LOOK = { terra: [8, [c(3, 3), c(3, 2)], c(3, 4)], asgard: [10, [GREY(4), GREY(3)], GREY(7)], atlantis: [7, [c(3, 4), c(3, 3)], c(1, 4)], olympus: [9, [c(2, 3), c(2, 2)], c(9, 5)] };
const strHash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; };
const PHASE = { down: 'going down the line', search: 'searching the wreck', up: 'coming back up', swim: 'you are swimming' }, DEN = { down: 'going down with the keg', search: 'setting the keg', up: 'swimming clear' };
const GOLD = PAL[103], KR = (l) => c(13, l); // the kraken's red-purple and gold eyes, as on its surface sprites

export function createDiveView() {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:18px;top:96px;z-index:5;pointer-events:none;display:none;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 8px 8px;text-align:center;font-size:12px;color:var(--dim)';
  box.innerHTML = '<div></div><canvas width=' + W + ' height=' + H + ' style="position:static;display:block;width:336px;height:192px;margin-top:4px;border:2px solid #07080c"></canvas>';
  document.body.appendChild(box);
  const cap = box.firstChild, cv = box.lastChild, g = cv.getContext('2d');
  const R = (col, x, y, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x | 0, y | 0, w, h); };
  let shown = false, lastCap = '', below = false;
  return (s, night = 0, under = false) => { // under: the camera is down with the diver, so only the caption shows
    const d = s && s.mode === 'ship' ? diveStage(s) : null;
    if (!!d !== shown) { shown = !!d; box.style.display = shown ? 'block' : 'none'; }
    if (!d) return;
    const name = d.w.name.replace(/^The /, ''), txt = `Diver down · the ${name} · ${(d.den ? DEN : PHASE)[d.phase]} · V: ${under ? 'back on deck' : 'go down with them'}`;
    if (txt !== lastCap) { lastCap = txt; cap.textContent = txt; }
    if (under !== below) { below = under; cv.style.display = under ? 'none' : 'block'; }
    if (under) return;
    const [hue, floor, fish] = LOOK[d.realm] || LOOK.terra, dk = (d.w.deep ? 1 : 0) + (night > 0.5 ? 1 : 0), t = Math.floor(s.t * 8) / 8, h = strHash(d.w.name);
    // sky strip and the ship's hull at the surface, then four flat bands of water, darker with depth
    R(night > 0.5 ? c(10, 0) : c(8, 4), 0, 0, W, SURF); R(c(2, 0), LINE_X - 14, SURF - 3, 26, 3); R(PAL[0], LINE_X - 12, SURF, 22, 1);
    for (let b = 0; b < 4; b++) { const y0 = SURF + 1 + b * 12; R(c(hue, 4 - b - dk), 0, y0, W, 12); }
    R(c(hue, 5 - dk), 0, SURF + 1, W, 1); // the underside of the surface
    for (let i = 0; i < 3; i++) for (let y = SURF + 2; y < SURF + 16; y++) R(c(hue, 5 - dk), 14 + i * 34 + ((y - SURF) >> 1), y); // still light shafts
    // the sea floor, with a few stones and weed swaying in steps
    R(floor[0], 0, FLOOR, W, H - FLOOR); for (let i = 0; i < 14; i++) R(floor[1], (strHash(name + i) % W), FLOOR + 1 + (i % 4) * 2, 2, 1);
    for (let i = 0; i < 6; i++) { const x = 6 + ((h >>> (i * 3)) % 100), len = 3 + (i % 3) * 2; for (let y = 0; y < len; y++) R(c(6, 1), x + ((y + Math.floor(t * 2) + i) % 4 === 0 ? 1 : 0), FLOOR - 1 - y); }
    if (d.den) { // the kraken's den: a rock mound with a dark mouth, two gold eyes that blink, an arm swaying out, and the keg once set
      const x0 = 62; for (let i = 0; i < 44; i++) { const top = FLOOR - Math.round(14 * Math.sin((i / 43) * Math.PI)) - ((h >>> (i % 23)) & 1); R(PAL[0], x0 + i, top); R(GREY(i % 6 === 0 ? 2 : 3), x0 + i, top + 1, 1, FLOOR - top); }
      R(PAL[0], x0 + 12, FLOOR - 8, 20, 8); R(PAL[0], x0 + 15, FLOOR - 10, 14, 2);
      if (Math.floor(t * 2) % 7) for (const ex of [x0 + 17, x0 + 25]) { R(GOLD, ex, FLOOR - 6, 3, 2); R(PAL[0], ex + 1, FLOOR - 6, 1, 2); }
      for (let k = 0; k < 18; k++) { const sw = Math.round(3 * Math.sin(t * 2 + k / 4)); R(KR(k % 4 === 0 ? 1 : 2), x0 + 10 - (k >> 1) + sw, FLOOR - 2 - k, 2, 1); if (k % 4 === 2) R(KR(4), x0 + 11 - (k >> 1) + sw, FLOOR - 2 - k); }
      if (d.phase !== 'down') { R(c(2, 1), x0 + 20, FLOOR - 4, 4, 4); R(c(2, 0), x0 + 20, FLOOR - 3, 4, 1); } // the powder keg at the mouth
    } else {
    // the wreck: a broken hull half sunk in the sand, tilted, with holes, a snapped mast, and the strongbox until the last dive takes it
    const tilt = h & 1 ? 1 : -1, x0 = 64;
    for (let i = 0; i < 38; i++) {
      const top = FLOOR - 9 + Math.round((tilt * (i - 19)) / 7) + (i < 3 || i > 34 ? 2 : 0), hole = (h >>> (i % 29)) % 7 === 0 && i > 4 && i < 34;
      R(PAL[0], x0 + i, top, 1, 1); R(hole ? c(hue, 1 - dk) : i % 5 === 0 ? c(2, 0) : c(2, 1 + (i & 1)), x0 + i, top + 1, 1, FLOOR - top);
    }
    const mx = x0 + 14 + (h % 8), my = FLOOR - 9 + Math.round((tilt * (mx - x0 - 19)) / 7); for (let k = 0; k < 16; k++) R(c(2, 0), mx + tilt * (k >> 1), my - k, 2, 1);
    if (d.last) R(c(3, 4), x0 + 17, FLOOR - 4, 4, 3);
    }
    // the diver on the line, bubbles rising, a few fish
    const fr = d.phase === 'search' ? (d.k - 0.4) / 0.35 : 0, dx = d.phase === 'down' ? LINE_X + d.depth * 18 : d.phase === 'search' ? LINE_X + 18 + fr * 22 : LINE_X + d.depth * 40, dy = SURF + 3 + d.depth * (FLOOR - SURF - 14) + (Math.floor(t * 2) & 1);
    for (let k = 0; k <= 24; k++) { const f = k / 24; R(GREY(6), LINE_X + (dx - LINE_X) * f, SURF + 1 + (dy - SURF - 1) * f); }
    R(SKIN, dx, dy, 2, 2); R(c(10, 0), dx, dy + 2, 2, 3); R(c(10, 0), dx + ((Math.floor(t * 4) & 1) ? -1 : 2), dy + 5);
    for (let i = 0; i < 3; i++) { const by = dy - 2 - ((t * 10 + i * 6) % 16); if (by > SURF + 1) R(c(hue, 5), dx + 1 + ((i + Math.floor(t * 3)) % 2), by); }
    for (let i = 0; i < 4; i++) { const sp = (i & 1 ? -1 : 1) * (5 + i * 2), x = ((((t * sp + i * 37) % 130) + 130) % 130) - 9, y = SURF + 10 + i * 9; R(fish, x, y, 3, 1); R(fish, x + (sp > 0 ? -1 : 3), y - 1, 1, 3); }
  };
}
