// Procedural audio (no sample files): sea, wind, cannons, coins. Built on the first click or key press.
export function createAudio() {
  let ac, out, sea, wind, windF, vol = 0.7, mus, murmur, echo, scene = { foot: false, town: 0 }, nextBar = 0, nextVoice = 0, nextGull = 0, bar = 0;
  const noiseBuf = () => { const n = ac.sampleRate * 3, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); for (let i = 0, l = 0; i < n; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } return b; };
  function init() {
    if (ac) { ac.resume?.(); return; }
    try { ac = new AudioContext(); } catch { return; }
    out = ac.createGain(); out.gain.value = vol * 0.95; const lim = ac.createDynamicsCompressor(); lim.threshold.value = -16; lim.ratio.value = 6; out.connect(lim); lim.connect(ac.destination); // a soft limiter so cannons never clip
    const nb = noiseBuf(), src = (f, type, g) => { const s = ac.createBufferSource(); s.buffer = nb; s.loop = true; const bq = ac.createBiquadFilter(); bq.type = type; bq.frequency.value = f; const gn = ac.createGain(); gn.gain.value = g; s.connect(bq); bq.connect(gn); gn.connect(out); s.start(); return { gn, bq }; };
    const a = src(380, 'lowpass', 0.5), w = src(900, 'bandpass', 0.0);
    sea = a.gn; wind = w.gn; windF = w.bq;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.18; lfo.connect(lg); lg.connect(sea.gain); lfo.start();
    // the town crowd: a low murmur that swells and falls
    murmur = src(480, 'bandpass', 0).gn; const ml = ac.createOscillator(), mg = ac.createGain(); ml.frequency.value = 0.27; mg.gain.value = 0.02; ml.connect(mg); mg.connect(murmur.gain); ml.start();
    // music bus: everything goes through a soft echo, like a quiet room
    mus = ac.createGain(); mus.gain.value = 0; echo = ac.createDelay(1); echo.delayTime.value = 0.47; const fb = ac.createGain(), lp = ac.createBiquadFilter(); fb.gain.value = 0.42; lp.type = 'lowpass'; lp.frequency.value = 1800;
    mus.connect(out); mus.connect(echo); echo.connect(lp); lp.connect(fb); fb.connect(echo); lp.connect(out);
  }
  // relaxing generative music in D major: slow chord pads with a few soft plucked notes over them, never the same twice
  const CH = [[0, 4, 7, 11], [5, 9, 12, 16], [-3, 0, 4, 7], [7, 11, 14, 18]], PENT = [0, 2, 4, 7, 9, 12, 14, 16];
  const hz = (n) => 146.83 * Math.pow(2, n / 12);
  function note(t, f, type, peak, a, d, dest) { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; env(g, t, a, d, peak); o.connect(g); g.connect(dest || mus); o.start(t); o.stop(t + a + d + 0.1); }
  function playBar(t) {
    const c = CH[bar % 4], len = 8;
    for (const n of c) { const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(); o.type = 'sine'; o.frequency.value = hz(n + 12) * (1 + (Math.random() - 0.5) * 0.004); f.type = 'lowpass'; f.frequency.value = 900; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 2.5); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 1.5); o.connect(f); f.connect(g); g.connect(mus); o.start(t); o.stop(t + len + 1.6); }
    note(t, hz(c[0]), 'sine', 0.08, 1.5, len, mus); // slow bass
    const root = c[0] + 12, hits = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < hits; i++) { const pick = Math.random() < 0.6 ? c[(Math.random() * 4) | 0] + 24 : root + PENT[(Math.random() * PENT.length) | 0]; note(t + 0.8 + i * (len / hits) + Math.random() * 0.6, hz(pick), 'triangle', 0.07, 0.015, 1.6); }
    bar++;
  }
  function scheduleMusic() {
    const t = ac.currentTime; if (t + 1 < nextBar) return; // schedule a bar ahead
    playBar(Math.max(nextBar, t + 0.1)); nextBar = Math.max(nextBar, t) + 8;
  }
  // town voices and bells, gulls and the odd creak on the shore
  function chatter(t, town) {
    if (t < nextVoice || town < 0.15) return; nextVoice = t + 0.5 + Math.random() * 1.6 / town;
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(), p = (Math.random() < 0.5 ? 120 : 190) * (0.9 + Math.random() * 0.4); o.type = 'sawtooth'; o.frequency.setValueAtTime(p, t); o.frequency.linearRampToValueAtTime(p * (0.85 + Math.random() * 0.4), t + 0.25); f.type = 'bandpass'; f.frequency.value = 500 + Math.random() * 700; f.Q.value = 4; env(g, t, 0.04, 0.2 + Math.random() * 0.15, 0.04 + 0.05 * town); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 0.5);
    if (Math.random() < 0.12) note(t, 1500 + Math.random() * 600, 'triangle', 0.015 * town, 0.003, 0.5, out); // a distant clink
  }
  function gull(t) {
    if (t < nextGull) return; nextGull = t + 7 + Math.random() * 12;
    for (let i = 0; i < 2 + ((Math.random() * 2) | 0); i++) { const o = ac.createOscillator(), g = ac.createGain(), s = t + i * 0.32; o.type = 'sine'; o.frequency.setValueAtTime(2100, s); o.frequency.exponentialRampToValueAtTime(1300, s + 0.22); env(g, s, 0.03, 0.2, 0.012); o.connect(g); g.connect(out); o.start(s); o.stop(s + 0.35); }
  }
  const env = (g, t, a, d, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  return {
    init, setVolume(v) { vol = v; if (out) out.gain.value = v * 0.95; },
    // wind loudness follows ship speed and the cold near the wall
    update(speed, cold, sc) { if (!ac) return; const t = ac.currentTime; if (sc) scene = sc; const foot = scene.foot, town = scene.town || 0; scheduleMusic(); chatter(t, town); if (foot && town < 0.2) gull(t);
      mus.gain.setTargetAtTime(foot ? 0.7 - 0.12 * town : 0.7, t, 2); murmur.gain.setTargetAtTime(0.6 * town, t, 1.5); sea.gain.setTargetAtTime(foot ? 0.4 - 0.15 * town : 0.5, t, 1);
      wind.gain.setTargetAtTime(foot ? 0.05 + cold * 0.2 : Math.min(0.5, 0.05 + Math.abs(speed) * 0.04 + cold * 0.25), t, 0.3); windF.frequency.setTargetAtTime(700 + cold * 500, t, 0.5); },
    boom(distGain = 1) { if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.4); env(g, t, 0.01, 0.5, 0.9 * distGain); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.6);
      const s = ac.createBufferSource(); s.buffer = noiseBuf(); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g2 = ac.createGain(); env(g2, t, 0.005, 0.35, 1.2 * distGain); s.connect(f); f.connect(g2); g2.connect(out); s.start(t); s.stop(t + 0.5); },
    coin() { if (!ac) return; const t = ac.currentTime; [880, 1320].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = f; env(g, t + i * 0.08, 0.005, 0.25, 0.25); o.connect(g); g.connect(out); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.3); }); },
    quest() { if (!ac) return; const t = ac.currentTime; [523, 659, 784].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; env(g, t + i * 0.12, 0.01, 0.5, 0.2); o.connect(g); g.connect(out); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.6); }); },
    hit() { this.boom(0.5); },
    // a sword swing: a quick falling whoosh, with a dull thud when it lands
    slash(landed) { if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.14); env(g, t, 0.01, 0.14, 0.05); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2); if (landed) this.boom(0.18); },
  };
}
