/**
 * WebAudio 합성 효과음 (외부 오디오 파일 없음).
 * 첫 사용자 입력 이후에 AudioContext 를 연다 (브라우저 자동재생 정책).
 */
let ctx = null, master = null, noiseBuf = null;
let volume = 0.5, muted = false;

function ensure() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
  return ctx;
}
if (typeof window !== 'undefined') {
  const unlock = () => { ensure(); ctx?.resume?.(); };
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });
}

const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };

let pitch = 1;
function tone(type, f0, f1, dur, peak = 0.3, delay = 0) {
  f0 *= pitch; f1 *= pitch;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, peak, dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(filterType, f0, f1, dur, peak = 0.3, q = 1, delay = 0) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, 0.004, peak, dur);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

const SOUNDS = {
  whoosh: () => noise('bandpass', 600, 2400, 0.16, 0.18, 1.2),
  heavyWhoosh: () => noise('bandpass', 300, 1400, 0.28, 0.25, 0.9),
  impact: (w = 1) => { tone('sine', 140 * w, 50, 0.16, 0.45); noise('lowpass', 2200, 300, 0.09, 0.28); },
  heavyImpact: () => { tone('sine', 110, 38, 0.3, 0.6); noise('lowpass', 1600, 120, 0.2, 0.4); tone('square', 70, 40, 0.12, 0.08); },
  crit: () => { tone('triangle', 1400, 1300, 0.35, 0.18); tone('sine', 2100, 2000, 0.3, 0.1, 0.01); },
  hurt: () => { tone('sawtooth', 180, 90, 0.18, 0.15); noise('lowpass', 900, 200, 0.12, 0.2); },
  block: () => { tone('square', 620, 540, 0.08, 0.12); tone('triangle', 1250, 1180, 0.22, 0.12); noise('highpass', 3000, 2000, 0.06, 0.15); },
  arrow: () => { noise('highpass', 4000, 1500, 0.12, 0.15); tone('triangle', 900, 500, 0.08, 0.06); },
  spell: () => { tone('sine', 520, 980, 0.25, 0.14); tone('triangle', 780, 1460, 0.25, 0.08, 0.02); noise('bandpass', 2500, 5000, 0.2, 0.06, 4); },
  fire: () => { noise('lowpass', 1800, 400, 0.35, 0.22); tone('sawtooth', 120, 70, 0.25, 0.06); },
  frost: () => { tone('sine', 1800, 2400, 0.3, 0.08); noise('highpass', 6000, 3000, 0.3, 0.1); },
  heal: () => { [660, 880, 1320].forEach((f, i) => tone('sine', f, f, 0.35, 0.09, i * 0.06)); },
  dodge: () => noise('bandpass', 800, 300, 0.2, 0.15, 0.8),
  click: () => tone('triangle', 900, 700, 0.05, 0.08),
  coin: () => { tone('square', 1600, 1600, 0.06, 0.05); tone('square', 2400, 2400, 0.12, 0.05, 0.06); },
  levelUp: () => { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.35, 0.14, i * 0.09)); },
  telegraph: () => tone('sine', 300, 260, 0.12, 0.05),
  knockdown: () => { tone('sine', 80, 40, 0.35, 0.4); noise('lowpass', 600, 80, 0.3, 0.3); },
  crunch: () => { noise('bandpass', 2600, 900, 0.07, 0.22, 2.5); tone('square', 220, 90, 0.05, 0.06); },
  tail: () => { noise('lowpass', 900, 200, 0.35, 0.08, 0.7); },
  ting: () => { tone('sine', 2400, 2350, 0.45, 0.14); tone('sine', 3600, 3550, 0.3, 0.06, 0.01); },
  boom: () => { tone('sine', 60, 28, 0.7, 0.75); noise('lowpass', 900, 60, 0.6, 0.5); tone('triangle', 180, 60, 0.4, 0.15); },
  threadSnap: () => { tone('triangle', 1800, 600, 0.06, 0.12); noise('highpass', 5000, 3000, 0.05, 0.1); },
  heartbeat: () => { tone('sine', 62, 48, 0.12, 0.45); tone('sine', 58, 44, 0.12, 0.35, 0.18); },
  release: () => { tone('sawtooth', 300, 1200, 0.15, 0.12); noise('bandpass', 1500, 4000, 0.12, 0.15, 2); },
};

export const Sfx = {
  play(name, arg, { jitter = 0 } = {}) {
    if (muted || !ensure() || ctx.state !== 'running') return;
    pitch = 1 + (Math.random() - 0.5) * 2 * jitter;
    try { SOUNDS[name]?.(arg); } catch { /* 무시 */ }
    pitch = 1;
  },
  /** 타격 소리 층: 휘두름 → 몸통 충돌 → 바스러짐/여운. 무거울수록 저음 */
  hit(weight, crit) {
    this.play(weight === 'heavy' ? 'heavyImpact' : 'impact', weight === 'medium' ? 0.8 : 1, { jitter: 0.08 });
    this.play('crunch', null, { jitter: 0.15 });
    if (weight !== 'light') this.play('tail', null, { jitter: 0.1 });
    if (crit) this.play('ting', null, { jitter: 0.03 });
  },
  /** 차지: 올라가는 음 */
  chargeStart(max) {
    if (muted || !ensure() || ctx.state !== 'running') return;
    this.chargeStop();
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(880, t + max);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.1);
    o.connect(g).connect(master); o.start(t);
    this.charge = { o, g };
  },
  chargeStop() { if (!this.charge) return; const { o, g } = this.charge; try { g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05); o.stop(ctx.currentTime + 0.06); } catch { /* 무시 */ } this.charge = null; },
  setVolume(v) { volume = v; if (master) master.gain.value = v; },
  toggleMute() { muted = !muted; return muted; },
};

/** 패드 진동 (연결된 경우만) */
export function rumble([ms, weak, strong]) {
  try {
    for (const pad of navigator.getGamepads?.() || []) pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, weakMagnitude: weak, strongMagnitude: strong });
  } catch { /* 무시 */ }
}
