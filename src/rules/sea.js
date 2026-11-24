// Sea + wind. No drawing in here. waveHeight() is duplicated in the water shader (render/gpu.js): keep both in sync.
// the swell: three long trains crossing, so the sea heaves in big rounded humps. Mirrored in the water shader (render/gpu.js): keep both in sync.
// Near islands the swell dies away to flat water (calm zones: [x, z, radius]); that keeps docks dry and the beaches out of the surf.
let Z = [];
export const setCalm = (z) => { Z = z; };
export const calm = (x, z) => { let c = 1; for (const q of Z) { const d = Math.hypot(x - q[0], z - q[1]); if (d < q[2] * 2.1) { const u = Math.max(0, Math.min(1, (d - q[2]) / (q[2] * 1.1))); c = Math.min(c, u * u * (3 - 2 * u)); } } return c; };
export const wave = (x, z, t) => calm(x, z) * 3 * (0.6 * Math.sin(x * 0.057 + z * 0.026 + t * 0.55) + 0.35 * Math.sin(x * -0.038 + z * 0.07 + t * 0.78) + 0.18 * Math.sin(x * 0.085 + z * -0.06 + t * 1.05));

// direction the wind blows TOWARD (radians), drifts slowly; speed 0.5..1
export const windAt = (t) => ({ dir: 0.8 + 0.9 * Math.sin(t * 0.004) + 0.4 * Math.sin(t * 0.011), speed: 0.75 + 0.25 * Math.sin(t * 0.007 + 1) });

const wrapPi = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2)); // a proper wrap: JS % keeps the sign, which once made this NaN
// how far off the wind the bow points: 0 = straight into it, PI = running with it. yaw 0 points along +x, positive yaw turns toward +z.
export const windAngle = (yaw, wind) => Math.PI - Math.abs(wrapPi(wind.dir - yaw));
// the polar diagram: boat speed (0..1) by angle off the wind. Dead into the wind you stall, about 45 degrees off you can claw upwind,
// a beam reach (wind from the side) is fastest, and running dead downwind is slower than you would think.
const POLAR = [[0, 0.04], [0.5, 0.04], [0.8, 0.45], [1.05, 0.74], [1.57, 1], [2.1, 1], [2.6, 0.86], [3.1416, 0.66]];
export const polar = (th) => { for (let i = 1; i < POLAR.length; i++) if (th <= POLAR[i][0]) { const [x0, y0] = POLAR[i - 1], [x1, y1] = POLAR[i]; return y0 + ((y1 - y0) * (th - x0)) / (x1 - x0); } return POLAR[POLAR.length - 1][1]; };
export const pointOfSail = (th) => (th < 0.5 ? 'Head to wind' : th < 0.95 ? 'Close-hauled' : th < 1.3 ? 'Close reach' : th < 1.85 ? 'Beam reach' : th < 2.6 ? 'Broad reach' : 'Running');
export const sailEfficiency = (yaw, wind) => polar(windAngle(yaw, wind)) * wind.speed;
