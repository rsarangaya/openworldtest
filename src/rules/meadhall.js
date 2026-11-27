// Asgard's mead halls: the tavern of an Asgard town is a long hall with a hearth and feast tables. Two extras on the keeper's menu:
// the feast (pay, eat: full health and a merrier crew, once a feast) and the skald's songs (saga verses; some hint at what lies ahead).
import { hash } from '../gen/rng.js';

export const FEAST_PRICE = 15, FEAST_EVERY = 300; // a new feast is laid every 300 s of game time (same rhythm as the notice boards)
export const isHall = (isl) => isl?.theme === 'asgard';
export const feastReady = (s) => s.t - (s.feastT ?? -1e9) >= FEAST_EVERY;
// returns the line to show; changes the state only when the feast is joined
export function feast(s) {
  if (!feastReady(s)) return 'The tables are bare. The next feast is laid in ' + Math.ceil((FEAST_EVERY - (s.t - s.feastT)) / 60) + ' min.';
  if (s.gold < FEAST_PRICE) return `A seat at the feast costs ${FEAST_PRICE} gold. You do not have it.`;
  s.gold -= FEAST_PRICE; s.feastT = s.t; s.hp = s.maxHp; s.feasts = (s.feasts || 0) + 1; s.score = (s.score || 0) + 5;
  const crew = s.crew || []; for (const c of crew) c.morale = Math.min(100, c.morale + 15);
  return `You eat roast pork and drink mead until the benches shake. Your wounds are forgotten${crew.length ? ' and your crew sing your name' : ''}.`;
}
const SONGS = [
  'Nine nights the drowned row, and never reach the shore; give them fire, and they rest.',
  'The Serpent sleeps beneath the sea, his tail in his mouth. Woe to the ship that wakes him.',
  'In the hall of shields the feast never ends, and the mead never runs dry, and the brave never age.',
  'The southern men built a wall of ice. We laughed, and then we stopped laughing.',
  'Thorfinn split the sea-wolf\'s jaw with one blow, then sold its teeth for a cask of mead.',
  'Three sisters spin at the root of the world. Even the gods wait on their thread.',
  'The wolf will break his chain one day. Until then, sing, and pour, and sing again.',
  'A shield-maiden sailed into the green fire in the sky, and came back with her hair turned white.',
  'Far past the cold sea, they say, a city sank whole beneath the waves, and its bells still ring.',
  'An oath sworn on a ring of iron cannot be broken. An oath sworn over mead is broken by morning.',
];
export const SONG_COUNT = SONGS.length;
export const songFor = (seed, n) => SONGS[(((hash(seed, 31) >>> 0) % SONGS.length) + n) % SONGS.length]; // each ask moves to the next verse
