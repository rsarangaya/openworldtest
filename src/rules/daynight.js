// Day and night: a pure clock from game time. Looks only (no rule reads it yet).
// One day lasts DAY seconds of play; daylight (06:00-18:00) takes 70% of it, so nights are short.
// The clock moves in quarter-hour steps, so light and shadow change in small flat jumps, never a crawl.
export const DAY = 1200, START = 8; // 20 minutes a day; a new game starts at 08:00
const LIT = 0.7, TAU = Math.PI * 2;
// hour of day (0-24, quarter-hour steps) at game time t, plus any offset in hours
export function hourAt(t, off = 0) {
  const p0 = (START - 6) / 12 * LIT, p = (((t / DAY + p0) % 1) + 1) % 1; // p: share of the day since 06:00
  const h = p < LIT ? 6 + (p / LIT) * 12 : 18 + ((p - LIT) / (1 - LIT)) * 12;
  return (Math.floor(((h + off) % 24 + 24) % 24 * 4) / 4) % 24;
}
// light at hour h: sun (or moon) direction, night 0-1, dusk 0-1 (warm low light at dawn and dusk)
export function lightAt(h) {
  const a = ((h - 6) / 24) * TAU, el = Math.sin(a); // sun height: 0 at 06:00 and 18:00, 1 at noon
  const night = Math.min(1, Math.max(0, (0.06 - el) / 0.3)), dusk = Math.max(0, 1 - Math.abs(el - 0.02) / 0.22) * (1 - night * 0.6);
  const up = el > -0.02 ? Math.max(0.18, el) : Math.max(0.3, -el); // below the horizon the moon lights the world, from the other side
  const az = el > -0.02 ? Math.cos(a) : -Math.cos(a), k = Math.sqrt(1 - up * up);
  return { sun: [az * k * 0.85, up, 0.53 * k], night, dusk };
}
export const clockText = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
