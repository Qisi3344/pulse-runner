// WebAudio 步进音序器：kick / hat / bass / arp 全合成，零音频文件。
// BPM 跟随游戏速度；beatPulseAt 给主循环提供节拍脉冲信号。
import { state } from './state.js';

export const A = { ok: false, bpm: 122 };

A.init = function () {
  if (A.ok) return;
  try { A.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  const ctx = A.ctx;
  A.master = ctx.createGain();
  A.master.gain.value = +(localStorage.getItem('pulse_vol') ?? 0.72);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 7;
  A.master.connect(comp); comp.connect(ctx.destination);
  // 主延迟：给琶音一点空间感
  A.delay = ctx.createDelay(0.6);
  A.delay.delayTime.value = (60 / A.bpm) * 0.75;
  const dg = ctx.createGain(); dg.gain.value = 0.22;
  const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400;
  A.delay.connect(dlp); dlp.connect(dg); dg.connect(A.master);
  // 噪声缓冲：hat 与 crash 共用
  const nb = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  A.noiseBuf = nb;
  A.ok = true;
};

A.setVolume = function (v) {
  if (A.ok) A.master.gain.value = v;
  localStorage.setItem('pulse_vol', v);
};

function at(t) { return A.ctx.currentTime + Math.max(0, t); }

function kick(t) {
  const o = A.ctx.createOscillator(), g = A.ctx.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.13);
  g.gain.setValueAtTime(0.95, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  o.connect(g); g.connect(A.master); o.start(t); o.stop(t + 0.3);
}
function hat(t, open) {
  const src = A.ctx.createBufferSource(); src.buffer = A.noiseBuf; src.loop = true;
  const f = A.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = open ? 7000 : 8800;
  const g = A.ctx.createGain();
  g.gain.setValueAtTime(open ? 0.16 : 0.1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.16 : 0.045));
  src.connect(f); f.connect(g); g.connect(A.master);
  src.start(t); src.stop(t + 0.2);
}
function bass(t, midi, dur) {
  const o = A.ctx.createOscillator(), g = A.ctx.createGain(), f = A.ctx.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
  f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(240, t + dur);
  f.Q.value = 6;
  g.gain.setValueAtTime(0.26, t); g.gain.setValueAtTime(0.26, t + dur - 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(f); f.connect(g); g.connect(A.master);
  o.start(t); o.stop(t + dur + 0.05);
}
function arp(t, midi) {
  const o = A.ctx.createOscillator(), g = A.ctx.createGain();
  o.type = 'square'; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
  g.gain.setValueAtTime(0.055, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  o.connect(g); g.connect(A.master); g.connect(A.delay);
  o.start(t); o.stop(t + 0.2);
}

export const sfx = {
  uiTick: () => {
    if (!A.ok) return;
    const t = A.ctx.currentTime;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g); g.connect(A.master); o.start(t); o.stop(t + 0.1);
  },
  pick: combo => {
    if (!A.ok) return;
    const t = A.ctx.currentTime;
    const midi = 76 + Math.min(12, combo) * 0.5;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(A.master); g.connect(A.delay); o.start(t); o.stop(t + 0.2);
  },
  crash: () => {
    if (!A.ok) return;
    const t = A.ctx.currentTime;
    const src = A.ctx.createBufferSource(); src.buffer = A.noiseBuf; src.loop = true;
    const f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(f); f.connect(g); g.connect(A.master); src.start(t); src.stop(t + 0.45);
  },
  boom: () => {
    if (!A.ok) return;
    const t = A.ctx.currentTime;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(24, t + 1.1);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    o.connect(g); g.connect(A.master); o.start(t); o.stop(t + 1.4);
  },
  jump: () => {
    if (!A.ok) return;
    const t = A.ctx.currentTime;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(620, t + 0.12);
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(A.master); o.start(t); o.stop(t + 0.2);
  },
  // 区段门通过：上扬双音
  gate: () => {
    if (!A.ok) return;
    const t = A.ctx.currentTime;
    [523.25, 784].forEach((f0, i) => {
      const o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f0;
      g.gain.setValueAtTime(0.12, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.35);
      o.connect(g); g.connect(A.master); g.connect(A.delay);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.4);
    });
  },
  // 护盾回充：暖三连音
  heal: () => {
    if (!A.ok) return;
    const t = A.ctx.currentTime;
    [659.26, 830.6, 987.77].forEach((f0, i) => {
      const o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f0;
      g.gain.setValueAtTime(0.1, t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.22);
      o.connect(g); g.connect(A.master); g.connect(A.delay);
      o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.25);
    });
  },
  // OVERDRIVE 启动：滤波上扫
  overdrive: () => {
    if (!A.ok) return;
    const t = A.ctx.currentTime;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain(), f = A.ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.5);
    f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(6000, t + 0.5);
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(f); f.connect(g); g.connect(A.master); o.start(t); o.stop(t + 0.65);
  },
};

// 16 步音序（Am F C G 的 synthwave 走向）
const PROG = [45, 41, 48, 43];           // A2 F2 C3 G2 根音
const ARP_STEPS = [69, 72, 76, 72, 69, 76, 81, 76, 69, 72, 76, 72, 67, 72, 76, 79];
export const seq = { nextBeat: 0, beat: 0, bar: 0 };
export const beatPulseAt = [];           // 排定的节拍时刻（audio 时钟）

export function schedule() {
  if (!A.ok) return;
  const ahead = A.ctx.currentTime + 0.28;
  while (seq.nextBeat < ahead) {
    const t = seq.nextBeat;
    const step = seq.beat % 4, barStep = seq.beat % 16;
    if (step === 0) kick(t);
    if (seq.beat % 2 === 0) hat(t, false); else if (seq.beat % 8 === 3) hat(t, true);
    if (step === 0 || step === 2) bass(t, PROG[Math.floor(seq.beat / 4) % 4] + (step === 2 ? 12 : 0), (60 / A.bpm) * 0.9);
    arp(t, ARP_STEPS[barStep] + 12);
    // 给游戏循环一个节拍脉冲信号（提前通知）
    beatPulseAt.push(t);
    seq.nextBeat += (60 / A.bpm) / 2;      // 八分音符
    seq.beat++;
  }
}

// BPM 跟随游戏速度（46→96 对应 122→148），OVERDRIVE 期间再抬 8
export function syncBpm() {
  if (!A.ok) return;
  const base = 122 + Math.floor((state.speed - 46) / 50 * 26);
  A.bpm = state.overdrive > 0 ? base + 8 : base;
}
