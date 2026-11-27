// Procedural audio (no sample files): sea, wind, cannons, coins. Built on the first click or key press.
// Generative music in three styles: Terra (calm D major pads), Asgard (D minor over a low open-fifth drone, a horn call now and then)
// and the mead hall (a quicker lyre tune over a frame drum). A style is a pure list of notes per bar, so it can be checked without sound.
export const musicStyle = (sc) => (sc?.hall ? 'hall' : sc?.norse ? 'norse' : 'terra');
const CH = { terra: [[0, 4, 7, 11], [5, 9, 12, 16], [-3, 0, 4, 7], [7, 11, 14, 18]], norse: [[0, 7, 12, 15], [-2, 5, 10, 14], [-4, 3, 8, 12], [-2, 5, 10, 14]] };
const SCALE = { terra: [0, 2, 4, 7, 9, 12, 14, 16], norse: [0, 3, 5, 7, 10, 12, 15, 17], hall: [0, 2, 3, 5, 7, 9, 10, 12, 14, 15] }; // major pentatonic, minor pentatonic, D dorian
// one bar: { len (s), notes: [{ t, n (semitones from D3), type, peak, a, d, pad?, drum? }] }; rnd is a 0..1 random source
export function barNotes(style, bar, rnd) {
  const notes = [], P = (t, n, type, peak, a, d) => notes.push({ t, n, type, peak, a, d });
  if (style === 'hall') { // 4 s bars in a lilting 6/8: a drum on every beat, a lyre stepping round the dorian scale, a drone under it
    const len = 4, root = bar % 2 ? -2 : 0, S = SCALE.hall;
    for (const n of [root, root + 7]) notes.push({ t: 0, n: n + 12, pad: true, peak: 0.035, a: 0.6, d: len });
    for (let i = 0; i < 6; i++) notes.push({ t: i * len / 6, drum: true, peak: i % 3 ? 0.12 : 0.28 });
    let k = 4 + ((rnd() * 3) | 0); for (let i = 0; i < 6; i++) { if (i && rnd() < 0.15) continue; k = Math.max(0, Math.min(S.length - 1, k + ((rnd() * 5) | 0) - 2)); P(i * len / 6 + 0.02, S[k] + 12, 'triangle', 0.08, 0.008, 0.55); }
    return { len, notes };
  }
  const norse = style === 'norse', c = CH[norse ? 'norse' : 'terra'][bar % 4], len = 8, S = SCALE[norse ? 'norse' : 'terra'];
  for (const n of c) notes.push({ t: 0, n: n + 12, pad: true, peak: 0.05, a: 2.5, d: len - 1 });
  P(0, norse ? -12 : c[0], 'sine', 0.08, 1.5, len); // slow bass (Asgard: a low D drone under every chord)
  if (norse) { P(0, -5, 'sine', 0.05, 1.5, len); if (rnd() < 0.35) { P(1.2, -5, 'sawtooth', 0.018, 0.5, 1.6); P(3.0, 0, 'sawtooth', 0.022, 0.4, 2.6); } } // the low fifth, and now and then a two-note horn call
  const root = norse ? 12 : c[0] + 12, hits = (norse ? 2 : 3) + ((rnd() * 3) | 0);
  for (let i = 0; i < hits; i++) { const pick = rnd() < 0.6 ? c[(rnd() * 4) | 0] + 24 : root + S[(rnd() * S.length) | 0]; P(0.8 + i * (len / hits) + rnd() * 0.6, pick, 'triangle', 0.07, 0.015, norse ? 2.2 : 1.6); }
  return { len, notes };
}
export function createAudio() {
  let ac, out, rainGain, sea, wind, windF, vol = 0.7, mus, murmur, echo, scene = { foot: false, town: 0 }, nextBar = 0, nextVoice = 0, nextGull = 0, bar = 0;
  const noiseBuf = () => { const n = ac.sampleRate * 3, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); for (let i = 0, l = 0; i < n; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } return b; };
  function init() {
    if (ac) { ac.resume?.(); return; }
    try { ac = new AudioContext(); } catch { return; }
    out = ac.createGain(); out.gain.value = vol * 0.95; const lim = ac.createDynamicsCompressor(); lim.threshold.value = -16; lim.ratio.value = 6; out.connect(lim); lim.connect(ac.destination); // a soft limiter so cannons never clip
    const nb = noiseBuf(), src = (f, type, g) => { const s = ac.createBufferSource(); s.buffer = nb; s.loop = true; const bq = ac.createBiquadFilter(); bq.type = type; bq.frequency.value = f; const gn = ac.createGain(); gn.gain.value = g; s.connect(bq); bq.connect(gn); gn.connect(out); s.start(); return { gn, bq }; };
    const a = src(380, 'lowpass', 0.5), w = src(900, 'bandpass', 0.0);
    rainGain = src(2600, 'highpass', 0).gn; // the hiss of rain
    sea = a.gn; wind = w.gn; windF = w.bq;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.18; lfo.connect(lg); lg.connect(sea.gain); lfo.start();
    // the town crowd: a low murmur that swells and falls
    murmur = src(480, 'bandpass', 0).gn; const ml = ac.createOscillator(), mg = ac.createGain(); ml.frequency.value = 0.27; mg.gain.value = 0.02; ml.connect(mg); mg.connect(murmur.gain); ml.start();
    // music bus: everything goes through a soft echo, like a quiet room
    mus = ac.createGain(); mus.gain.value = 0; echo = ac.createDelay(1); echo.delayTime.value = 0.47; const fb = ac.createGain(), lp = ac.createBiquadFilter(); fb.gain.value = 0.42; lp.type = 'lowpass'; lp.frequency.value = 1800;
    mus.connect(out); mus.connect(echo); echo.connect(lp); lp.connect(fb); fb.connect(echo); lp.connect(out);
  }
  // generative music, never the same twice: barNotes (below) picks the notes, this plays them
  const hz = (n) => 146.83 * Math.pow(2, n / 12);
  function note(t, f, type, peak, a, d, dest) { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; env(g, t, a, d, peak); o.connect(g); g.connect(dest || mus); o.start(t); o.stop(t + a + d + 0.1); }
  let style = 'terra', drumBuf;
  function drum(t, peak) { // a frame drum: a falling low thump with a short muffled slap
    drumBuf ||= noiseBuf(); const o = ac.createOscillator(), g = ac.createGain(), n = ac.createBufferSource(), f = ac.createBiquadFilter(), g2 = ac.createGain();
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.25); env(g, t, 0.005, 0.3, peak); o.connect(g); g.connect(mus); o.start(t); o.stop(t + 0.4);
    n.buffer = drumBuf; f.type = 'lowpass'; f.frequency.value = 160; env(g2, t, 0.003, 0.15, peak * 0.8); n.connect(f); f.connect(g2); g2.connect(mus); n.start(t, Math.random() * 2); n.stop(t + 0.25);
  }
  function playBar(t) {
    const b = barNotes(style, bar++, Math.random);
    for (const x of b.notes) { const at = t + x.t;
      if (x.drum) drum(at, x.peak);
      else if (x.pad) { const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(); o.type = 'sine'; o.frequency.value = hz(x.n) * (1 + (Math.random() - 0.5) * 0.004); f.type = 'lowpass'; f.frequency.value = 900; env(g, at, x.a, x.d, x.peak); o.connect(f); f.connect(g); g.connect(mus); o.start(at); o.stop(at + x.a + x.d + 0.1); }
      else note(at, hz(x.n), x.type, x.peak, x.a, x.d, mus); }
    return b.len;
  }
  function scheduleMusic() {
    const t = ac.currentTime; if (t + 1 < nextBar) return; // schedule a bar ahead
    const len = playBar(Math.max(nextBar, t + 0.1)); nextBar = Math.max(nextBar, t) + len;
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
  // distant whale song (through the echo bus) and bird cries, only while one is near; timers keep them sparse
  let nextWhale = 0, nextCry = 0;
  function whaleSong(g) { const t = ac.currentTime + 0.05; for (const [f0, f1, f2, pk, ty] of [[88, 170, 105, 0.11, 'sine'], [132, 250, 150, 0.04, 'triangle']]) { const o = ac.createOscillator(), gn = ac.createGain(), lf = ac.createOscillator(), lg = ac.createGain(); o.type = ty; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 2.4); o.frequency.exponentialRampToValueAtTime(f2, t + 5); lf.frequency.value = 5.5; lg.gain.value = f0 * 0.03; lf.connect(lg); lg.connect(o.frequency); env(gn, t, 1.2, 4.2, pk * g); o.connect(gn); gn.connect(mus); o.start(t); lf.start(t); o.stop(t + 5.6); lf.stop(t + 5.6); } }
  function cry(kind, g) { const t = ac.currentTime + 0.02; if (kind === 'raven' || kind === 'eagle') { for (let i = 0; i < (kind === 'raven' ? 2 : 3); i++) { const s = t + i * (kind === 'raven' ? 0.34 : 0.22), o = ac.createOscillator(), f = ac.createBiquadFilter(), gn = ac.createGain(); o.type = kind === 'raven' ? 'sawtooth' : 'triangle'; o.frequency.setValueAtTime(kind === 'raven' ? 430 : 2600, s); o.frequency.exponentialRampToValueAtTime(kind === 'raven' ? 210 : 1900, s + 0.2); f.type = 'bandpass'; f.frequency.value = kind === 'raven' ? 900 : 2800; f.Q.value = 3; env(gn, s, 0.01, 0.17, 0.05 * g); o.connect(f); f.connect(gn); gn.connect(out); o.start(s); o.stop(s + 0.3); } return; }
    for (let i = 0; i < 2 + ((Math.random() * 2) | 0); i++) { const o = ac.createOscillator(), gn = ac.createGain(), s = t + i * 0.3; o.type = 'sine'; o.frequency.setValueAtTime(2100, s); o.frequency.exponentialRampToValueAtTime(1300, s + 0.22); env(gn, s, 0.03, 0.2, 0.02 * g); o.connect(gn); gn.connect(out); o.start(s); o.stop(s + 0.35); } }
  const env = (g, t, a, d, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  return {
    get style() { return style; }, // the music style playing now (shown in the debug panel)
    init, setVolume(v) { vol = v; if (out) out.gain.value = v * 0.95; },
    // wind loudness follows ship speed and the cold near the wall
    update(speed, cold, sc) { if (!ac) return; const t = ac.currentTime; if (sc) scene = sc; style = musicStyle(scene); const foot = scene.foot, town = scene.town || 0; scheduleMusic(); chatter(t, town); if (foot && town < 0.2) gull(t);
      mus.gain.setTargetAtTime(scene.hall ? 0.8 : foot ? 0.7 - 0.12 * town : 0.7, t, 2); murmur.gain.setTargetAtTime(0.6 * town, t, 1.5); sea.gain.setTargetAtTime(foot ? 0.4 - 0.15 * town : 0.5, t, 1);
      wind.gain.setTargetAtTime(foot ? 0.05 + cold * 0.2 : Math.min(0.5, 0.05 + Math.abs(speed) * 0.04 + cold * 0.25), t, 0.3); windF.frequency.setTargetAtTime(700 + cold * 500, t, 0.5); },
    // nearest whale-like animal and bird distances (world units), called each frame
    critters(c) { if (!ac) return; const t = ac.currentTime; if (c.whale < 320 && t > nextWhale) { nextWhale = t + 16 + Math.random() * 18; whaleSong(Math.max(0.15, 1 - c.whale / 320)); } if (c.bird < 110 && t > nextCry) { nextCry = t + 4 + Math.random() * 8; cry(c.birdKind, Math.max(0.2, 1 - c.bird / 110)); } },
    // rain hiss and a heavier wind in a storm, called each frame
    weather(rain, storm) { if (!ac || !rainGain) return; const t = ac.currentTime; rainGain.gain.setTargetAtTime(0.16 * rain + 0.1 * storm, t, 0.8); },
    // thunder after a delay (the further the bolt, the longer): a low rolling rumble
    thunder(delay = 1, gain = 0.8) { if (!ac) return; const t = ac.currentTime + delay; this.nbuf ||= noiseBuf(); const n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); n.buffer = this.nbuf; n.loop = true; f.type = 'lowpass'; f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(60, t + 2.8); env(g, t, 0.05, 2.9, 1.3 * gain); n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + 3.1); },
    // water slapping the bow
    splash(k = 1) { if (!ac) return; const t = ac.currentTime; this.nbuf ||= noiseBuf(); const n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); n.buffer = this.nbuf; n.playbackRate.value = 2.4; f.type = 'bandpass'; f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(420, t + 0.5); f.Q.value = 0.7; env(g, t, 0.02, 0.55, 0.28 * Math.min(1.4, k)); n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random()); n.stop(t + 0.65); },
    boom(distGain = 1) { if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.4); env(g, t, 0.01, 0.5, 0.9 * distGain); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.6);
      const s = ac.createBufferSource(); s.buffer = noiseBuf(); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g2 = ac.createGain(); env(g2, t, 0.005, 0.35, 1.2 * distGain); s.connect(f); f.connect(g2); g2.connect(out); s.start(t); s.stop(t + 0.5); },
    coin() { if (!ac) return; const t = ac.currentTime; [880, 1320].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = f; env(g, t + i * 0.08, 0.005, 0.25, 0.25); o.connect(g); g.connect(out); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.3); }); },
    quest() { if (!ac) return; const t = ac.currentTime; [523, 659, 784].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; env(g, t + i * 0.12, 0.01, 0.5, 0.2); o.connect(g); g.connect(out); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.6); }); },
    // the Wall: a long groan with sharp cracks as the ram bites, then the break itself (deep boom, a rolling rumble, falling ice that tinkles)
    crack() { if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(74, t); o.frequency.exponentialRampToValueAtTime(36, t + 2.6); f.type = 'lowpass'; f.frequency.value = 240; env(g, t, 0.5, 2.3, 0.3); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 3);
      this.nbuf ||= noiseBuf(); for (let i = 0; i < 8; i++) { const s = t + 0.1 + i * 0.3 + Math.random() * 0.18, n = ac.createBufferSource(), h = ac.createBiquadFilter(), gg = ac.createGain(); n.buffer = this.nbuf; n.playbackRate.value = 3 + Math.random() * 3; h.type = 'highpass'; h.frequency.value = 1400 + Math.random() * 1400; env(gg, s, 0.002, 0.07 + Math.random() * 0.08, 0.25 + 0.06 * i); n.connect(h); h.connect(gg); gg.connect(out); n.start(s, Math.random() * 2); n.stop(s + 0.25); } },
    iceBreak() { if (!ac) return; const t = ac.currentTime; this.boom(1.3); this.nbuf ||= noiseBuf();
      const n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); n.buffer = this.nbuf; n.loop = true; f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(70, t + 3.6); env(g, t, 0.04, 3.6, 1.1); n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + 3.8);
      for (let i = 0; i < 16; i++) { const s = t + 0.15 + Math.random() * 1.9, fr = 2000 + Math.random() * 2800, o = ac.createOscillator(), gg = ac.createGain(); o.type = 'triangle'; o.frequency.value = fr; o.frequency.exponentialRampToValueAtTime(fr * 0.8, s + 0.3); env(gg, s, 0.003, 0.25, 0.05 + Math.random() * 0.05); o.connect(gg); gg.connect(out); o.start(s); o.stop(s + 0.35); } },
    hit() { this.boom(0.5); },
    // a sword swing: a quick falling whoosh, with a dull thud when it lands
    slash(landed) { if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.14); env(g, t, 0.01, 0.14, 0.05); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2); if (landed) this.boom(0.18); },
  };
}
