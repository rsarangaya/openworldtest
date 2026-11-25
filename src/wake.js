// Ship wakes. Each ship remembers where its stern has been for a few seconds; from that trail we build, every frame and flat on the real water surface:
// the churned foam astern (wide and white at the stern, breaking up and spreading as it ages, and curving with the turns), the two arms of the V spreading
// out to the sides, the foam running along the hull, and the spray at the bow. One small dynamic GPU buffer per ship, nothing is allocated per frame.
import { wave } from './rules/sea.js';

export const TTL = 6.5, STEP = 1.4, MAX_QUADS = 300, JUMP = 40;
const WHITE = [0.97, 0.99, 1], FOAM = [0.8, 0.91, 0.98], PALE = [0.62, 0.8, 0.9];
const noise = (n) => { const s = Math.sin(n * 91.7) * 43758.5; return s - Math.floor(s); };

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
  const vert = (px, pz, c, lift) => { a[k] = px; a[k + 1] = wave(px, pz, t) + lift; a[k + 2] = pz; a[k + 3] = 0; a[k + 4] = 1; a[k + 5] = 0; a[k + 6] = c[0]; a[k + 7] = c[1]; a[k + 8] = c[2]; k += 9; };
  // a flat quad from (ax,az) half-width wa to (bx,bz) half-width wb
  const strip = (ax, az, wa, bx, bz, wb, c, lift = 0.12) => {
    if (k + 54 > a.length) return; let dx = bx - ax, dz = bz - az; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; const px = dz, pz = -dx;
    const p0x = ax - px * wa, p0z = az - pz * wa, p1x = bx - px * wb, p1z = bz - pz * wb, p2x = bx + px * wb, p2z = bz + pz * wb, p3x = ax + px * wa, p3z = az + pz * wa;
    vert(p0x, p0z, c, lift); vert(p1x, p1z, c, lift); vert(p2x, p2z, c, lift); vert(p0x, p0z, c, lift); vert(p2x, p2z, c, lift); vert(p3x, p3z, c, lift);
  };
  const pts = w.pts, strength = Math.max(0.35, Math.min(1.2, speed / 9));
  // astern: churn and the V arms along the remembered path, newest at the ship
  const head = { x: x - Math.cos(yaw) * L * 0.95, z: z - Math.sin(yaw) * L * 0.95, yaw, t, v: speed, id: w.n };
  for (let i = pts.length - 1, next = head; i >= 0; next = pts[i], i--) {
    const q = pts[i], age = (t - q.t) / TTL, ageN = (t - next.t) / TTL; if (age > 1) break;
    const s = Math.max(0.4, Math.min(1.2, q.v / 9)), col = age < 0.22 ? WHITE : age < 0.55 ? FOAM : PALE;
    // churned water: two broken strands of foam and scattered flecks that spread and thin out as they age (never one solid band)
    const wid = (u) => B * (0.3 + 0.95 * u) * s, nx = -Math.sin(q.yaw), nz = Math.cos(q.yaw), fx = Math.cos(q.yaw), fz = Math.sin(q.yaw), tint = age < 0.05 ? WHITE : age < 0.4 ? FOAM : PALE;
    for (const side of [-1, 1]) {
      if (noise(q.id * 3 + side) < (age > 0.28 ? age * 0.75 : 0.2)) continue; // ragged even near the stern // gaps open up
      const wob = (n) => (noise(n * 5 + side) - 0.5) * 0.7, o0 = side * wid(age) * 0.55 + wob(q.id), o1 = side * wid(Math.max(0, ageN)) * 0.55 + wob(next.id);
      strip(q.x + nx * o0, q.z + nz * o0, 0.46 * s * (1 - age * 0.7), next.x + nx * o1, next.z + nz * o1, 0.56 * s * (1 - age * 0.72), tint);
    }
    if (age < 0.2 && noise(q.id + 5) > 0.15) strip(q.x, q.z, B * 0.34 * s, next.x, next.z, B * 0.4 * s, WHITE, 0.14); // the churn right under the stern
    if (age < 0.75 && noise(q.id + 7) > 0.25) { const o = (noise(q.id + 3) - 0.5) * wid(age) * 1.5, len = 0.35 + noise(q.id + 11) * 0.7; strip(q.x + nx * o, q.z + nz * o, 0.45 * (1 - age), q.x + nx * o + fx * len, q.z + nz * o + fz * len, 0.1, age < 0.2 ? WHITE : FOAM, 0.2); } // flecks
    // the V: two arms moving outward from the path
    for (const side of [-1, 1]) {
      const off = (p, u) => { const o = B * 0.7 + u * TTL * p.v * 0.22; return [p.x - Math.sin(p.yaw) * side * o, p.z + Math.cos(p.yaw) * side * o]; };
      if (age > 0.9 || (age > 0.45 && (q.id + (side > 0 ? 1 : 0)) % 3 === 0)) continue;
      const [x0, z0] = off(q, age), [x1, z1] = off(next, ageN), hw = (u) => Math.max(0.14, 0.6 * s * (1 - u * 0.85));
      strip(x0, z0, hw(age), x1, z1, hw(ageN), age < 0.3 ? WHITE : FOAM);
    }
  }
  if (speed > 1.2) {
    const c = Math.cos(yaw), sn = Math.sin(yaw), at = (f, s) => [x + c * f * L - sn * s * B, z + sn * f * L + c * s * B];
    // foam along both sides of the hull, thicker toward the bow
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
      const u0 = 1 - i * 0.33, u1 = u0 - 0.3, flare = (u) => 0.18 + 0.95 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.4)), 0.55);
      const [x0, z0] = at(u0, side * flare(u0)), [x1, z1] = at(u1, side * flare(u1)), wob = 0.06 * Math.sin(t * 9 + i * 2 + side);
      strip(x0, z0, (0.42 - i * 0.035) * strength + wob, x1, z1, (0.36 - i * 0.035) * strength + wob, i < 3 ? WHITE : FOAM, 0.18);
    }
    // bow spray: short bright bursts either side of the stem, flickering
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1, ph = (t * 3 + i * 0.37) % 1, [x0, z0] = at(1.02 - ph * 0.35, side * (0.12 + ph * (0.5 + noise(i) * 0.5))), [x1, z1] = at(1.02 - ph * 0.35 - 0.1, side * (0.2 + ph * (0.55 + noise(i) * 0.5)));
      strip(x0, z0, 0.3 * strength * (1 - ph) + 0.05, x1, z1, 0.14 * strength, WHITE, 0.18 + Math.sin(ph * Math.PI) * 0.7 * strength);
    }
  }
  return k / 9;
}
