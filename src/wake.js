// Ship wakes. Each ship remembers where its stern has been for a few seconds; from that trail we build, every frame and flat on the real water surface,
// soft round patches of foam (never pointed wedges): churn astern that spreads and thins out, two dotted arms of the V and a little at the bow, plus the hull's shadow. Nothing rings the ship.
// One small dynamic GPU buffer per ship, nothing is allocated per frame.
import { wave } from './rules/sea.js';

export const TTL = 6.5, STEP = 2, MAX_QUADS = 340, JUMP = 40;
const WHITE = [0.97, 0.99, 1], FOAM = [0.8, 0.91, 0.98], PALE = [0.62, 0.8, 0.9], SHADE = [0.05, 0.14, 0.22];
const noise = (n) => { const s = Math.sin(n * 91.7) * 43758.5; return s - Math.floor(s); };
// an eight-sided patch (reads as round at the game's pixel size)
const RING = Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2), Math.sin((i / 8) * Math.PI * 2)]);
const PATCH_VERTS = 18;

export const newTrail = () => ({ pts: [], n: 0, arr: new Float32Array(MAX_QUADS * 6 * 9) });

// remember the stern's path (call every frame); a teleport clears it
export function feed(w, x, z, yaw, L, speed, t) {
  const sx = x - Math.cos(yaw) * L * 0.95, sz = z - Math.sin(yaw) * L * 0.95, last = w.pts[w.pts.length - 1];
  if (last && (Math.hypot(sx - last.x, sz - last.z) > JUMP || t < last.t)) w.pts.length = 0;
  const prev = w.pts[w.pts.length - 1];
  if (speed > 1.2 && (!prev || Math.hypot(sx - prev.x, sz - prev.z) >= STEP)) w.pts.push({ x: sx, z: sz, yaw, t, v: speed, id: w.n++ });
  while (w.pts.length && (t - w.pts[0].t > TTL || w.pts.length > 60)) w.pts.shift();
}

// fill w.arr with the foam for this instant; returns the number of vertices
export function buildWake(w, x, z, yaw, L, B, speed, t) {
  const a = w.arr; let k = 0;
  const vert = (px, pz, y, c) => { a[k] = px; a[k + 1] = y; a[k + 2] = pz; a[k + 3] = 0; a[k + 4] = 1; a[k + 5] = 0; a[k + 6] = c[0]; a[k + 7] = c[1]; a[k + 8] = c[2]; k += 9; };
  // a round patch of radius r, a touch longer along (fx, fz); the swell is sampled once, at its middle
  const patch = (cx, cz, r, c, lift = 0.16, fx = 1, fz = 0, stretch = 1) => {
    if (r < 0.07 || k + PATCH_VERTS * 9 > a.length) return;
    const y = wave(cx, cz, t) + lift, at = (i) => { const [u, v] = RING[i]; return [cx + (fx * u * stretch - fz * v) * r, cz + (fz * u * stretch + fx * v) * r]; }, p0 = at(0);
    const lay = (p) => (r > 1.2 ? wave(p[0], p[1], t) + lift : y); // a big patch (the shadow) bends with the swell corner by corner
    for (let i = 1; i < 7; i++) { const p = at(i), q = at(i + 1); vert(p0[0], p0[1], lay(p0), c); vert(p[0], p[1], lay(p), c); vert(q[0], q[1], lay(q), c); }
  };
  const strength = Math.max(0.35, Math.min(1.2, speed / 18)), pts = w.pts;
  for (let i = pts.length - 1; i >= 0; i--) {
    const q = pts[i], age = (t - q.t) / TTL; if (age > 1) break;
    const s = Math.max(0.4, Math.min(1.2, q.v / 18)), fx = Math.cos(q.yaw), fz = Math.sin(q.yaw), nx = -fz, nz = fx, spread = B * (0.2 + 0.9 * age), tint = age < 0.12 ? WHITE : age < 0.45 ? FOAM : PALE;
    // churn: one or two soft patches either side of the keel line, with gaps that open as it ages
    for (const side of [-1, 1]) {
      if (noise(q.id * 3 + side) < 0.2 + age * 0.65) continue;
      const o = side * spread * (0.15 + 0.7 * noise(q.id * 5 + side)), along = (noise(q.id * 11 + side) - 0.5) * STEP;
      patch(q.x + nx * o + fx * along, q.z + nz * o + fz * along, (0.34 + 0.3 * noise(q.id + side)) * s * (1.1 - age * 0.7), tint, 0.16, fx, fz, 1.5);
    }
    // the V: a dotted line each side, drifting outward and shrinking
    if (age < 0.75 && q.id % 2 === 0) for (const side of [-1, 1]) { const o = side * (B * 0.85 + age * TTL * q.v * 0.12); patch(q.x + nx * o, q.z + nz * o, 0.3 * s * (1 - age), age < 0.25 ? FOAM : PALE, 0.16, fx, fz, 1.6); }
  }
  const c = Math.cos(yaw), sn = Math.sin(yaw), at = (f, o) => [x + c * f * L - sn * o * B, z + sn * f * L + c * o * B];
  // her shadow on the sea: a dark patch a little wider than the hull, lying on the swell, so she reads as sitting in the water
  for (let i = 0; i < 7; i++) { const u = -0.9 + i * 0.3, [px, pz] = at(u, 0); patch(px, pz, B * (0.55 + 0.9 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.4)), 0.55)), SHADE, 0.07 + i * 0.002, c, sn, 1.15); }
  if (speed > 1.2) {
    for (let i = 0; i < 8; i++) { // bow foam bubbling out either side of the stem
      const side = i % 2 ? 1 : -1, ph = (t * 3 + i * 0.37) % 1, [px, pz] = at(1.02 - ph * 0.3, side * (0.1 + ph * (0.6 + noise(i) * 0.5)));
      patch(px, pz, (0.1 + 0.28 * (1 - ph)) * strength, WHITE, 0.2 + Math.sin(ph * Math.PI) * 0.6 * strength);
    }
  }
  return k / 9;
}
