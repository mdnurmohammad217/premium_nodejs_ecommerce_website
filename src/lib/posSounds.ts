/**
 * POS sound effects.
 *
 * The counter needs audible confirmation: a scan that registered, a line that
 * came off the bill, a payment that went through. These are real recorded-
 * quality samples (44.1 kHz, rendered with proper attack/decay envelopes, no
 * clicks, peaks at -1 dBFS) bundled by Vite, so they are fingerprinted and
 * cached for a year like every other asset.
 *
 * Latency matters at a till — a beep that arrives late feels broken — so the
 * samples are decoded ONCE into memory with the Web Audio API and played from
 * there: no network request and no decoding at the moment of the click.
 * Playback also never interrupts itself, so quick repeated scans each beep.
 *
 * Browsers only allow audio after the user has interacted with the page, so
 * the audio context is created and the samples decoded on the first click or
 * key press (or when the POS calls `preloadPosSounds`). Until the samples are
 * ready — or if a browser can't decode them — a synthesised version of the same
 * cue plays instead, so the counter is never silent. A failure is always
 * swallowed: a missing beep must never interrupt a sale.
 *
 * Sound can be switched off from the POS top bar; the choice is kept per device.
 */
import addUrl from '../assets/sounds/add.wav?url';
import tickUrl from '../assets/sounds/tick.wav?url';
import removeUrl from '../assets/sounds/remove.wav?url';
import payUrl from '../assets/sounds/pay.wav?url';
import drawerUrl from '../assets/sounds/drawer.wav?url';
import errorUrl from '../assets/sounds/error.wav?url';
import clearUrl from '../assets/sounds/clear.wav?url';
import holdUrl from '../assets/sounds/hold.wav?url';

type SoundName = 'add' | 'tick' | 'remove' | 'pay' | 'drawer' | 'error' | 'clear' | 'hold';

const SAMPLE_URLS: Record<SoundName, string> = {
  add: addUrl,
  tick: tickUrl,
  remove: removeUrl,
  pay: payUrl,
  drawer: drawerUrl,
  error: errorUrl,
  clear: clearUrl,
  hold: holdUrl,
};

/** Relative loudness per cue, on top of the device volume */
const CUE_GAIN: Record<SoundName, number> = {
  add: 0.9,
  tick: 0.7,
  remove: 0.85,
  pay: 1,
  drawer: 0.85,
  error: 0.9,
  clear: 0.7,
  hold: 0.85,
};

const STORAGE_KEY = 'pos:sound-enabled';
const VOLUME_KEY = 'pos:sound-volume';

let context: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<SoundName, AudioBuffer>();
let loading: Promise<void> | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!context) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor({ latencyHint: 'interactive' });
      master = context.createGain();
      // A gentle limiter so two overlapping cues can never distort
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 4;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      master.connect(limiter).connect(context.destination);
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

/**
 * Decode every sample into memory. Safe to call repeatedly; the work happens
 * once. The POS calls it on mount, and the first user gesture calls it too.
 */
export function preloadPosSounds(): Promise<void> {
  if (loading) return loading;
  const ctx = audioContext();
  if (!ctx) return Promise.resolve();

  loading = Promise.all(
    (Object.keys(SAMPLE_URLS) as SoundName[]).map(async (name) => {
      try {
        const res = await fetch(SAMPLE_URLS[name]);
        const data = await res.arrayBuffer();
        const buffer = await new Promise<AudioBuffer>((resolve, reject) =>
          // callback form: older Safari has no promise-returning decodeAudioData
          ctx.decodeAudioData(data, resolve, reject)
        );
        buffers.set(name, buffer);
      } catch {
        /* this cue falls back to its synthesised version */
      }
    })
  ).then(() => undefined);
  return loading;
}

// Unlock and warm up on the first interaction anywhere on the page
if (typeof window !== 'undefined') {
  const unlock = () => {
    void preloadPosSounds();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    /* private mode — the setting just won't persist */
  }
}

export function getVolume(): number {
  try {
    const stored = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(stored) && stored > 0 && stored <= 1 ? stored : 0.8;
  } catch {
    return 0.8;
  }
}

