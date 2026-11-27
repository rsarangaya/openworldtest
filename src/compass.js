// The heading strip at the top: compass points, and (when you are ashore) which way your ship lies and how far. Nothing else.
// Same bearings as the map: north is up there, which is -z in the world. The strip is built once and only slid sideways.
const PX = 2, W = 360; // pixels per degree, strip window width (180 degrees)
const NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const BOAT = '<svg width="22" height="20" viewBox="0 0 22 20"><path d="M11 1 L11 12 L3 12 Z M12 4 L19 12 L12 12 Z" fill="#fff3c4" stroke="#07080c" stroke-width="1.4"/><path d="M2 13 L20 13 L17 18 L5 18 Z" fill="#e3b73e" stroke="#07080c" stroke-width="1.4"/></svg>';
const heading = (rad) => (((rad * 180) / Math.PI + 90) % 360 + 360) % 360;

export function createCompass(doc = document) {
  let ticks = '';
  for (let d = -90; d <= 450; d += 15) { const n = ((d % 360) + 360) % 360, main = n % 45 === 0; ticks += `<i style="left:${(d + 90) * PX}px" class="${main ? (n % 90 ? 'mid' : n ? 'main' : 'main north') : ''}">${main ? NAMES[n / 45] : ''}</i>`; }
  const el = doc.createElement('div'); el.id = 'compass';
  el.innerHTML = `<div class=win><div class=strip>${ticks}</div><b class=mark></b></div><div class=ship>${BOAT}<small></small></div><span class=clk></span>`;
  const clk = el.querySelector('.clk'), strip = el.querySelector('.strip'), ship = el.querySelector('.ship'), dist = el.querySelector('small');
  let last = '';
  // yaw: where you look; at: your position; boat: your ship, or null when you are aboard or have none
  const update = (yaw, at, boat, time = '') => { // time: the clock, shown beside the strip
    const h = heading(yaw), d = boat ? Math.hypot(boat.x - at.x, boat.z - at.z) : 0;
    let rel = boat ? heading(Math.atan2(boat.z - at.z, boat.x - at.x)) - h : 0; rel = ((rel + 540) % 360) - 180;
    const key = `${Math.round(h * PX)},${boat ? Math.round(rel) + ',' + Math.round(d) : ''}`;
    if (time !== clk.textContent) clk.textContent = time;
    if (key === last) return; last = key;
    strip.style.transform = `translateX(${Math.round(W / 2 - (h + 90) * PX)}px)`;
    ship.style.display = boat ? 'block' : 'none';
    if (!boat) return;
    const x = W / 2 + Math.max(-86, Math.min(86, rel)) * PX; // behind you: it waits at the edge on the shorter side
    ship.style.left = Math.round(x) + 'px';
    dist.textContent = (rel < -90 ? '◀ ' : '') + (d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m') + (rel > 90 ? ' ▶' : '');
  };
  return { el, update };
}
