// Debug mode for testing: add ?debug to the page address, then press the ` key (under Esc) to open or close the panel. It changes your real save, so use it for testing.
import { WALL_R, gatePos } from './gen/world.js';
import { OUTER_EDGE, gateOf, gateAngleOf } from './rules/realm.js';
import { REALMS } from './rules/map.js';
import { KINDS, sectorOf, sectorIslands, islandTown } from './gen/world.js';
import { groundAt, startRaid, startThief } from './rules/game.js';
import { SHIPS } from './rules/ships.js';
import { MAX_FOOD } from './rules/trade.js';
import { PARTS } from './rules/parts.js';
import { weatherForce, KINDS_W } from './rules/weather.js';
import { lairs } from './rules/serpent.js';
import { krakenLairs } from './rules/kraken.js';
import { cyclopsLairs } from './rules/cyclops.js';
import { hydraLairs } from './rules/hydra.js';
import { barrows } from './rules/draugr.js';
import { wrecks } from './rules/salvage.js';
import { hourAt, clockText } from './rules/daynight.js';

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
    ['World: Atlantis', (s) => { s.flags.crossed = true; needShip(s); s.mode = 'ship'; warp('atlantis'); }],
    ['World: Olympus', (s) => { s.flags.crossed = true; needShip(s); s.mode = 'ship'; warp('olympus'); }],
    ['Go: nearest town plaza', (s) => { const p = s.mode === 'ship' && s.ship ? s.ship : s.foot, cx = sectorOf(p.x), cz = sectorOf(p.z); let best = null;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const isl of sectorIslands(s.seed, cx + i, cz + j)) if (isl.port && (!best || Math.hypot(isl.x - p.x, isl.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z))) best = isl;
      if (!best) { say(s, 'No town near'); return; } const pz = islandTown(best).plaza; needShip(s); Object.assign(s.ship, { x: best.port.x, z: best.port.z, speed: 0 }); s.mode = 'foot'; s.foot = { x: pz.x + 3, z: pz.z + 3, y: groundAt(s, pz.x + 3, pz.z + 3), yaw: 0, vy: 0 }; teleport(); }],
    ['Go: fjord mouth', (s) => { if (s.realm !== 'asgard') { say(s, 'Go to Asgard first'); return; } const p = s.mode === 'ship' && s.ship ? s.ship : s.foot, cx = sectorOf(p.x), cz = sectorOf(p.z); let best = null;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const isl of sectorIslands(s.seed, cx + i, cz + j)) if (isl.fjords?.[0]?.port && (!best || Math.hypot(isl.x - p.x, isl.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z))) best = isl;
      if (!best) { say(s, 'No fjord port near'); return; } const a = best.port.angle, d = best.r * 1.7; sail(s, best.x + Math.cos(a) * d, best.z + Math.sin(a) * d, a + Math.PI); }],
    ['Go: world gate (+reads)', (s) => { const g = gateOf(s.realm); if (!g) { say(s, 'Go to Asgard or Atlantis first'); return; } const a = gateAngleOf(s.realm), k = (s[g.key] ||= []); while (k.length < g.need) k.push('dbg' + k.length); sail(s, Math.cos(a) * (WALL_R - 260), Math.sin(a) * (WALL_R - 260), a); }],
    ['World: Terra', (s) => { needShip(s); s.mode = 'ship'; warp('terra'); }],
    ['Go: serpent lair', (s) => { const l = lairs(s.baseSeed || s.seed)[0]; s.slain = []; s.serpent = null; sail(s, l.x - 230, l.z, 0); }],
    ['Go: hydra lair', (s) => { if (s.realm !== 'olympus') { say(s, 'Go to Olympus first'); return; } const l = hydraLairs(s.seed)[0]; s.slain = (s.slain || []).filter((q) => q !== l.id); s.hydra = null; s.ammo.fire = Math.max(s.ammo.fire, 12); sail(s, l.x - 230, l.z, 0); }],
    ['Go: cyclops lair', (s) => { if (s.realm !== 'olympus') { say(s, 'Go to Olympus first'); return; } const l = cyclopsLairs(s.seed)[0]; s.slain = (s.slain || []).filter((q) => !q.startsWith('cyclops')); s.cyclops = null; const a = Math.atan2(l.z - l.cz, l.x - l.cx); sail(s, l.x + Math.cos(a) * 150, l.z + Math.sin(a) * 150, a + Math.PI / 2); }],
    ['Go: kraken lair', (s) => { if (s.realm !== 'atlantis') { say(s, 'Go to Atlantis first'); return; } const l = krakenLairs(s.seed)[0]; s.slain = (s.slain || []).filter((q) => !q.startsWith('kraken')); s.kraken = null; sail(s, l.x - 200, l.z, 0); }],
    ['Go: wreck', (s) => { const w = wrecks(s.seed, s.realm && s.realm !== 'terra' ? s.realm : '')[0]; s.salvage = {}; s.dive = null; sail(s, w.x - 14, w.z, 0); s.ship.sail = 0; }],
    ['Go: draugr barrow', (s) => { if (s.realm !== 'asgard') { say(s, 'Go to Asgard first'); return; } const b = barrows(s.seed)[0]; s.slain = (s.slain || []).filter((q) => !q.startsWith('barrow')); s.draugr = null; sail(s, b.x - 260, b.z, 0); }],
    ...[['armoury', 'smith'], ['mead hall', 'tavern']].map(([name, kind]) => ['Go: ' + name + ' (on foot)', (s) => { const p = s.mode === 'ship' && s.ship ? s.ship : s.foot; let best = null, bd = 1e9; // in front of the nearest such door, facing in
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const isl of sectorIslands(s.seed, sectorOf(p.x) + i, sectorOf(p.z) + j)) { const b = islandTown(isl).buildings.find((q) => q.kind === kind); if (b) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; best = [isl, b]; } } }
      if (!best) { say(s, 'No ' + name + ' nearby'); return; } const [isl, b] = best; needShip(s); Object.assign(s.ship, { x: isl.port.berth.x, z: isl.port.berth.z, yaw: -Math.PI / 2, speed: 0 });
      const x = b.x, z = b.z + b.d / 2 + 2; s.enemies.clear(); teleport(); s.mode = 'foot'; s.foot = { x, z, y: groundAt(s, x, z), yaw: -Math.PI / 2, vy: 0 }; }]),
    ...[['mining town', 'mining', 'mine'], ["smugglers' cove", 'smuggler', 'cave'], ['temple town', 'temple', 'temple']].map(([name, style, mk]) => ['Go: ' + name + ' (on foot)', (s) => { const p = s.mode === 'ship' && s.ship ? s.ship : s.foot; let best = null; // in front of the nearest mine or cave mouth, facing it (none: the land end of the dock, facing the plaza)
      for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) for (const isl of sectorIslands(s.seed, sectorOf(p.x) + i, sectorOf(p.z) + j)) if (isl.style === style && (!best || Math.hypot(isl.x - p.x, isl.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z))) best = isl;
      if (!best) { say(s, 'No ' + name + ' nearby'); return; } const d = best.port.dock, m = islandTown(best).marks.find((q) => q.k === mk), pl = islandTown(best).plaza, x = m ? m.x : d.x1, z = m ? m.z + m.d / 2 + 7 : d.z1; needShip(s); Object.assign(s.ship, { x: best.port.berth.x, z: best.port.berth.z, yaw: best.port.berth.yaw, speed: 0 });
      const yaw = m ? -Math.PI / 2 : Math.atan2(pl.z - z, pl.x - x); s.ship.yaw = yaw; s.enemies.clear(); teleport(); s.ship.yaw = best.port.berth.yaw; s.mode = 'foot'; s.foot = { x, z, y: groundAt(s, x, z), yaw, vy: 0 }; }]), // teleport turns the view to the ship's heading
    ['Raid this port (on foot)', (s) => { const f = s.foot, isl = s.mode === 'foot' && sectorIslands(s.seed, sectorOf(f.x), sectorOf(f.z)).concat(...[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([i, j]) => sectorIslands(s.seed, sectorOf(f.x) + i, sectorOf(f.z) + j))).find((q) => q.port && Math.hypot(q.x - f.x, q.z - f.z) < q.r * 1.3); if (!isl || !startRaid(s, isl)) say(s, 'Walk in a port first (no raid already on)'); }],
    ['Cutpurse here (on foot)', (s) => { const f = s.foot, isl = s.mode === 'foot' && sectorIslands(s.seed, sectorOf(f.x), sectorOf(f.z)).concat(...[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([i, j]) => sectorIslands(s.seed, sectorOf(f.x) + i, sectorOf(f.z) + j))).find((q) => q.port && Math.hypot(q.x - f.x, q.z - f.z) < q.r * 1.3); if (!isl || !startThief(s, isl)) say(s, 'Walk in a port first (a purse to steal)'); }],
    ['Spawn raider', (s) => spawn(s, 'raider')],
    ['Spawn navy', (s) => spawn(s, 'navy')],
    ['Clear enemies', (s) => { s.enemies.clear(); s.guards = []; s.foes = []; }],
    ['Clear bounty', (s) => { s.bounty = 0; s.bountyGold = 0; s.alert = {}; }],
    ['Skip 10 minutes', (s) => { s.t += 600; }],
    ['Time: +3 hours', (s) => { s.dayOff = ((s.dayOff || 0) + 3) % 24; say(s, 'Time ' + clockText(hourAt(s.t, s.dayOff))); }],
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
