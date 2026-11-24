// All DOM: menus, intro, HUD, shop dialogs, quest log, pause, ending. The game rules never touch the DOM.
import { QUESTS, currentQuest, questText } from './rules/quests.js';
import { GOODS } from './gen/world.js';
import { WEAPONS, WEAPON_ORDER, owns } from './rules/weapons.js';
import { quantize, SOFT } from './render/palette.js';
import { buyWeapon, equip } from './rules/weapons.js';
import { trimInfo, payBounty } from './rules/game.js';
import { newsFor, markRead } from './rules/news.js';
import { SHIPS, SHIP_ORDER, TRADE_IN } from './rules/ships.js';
import { localRep, worldRep, tier, buyMult } from './rules/rep.js';
import { buy, sell, buyFood, repair, buyShip, shipQuote, buyRam, buyPrice, sellPrice, cargoCount, SHIP_PRICE, RAM_PRICE, FOOD_PRICE, MAX_FOOD } from './rules/trade.js';

const $ = (id) => document.getElementById(id);
const on = (id, v) => $(id).classList.toggle('on', v);
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const REALMS = [
  { id: 'terra', name: 'Terra', blurb: 'The known world, ringed by ice.', open: true },
  { id: 'atlantis', name: 'Atlantis', blurb: 'A drowned world of glass and light.', open: false },
  { id: 'asgard', name: 'Asgard', blurb: 'Above the clouds, where the long ships sail on wind and fire.', open: false },
];

