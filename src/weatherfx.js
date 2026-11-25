// Weather on screen: rain streaks and snow flakes on a small overlay canvas (drawn at the game's own pixel size, so it matches the look), lightning, and a label.
// Nothing is drawn, and the canvas is hidden, when the sky is dry.
import { LABEL } from './rules/weather.js';

const MAX_DROPS = 220;
export function createWeatherFx(onThunder) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), tag = document.createElement('div'), flash = document.createElement('div');
  c.id = 'wx'; c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;image-rendering:pixelated;z-index:1;display:none';
  flash.style.cssText = 'position:fixed;inset:0;background:#dfe8ff;opacity:0;pointer-events:none;z-index:1';
  tag.style.cssText = 'position:fixed;right:10px;top:58px;z-index:3;padding:2px 8px;border-radius:4px;background:rgba(10,14,22,.78);color:#cfe0f5;font:12px system-ui;pointer-events:none;display:none';
  document.body.append(c, flash, tag);
  const drops = Array.from({ length: MAX_DROPS }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 }));
  let nextBolt = 6, flashT = 0, label = '';
  return {
    // w: the weather (or null when not playing), wind: screen-sideways push (-1..1), indoors: no rain under a roof
    draw(dt, w, wind, indoors, h = 270) {
      const text = w ? LABEL[w.kind] : '';
      if (text !== label) { label = text; tag.textContent = text; tag.style.display = text ? 'block' : 'none'; }
      const rain = w && !indoors ? w.rain : 0, snow = w && !indoors ? w.snow : 0, n = Math.round(MAX_DROPS * Math.max(rain, snow * 0.8));
      if (w && w.storm > 0.6) { nextBolt -= dt; if (nextBolt <= 0) { nextBolt = 5 + Math.random() * 11; flashT = 0.35; onThunder(0.3 + Math.random() * 1.6, 0.5 + Math.random() * 0.5); } }
      if (flashT > 0) { flashT -= dt; flash.style.opacity = flashT > 0 ? (flashT > 0.22 || (flashT < 0.12 && flashT > 0.06) ? 0.55 : 0.08) : 0; }
      if (!n) { if (c.style.display !== 'none') c.style.display = 'none'; return; }
      const W = Math.round((h * innerWidth) / innerHeight); if (c.width !== W || c.height !== h) { c.width = W; c.height = h; }
      c.style.display = 'block'; g.clearRect(0, 0, W, h);
      const isSnow = snow > rain, slant = wind * (isSnow ? 0.25 : 0.35) + (w.storm > 0.5 ? 0.18 : 0);
      g.fillStyle = isSnow ? 'rgba(244,248,255,0.9)' : 'rgba(185,208,235,0.62)';
      for (let i = 0; i < n; i++) {
        const d = drops[i];
        d.y += dt * d.s * (isSnow ? 0.12 + 0.2 * w.storm : 1.35); d.x += dt * d.s * (slant * (isSnow ? 0.5 : 0.8) + (isSnow ? Math.sin(d.y * 14 + i) * 0.015 : 0));
        if (d.y > 1) { d.y -= 1; d.x = Math.random(); }
        if (d.x > 1) d.x -= 1; else if (d.x < 0) d.x += 1;
        const x = (d.x * W) | 0, y = (d.y * h) | 0;
        if (isSnow) { const s = d.s > 1.05 ? 2 : 1; g.fillRect(x, y, s, s); } else { const len = (5 + d.s * 5) | 0; for (let k = 0; k < len; k += 2) g.fillRect((x - k * slant * 0.6) | 0, y - k, 1, 2); }
      }
    },
  };
}