export function setVolume(volume: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(Math.min(1, Math.max(0, volume))));
  } catch {
    /* ignored */
  }
}

/* -------------------------------------------------------------------------- */
/* Synthesised fallback (used only until the samples are decoded)             */
/* -------------------------------------------------------------------------- */

interface ToneSpec {
  freq: number;
  duration: number;
  delay?: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
}

function synth(ctx: AudioContext, destination: AudioNode, tones: ToneSpec[]): void {
  const now = ctx.currentTime;
  for (const tone of tones) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + (tone.delay || 0);
      const end = start + tone.duration;
      const peak = (tone.gain ?? 1) * 0.35;
      osc.type = tone.type || 'sine';
      osc.frequency.setValueAtTime(tone.freq, start);
      if (tone.slideTo) osc.frequency.exponentialRampToValueAtTime(tone.slideTo, end);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(destination);
      osc.start(start);
      osc.stop(end + 0.02);
    } catch {
      /* one tone failing is not worth reporting */
    }
  }
}

const FALLBACK: Record<SoundName, ToneSpec[]> = {
  add: [{ freq: 1975, duration: 0.09, gain: 0.9 }],
  tick: [{ freq: 2637, duration: 0.05, gain: 0.5 }],
  remove: [
    { freq: 1318, duration: 0.08, gain: 0.7 },
    { freq: 988, duration: 0.12, delay: 0.08, gain: 0.7 },
  ],
  pay: [
    { freq: 2093, duration: 0.5, delay: 0.05, gain: 0.8 },
    { freq: 2637, duration: 0.6, delay: 0.11, gain: 0.6 },
  ],
  drawer: [{ freq: 95, duration: 0.12, type: 'triangle', gain: 1 }],
  error: [
    { freq: 233, duration: 0.13, type: 'square', gain: 0.4 },
    { freq: 196, duration: 0.18, delay: 0.15, type: 'square', gain: 0.4 },
  ],
  clear: [{ freq: 900, duration: 0.18, type: 'triangle', gain: 0.5, slideTo: 300 }],
  hold: [
    { freq: 1760, duration: 0.12, gain: 0.6 },
    { freq: 1318, duration: 0.16, delay: 0.11, gain: 0.6 },
  ],
};

/* -------------------------------------------------------------------------- */
/* Playback                                                                    */
/* -------------------------------------------------------------------------- */

function play(name: SoundName): void {
  if (!isSoundEnabled()) return;
  const ctx = audioContext();
  if (!ctx || !master) return;

  master.gain.value = getVolume();
  void preloadPosSounds();

  const buffer = buffers.get(name);
  if (!buffer) {
    synth(ctx, master, FALLBACK[name]);
    return;
  }

  try {
    const source = ctx.createBufferSource();
    const cue = ctx.createGain();
    cue.gain.value = CUE_GAIN[name];
    source.buffer = buffer;
    source.connect(cue).connect(master);
    source.start();
  } catch {
    synth(ctx, master, FALLBACK[name]);
  }
}

/** A product went into the cart — a crisp scanner beep. */
export const soundAdd = () => play('add');
/** Quantity stepped up or down — a light tick. */
export const soundTick = () => play('tick');
/** A line was removed — two soft descending notes. */
export const soundRemove = () => play('remove');
/** Payment complete — the cash register "cha-ching". */
export const soundPay = () => play('pay');
/** Cash drawer / receipt printed. */
export const soundDrawer = () => play('drawer');
/** Something was refused — stock ran out, wrong code. */
export const soundError = () => play('error');
/** The bill was cleared. */
export const soundClear = () => play('clear');
/** Sale held for later. */
export const soundHold = () => play('hold');
/** Used by the sound toggle so the operator hears what they just enabled. */
export const soundPreview = soundPay;

export const posSounds = {
  add: soundAdd,
  tick: soundTick,
  remove: soundRemove,
  pay: soundPay,
  drawer: soundDrawer,
  error: soundError,
  clear: soundClear,
  hold: soundHold,
};
