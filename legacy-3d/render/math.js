// Small column-major 4x4 matrix helpers (WebGPU clip space: z in 0..1). Load-time / per-object only.
export const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
export const perspective = (fovy, aspect, near, far) => {
  const f = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
  o[0] = f / aspect; o[5] = f; o[10] = far / (near - far); o[11] = -1; o[14] = (near * far) / (near - far); return o;
};
export const lookAt = (ex, ey, ez, tx, ty, tz) => {
  let fx = tx - ex, fy = ty - ey, fz = tz - ez; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  let sx = fy * 0 - fz * 1, sy = fz * 0 - fx * 0, sz = fx * 1 - fy * 0; const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl; // s = f x up(0,1,0)
  const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
  const o = new Float32Array(16);
  o[0] = sx; o[4] = sy; o[8] = sz; o[1] = ux; o[5] = uy; o[9] = uz; o[2] = -fx; o[6] = -fy; o[10] = -fz;
  o[12] = -(sx * ex + sy * ey + sz * ez); o[13] = -(ux * ex + uy * ey + uz * ez); o[14] = fx * ex + fy * ey + fz * ez; o[15] = 1; return o;
};
// model matrix: scale, then roll about local x, pitch about local z (bow up), then heading about y, then translate.
// Heading convention: yaw 0 points along +x, positive yaw turns toward +z.
export const model = (x, y, z, yaw = 0, pitch = 0, roll = 0, sc = 1) => {
  const cy = Math.cos(-yaw), sy = Math.sin(-yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const Ry = [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1], Rz = [cp, sp, 0, 0, -sp, cp, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], Rx = [1, 0, 0, 0, 0, cr, sr, 0, 0, -sr, cr, 0, 0, 0, 0, 1];
  const m = mul(mul(Float32Array.from(Ry), Float32Array.from(Rz)), Float32Array.from(Rx));
  for (let i = 0; i < 12; i++) m[i] *= sc;
  m[12] = x; m[13] = y; m[14] = z; return m;
};