export function createUI() {
  const ui = {};
  let hudKey = '';

  // ------------------------------------------------------------ menu + options
  ui.menu = ({ hasSave, onNew, onContinue, getOptions, setOptions }) => {
    const m = $('menu');
    const main = () => {
      m.innerHTML = `<h1>Beyond the Wall</h1><p class=sub>A voyage to the edge of the world</p>
        ${hasSave ? '<button id=mC>Continue</button>' : ''}<button id=mN>${hasSave ? 'New Game' : 'Start'}</button><button id=mO>Options</button><button id=mX>Exit</button>`;
      if (hasSave) $('mC').onclick = () => { on('menu', false); onContinue(); };
      let armed = false; // a saved game exists: ask once, in the menu itself (a native confirm() box blocks the whole page)
      $('mN').onclick = () => { if (hasSave && !armed) { armed = true; $('mN').textContent = 'Overwrite your save? Click again'; return; } on('menu', false); onNew(); };
      $('mO').onclick = () => ui.options(getOptions, setOptions, main);
      $('mX').onclick = () => { m.innerHTML = '<h1>Fair winds</h1><p class=sub>You can close this tab now.</p>'; try { window.close(); } catch {} };
    };
    main(); on('menu', true);
  };
  ui.options = (getOptions, setOptions, back, el = $('menu')) => {
    const o = getOptions();
    el.innerHTML = `<div class=box><h2>Options</h2>
      <div class=opt><span>Volume</span><input id=oV type=range min=0 max=1 step=.05 value=${o.volume}><span id=oVt></span></div>
      <div class=opt><span>Mouse sensitivity</span><input id=oS type=range min=.3 max=2.5 step=.1 value=${o.sens}><span id=oSt></span></div>
      <div class=opt><span>Pixel detail</span><input id=oR type=range min=135 max=540 step=45 value=${o.pixels}><span id=oRt></span></div>
      <div class=opt><span>View distance</span><input id=oD type=range min=1 max=3 step=1 value=${o.distance}><span id=oDt></span></div>
      <div class=opt><span>Fullscreen</span><input id=oF type=checkbox ${o.fullscreen ? "checked" : ""}><span></span></div>
      <p class=hint>Fullscreen lets the game block browser shortcuts like Ctrl+W while you play. Lower pixel detail (chunkier pixels) and view distance for slower computers.</p><button id=oB>Back</button></div>`;
    const sync = () => {
      const n = { volume: +$('oV').value, sens: +$('oS').value, pixels: +$('oR').value, distance: +$('oD').value, fullscreen: $('oF').checked };
      $('oVt').textContent = Math.round(n.volume * 100) + '%'; $('oSt').textContent = n.sens.toFixed(1); $('oRt').textContent = n.pixels + 'p'; $('oDt').textContent = n.distance;
      setOptions(n);
    };
    for (const id of ['oV', 'oS', 'oR', 'oD', 'oF']) $(id).oninput = sync; sync();
    $('oB').onclick = back;
  };

  // ------------------------------------------------------------ intro: a documentary, then a decision
  ui.intro = (cards) => new Promise((resolve) => {
    const el = $('intro'); let i = 0, done = false;
    const show = () => { el.innerHTML = `<div class=card>${cards[i]}</div><div class=hint>click or press Space to continue · Esc to skip</div>`; };
    const finish = () => { if (done) return; done = true; removeEventListener('keydown', key); el.onclick = null; on('intro', false); resolve(); };
    const next = () => { if (++i >= cards.length) finish(); else show(); };
    const key = (e) => { if (e.code === 'Escape') finish(); else if (e.code === 'Space' || e.code === 'Enter') next(); };
    el.onclick = next; addEventListener('keydown', key); show(); on('intro', true);
  });

  // ------------------------------------------------------------ ship tips: shown for a while each time you board
  let tipT = 0;
  ui.tips = (show) => {
    const el = $('tips'); clearTimeout(tipT); if (!show) { el.style.display = 'none'; return; }
    el.innerHTML = '<b class=gold>Ship controls</b><div><kbd>A</kbd> <kbd>D</kbd> steer · <kbd>W</kbd> <kbd>S</kbd> sails · <kbd>Z</kbd> <kbd>C</kbd> swing the boom (keep the white mark on the gold one; you can sail across the wind and even about 45° into it, but never dead into it) · <kbd>R</kbd> autosail (straight ahead) · <kbd>O</kbd> oars when the wind dies · <kbd>F</kbd> dock at a pier</div><b class=gold>Ship battles</b><div>Turn so the enemy is beside you, then fire: <kbd>Q</kbd> left cannons, <kbd>E</kbd> right cannons. Raiders fly black sails.</div>';
    el.style.display = 'block'; tipT = setTimeout(() => { el.style.display = 'none'; }, 16000);
  };

  // ------------------------------------------------------------ HUD
  ui.hud = (v) => on('hud', v);
  const WSVG = (() => { // the held weapon is drawn by code: each arm is ONE silhouette with a single outline (no seams), then the weapon, hands stacked on the grip
    const INK = '#07080c', SKIN = '#dba67e', SKIN_L = '#eab98f', SKIN_D = '#b07a55', SLV = '#5b4632', SLV_D = '#463524', CUFF = '#cfc6b2', f1 = (n) => +n.toFixed(1);
    const Pg = (...p) => `<polygon points='${p.map(f1).join(' ')}'`, Rc = (x, y, w, h, r = 0) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='${r}'`, El = (cx, cy, rx, ry, rot) => `<ellipse cx='${f1(cx)}' cy='${f1(cy)}' rx='${rx}' ry='${ry}' transform='rotate(${f1(rot)} ${f1(cx)} ${f1(cy)})'`;
    const sil = (parts, h = 7) => parts.map(([s]) => `${s} fill='${INK}' stroke='${INK}' stroke-width='${h}' stroke-linejoin='round'/>`).join('') + parts.map(([s, c]) => `${s} fill='${c}' stroke='none'/>`).join('');
    const arm = (side, y0) => {
      let dx = side * 0.5, dy = 1; const n = Math.hypot(dx, dy); dx /= n; dy /= n; const cx = 167 + side * 46, cy = y0 + 30, pt = (l, w) => [cx + dx * l - dy * w, cy + dy * l + dx * w], bx = side > 0 ? 172 : 118, fx = side > 0 ? 143 : 157;
      const parts = [[Pg(...pt(20, -30), ...pt(20, 30), ...pt(300, 64), ...pt(300, -64)), SLV], [Pg(...pt(-4, -27), ...pt(-4, 27), ...pt(24, 32), ...pt(24, -32)), CUFF], [Pg(...pt(-18, -20), ...pt(-18, 20), ...pt(0, 26), ...pt(0, -26)), SKIN], [Rc(bx, y0 - 8, 46, 60, 18), SKIN]];
      for (let k = 0; k < 4; k++) parts.push([Rc(fx, y0 + k * 14 - 3, 34, 15, 7.5), k % 2 ? SKIN : SKIN_L]); parts.push([El(167 + side * 6, y0 - 12, 15, 8, -side * 12), SKIN_L]);
      let d = Pg(...pt(20, 0), ...pt(20, side < 0 ? 30 : -30), ...pt(300, side < 0 ? 64 : -64), ...pt(300, 0)) + ` fill='${SLV_D}'/>`;
      for (let k = 0; k < 3; k++) d += `<path d='M${fx + 3} ${y0 + k * 14 + 11.5}L${fx + 31} ${y0 + k * 14 + 11.5}' stroke='${SKIN_D}' stroke-width='2.4' stroke-linecap='round' fill='none'/>`;
      return `<g>${sil(parts)}${d}${Rc(bx + 4, y0 - 4, 38, 14, 7)} fill='${SKIN_L}'/></g>`;
    };
    const W = (weapon, hands, flash = '') => `<g transform='rotate(-6 167 150)'><g>${weapon}</g>${hands.map(([s, y]) => arm(s, y)).join('')}${flash}</g>`;
    const blade = (pts, tip, body, edge) => sil([[Pg(...pts), body]], 6) + Pg(...tip) + ` fill='${edge}'/>`, grip = (a, b) => sil([[Rc(159, a, 16, b - a, 3), '#6b4326']], 6), gold = (x, y, w, h) => sil([[Rc(x, y, w, h, 4), '#e3b73e']], 6);
    const two = [[1, 116], [-1, 182]], one = [[1, 150]];
    const sw = blade([150, -120, 167, -150, 184, -120, 184, 96, 150, 96], [167, -150, 184, -120, 184, 96, 167, 96], '#dfe5f1', '#a9b4c9') + gold(128, 92, 78, 15) + grip(104, 250) + sil([["<circle cx='167' cy='256' r='10'", '#e3b73e']], 6);
    const dg = blade([157, -6, 167, -30, 177, -6, 177, 120, 157, 120], [167, -30, 177, -6, 177, 120, 167, 120], '#dfe5f1', '#a9b4c9') + gold(142, 118, 50, 12) + grip(126, 205);
    const sp = sil([[Rc(161, -40, 12, 360, 3), '#7d5532'], [Pg(167, -135, 186, -38, 167, -48, 148, -38), '#cdd4e2'], [Rc(156, -46, 22, 10, 2), '#c2402f']], 6) + Pg(167, -135, 186, -38, 167, -48) + " fill='#9ba6bc'/>";
    const ax = sil([[Rc(160, -30, 14, 300, 3), '#7d5532'], [Pg(174, -28, 230, -56, 242, 36, 174, 26), '#b6bed0'], [Rc(154, -34, 26, 14, 3), '#4a4f5e']], 6) + Pg(230, -56, 242, 36, 220, 30) + " fill='#eef2fa'/>";
    const pi = sil([[Pg(142, 40, 192, 40, 192, 120, 142, 120), '#3a3f4c'], [Rc(152, 14, 30, 32, 3), '#555c6e'], [Rc(159, 2, 17, 14, 2), '#2a2e38'], [Pg(142, 120, 192, 120, 188, 200, 154, 200), '#6b4326']], 6);
    return { sword: W(sw, two), dagger: W(dg, one), spear: W(sp, [[1, 150], [-1, 216]]), axe: W(ax, [[1, 128], [-1, 194]]), pistol: W(pi, one) };
  })();
  let wShown = null; // the weapon held in front of you: a flat sprite that swings, thrusts or recoils when you attack
  const wURL = new Map(); // each weapon is drawn once at the game's own pixel size (coarser than the world on purpose: 112x110), snapped to the game palette with hard alpha, then shown with hard edges
  const weaponImage = (id, done) => {
    if (wURL.has(id)) return done(wURL.get(id));
    const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = 112; c.height = 110; c.getContext('2d').drawImage(img, 0, 0, 112, 110); if (!SOFT) quantize(c); wURL.set(id, c.toDataURL()); done(wURL.get(id)); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='480' height='470' viewBox='-70 -160 480 470' stroke='${'#07080c'}' stroke-width='3' stroke-linejoin='round'>${WSVG[id] || WSVG.sword}</svg>`);
  };
  const showWeapon = (id) => { const e = $('weapon'); if (!e) return; if (!id) { e.style.display = 'none'; wShown = null; return; } e.style.display = 'block'; if (wShown !== id) { wShown = id; e.className = ''; weaponImage(id, (url) => { if (wShown === id) e.innerHTML = `<img src="${url}">` + (id === 'pistol' ? '<i class=mf></i>' : ''); }); } };
  ui.slash = (w, hit) => { const e = $('slash'), we = $('weapon'); const id = w || 'sword'; if (we && wShown) { we.className = ''; void we.offsetWidth; we.className = 'a-' + id; } if (!e) return; if (id === 'pistol' || id === 'spear' || id === 'dagger') return; e.classList.remove('go'); void e.offsetWidth; e.classList.add('go'); };
  ui.hurt = () => { const e = $('hurt'); if (!e) return; e.classList.remove('go'); void e.offsetWidth; e.classList.add('go'); };

  ui.crosshair = (v) => { const c = $('cross'); if (c) c.style.display = v ? 'block' : 'none'; };
  ui.updateHud = (s, info) => {
    showWeapon(s.mode === 'foot' && !s.over ? (s.weapon || 'sword') : null);
    const q = currentQuest(s), tg = q?.target?.(s), mode = s.mode, p = s.ship, ti = p ? trimInfo(s) : null;
    const so = $('speedo'); if (so) { if (mode === 'ship' && p) { const kn = (Math.abs(p.speed) * 1.2).toFixed(1), pc = Math.min(100, Math.round((Math.abs(p.speed) / (15 * (SHIPS[s.shipClass] || SHIPS.sailboat).speed)) * 100)), h = `<b>${kn}</b> kn<div class=bar><i style="width:${pc}%"></i></div>`; if (so._h !== h) { so._h = h; so.innerHTML = h; } so.style.display = 'block'; } else so.style.display = 'none'; }
    const dist = tg ? Math.hypot(tg.x - (mode === 'ship' ? p.x : s.foot.x), tg.z - (mode === 'ship' ? p.z : s.foot.z)) : 0;
    const bearing = tg ? Math.atan2(tg.z - (mode === 'ship' ? p.z : s.foot.z), tg.x - (mode === 'ship' ? p.x : s.foot.x)) : 0;
    const key = [s.weapon, Math.round(s.hp), Math.round(s.bountyGold || 0), Math.round(s.gold), s.food, Math.round(s.hull), cargoCount(s), mode, p ? Math.round(p.speed * 1.2) : 0, p ? Math.round(p.sail * 100) : 0, s.quest, s.auto ? 1 : 0, s.row ? 1 : 0, Math.round((p?.trim || 0) * 10), p ? Math.round(trimInfo(s).best * 10) : 0, p ? ti.point : 0, tg ? Math.round(dist / 10) : -1, s.log.join('|'), info.prompt, Math.round((bearing - info.yaw) * 20), Math.round((s.wind.dir - info.yaw) * 20)].join();
    if (key === hudKey) return; hudKey = key;
    $('stats').innerHTML = `<div class=row><span>Gold</span><b>${Math.round(s.gold)}</b></div><div class=row><span>Provisions</span><b class="${s.food < 5 && s.ship ? 'bad' : ''}">${s.food}</b></div><div class=row><span>Cargo</span><b>${cargoCount(s)}/${s.hold}</b></div>`
      + (mode === 'foot' ? `<div class=row><span>Weapon</span><b>${WEAPONS[s.weapon || 'sword'].n}. ${WEAPONS[s.weapon || 'sword'].name}</b></div>` : '') + (s.hp < s.maxHp - 0.5 ? `<div class=row><span>Health</span><b class="${s.hp < 35 ? 'bad' : ''}">${Math.round(s.hp)}</b></div>` : '') + (s.bountyGold > 0 ? `<div class=row><span>Wanted</span><b class=bad>${Math.round(s.bountyGold)}g</b></div>` : '')
      + (p ? `<div class=row><span>Hull</span><b>${Math.round(s.hull)}</b></div><div class=bar><i style="width:${Math.round(s.hull / s.maxHull * 100)}%;background:${s.hull < s.maxHull * 0.35 ? 'var(--warn)' : 'var(--good)'}"></i></div><div class=row><span>Speed</span><b>${Math.round(p.speed * 1.2)} kn</b></div><div class=row><span>Sails</span><b>${Math.round(p.sail * 100)}%</b></div><div class=row><span>Heading</span><b class="${ti.drive < 0.3 ? 'bad' : ti.drive > 0.85 ? 'good' : ''}">${ti.point}</b></div><div class=row><span>Sail trim</span><b class="${ti.eff > 0.9 ? 'good' : ti.eff > 0.7 ? '' : 'bad'}">${Math.round(ti.eff * 100)}% wind</b></div><div class=trim><i class=best style="left:${50 + ti.best * 50}%"></i><i class=cur style="left:${50 + ti.trim * 50}%"></i></div><div class=trimk>Z ◀ sail ▶ C &nbsp; match the gold mark</div>` + (s.auto ? '<div class=row><span>Autosail</span><b class=gold>ON</b></div>' : '') + (s.row ? '<div class=row><span>Oars</span><b class=gold>OUT</b></div>' : '') : '');
    $('obj').innerHTML = q ? `<b class=gold>${esc(q.title)}</b><small>${esc(questText(s, q))}</small>${tg ? `<small><svg id=arrow style="transform:rotate(${(bearing - info.yaw) * 57.2958}deg)" viewBox="0 0 24 28"><path d="M12 1 L19.5 25.5 L12 20 L4.5 25.5 Z" fill="#ffd76a" stroke="#07080c" stroke-width="1.7" stroke-linejoin="round"/></svg> ${esc(tg.label)} · ${dist > 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m'}</small>` : `<small>${esc(q.hint)}</small>`}` : '<b class=gold>The world is yours.</b>';
    $('log').innerHTML = s.log.map((l) => `<div>${esc(l)}</div>`).join('');
    const pr = $('prompt'); pr.style.display = info.prompt ? 'block' : 'none'; pr.textContent = info.prompt || '';
    $('windArrow').innerHTML = '<svg class=dart  viewBox="0 0 24 28"><path d="M12 1 L19.5 25.5 L12 20 L4.5 25.5 Z" fill="#ffd76a" stroke="#07080c" stroke-width="1.7" stroke-linejoin="round"/></svg>'; $('windArrow').style.transform = `rotate(${(s.wind.dir - info.yaw) * 57.2958}deg)`; $('windTxt').textContent = `wind ${Math.round(s.wind.speed * 100)}%`;
    $('keys').innerHTML = mode === 'ship' ? 'A/D steer · W/S sails · Z/C trim · R sail straight · O oars · F dock<br>Tab quests · Esc menu' : 'WASD walk · Shift run · F interact · Q or click: attack · 1-5 weapon<br>Tab quests · Esc menu';
  };

  // ------------------------------------------------------------ dialogs and shops
  ui.panelOpen = () => $('panel').classList.contains('on');
  ui.closePanel = () => on('panel', false);
  ui.dialog = (s, res, ctx) => {
    const el = $('panel'); let i = 0;
    const close = () => { on('panel', false); ctx.onClose?.(); };
    const head = `<div class=npc>${esc(res.npc.name)} · ${esc(res.npc.kind)}</div>`;
    const talk = () => {
      el.innerHTML = `<div class=box>${head}<p>${esc(res.lines[i])}</p><button id=pN>${i < res.lines.length - 1 ? 'Continue' : res.panel ? 'Trade' : 'Farewell'}</button></div>`;
      $('pN').onclick = () => { if (++i < res.lines.length) talk(); else if (res.panel) shop(); else close(); };
    };
    const port = ctx.island?.port;
    const shop = () => {
      let h = `<div class=box>${head}<h2>${res.panel === 'market' ? 'Market' : res.panel === 'shipyard' ? 'Shipyard' : 'The Warden'}</h2><div>Gold: <b class=gold>${Math.round(s.gold)}</b>${port ? ` · Standing here: <b>${tier(localRep(s, port.iid))}</b> · Realm: <b>${tier(worldRep(s))}</b>` : ''}</div>`;
      if (res.panel === 'market') {
        h += `<p>Provisions (${FOOD_PRICE}g each): you have <b>${s.food}</b>/${MAX_FOOD} <button class=small data-a=f1>+1</button><button class=small data-a=f5>+5</button><button class=small data-a=fm>Fill</button></p>`;
        h += '<table><tr><th>Goods</th><th class=n>Buy</th><th class=n>Sell</th><th class=n>Have</th><th></th></tr>';
        for (const g of GOODS) h += `<tr><td>${g}${g === port.cheap ? ' <span class=gold>cheap</span>' : g === port.dear ? ' <span class=bad>dear</span>' : ''}</td><td class=n>${buyPrice(s, port, g)}</td><td class=n>${sellPrice(s, port, g)}</td><td class=n>${s.cargo[g] || 0}</td><td class=n><button class=small data-a="b:${g}">Buy</button><button class=small data-a="s:${g}">Sell</button></td></tr>`;
        h += `</table><p class=hint>Hold: ${cargoCount(s)}/${s.hold}. Buy where a good is cheap, sell where it is dear.</p>`;
        h += '<h3>Arms</h3><table>' + WEAPON_ORDER.filter((id) => id !== 'sword').map((id) => { const w = WEAPONS[id], have = owns(s, id), pr = Math.round(w.price * buyMult(s, port.iid)); return `<tr><td>${w.n}. ${w.name}</td><td><small>${w.blurb} Dmg ${w.dmg}${w.ranged ? ', ranged' : ', reach ' + w.reach}</small></td><td class=n>${have ? (s.weapon === id ? 'equipped' : `<button class=small data-a=eq-${id}>Equip</button>`) : `<button class=small data-a=w-${id} ${s.gold < pr ? 'disabled' : ''}>${pr}g</button>`}</td></tr>`; }).join('') + '</table>';
        if (s.bountyGold > 0) h += `<button class=small data-a=bounty>Pay your bounty (${Math.round(s.bountyGold)}g)</button>`;
        if (s.ship) h += `<button class=small data-a=rep>Repair hull (2g per point, ${Math.round(s.hull)}/${s.maxHull})</button>`;
      } else if (res.panel === 'shipyard') {
        const mine = SHIP_ORDER.indexOf(s.shipClass || 'sailboat'), near = s.ship && Math.hypot(s.ship.x - ctx.island.port.berth.x, s.ship.z - ctx.island.port.berth.z) <= 45;
        h += s.ship ? `<p>Your ${SHIPS[s.shipClass || 'sailboat'].name} is moored at the dock.${near ? ' Trade her in for ' + Math.round(TRADE_IN * 100) + '% of her price.' : ' Bring her here to trade up.'}</p>` : '<p>Pick a ship. She will be moored at the dock.</p>';
        for (const id of SHIP_ORDER) { const c = SHIPS[id], i = SHIP_ORDER.indexOf(id); if (i <= (s.ship ? mine : -1)) continue; h += `<p><b>${c.name}</b>: ${c.blurb}<br><small>Hull ${c.hull} · Hold ${c.hold} · Speed ${Math.round(c.speed * 100)}% · Guns ${c.ports}</small></p><button data-a=ship-${id} ${s.gold < shipQuote(s, id) || (s.ship && !near) ? 'disabled' : ''}>Buy the ${c.name} (${shipQuote(s, id)} gold)</button>`; }
        if (!s.ship) h += '<p class=hint>Afterwards, walk to the end of the dock and press F to board.</p>';
      } else {
        h += s.upgrades.ram ? '<p>Your ship carries an icebreaker ram.</p>' : `<p>An iron-shod icebreaker ram, bolted to your bow.</p><button data-a=ram ${s.gold < RAM_PRICE || !s.ship ? 'disabled' : ''}>Fit the ram (${RAM_PRICE} gold)</button>${s.ship ? '' : '<p class=hint>You need a ship first.</p>'}`;
      }
      el.innerHTML = h + '<p><button id=pC>Close</button></p></div>';
      $('pC').onclick = close;
      el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'f1') buyFood(s, 1); else if (a === 'f5') buyFood(s, 5); else if (a === 'fm') buyFood(s, MAX_FOOD);
        else if (a === 'rep') repair(s); else if (a === 'bounty') payBounty(s); else if (a.startsWith('w-')) buyWeapon(s, a.slice(2), buyMult(s, port.iid)); else if (a.startsWith('eq-')) equip(s, a.slice(3));
        else if (a.startsWith('ship-')) { if (buyShip(s, ctx.island, a.slice(5))) ctx.say('The ' + SHIPS[a.slice(5)].name + ' is yours. Walk to the end of the dock to board.'); }
        else if (a === 'ram') { if (buyRam(s)) ctx.say('The icebreaker ram is fitted.'); }
        else if (a[0] === 'b') buy(s, port, a.slice(2), 1); else if (a[0] === 's') sell(s, port, a.slice(2), 1);
        ctx.audio?.coin(); ctx.onChange?.(); shop();
      }));
    };
    talk(); on('panel', true);
  };
  // the town notice board
  ui.news = (s, isl, onClose) => {
    const el = $('panel'), n = newsFor(s, isl); markRead(s, isl);
    el.innerHTML = `<div class=box style="max-height:86vh;overflow:auto"><h2>${esc(n.title)}</h2><div class=npc>Issue ${n.issue}${n.fresh ? ' · <span class=gold>new notices pinned</span>' : ' · nothing new since you last looked'}</div>${n.items.map((i) => `<p><small class=gold>${esc(i.tag)}</small><br><b>${esc(i.head)}</b><br>${esc(i.body)}</p>`).join('')}<button id=nC>Step away</button></div>`;
    $('nC').onclick = () => { on('panel', false); onClose?.(); }; on('panel', true);
  };
  ui.questLog = (s, onClose) => {
    const el = $('panel');
    el.innerHTML = `<div class=box><h2>Quest log</h2>${QUESTS.map((q, i) => `<p style="opacity:${i > s.quest ? 0.4 : 1}"><b class="${i < s.quest ? '' : 'gold'}">${i < s.quest ? '✔ ' : i === s.quest ? '➤ ' : ''}${esc(q.title)}</b><br><small>${i <= s.quest ? esc(questText(s, q)) : '???'}</small></p>`).join('')}<button id=qC>Close</button></div>`;
    $('qC').onclick = () => { on('panel', false); onClose?.(); }; on('panel', true);
  };

  // ------------------------------------------------------------ pause, ending, game over
  ui.pause = ({ onResume, onSave, onQuit, getOptions, setOptions }) => {
    const el = $('pause'), main = () => {
      el.innerHTML = '<div class=box style="text-align:center"><h2>Paused</h2><button id=pR>Resume</button><br><button id=pS>Save game</button><br><button id=pO>Options</button><br><button id=pQ>Save &amp; quit to menu</button></div>';
      $('pR').onclick = () => { on('pause', false); onResume(); };
      $('pS').onclick = () => { onSave(); $('pS').textContent = 'Saved ✔'; };
      $('pO').onclick = () => ui.options(getOptions, setOptions, main, el);
      $('pQ').onclick = () => { on('pause', false); onQuit(); };
    };
    main(); on('pause', true);
  };
  ui.pauseOpen = () => $('pause').classList.contains('on');
  ui.hidePause = () => on('pause', false);
  ui.ending = ({ onReturn, onMenu }) => {
    $('end').innerHTML = `<div class=box style="text-align:center"><h1 style="font-size:40px">The Wall breaks</h1><p>The ram bites, the ice screams, and the gate gives way. Beyond it the sea goes on, but it is not the same sea. The stars are in the wrong places. You have left the world you knew.</p>
      <p class=hint>WORLDS BEYOND THE WALL</p>${REALMS.map((r) => `<p><b class=gold>${r.name}</b> — ${esc(r.blurb)} <i>${r.open ? '(you are here)' : '(coming soon)'}</i></p>`).join('')}
      <button id=eR>Sail back through the gate</button><br><button id=eM>Main menu</button></div>`;
    $('eR').onclick = () => { on('end', false); onReturn(); }; $('eM').onclick = () => { on('end', false); onMenu(); }; on('end', true);
  };
  ui.gameOver = ({ hasSave, onLoad, onMenu }) => {
    $('end').innerHTML = `<div class=box style="text-align:center"><h1 style="font-size:40px">Lost at sea</h1><p>Your ship goes under. The Wall will have to wait.</p>${hasSave ? '<button id=gL>Load last save</button><br>' : ''}<button id=gM>Main menu</button></div>`;
    if (hasSave) $('gL').onclick = () => { on('end', false); onLoad(); }; $('gM').onclick = () => { on('end', false); onMenu(); }; on('end', true);
  };
  ui.loading = (v, text) => { if (text) $('loading').textContent = text; on('loading', v); };
  ui.fade = (v) => { $('fade').style.opacity = v ? 1 : 0; };
  ui.error = (m) => { $('err').textContent = m; on('err', true); on('loading', false); };
  return ui;
}
