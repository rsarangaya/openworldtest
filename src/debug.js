// Debug mode for testing: add ?debug to the page address, then press the ` key (under Esc) to open or close the panel. It changes your real save, so use it for testing.
import { WALL_R, gatePos } from './gen/world.js';
import { OUTER_EDGE, RUNES_NEEDED, runeGateAngle } from './rules/realm.js';
import { REALMS } from './rules/map.js';
import { KINDS, sectorOf, sectorIslands, islandTown } from './gen/world.js';
import { groundAt } from './rules/game.js';
import { SHIPS } from './rules/ships.js';
import { MAX_FOOD } from './rules/trade.js';
import { PARTS } from './rules/parts.js';
import { weatherForce, KINDS_W } from './rules/weather.js';
import { lairs } from './rules/serpent.js';
import { barrows } from './rules/draugr.js';

export const debugEnabled = () => /[?&]debug\b/.test(location.search);

export function createDebug({ get, teleport, warp, say, info }) {
  let el = null, timer = 0, god = false;
  const needShip = (s) => { if (!s.ship) { const f = s.foot; s.ship = { x: f.x, z: f.z, yaw: 0, speed: 0, sail: 0.5, cd: [0, 0] }; s.shipClass ||= 'sailboat'; s.maxHull = s.hull = SHIPS[s.shipClass].hull; s.hold = SHIPS[s.shipClass].hold; } };
  const sail = (s, x, z, yaw) => { needShip(s); Object.assign(s.ship, { x, z, yaw, speed: 0, sail: 0.5 }); s.mode = 'ship'; s.enemies.clear(); teleport(); };
  const spawn = (s, kind) => { needShip(s); const p = s.ship, id = 'dbg' + (s.dbgN = (s.dbgN || 0) + 1); s.enemies.set(id, { id, seed: 40 + s.dbgN, kind, x: p.x + Math.cos(p.yaw) * 70, z: p.z + Math.sin(p.yaw) * 70, yaw: p.yaw + Math.PI, name: 'Test ' + kind, captain: 'Debug', gen: false, speed: 0, hp: KINDS[kind].hp, maxHp: KINDS[kind].hp, cd: [3, 3] }); };
  const ACTIONS = [
    ['+1000 gold', (s) => { s.gold += 1000; }],
    ['Full food & health', (s) => { s.food = MAX_FOOD; s.hp = s.maxHp; s.hull = s.maxHull; }],
    ['God mode', () => { god = !god; }],
    ['Galleon', (s) => { needShip(s); s.shipClass = 'galleon'; s.maxHull = s.hull = SHIPS.galleon.hull; s.hold = SHIPS.galleon.hold; }],
    ['Ram + all parts', (s) => { s.upgrades.ram = true; for (const k in PARTS) s.parts[k] = PARTS[k].max; s.ammo = { chain: 50, fire: 50 }; }],
    ['Break the Wall', (s) => { s.upgrades.ram = true; s.flags.crossed = true; s.flags.beyond = true; }],
    ['Go: weak spot', (s) => { const g = gatePos(s.baseSeed || s.seed); sail(s, g.x * (1 - 60 / WALL_R), g.z * (1 - 60 / WALL_R), g.angle); }],
    ['Go: Outer Sea edge', (s) => { s.flags.crossed = true; const th = REALMS.find((r) => r.id === 'asgard').grand.ang; sail(s, Math.cos(th) * (OUTER_EDGE - 120), Math.sin(th) * (OUTER_EDGE - 120), th); }],
    ['World: Asgard', (s) => { s.flags.crossed = true; needShip(s); s.mode = 'ship'; warp('asgard'); }],
    ['Go: fjord mouth', (s) => { if (s.realm !== 'asgard') { say(s, 'Go to Asgard first'); return; } const p = s.mode === 'ship' && s.ship ? s.ship : s.foot, cx = sectorOf(p.x), cz = sectorOf(p.z); let best = null;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const isl of sectorIslands(s.seed, cx + i, cz + j)) if (isl.fjords?.[0]?.port && (!best || Math.hypot(isl.x - p.x, isl.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z))) best = isl;
      if (!best) { say(s, 'No fjord port near'); return; } const a = best.port.angle, d = best.r * 1.7; sail(s, best.x + Math.cos(a) * d, best.z + Math.sin(a) * d, a + Math.PI); }],
    ['Go: rune gate (+runes)', (s) => { if (s.realm !== 'asgard') { say(s, 'Go to Asgard first'); return; } const a = runeGateAngle(); s.runes ||= []; while (s.runes.length < RUNES_NEEDED) s.runes.push('dbg' + s.runes.length); sail(s, Math.cos(a) * (WALL_R - 260), Math.sin(a) * (WALL_R - 260), a); }],
    ['World: Terra', (s) => { needShip(s); s.mode = 'ship'; warp('terra'); }],
    ['Go: serpent lair', (s) => { const l = lairs(s.baseSeed || s.seed)[0]; s.slain = []; s.serpent = null; sail(s, l.x - 230, l.z, 0); }],
    ['Go: draugr barrow', (s) => { if (s.realm !== 'asgard') { say(s, 'Go to Asgard first'); return; } const b = barrows(s.seed)[0]; s.slain = (s.slain || []).filter((q) => !q.startsWith('barrow')); s.draugr = null; sail(s, b.x - 260, b.z, 0); }],
    ...[['armoury', 'smith'], ['mead hall', 'tavern']].map(([name, kind]) => ['Go: ' + name + ' (on foot)', (s) => { const p = s.mode === 'ship' && s.ship ? s.ship : s.foot; let best = null, bd = 1e9; // in front of the nearest such door, facing in
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const isl of sectorIslands(s.seed, sectorOf(p.x) + i, sectorOf(p.z) + j)) { const b = islandTown(isl).buildings.find((q) => q.kind === kind); if (b) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; best = [isl, b]; } } }
      if (!best) { say(s, 'No ' + name + ' nearby'); return; } const [isl, b] = best; needShip(s); Object.assign(s.ship, { x: isl.port.berth.x, z: isl.port.berth.z, yaw: -Math.PI / 2, speed: 0 });
      const x = b.x, z = b.z + b.d / 2 + 2; s.enemies.clear(); teleport(); s.mode = 'foot'; s.foot = { x, z, y: groundAt(s, x, z), yaw: -Math.PI / 2, vy: 0 }; }]),
    ['Spawn raider', (s) => spawn(s, 'raider')],
    ['Spawn navy', (s) => spawn(s, 'navy')],
    ['Clear enemies', (s) => { s.enemies.clear(); s.guards = []; s.foes = []; }],
    ['Clear bounty', (s) => { s.bounty = 0; s.bountyGold = 0; s.alert = {}; }],
    ['Skip 10 minutes', (s) => { s.t += 600; }],
    ['Weather: next', (s) => { const list = [null, ...KINDS_W]; weatherForce.kind = list[(list.indexOf(weatherForce.kind) + 1) % list.length]; say(s, 'Weather ' + (weatherForce.kind || 'automatic')); }],
  ];
  const text = () => { const s = get(); if (!s || !el) return; const p = s.mode === 'ship' && s.ship ? s.ship : s.foot; el.querySelector('#dbgInfo').textContent = `${s.realm || 'terra'}  x ${p.x.toFixed(0)}  z ${p.z.toFixed(0)}  (${Math.hypot(p.x, p.z).toFixed(0)} from centre)\nships ${s.enemies.size}  fx ${s.fx.length}  quest ${s.quest}  gold ${Math.round(s.gold)}${god ? '  GOD' : ''}\n${info()}`; };
  function toggle() {
    if (el) { el.remove(); el = null; clearInterval(timer); return false; }
    el = document.createElement('div'); el.id = 'dbg';
    el.style.cssText = 'position:fixed;right:8px;top:60px;z-index:20;background:rgba(10,14,22,.94);border:1px solid #c9a13a;border-radius:6px;padding:8px;width:250px;font:12px monospace;color:#e8e2d0';
    el.innerHTML = '<b style="color:#f3d98a">DEBUG</b> <small>(` closes)</small><pre id=dbgInfo style="white-space:pre-wrap;margin:6px 0"></pre>' + ACTIONS.map(([n], i) => `<button data-d=${i} style="margin:2px;padding:3px 6px;font:11px monospace;cursor:pointer">${n}</button>`).join('');
    el.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { const s = get(); if (!s) return; ACTIONS[+b.dataset.d][1](s); say(s, 'Debug: ' + ACTIONS[+b.dataset.d][0]); b.blur(); text(); }));
    document.body.appendChild(el); timer = setInterval(text, 400); text(); return true;
  }
  // keeps you alive while god mode is on
  const tick = () => { const s = get(); if (god && s) { s.hull = s.maxHull; s.hp = s.maxHp; if (s.sunkT !== undefined) delete s.sunkT; } };
  return { toggle, tick, get open() { return !!el; } };
}
