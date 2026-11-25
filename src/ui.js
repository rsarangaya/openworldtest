// All DOM: menus, intro, HUD, shop dialogs, quest log, pause, ending. The game rules never touch the DOM.
import { QUESTS, currentQuest, questText } from './rules/quests.js';
import { GOODS } from './gen/world.js';
import { WEAPONS, WEAPON_ORDER, owns } from './rules/weapons.js';
import { quantize, SOFT } from './render/palette.js';
import { buyWeapon, equip } from './rules/weapons.js';
import { travelList, travelBlock, trimInfo, payBounty, handIn, prizeInfo, finishBoarding, contractsFor, signContract, settleBoard, dropContract } from './rules/game.js';
import { active as contractList, describe as contractText, quote as quoteContract, MAX_ACTIVE } from './rules/contracts.js';
import { board, byId, lead, rankOf, payBonus } from './rules/hunt.js';
import { newsFor, markRead } from './rules/news.js';
import { SHIPS, SHIP_ORDER, TRADE_IN } from './rules/ships.js';
import { localRep, worldRep, tier, buyMult } from './rules/rep.js';
import { drawTerra, drawWorld } from './mapview.js';
import { realmState, REALMS as WORLDS, HINTED } from './rules/map.js';
import { ROLES, candidates, hire, dismiss, capacity, crewOf, aboard, wages, PAY_EVERY, FLEET_UPKEEP } from './rules/crew.js';
import { fleetOf, sellShip, sellValue, orderOf, ORDER_TEXT, MAX_FLEET } from './rules/fleet.js';
import { PARTS, PART_ORDER, level as plevel, partPrice, fitPart, AMMO, buyAmmo, ammoOf } from './rules/parts.js';
import { buy, sell, buyFood, repair, buyShip, shipQuote, buyRam, buyPrice, sellPrice, cargoCount, SHIP_PRICE, RAM_PRICE, FOOD_PRICE, MAX_FOOD } from './rules/trade.js';

