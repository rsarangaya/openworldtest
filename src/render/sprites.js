// Pixel-art billboard sprites: people, trees, bushes, rocks, flowers, plaza and dock furniture. Each one is painted ONCE with the anime painters,
// snapped to the fixed palette, packed into the GPU atlas, and from then on drawn as a flat camera-facing quad. Zero asset files.
import { bake } from '../render2d/art.js';
import * as A from '../render2d/art.js';
import { quantize, SOFT } from './palette.js';

// warm bright pixels (a lamp's flame) are left partly clear: the renderer keeps them bright at night
const glowPixels = (c) => { const g = c.getContext('2d'), im = g.getImageData(0, 0, c.width, c.height), d = im.data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] > 200 && d[i + 1] > 170 && d[i + 2] < 170) d[i + 3] = 190; g.putImageData(im, 0, 0); };
const PERSON_SCALE = 0.6; // the painted person is ~3.4 units tall; scale to a ~2 unit human
export function createSprites(R) {
  const cache = new Map(); let epoch = R.atlasEpoch, theme = 'terra'; // the look of the realm in play (people and, later, more)
  // new sprites are painted within a small time budget a frame (a new town needs hundreds): the rest appear over the next frames
  let spent = 0; const BUDGET = 4;
  const frame = () => { spent = 0; };
  function get(key, box, S, paint, lit) {
    if (R.atlasEpoch !== epoch) { cache.clear(); epoch = R.atlasEpoch; }
    let s = cache.get(key); if (s) return s;
    if (spent > BUDGET) return null;
    const t0 = performance.now();
    const b = bake(box, SOFT ? S * 3 : S, paint); if (!SOFT) quantize(b.c); if (lit) glowPixels(b.c);
    const uv = R.addSprite(b.c); if (R.atlasEpoch !== epoch) { cache.clear(); epoch = R.atlasEpoch; }
    s = { uv, x0: box.x0, x1: box.x1, top: -box.y0, bot: -box.y1 }; cache.set(key, s); spent += performance.now() - t0; return s;
  }
  const prop = (p, bi) => {
    switch (p.k) {
      case 'tree': return get(`t${p.v % 8}${bi}`, A.TREE_BOX, 9, (g) => A.paintTree(g, p.v % 8, bi));
      case 'bush': return get(`b${p.v % 4}`, A.BUSH_BOX, 10, (g) => A.paintBush(g, p.v));
      case 'rock': return get(`r${p.v % 4}${bi}`, A.ROCK_BOX, 10, (g) => A.paintRock(g, p.v, bi));
      case 'flower': return get(`f${p.v % 5}`, A.FLOWER_BOX, 12, (g) => A.paintFlower(g, p.v));
      case 'tuft': return get(`u${p.v % 4}`, A.TUFT_BOX, 12, (g) => A.paintTuft(g, p.v));
      case 'crate': return get(`c${p.v % 2}`, A.CRATE_BOX, 12, (g) => A.paintCrate(g, p.v));
      case 'barrel': return get('a', A.CRATE_BOX, 12, (g) => A.paintBarrel(g));
      case 'lamp': return get('l', A.LAMP_BOX, 12, (g) => A.paintLamp(g), true);
      case 'well': return get('w', A.WELL_BOX, 11, (g) => A.paintWell(g));
      case 'stall': return get(`s${theme}${p.v % 4}`, A.STALL_BOX, 11, (g) => A.paintStall(g, p.v));
      case 'bench': return get('n', A.BENCH_BOX, 12, (g) => A.paintBench(g));
      case 'counter': return get(`co${p.kind}`, A.shopMidBox, 12, (g) => A.paintShopCounter(g, { kind: p.kind }));
      case 'board': return get('bd', A.BOARD_BOX, 12, (g) => A.paintBoard(g));
      case 'sign': return get(`sg${p.kind}`, A.SIGN_BOX, 12, (g) => A.paintSign(g, p.kind));
      case 'bar': return get('br', A.BAR_BOX, 12, (g) => A.paintBar(g));
      case 'cellrail': return get('rl' + p.v, A.railBox(p.v / 10), 12, (g) => A.paintRail(g, p.v / 10));
      case 'bunk': return get('bk', A.BUNK_BOX, 12, (g) => A.paintBunk(g));
      case 'desk': return get('dk', A.DESK_BOX, 12, (g) => A.paintDesk(g));
      case 'keys': return get('ky', A.KEYS_BOX, 12, (g) => A.paintKeys(g));
      case 'notices': return get('nt', A.NOTICES_BOX, 12, (g) => A.paintNotices(g));
      case 'rack': return get('rk', A.RACK_BOX, 12, (g) => A.paintRack(g));
      case 'anvil': return get('an', A.ANVIL_BOX, 12, (g) => A.paintAnvil(g));
      case 'forge': return get('fg', A.FORGE_BOX, 12, (g) => A.paintForge(g));
      case 'shelf': return get(`sh${p.kind}`, A.SHELF_BOX, 12, (g) => A.paintShelf(g, p.kind));
      case 'hearth': return get('hh', A.HEARTH_BOX, 12, (g) => A.paintHearth(g));
      case 'feast': return get('ft' + (p.v & 1), A.FEAST_BOX, 12, (g) => A.paintFeast(g, p.v & 1));
      case 'rune': return get('ru', A.RUNE_BOX, 12, (g) => A.paintRune(g));
      case 'xmark': return get('x', A.XMARK_BOX, 12, (g) => A.paintXMark(g));
    }
    return null;
  };
  const person = (kind, seed, dir, fr) => get(`p${theme}${kind}${seed % 16}${dir}${fr}`, A.PERSON_BOX, 12, (g) => A.paintPerson(g, A.personSpec(kind, seed % 16, theme), dir, fr));
  const setTheme = (t) => { theme = t || 'terra'; A.setArtTheme(theme); };
  const fx = (k) => get('fx' + k, A.FX_BOX, 12, (g) => (k === 'hurt' ? A.paintHurt(g) : k === 'flash' ? A.paintFlash(g) : k === 'smoke' ? A.paintSmoke(g) : A.paintSplash(g)));
  const fallen = (kind, seed) => get(`fl${theme}${kind}${seed % 16}`, A.FALLEN_BOX, 12, (g) => { g.rotate(Math.PI / 2); A.paintPerson(g, A.personSpec(kind, seed % 16, theme), 'down', 0); });
  const gate = () => get('gate', A.GATE_BOX, 12, (g) => A.paintGate(g));
  const hp = (n, skull) => (skull ? get('sk' + n, A.SKULL_HP_BOX, 12, (g) => A.paintSkullHp(g, n / 10)) : get('hp' + n, A.HP_BOX, 12, (g) => A.paintHp(g, n / 10)));
  const critter = (kind, dir, fr) => get(`cr${kind}${dir}${fr}`, A.CRIT_BOX[kind], 10, (g) => A.paintCritter(g, kind, dir, fr));
  return { frame, prop, person, setTheme, critter, fallen, hp, fx, gate, PERSON_SCALE };
}
