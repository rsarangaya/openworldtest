// Deterministic randomness + noise. Everything in the world is a pure function of (seed, coordinates),
// so nothing is stored: the same seed always rebuilds the same sea.

export const hash = (a, b = 0, c = 0, d = 0) => {
  let h = (a | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (b | 0), 0x85ebca6b); h ^= h >>> 15;
  h = Math.imul(h ^ (c | 0), 0xc2b2ae35); h ^= h >>> 13;
  h = Math.imul(h ^ (d | 0), 0x27d4eb2f); h ^= h >>> 16;
  return h >>> 0;
};

// mulberry32: a small fast PRNG. Call the returned function for a float in [0,1).
export const mulberry = (s) => {
  let t = s >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};
// an independent random stream for (seed, a, b, c)
export const rngFor = (seed, a = 0, b = 0, c = 0) => mulberry(hash(seed, a, b, c));

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const mix = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
export const pick = (r, arr) => arr[(r() * arr.length) | 0];
export const range = (r, a, b) => a + (b - a) * r();

const h2 = (seed, x, y) => hash(seed, x, y) / 4294967296;
export const vnoise = (seed, x, y) => {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  return mix(mix(h2(seed, ix, iy), h2(seed, ix + 1, iy), fx), mix(h2(seed, ix, iy + 1), h2(seed, ix + 1, iy + 1), fx), fy);
};
export const fbm = (seed, x, y, oct = 4) => {
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(seed + i * 101, x, y); n += a; x = x * 2.03 + 17.1; y = y * 2.03 + 31.7; a *= 0.5; }
  return s / n;
};