const $ = (id) => document.getElementById(id);
const on = (id, v) => $(id).classList.toggle('on', v);
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

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
      <div class=opt><span>AFK: keep running when tabbed out (P)</span><input id=oA type=checkbox ${o.afk ? "checked" : ""}><span></span></div>
      <p class=hint>Fullscreen lets the game block browser shortcuts like Ctrl+W while you play. Lower pixel detail (chunkier pixels) and view distance for slower computers.</p><button id=oB>Back</button></div>`;
    const sync = () => {
      const n = { volume: +$('oV').value, sens: +$('oS').value, pixels: +$('oR').value, distance: +$('oD').value, fullscreen: $('oF').checked, afk: $('oA').checked };
      $('oVt').textContent = Math.round(n.volume * 100) + '%'; $('oSt').textContent = n.sens.toFixed(1); $('oRt').textContent = n.pixels + 'p'; $('oDt').textContent = n.distance;
      setOptions(n);
    };
    for (const id of ['oV', 'oS', 'oR', 'oD', 'oF', 'oA']) $(id).oninput = sync; sync();
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
    el.innerHTML = '<b class=gold>Ship controls</b><div><kbd>A</kbd> <kbd>D</kbd> steer · <kbd>W</kbd> <kbd>S</kbd> sails · <kbd>Z</kbd> <kbd>C</kbd> swing the boom (keep the white mark on the gold one; you can sail across the wind and even about 45° into it, but never dead into it) · <kbd>R</kbd> autosail (straight ahead) · <kbd>O</kbd> oars when the wind dies · <kbd>F</kbd> dock at a pier · <kbd>G</kbd> grapple a ship alongside and board her · <kbd>T</kbd> fleet orders · <kbd>B</kbd> toggle bombarding towns (off: shot flies over them)</div><b class=gold>Ship battles</b><div>Turn so the enemy is beside you, then fire: <kbd>Q</kbd> left cannons, <kbd>E</kbd> right cannons. <kbd>1</kbd> round · <kbd>2</kbd> chain (slows) · <kbd>3</kbd> fire shot, bought at the shipwright. Raiders fly black sails.</div>';
    el.style.display = 'block'; tipT = setTimeout(() => { el.style.display = 'none'; }, 16000);
  };

  // ------------------------------------------------------------ HUD
  ui.hud = (v) => on('hud', v);
  const WSVG = (() => { // the held weapon is drawn by code: each arm is ONE silhouette with a single outline (no seams), then the weapon, hands stacked on the grip
    const INK = '#07080c', SKIN = '#dba67e', SKIN_L = '#eab98f', SKIN_D = '#b07a55', SLV = '#5b4632', SLV_D = '#463524', CUFF = '#cfc6b2', f1 = (n) => +n.toFixed(1);
    const Pg = (...p) => `<polygon points='${p.map(f1).join(' ')}'`, Rc = (x, y, w, h, r = 0) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='${r}'`, El = (cx, cy, rx, ry, rot) => `<ellipse cx='${f1(cx)}' cy='${f1(cy)}' rx='${rx}' ry='${ry}' transform='rotate(${f1(rot)} ${f1(cx)} ${f1(cy)})'`;
    const sil = (parts, h = 7) => parts.map(([s]) => `${s} fill='${INK}' stroke='${INK}' stroke-width='${h}' stroke-linejoin='round'/>`).join('') + parts.map(([s, c]) => `${s} fill='${c}' stroke='none'/>`).join('');
    const arm = (side, y0, dxs = 0) => {
      let dx = side * 0.5, dy = 1; const n = Math.hypot(dx, dy); dx /= n; dy /= n; const cx = 167 + side * 46, cy = y0 + 30, pt = (l, w) => [cx + dx * l - dy * w, cy + dy * l + dx * w], bx = side > 0 ? 172 : 118, fx = side > 0 ? 143 : 157;
      const parts = [[Pg(...pt(20, -30), ...pt(20, 30), ...pt(300, 64), ...pt(300, -64)), SLV], [Pg(...pt(-4, -27), ...pt(-4, 27), ...pt(24, 32), ...pt(24, -32)), CUFF], [Pg(...pt(-18, -20), ...pt(-18, 20), ...pt(0, 26), ...pt(0, -26)), SKIN], [Rc(bx, y0 - 8, 46, 60, 18), SKIN]];
      for (let k = 0; k < 4; k++) parts.push([Rc(fx, y0 + k * 14 - 3, 34, 15, 7.5), k % 2 ? SKIN : SKIN_L]); parts.push([El(167 + side * 6, y0 - 12, 15, 8, -side * 12), SKIN_L]);
      let d = Pg(...pt(20, 0), ...pt(20, side < 0 ? 30 : -30), ...pt(300, side < 0 ? 64 : -64), ...pt(300, 0)) + ` fill='${SLV_D}'/>`;
      for (let k = 0; k < 3; k++) d += `<path d='M${fx + 3} ${y0 + k * 14 + 11.5}L${fx + 31} ${y0 + k * 14 + 11.5}' stroke='${SKIN_D}' stroke-width='2.4' stroke-linecap='round' fill='none'/>`;
      return `<g transform='translate(${dxs} 0)'>${sil(parts)}${d}${Rc(bx + 4, y0 - 4, 38, 14, 7)} fill='${SKIN_L}'/></g>`;
    };
    const W = (weapon, hands, flash = '', ang = -6, py = 150) => `<g transform='rotate(${ang} 167 ${py})'><g>${weapon}</g>${hands.map(([s, y]) => arm(s, y)).join('')}${flash}</g>`;
    const blade = (pts, tip, body, edge) => sil([[Pg(...pts), body]], 6) + Pg(...tip) + ` fill='${edge}'/>`, grip = (a, b) => sil([[Rc(159, a, 16, b - a, 3), '#6b4326']], 6), gold = (x, y, w, h) => sil([[Rc(x, y, w, h, 4), '#e3b73e']], 6);
    const two = [[1, 116], [-1, 182]], one = [[1, 150]];
    const sw = blade([150, -120, 167, -150, 184, -120, 184, 96, 150, 96], [167, -150, 184, -120, 184, 96, 167, 96], '#dfe5f1', '#a9b4c9') + gold(128, 92, 78, 15) + grip(104, 250) + sil([["<circle cx='167' cy='256' r='10'", '#e3b73e']], 6);
    const dg = blade([157, -6, 167, -30, 177, -6, 177, 120, 157, 120], [167, -30, 177, -6, 177, 120, 167, 120], '#dfe5f1', '#a9b4c9') + gold(142, 118, 50, 12) + grip(126, 205);
    const sp = sil([[Rc(161, -40, 12, 360, 3), '#7d5532'], [Pg(167, -135, 186, -38, 167, -48, 148, -38), '#cdd4e2'], [Rc(156, -46, 22, 10, 2), '#c2402f']], 6) + Pg(167, -135, 186, -38, 167, -48) + " fill='#9ba6bc'/>";
    const ax = sil([[Rc(160, -30, 14, 300, 3), '#7d5532'], [Pg(160, -28, 104, -56, 92, 36, 160, 26), '#b6bed0'], [Rc(154, -34, 26, 14, 3), '#4a4f5e']], 6) + Pg(104, -56, 92, 36, 114, 30) + " fill='#eef2fa'/>";
    const pi = sil([[Pg(142, 40, 192, 40, 192, 120, 142, 120), '#3a3f4c'], [Rc(152, 14, 30, 32, 3), '#555c6e'], [Rc(159, 2, 17, 14, 2), '#2a2e38'], [Pg(142, 120, 192, 120, 188, 200, 154, 200), '#6b4326']], 6);
    return { sword: W(sw, two), dagger: W(dg, one), spear: W(sp, [[1, 150], [-1, 216]]), axe: `<g transform='rotate(-6 167 150)'><g transform='rotate(-45 167 230)'>${ax}</g>${arm(-1, 177, -28)}${arm(1, 134, -71)}</g>`, pistol: W(pi, one), fists: W('', one) };
  })();
  let wShown = null; // the weapon held in front of you: a flat sprite that swings, thrusts or recoils when you attack
  const wURL = new Map(); // each weapon is drawn once at the game's own pixel size (coarser than the world on purpose: 112x110), snapped to the game palette with hard alpha, then shown with hard edges
  const weaponImage = (id, done) => {
    if (wURL.has(id)) return done(wURL.get(id));
    const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = 112; c.height = 110; c.getContext('2d').drawImage(img, 0, 0, 112, 110); if (!SOFT) quantize(c); wURL.set(id, c.toDataURL()); done(wURL.get(id)); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='480' height='470' viewBox='-70 -160 480 470' stroke='${'#07080c'}' stroke-width='3' stroke-linejoin='round'>${WSVG[id] || WSVG.sword}</svg>`);
  };
  const showWeapon = (id) => { const e = $('weapon'); if (!e) return; if (!id) { e.style.display = 'none'; wShown = null; return; } e.style.display = 'block'; if (wShown !== id) { wShown = id; e.className = ''; weaponImage(id, (url) => { if (wShown === id) e.innerHTML = `<img src="${url}">` + (id === 'pistol' ? '<i class=mf></i>' : ''); }); } };
  ui.slash = (w, hit) => { const e = $('slash'), we = $('weapon'); const id = w || 'fists'; if (we && wShown) { we.className = ''; void we.offsetWidth; we.className = 'a-' + id; } if (!e) return; if (id === 'pistol' || id === 'spear' || id === 'dagger' || id === 'fists') return; e.classList.remove('go'); void e.offsetWidth; e.classList.add('go'); };
  ui.hurt = () => { const e = $('hurt'); if (!e) return; e.classList.remove('go'); void e.offsetWidth; e.classList.add('go'); };

  ui.crosshair = (v) => { const c = $('cross'); if (c) c.style.display = v ? 'block' : 'none'; };
  ui.updateHud = (s, info) => {
    showWeapon(s.mode === 'foot' && !s.over ? (s.weapon || 'fists') : null);
    const q = currentQuest(s), tg = q?.target?.(s), mode = s.mode, p = s.ship, ti = p ? trimInfo(s) : null;
    const so = $('speedo'); if (so) { if (mode === 'ship' && p) { const kn = (Math.abs(p.speed) * 1.2).toFixed(1), pc = Math.min(100, Math.round((Math.abs(p.speed) / (15 * (SHIPS[s.shipClass] || SHIPS.sailboat).speed)) * 100)), h = `<b>${kn}</b> kn<div class=bar><i style="width:${pc}%"></i></div>`; if (so._h !== h) { so._h = h; so.innerHTML = h; } so.style.display = 'block'; } else so.style.display = 'none'; }
    const dist = tg ? Math.hypot(tg.x - (mode === 'ship' ? p.x : s.foot.x), tg.z - (mode === 'ship' ? p.z : s.foot.z)) : 0;
    const bearing = tg ? Math.atan2(tg.z - (mode === 'ship' ? p.z : s.foot.z), tg.x - (mode === 'ship' ? p.x : s.foot.x)) : 0;
    const key = [s.weapon, Math.round(s.hp), Math.round(s.bountyGold || 0), (s.crew || []).length, (s.fleet || []).length, s.fleetOrder || 0, s.shot || 0, (s.ammo || {}).chain || 0, (s.ammo || {}).fire || 0, s.prisoner || 0, Math.round(s.gold), s.food, Math.round(s.hull), cargoCount(s), mode, p ? Math.round(p.speed * 1.2) : 0, p ? Math.round(p.sail * 100) : 0, s.quest, s.flags.crossed ? 1 : 0, s.auto ? 1 : 0, s.bombard ? 1 : 0, s.row ? 1 : 0, Math.round((p?.trim || 0) * 10), p ? Math.round(trimInfo(s).best * 10) : 0, p ? ti.point : 0, tg ? Math.round(dist / 10) : -1, s.log.join('|'), info.prompt, Math.round((bearing - info.yaw) * 20), Math.round((s.wind.dir - info.yaw) * 20)].join();
    if (key === hudKey) return; hudKey = key;
    $('stats').innerHTML = `<div class=row><span>Gold</span><b>${Math.round(s.gold)}</b></div><div class=row><span>Provisions</span><b class="${s.food < 5 && s.ship ? 'bad' : ''}">${s.food}</b></div><div class=row><span>Cargo</span><b>${cargoCount(s)}/${s.hold}</b></div>`
      + (mode === 'foot' ? `<div class=row><span>Weapon</span><b>${WEAPONS[s.weapon || 'fists'].n ? WEAPONS[s.weapon || 'fists'].n + '. ' : ''}${WEAPONS[s.weapon || 'fists'].name}</b></div>` : '') + (s.hp < s.maxHp - 0.5 ? `<div class=row><span>Health</span><b class="${s.hp < 35 ? 'bad' : ''}">${Math.round(s.hp)}</b></div>` : '') + (s.bountyGold > 0 ? `<div class=row><span>Wanted</span><b class=bad>${Math.round(s.bountyGold)}g</b></div>` : '') + (s.prisoner ? `<div class=row><span>Prisoner</span><b class=gold>${esc((byId(s, s.prisoner) || {}).name || '')}</b></div>` : '')
      + (p && ((s.ammo || {}).chain || (s.ammo || {}).fire) ? `<div class=row><span>Shot</span><b class=gold>${AMMO[(s.shot === 'chain' && s.ammo.chain) || (s.shot === 'fire' && s.ammo.fire) ? s.shot : 'round'].name}</b></div>` : '') + (p && crewOf(s).length ? `<div class=row><span>Crew</span><b>${aboard(s).length}/${capacity(s)}</b></div>` : '') + (fleetOf(s).length ? `<div class=row><span>Fleet</span><b class=gold>${fleetOf(s).length} · ${orderOf(s)}</b></div>` : '') + (p ? `<div class=row><span>Hull</span><b>${Math.round(s.hull)}</b></div><div class=bar><i style="width:${Math.round(s.hull / s.maxHull * 100)}%;background:${s.hull < s.maxHull * 0.35 ? 'var(--warn)' : 'var(--good)'}"></i></div><div class=row><span>Speed</span><b>${Math.round(p.speed * 1.2)} kn</b></div><div class=row><span>Sails</span><b>${Math.round(p.sail * 100)}%</b></div><div class=row><span>Heading</span><b class="${ti.drive < 0.3 ? 'bad' : ti.drive > 0.85 ? 'good' : ''}">${ti.point}</b></div><div class=row><span>Sail trim</span><b class="${ti.eff > 0.9 ? 'good' : ti.eff > 0.7 ? '' : 'bad'}">${Math.round(ti.eff * 100)}% wind</b></div><div class=trim><i class=best style="left:${50 + ti.best * 50}%"></i><i class=cur style="left:${50 + ti.trim * 50}%"></i></div><div class=trimk>Z ◀ sail ▶ C &nbsp; match the gold mark</div>` + (s.auto ? '<div class=row><span>Autosail</span><b class=gold>ON</b></div>' : '') + (s.bombard ? '<div class=row><span>Bombard</span><b class=bad>TOWNS ON</b></div>' : '') + (s.row ? '<div class=row><span>Oars</span><b class=gold>OUT</b></div>' : '') : '');
    $('obj').innerHTML = q ? `<b class=gold>${esc(q.title)}</b><small>${esc(questText(s, q))}</small>${tg ? `<small><svg id=arrow style="transform:rotate(${(bearing - info.yaw) * 57.2958}deg)" viewBox="0 0 24 28"><path d="M12 1 L19.5 25.5 L12 20 L4.5 25.5 Z" fill="#ffd76a" stroke="#07080c" stroke-width="1.7" stroke-linejoin="round"/></svg> ${esc(tg.label)} · ${dist > 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m'}</small>` : `<small>${esc(q.hint)}</small>`}` : '<b class=gold>The world is yours.</b>';
    $('log').innerHTML = s.log.map((l) => `<div>${esc(l)}</div>`).join('');
    const pr = $('prompt'); pr.style.display = info.prompt ? 'block' : 'none'; pr.textContent = info.prompt || '';
    $('windArrow').innerHTML = '<svg class=dart  viewBox="0 0 24 28"><path d="M12 1 L19.5 25.5 L12 20 L4.5 25.5 Z" fill="#ffd76a" stroke="#07080c" stroke-width="1.7" stroke-linejoin="round"/></svg>'; $('windArrow').style.transform = `rotate(${(s.wind.dir - info.yaw) * 57.2958}deg)`; $('windTxt').textContent = `wind ${Math.round(s.wind.speed * 100)}%`;
    $('keys').innerHTML = mode === 'ship' ? 'A/D steer · W/S sails · Z/C trim · R sail straight · O oars · F dock<br>Tab quests' + (s.flags.crossed ? ' · M map' : '') + ' · Esc menu' : 'WASD walk · Shift run · F interact · Q or click: attack · 1-5 weapon<br>Tab quests' + (s.flags.crossed ? ' · M map' : '') + ' · Esc menu';
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
      let h = `<div class=box>${head}<h2>${res.panel === 'market' ? 'Market' : res.panel === 'shipyard' ? 'Shipyard' : res.panel === 'arms' ? 'Armoury' : res.panel === 'guard' ? 'Guard Station' : res.panel === 'tavern' ? 'Tavern' : 'The Warden'}</h2><div>Gold: <b class=gold>${Math.round(s.gold)}</b>${port ? ` · Standing here: <b>${tier(localRep(s, port.iid))}</b> · Realm: <b>${tier(worldRep(s))}</b>` : ''}</div>`;
      if (res.panel === 'market') {
        h += `<p>Provisions (${FOOD_PRICE}g each): you have <b>${s.food}</b>/${MAX_FOOD} <button class=small data-a=f1>+1</button><button class=small data-a=f5>+5</button><button class=small data-a=fm>Fill</button></p>`;
        h += '<table><tr><th>Goods</th><th class=n>Buy</th><th class=n>Sell</th><th class=n>Have</th><th></th></tr>';
        for (const g of GOODS) h += `<tr><td>${g}${g === port.cheap ? ' <span class=gold>cheap</span>' : g === port.dear ? ' <span class=bad>dear</span>' : ''}</td><td class=n>${buyPrice(s, port, g)}</td><td class=n>${sellPrice(s, port, g)}</td><td class=n>${s.cargo[g] || 0}</td><td class=n><button class=small data-a="b:${g}">Buy</button><button class=small data-a="s:${g}">Sell</button></td></tr>`;
        h += `</table><p class=hint>Hold: ${cargoCount(s)}/${s.hold}. Buy where a good is cheap, sell where it is dear.</p>`;
        if (s.bountyGold > 0) h += `<button class=small data-a=bounty>Pay your bounty (${Math.round(s.bountyGold)}g)</button>`;
        if (s.ship) h += `<button class=small data-a=rep>Repair hull (2g per point, ${Math.round(s.hull)}/${s.maxHull})</button>`;
      } else if (res.panel === 'arms') {
        h += `<p>You carry: <b>${WEAPONS[s.weapon || 'fists'].name}</b>. Keys 1-5 swap weapons you own.</p>`;
        h += '<table>' + WEAPON_ORDER.map((id) => { const w = WEAPONS[id], have = owns(s, id), pr = Math.round(w.price * buyMult(s, port.iid)); return `<tr><td>${w.n}. ${w.name}</td><td><small>${w.blurb} Dmg ${w.dmg}${w.ranged ? ', ranged' : ', reach ' + w.reach}</small></td><td class=n>${have ? (s.weapon === id ? 'equipped' : `<button class=small data-a=eq-${id}>Equip</button>`) : `<button class=small data-a=w-${id} ${s.gold < pr ? 'disabled' : ''}>${pr}g</button>`}</td></tr>`; }).join('') + '</table>';
      } else if (res.panel === 'tavern') {
        const crew = crewOf(s), cap = capacity(s), nab = aboard(s).length;
        h += s.ship ? `<p>Your crew: <b>${nab}/${cap}</b> · wages <b>${wages(s)}g</b> every ${PAY_EVERY} s</p>` : '<p>You need a ship before you can take on hands.</p>';
        if (crew.length) h += '<table>' + crew.map((c) => `<tr><td>${esc(c.name)} · ${ROLES[c.role].name}<br><small>${ROLES[c.role].blurb} · morale ${Math.round(c.morale)}</small></td><td class=n>${c.wage}g/pay</td><td class=n>${c.captain ? '<small>captain of a prize</small>' : `<button class=small data-a=dis-${c.id}>Dismiss</button>`}</td></tr>`).join('') + '</table>';
        if (s.ship) { h += '<p><b class=gold>Looking for a berth</b></p><table>' + candidates(s, ctx.island).map((c) => `<tr><td>${esc(c.name)} · ${ROLES[c.role].name}<br><small>${ROLES[c.role].blurb}</small></td><td class=n>${c.wage}g/pay</td><td class=n><button class=small data-a=hire-${c.id} ${nab >= cap || s.gold < c.fee ? 'disabled' : ''}>Hire ${c.fee}g</button></td></tr>`).join('') + '</table>'; }
      } else if (res.panel === 'guard') {
        h += s.bountyGold > 0 ? `<p>You owe <b class=bad>${Math.round(s.bountyGold)}g</b> for your crimes.</p><button class=small data-a=bounty>Pay your bounty (${Math.round(s.bountyGold)}g)</button>` : '<p>Your record is clean.</p>';
        const pw = s.prisoner && byId(s, s.prisoner);
        h += `<p>Rank: <b>${rankOf(s.handed || 0)}</b> · Handed in: <b>${s.handed || 0}</b></p>`;
        if (pw) h += `<p>Your prisoner: <b>${esc(pw.name)}</b> (${esc(pw.crime)}).</p><button class=small data-a=hand>Hand them in (+${Math.round(pw.reward * payBonus(s.handed || 0))}g)</button>`;
        h += '<p><b class=gold>Wanted</b></p><table>' + board(s).map((w) => { const l = lead(w, s.foot.x, s.foot.z), far = l.dist > 1000 ? (l.dist / 1000).toFixed(1) + ' km' : Math.round(l.dist) + ' m'; return `<tr><td><b>${esc(w.name)}</b><br><small>${esc(w.crime)} · ${w.kind === 'ship' ? 'sails ' + esc(w.ship) : 'hiding near ' + esc(w.where)} · ${far}</small></td><td><small>${w.aliveOnly ? 'ALIVE only' : 'dead or alive'}</small></td><td class=n>${w.aliveOnly || w.kind === 'ship' ? w.reward + 'g' : w.reward + 'g alive / ' + w.dead + 'g dead'}</td></tr>`; }).join('') + '</table><p class=hint>Subdue a target (hit until they drop), press F to bind them, then hand them in at any guard station.</p>';
      } else if (res.panel === 'shipyard') {
        const mine = SHIP_ORDER.indexOf(s.shipClass || 'sailboat'), near = s.ship && Math.hypot(s.ship.x - ctx.island.port.berth.x, s.ship.z - ctx.island.port.berth.z) <= 45;
        h += s.ship ? `<p>Your ${SHIPS[s.shipClass || 'sailboat'].name} is moored at the dock.${near ? ' Trade her in for ' + Math.round(TRADE_IN * 100) + '% of her price.' : ' Bring her here to trade up.'}</p>` : '<p>Pick a ship. She will be moored at the dock.</p>';
        for (const id of SHIP_ORDER) { const c = SHIPS[id], i = SHIP_ORDER.indexOf(id); if (i <= (s.ship ? mine : -1)) continue; h += `<p><b>${c.name}</b>: ${c.blurb}<br><small>Hull ${c.hull} · Hold ${c.hold} · Speed ${Math.round(c.speed * 100)}% · Guns ${c.ports}</small></p><button data-a=ship-${id} ${s.gold < shipQuote(s, id) || (s.ship && !near) ? 'disabled' : ''}>Buy the ${c.name} (${shipQuote(s, id)} gold)</button>`; }
        if (fleetOf(s).length) h += `<p><b class=gold>Your fleet</b> (${fleetOf(s).length}/${MAX_FLEET}, ${FLEET_UPKEEP}g upkeep each a pay day) · order: <b>${orderOf(s)}</b><br><small>${esc(ORDER_TEXT[orderOf(s)])}. Press T at sea to change it.</small></p><table>` + fleetOf(s).map((f) => `<tr><td>${esc(f.name)}<br><small>hull ${Math.round(f.hp)}/${f.maxHp}</small></td><td class=n><button class=small data-a=fsell-${f.id}>Sell ${sellValue(f)}g</button></td></tr>`).join('') + '</table>';
        if (!s.ship) h += '<p class=hint>Afterwards, walk to the end of the dock and press F to board.</p>';
        else { h += `<p><b class=gold>Fittings</b>${near ? '' : ' <small>(bring her to the dock to fit parts)</small>'}</p><table>` + PART_ORDER.map((id) => { const P = PARTS[id], lv = plevel(s, id); return `<tr><td>${P.name} ${lv}/${P.max}<br><small>${P.blurb}</small></td><td class=n>${lv >= P.max ? 'fitted' : `<button class=small data-a=part-${id} ${!near || s.gold < partPrice(s, id) ? 'disabled' : ''}>${partPrice(s, id)}g</button>`}</td></tr>`; }).join('') + '</table>'; h += `<p><b class=gold>Special shot</b> (keys 1-3 at sea)</p><table>` + ['chain', 'fire'].map((id) => `<tr><td>${AMMO[id].name} (${ammoOf(s)[id]})<br><small>${AMMO[id].blurb}</small></td><td class=n><button class=small data-a=ammo-${id} ${s.gold < AMMO[id].price * 10 ? 'disabled' : ''}>+10 · ${AMMO[id].price * 10}g</button></td></tr>`).join('') + '</table>'; }
      } else {
        h += s.upgrades.ram ? '<p>Your ship carries an icebreaker ram.</p>' : `<p>An iron-shod icebreaker ram, bolted to your bow.</p><button data-a=ram ${s.gold < RAM_PRICE || !s.ship ? 'disabled' : ''}>Fit the ram (${RAM_PRICE} gold)</button>${s.ship ? '' : '<p class=hint>You need a ship first.</p>'}`;
      }
      el.innerHTML = h + '<p><button id=pC>Close</button></p></div>';
      $('pC').onclick = close;
      el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'f1') buyFood(s, 1); else if (a === 'f5') buyFood(s, 5); else if (a === 'fm') buyFood(s, MAX_FOOD);
        else if (a === 'rep') repair(s); else if (a === 'bounty') payBounty(s); else if (a === 'hand') handIn(s, ctx.island); else if (a.startsWith('w-')) buyWeapon(s, a.slice(2), buyMult(s, port.iid)); else if (a.startsWith('eq-')) equip(s, a.slice(3));
        else if (a.startsWith('fsell-')) { const g = sellShip(s, a.slice(6)); if (g) ctx.say('You sell the ship for ' + g + ' gold.'); } else if (a.startsWith('hire-')) { const c = candidates(s, ctx.island).find((q) => q.id === a.slice(5)); if (c && hire(s, ctx.island, c)) ctx.say(c.name + ' signs on as your ' + c.role + '.'); } else if (a.startsWith('dis-')) dismiss(s, a.slice(4));
        else if (a.startsWith('part-')) { if (fitPart(s, a.slice(5))) ctx.say(PARTS[a.slice(5)].name + ' fitted.'); } else if (a.startsWith('ammo-')) buyAmmo(s, a.slice(5), 10);
        else if (a.startsWith('ship-')) { if (buyShip(s, ctx.island, a.slice(5))) ctx.say('The ' + SHIPS[a.slice(5)].name + ' is yours. Walk to the end of the dock to board.'); }
        else if (a === 'ram') { if (buyRam(s)) ctx.say('The icebreaker ram is fitted.'); }
        else if (a[0] === 'b') buy(s, port, a.slice(2), 1); else if (a[0] === 's') sell(s, port, a.slice(2), 1);
        ctx.audio?.coin(); ctx.onChange?.(); shop();
      }));
    };
    talk(); on('panel', true);
  };
  // the world map (M): Terra's local map and the grand map of every world you have heard of
  ui.map = (s, onClose, onTravel) => {
    const el = $('panel'); let tab = 'terra', t0 = performance.now(), timer = 0, N = 640;
    const close = () => { clearInterval(timer); on('panel', false); onClose?.(); };
    const draw = () => { const c = $('mapc'); if (!c || !ui.panelOpen()) { clearInterval(timer); return; } const ctx = c.getContext('2d'), t = (performance.now() - t0) / 1000; if (tab === 'terra') drawTerra(ctx, s, N, t); else drawWorld(ctx, s, N, t); };
    const travelHtml = () => { const why = travelBlock(s), list = travelList(s); return `<div style="max-height:48vh;overflow:auto"><p><small>Sail to a port you have already walked. The voyage takes time at sea and uses provisions (you have <b>${s.food}</b>).</small></p>${why ? `<p class=bad>${esc(why)}</p>` : ''}${list.length ? '<table>' + list.map((t) => `<tr><td><b>${esc(t.name)}</b><br><small>${t.dist > 1000 ? (t.dist / 1000).toFixed(1) + ' km' : Math.round(t.dist) + ' m'} · ${Math.max(1, Math.round(t.time / 60))} min · ${t.food} provisions</small></td><td class=n><button class=small data-go="${esc(t.id)}" ${why || s.food < t.food ? 'disabled' : ''}>Sail</button></td></tr>`).join('') + '</table>' : '<p class=hint>No ports visited here yet. Walk into a port to add it.</p>'}</div>`; };
    const show = () => {
      const heard = WORLDS.filter((r) => !r.home && realmState(s, r.id) >= HINTED).length;
      el.innerHTML = `<div class=box style="max-width:min(720px,96vw)"><h2>Map</h2><div><button class=small id=mT ${tab === 'terra' ? 'disabled' : ''}>Terra</button> <button class=small id=mW ${tab === 'world' ? 'disabled' : ''}>All worlds (${heard} heard of)</button> <button class=small id=mV ${tab === 'travel' ? 'disabled' : ''}>Fast travel</button></div>${tab === 'travel' ? travelHtml() : ''}<canvas id=mapc width=${N} height=${N} style="width:min(640px,60vh);height:min(640px,60vh);image-rendering:pixelated;display:${tab === 'travel' ? 'none' : 'block'};margin:.6em auto;border:2px solid #07080c"></canvas><small>${tab === 'terra' ? 'Only waters you have sailed, places you have walked and charts you were given are drawn.' : 'Other worlds appear when you hear of them, and in colour when you reach them.'}</small><p><button id=mC>Close (M)</button></p></div>`;
      $('mC').onclick = close; $('mT').onclick = () => { tab = 'terra'; show(); }; $('mW').onclick = () => { tab = 'world'; show(); }; $('mV').onclick = () => { tab = 'travel'; show(); }; el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { const id = b.dataset.go; close(); onTravel?.(id); })); draw(); clearInterval(timer); timer = setInterval(draw, 500);
    };
    show(); on('panel', true);
  };
  // the boarded ship's fate
  ui.prize = (s, onClose) => {
    const el = $('panel'), P = prizeInfo(s); if (!P) return onClose?.();
    el.innerHTML = `<div class=box><h2>The deck is yours</h2><div class=npc>${esc(P.label)} ${esc(P.name)} · Captain ${esc((P.captain || {}).name || '?')}${P.captain?.st === 'dead' ? ' (dead)' : P.captain?.st === 'taken' ? ' (your prisoner)' : ' (surrendered)'}</div><p>${P.lawful ? 'Taking a hostile ship is lawful.' : '<b class=bad>She was peaceful: taking her is piracy.</b>'}</p><p><button data-a=loot>Strip the hold (+${P.gold}g${P.n ? `, ${P.n} ${esc(P.good)}` : ''}) and cast her off</button></p><p><button data-a=claim>Claim her as a prize (+${P.claim}g${P.n ? `, ${P.n} ${esc(P.good)}` : ''})${P.lawful ? '' : ' · +300 bounty'}</button></p><p><button data-a=keep ${P.keep ? '' : 'disabled'}>Keep her in your fleet (loot only: +${P.gold}g cargo${P.n ? `, ${P.n} ${esc(P.good)}` : ''})${P.lawful ? '' : ' · +300 bounty'}</button>${P.keep ? '' : `<br><small>${P.fleetFull ? 'Your fleet is full.' : 'You need a spare hand to captain her: hire one at a tavern.'}</small>`}</p><p><button data-a=scuttle>Scuttle her (+${P.scuttle}g)</button></p><p><button id=zC>Decide later</button></p></div>`;
    el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { finishBoarding(s, b.dataset.a); on('panel', false); onClose?.(true); }));
    $('zC').onclick = () => { on('panel', false); onClose?.(false); }; on('panel', true);
  };
  // the town notice board
  ui.news = (s, isl, onClose) => {
    const el = $('panel'), n = newsFor(s, isl); markRead(s, isl); settleBoard(s, isl);
    const draw = () => {
      const offs = contractsFor(s, isl), mine = contractList(s);
      const jobs = `<p><b class=gold>Contracts</b> <small>(${mine.length}/${MAX_ACTIVE} carried)</small></p>` + (mine.length ? '<table>' + mine.map((c) => `<tr><td>${esc(contractText(s, c))}</td><td class=n><button class=small data-k="x:${c.id}">Drop</button></td></tr>`).join('') + '</table>' : '') + (offs.length ? '<table>' + offs.map((o) => `<tr><td>${esc(o.text)}<br><small>${Math.round(o.window / 60)} min</small></td><td class=n><button class=small data-k="a:${o.id}">${quoteContract(s, o)}g · Sign</button></td></tr>`).join('') + '</table>' : '<p class=hint>No more work posted this issue.</p>');
      el.innerHTML = `<div class=box style="max-height:86vh;overflow:auto"><h2>${esc(n.title)}</h2><div class=npc>Issue ${n.issue}${n.fresh ? ' · <span class=gold>new notices pinned</span>' : ' · nothing new since you last looked'}</div>${jobs}${n.items.map((i) => `<p><small class=gold>${esc(i.tag)}</small><br><b>${esc(i.head)}</b><br>${esc(i.body)}</p>`).join('')}<button id=nC>Step away</button></div>`;
      $('nC').onclick = () => { on('panel', false); onClose?.(); };
      el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { const [a, id] = b.dataset.k.split(':'), k = b.dataset.k.slice(2); if (a === 'a') { const o = offs.find((q) => q.id === k); if (o) signContract(s, o); } else dropContract(s, k); draw(); }));
    };
    draw(); on('panel', true);
  };
  ui.questLog = (s, onClose) => {
    const el = $('panel');
    el.innerHTML = `<div class=box><h2>Quest log</h2>${QUESTS.map((q, i) => `<p style="opacity:${i > s.quest ? 0.4 : 1}"><b class="${i < s.quest ? '' : 'gold'}">${i < s.quest ? '✔ ' : i === s.quest ? '➤ ' : ''}${esc(q.title)}</b><br><small>${i <= s.quest ? esc(questText(s, q)) : '???'}</small></p>`).join('')}${contractList(s).length ? '<p><b class=gold>Contracts</b></p>' + contractList(s).map((c) => `<p><small>${esc(contractText(s, c))}</small></p>`).join('') : ''}<button id=qC>Close</button></div>`;
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
      <p class=hint>WORLDS BEYOND THE WALL</p>${WORLDS.map((r) => `<p><b class=gold>${r.name}</b> — ${esc(r.blurb)} <i>${r.home ? '(you are here)' : '(coming soon)'}</i></p>`).join('')}
      <button id=eR>Sail back through the gate</button><br><button id=eM>Main menu</button></div>`;
    $('eR').onclick = () => { on('end', false); onReturn(); }; $('eM').onclick = () => { on('end', false); onMenu(); }; on('end', true);
  };
  ui.gameOver = ({ hasSave, onLoad, onMenu }) => {
    $('end').innerHTML = `<div class=box style="text-align:center"><h1 style="font-size:40px">Lost at sea</h1><p>Your ship goes under. The Wall will have to wait.</p>${hasSave ? '<button id=gL>Load last save</button><br>' : ''}<button id=gM>Main menu</button></div>`;
    if (hasSave) $('gL').onclick = () => { on('end', false); onLoad(); }; $('gM').onclick = () => { on('end', false); onMenu(); }; on('end', true);
  };
  ui.loading = (v, text) => { if (text) $('loading').textContent = text; on('loading', v); };
  ui.fade = (v) => { $('fade').style.opacity = v ? 1 : 0; };
  // overlays made on demand: a title banner, cinematic bars, and a white flash (no template changes)
  const mk = (id, css) => { let e = document.getElementById(id); if (!e) { e = document.createElement('div'); e.id = id; e.style.cssText = 'position:fixed;pointer-events:none;' + css; document.body.appendChild(e); } return e; };
  ui.banner = (text, sub = '', ms = 3200) => { const e = mk('banner', 'left:0;right:0;top:34%;text-align:center;z-index:8;opacity:0;transition:opacity .9s;color:#f3d98a;text-shadow:0 2px 0 #000,0 0 18px #000;font:700 44px Georgia,serif;letter-spacing:3px'); e.innerHTML = esc(text) + (sub ? '<div style="font:16px Georgia,serif;letter-spacing:1px;margin-top:10px;color:#e8e2d0">' + esc(sub) + '</div>' : ''); e.style.opacity = 1; clearTimeout(e._t); e._t = setTimeout(() => { e.style.opacity = 0; }, ms); };
  ui.cine = (on) => { const c = 'left:0;right:0;height:11vh;background:#000;z-index:6;transition:transform .8s;'; const a = mk('barT', 'top:0;' + c), b = mk('barB', 'bottom:0;' + c); a.style.transform = on ? 'none' : 'translateY(-100%)'; b.style.transform = on ? 'none' : 'translateY(100%)'; };
  ui.flash = () => { const e = mk('flash', 'inset:0;background:#fff;z-index:7;opacity:1;transition:opacity 1.6s ease-out'); e.style.transition = 'none'; e.style.opacity = 0.95; void e.offsetWidth; e.style.transition = 'opacity 1.6s ease-out'; e.style.opacity = 0; };
  ui.error = (m) => { $('err').textContent = m; on('err', true); on('loading', false); };
  return ui;
}
