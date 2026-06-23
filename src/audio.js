// src/audio.js
// Tiny WebAudio SFX engine. Sounds are decoded to AudioBuffers once and played
// through short-lived BufferSources so they can overlap and be pitch-varied
// cheaply. Mobile browsers block audio until a user gesture, so the context is
// resumed on the first touch/click/key (unlock()).
//
// SFX are CC0 from Kenney (RPG Audio + Impact Sounds) — see assets/audio/CREDITS.txt.

const AC = window.AudioContext || window.webkitAudioContext;
const ctx = AC ? new AC() : null;
const buffers = new Map();      // file -> AudioBuffer
let master = null;
let unlocked = false;
let enabled = true;

// event name -> one or more files (a random variant is chosen per play)
const SFX = {
  swing:  ['swing.ogg', 'swing2.ogg'],
  punch:  ['punch.ogg', 'punch2.ogg'],
  shoot:  ['shoot.ogg'],
  hit:    ['hit.ogg', 'hit2.ogg', 'hit3.ogg'],
  death:  ['death.ogg'],
  throw:  ['throw.ogg'],
  land:   ['land.ogg'],
  pickup: ['pickup.ogg'],
  equip:  ['equip.ogg'],
  hurt:   ['hurt.ogg'],
  door:   ['door.ogg'],
  win:    ['win.ogg'],
  step:   ['step1.ogg', 'step2.ogg', 'step3.ogg', 'step4.ogg'],
};

// per-event base volume
const VOL = {
  swing: 0.5, punch: 0.55, shoot: 0.6, hit: 0.5, death: 0.65, throw: 0.5,
  land: 0.4, pickup: 0.5, equip: 0.5, hurt: 0.65, door: 0.55, win: 0.85, step: 0.22,
};

export async function load() {
  if (!ctx) return { loaded: 0 };
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const files = [...new Set(Object.values(SFX).flat())];
  const jobs = files.map(async file => {
    try {
      const res = await fetch('assets/audio/sfx/' + file, { cache: 'force-cache' });
      const arr = await res.arrayBuffer();
      const buf = await decode(arr);
      buffers.set(file, buf);
      return true;
    } catch (_) { return false; }
  });
  const results = await Promise.all(jobs);
  return { loaded: results.filter(Boolean).length };
}

function decode(arrayBuffer) {
  // Safari historically only supports the callback form.
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(arrayBuffer, resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

// Resume the context on the first user gesture (mobile autoplay policy).
export function unlock() {
  if (!ctx || unlocked) return;
  const go = () => {
    if (unlocked) return;
    unlocked = true;
    if (ctx.state === 'suspended') ctx.resume();
    window.removeEventListener('touchstart', go);
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
  };
  window.addEventListener('touchstart', go, { passive: true });
  window.addEventListener('pointerdown', go, { passive: true });
  window.addEventListener('keydown', go);
}

export function setEnabled(v) { enabled = !!v; }

export function play(name, opts = {}) {
  if (!ctx || !enabled) return;
  if (ctx.state === 'suspended') ctx.resume();   // best-effort after unlock
  const variants = SFX[name];
  if (!variants) return;
  const file = variants[(Math.random() * variants.length) | 0];
  const buf = buffers.get(file);
  if (!buf) return;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const jitter = opts.rateJitter ?? 0.08;
  src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * jitter);

  const g = ctx.createGain();
  g.gain.value = (VOL[name] ?? 0.5) * (opts.gain ?? 1);
  src.connect(g); g.connect(master);
  src.start();
}

// convenience singleton
export const sfx = { load, unlock, play, setEnabled };
