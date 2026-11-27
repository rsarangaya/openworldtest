// Weather: spells of a few minutes, a pure function of (world seed, realm, time, where you are), so nothing is saved and it costs almost nothing.
// clear, cloudy, rain, storm, fog, snow. Cold places (Asgard, the waters near the Wall) get snow instead of rain; Olympus is sunny (long clear spells,
// few storms or fogs, never snow). Spells blend into each other.
import { hash } from '../gen/rng.js';

export const SPELL = 200, BLEND = 30, GRACE = 2; // the first GRACE spells of a game are always clear
export const KINDS_W = ['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow'];
export const LABEL = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm', fog: 'Fog', snow: 'Snow' };
const ODDS = {
  mild: [['clear', 50], ['cloudy', 21], ['rain', 14], ['storm', 8], ['fog', 7]],
  cold: [['clear', 32], ['cloudy', 25], ['snow', 23], ['storm', 12], ['fog', 8]],
  sunny: [['clear', 72], ['cloudy', 17], ['rain', 7], ['storm', 3], ['fog', 1]],
};
// what each kind looks like: cloud cover, rain, snow, fog, storminess (all 0..1)
const LOOK = {
  clear: [0, 0, 0, 0, 0], cloudy: [0.55, 0, 0, 0, 0], rain: [0.8, 0.7, 0, 0.18, 0], storm: [1, 1, 0, 0.22, 1], fog: [0.45, 0, 0, 1, 0], snow: [0.75, 0, 0.85, 0.3, 0],
};
export const weatherForce = { kind: null }; // debug mode and tests can pin the weather
const spellKind = (seed, k, clime) => {
  if (weatherForce.kind) return weatherForce.kind;
  if (k < GRACE) return 'clear';
  const odds = ODDS[clime] || ODDS.mild; let r = (hash(seed >>> 0, k, 8123) >>> 0) % 100;
  for (const [kind, w] of odds) if ((r -= w) < 0) return kind;
  return 'clear';
};
// the weather now: { kind, cloud, rain, snow, fog, storm } (a storm in cold waters is a snow storm); clime is 'mild', 'cold' or 'sunny'
export function weatherAt(seed, t, clime = 'mild') {
  const k = Math.floor(t / SPELL), u = weatherForce.kind ? 1 : Math.min(1, (t - k * SPELL) / BLEND), e = u * u * (3 - 2 * u);
  const kind = spellKind(seed, k, clime), a = LOOK[kind], b = LOOK[spellKind(seed, k - 1, clime)], v = a.map((x, i) => b[i] + (x - b[i]) * e);
  let [cloud, rain, snow, fog, storm] = v; if (clime === 'cold') { snow = Math.max(snow, rain * 0.9); rain = 0; }
  return { kind, cloud, rain, snow, fog, storm };
}
export const isCold = (realm, x, z, wallR) => realm === 'asgard' || (realm === 'terra' && Math.abs(Math.hypot(x, z) / wallR - 0.93) < 0.13);
export const climeOf = (realm, x, z, wallR) => (realm === 'olympus' ? 'sunny' : isCold(realm, x, z, wallR) ? 'cold' : 'mild');
export const roughOf = (w) => 1 + 0.8 * w.storm + (0.55 * w.rain + 0.2 * w.snow) * (1 - w.storm); // how much bigger the swell is: rain about 1.4x, a storm 1.8x
export const windMul = (w) => 1 + 0.4 * w.storm + 0.08 * w.rain;
export const gust = (w, t) => 0.38 * w.storm * Math.sin(t * 0.47) * Math.sin(t * 0.13 + 1); // a storm wind swings about
