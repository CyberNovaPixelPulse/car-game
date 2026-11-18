/**
 * Browser-free synthesis of the tank's one-shot sounds. Every sound is built
 * from physical models (decaying inharmonic modes for struck steel and brass,
 * filtered noise for blast and friction) so it can be rendered offline for
 * review and turned into WebAudio buffers at runtime. No recordings are used.
 */

export type OneShot =
  | "cannon"
  | "recoil"
  | "runout"
  | "rattle"
  | "breech"
  | "ram"
  | "rack"
  | "handle"
  | "case"
  | "clack"
  | "tick"
  | "clunk"
  | "click"
  | "starter"
  | "outdoor-space";

export const ONE_SHOTS: readonly OneShot[] = [
  "cannon",
  "recoil",
  "runout",
  "rattle",
  "breech",
  "ram",
  "rack",
  "handle",
  "case",
  "clack",
  "tick",
  "clunk",
  "click",
  "starter",
  "outdoor-space",
];

/** How many distinct takes are rendered, so repeated hits do not sound copied. */
export const VARIANTS: Record<OneShot, number> = {
  cannon: 1,
  recoil: 1,
  runout: 1,
  rattle: 2,
  breech: 2,
  ram: 2,
  rack: 2,
  handle: 3,
  case: 3,
  clack: 8,
  tick: 3,
  clunk: 2,
  click: 1,
  starter: 1,
  "outdoor-space": 1,
};

type Mode = [frequency: number, decay: number, amplitude: number];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RBJ band-pass (0 dB peak) with per-sample retuning for sweeps. */
class Band {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private b0 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  constructor(private rate: number) {}
  tune(frequency: number, q: number) {
    const w = (2 * Math.PI * Math.min(frequency, this.rate * 0.45)) / this.rate;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * Math.cos(w)) / a0;
    this.a2 = (1 - alpha) / a0;
    return this;
  }
  run(x: number) {
    const y =
      this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** One-pole low-pass; cutoff may change every sample. */
class Low {
  private y = 0;
  constructor(private rate: number) {}
  run(x: number, cutoff: number) {
    this.y +=
      (1 - Math.exp((-2 * Math.PI * cutoff) / this.rate)) * (x - this.y);
    return this.y;
  }
}

function addModes(
  out: Float32Array,
  rate: number,
  start: number,
  modes: Mode[],
  random: () => number,
  gain = 1,
) {
  const first = Math.floor(start * rate);
  for (const [frequency, decay, amplitude] of modes) {
    const f = frequency * (0.985 + random() * 0.03);
    const phase = random() * Math.PI * 2;
    const end = Math.min(out.length, first + Math.ceil(decay * 7 * rate));
    for (let i = first; i < end; i++) {
      const t = (i - first) / rate;
      const attack = Math.min(1, t / 0.0006);
      out[i] +=
        gain *
        amplitude *
        attack *
        Math.exp(-t / decay) *
        Math.sin(2 * Math.PI * f * t + phase);
    }
  }
}

function addNoise(
  out: Float32Array,
  rate: number,
  start: number,
  duration: number,
  envelope: (t: number) => number,
  random: () => number,
  shape: (x: number, t: number) => number = (x) => x,
) {
  const first = Math.floor(start * rate);
  const end = Math.min(out.length, first + Math.ceil(duration * rate));
  for (let i = first; i < end; i++) {
    const t = (i - first) / rate;
    out[i] += envelope(t) * shape(random() * 2 - 1, t);
  }
}

function normalize(out: Float32Array<ArrayBuffer>, peak: number) {
  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] *= peak / max;
  // A short fade keeps the tail from clicking when a buffer ends mid-ring.
  const fade = Math.min(out.length, 256);
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

/** Struck steel plate / armour fitting. */
function steelHit(
  out: Float32Array,
  rate: number,
  start: number,
  random: () => number,
  low: number,
  ring: number,
  gain: number,
) {
  const ratios = [1, 2.32, 3.87, 5.41, 7.18];
  addModes(
    out,
    rate,
    start,
    ratios.map((r, i) => [low * r, ring / (1 + i * 0.7), 1 / (1 + i * 0.6)]),
    random,
    gain,
  );
  const band = new Band(rate).tune(low * 6, 0.9);
  addNoise(
    out,
    rate,
    start,
    0.03,
    (t) => gain * 0.8 * Math.exp(-t / 0.004),
    random,
    (x) => band.run(x),
  );
}

export function renderOneShot(
  kind: OneShot,
  rate: number,
  variant = 0,
): Float32Array<ArrayBuffer> {
  const random = rng(
    0x9e3779b9 ^ (ONE_SHOTS.indexOf(kind) * 7919 + variant * 104729),
  );
  const seconds = {
    cannon: 2.6,
    recoil: 0.7,
    runout: 0.45,
    rattle: 0.7,
    breech: 0.9,
    ram: 0.4,
    rack: 0.55,
    handle: 0.3,
    case: 1.9,
    clack: 0.09,
    tick: 0.045,
    clunk: 0.35,
    click: 0.14,
    starter: 1.05,
    "outdoor-space": 2.4,
  }[kind];
  const out = new Float32Array(Math.ceil(seconds * rate));
  switch (kind) {
    case "cannon": {
      // 75 mm muzzle blast heard through the hull: a pressure thump whose
      // pitch collapses, a short supersonic crack, then a low rolling tail.
      let phase = 0;
      const body = new Low(rate);
      const tail = new Low(rate);
      let brown = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / rate;
        const f = 26 + 70 * Math.exp(-t / 0.05);
        phase += (2 * Math.PI * f) / rate;
        const thump =
          Math.min(1, t / 0.002) * Math.exp(-t / 0.42) * Math.sin(phase);
        const white = random() * 2 - 1;
        const blast =
          body.run(white, 180 + 2200 * Math.exp(-t / 0.05)) *
          Math.exp(-t / 0.28) *
          3.2;
        const crack = t < 0.05 ? white * Math.exp(-t / 0.007) * 0.9 : 0;
        brown = brown * 0.996 + white * 0.04;
        const roll = tail.run(brown, 140) * Math.exp(-t / 0.95) * 2.4;
        out[i] = Math.tanh(1.6 * (thump * 1.1 + blast + crack + roll));
      }
      return normalize(out, 0.98);
    }
    case "recoil":
      // Breech assembly slamming back into the recoil cylinders.
      steelHit(out, rate, 0, random, 132, 0.2, 1);
      addModes(out, rate, 0, [[58, 0.09, 0.9]], random);
      return normalize(out, 0.9);
    case "runout":
      // Recuperator returning the gun to battery.
      steelHit(out, rate, 0, random, 205, 0.09, 0.6);
      addModes(out, rate, 0, [[75, 0.05, 0.5]], random);
      return normalize(out, 0.55);
    case "rattle": {
      // Loose kit (periscope caps, tools, ready-rack clips) shaken by the blast.
      for (let n = 0; n < 7; n++)
        steelHit(
          out,
          rate,
          0.02 + random() * 0.5,
          random,
          600 + random() * 1400,
          0.02 + random() * 0.03,
          0.2 + random() * 0.4,
        );
      return normalize(out, 0.4);
    }
    case "breech": {
      // Vertical sliding breech block closing on the case rim: heavy, ringing.
      addModes(out, rate, 0, [[68, 0.05, 1.1]], random);
      steelHit(out, rate, 0.004, random, 270 + variant * 18, 0.24, 1);
      steelHit(out, rate, 0.028, random, 1450, 0.05, 0.35);
      return normalize(out, 0.85);
    }
    case "ram": {
      // Shell driven home by the loader's fist: a dull, padded thud.
      addModes(out, rate, 0, [[92 + variant * 6, 0.07, 1]], random);
      const low = new Low(rate);
      addNoise(
        out,
        rate,
        0,
        0.12,
        (t) => 0.8 * Math.exp(-t / 0.025),
        random,
        (x) => low.run(x, 700),
      );
      addModes(
        out,
        rate,
        0.002,
        [
          [1630, 0.05, 0.08],
          [3020, 0.03, 0.05],
        ],
        random,
      );
      return normalize(out, 0.6);
    }
    case "rack": {
      // Round dragged out of the ready rack: brass sliding on steel, then a clunk.
      const band = new Band(rate);
      addNoise(
        out,
        rate,
        0,
        0.3,
        (t) =>
          0.5 * Math.min(1, t / 0.03) * Math.exp(-Math.max(0, t - 0.2) / 0.03),
        random,
        (x, t) =>
          band.tune(1900 - 2600 * t + 300 * Math.sin(t * 70), 6).run(x) * 3,
      );
      steelHit(out, rate, 0.27, random, 360 + variant * 30, 0.08, 0.55);
      return normalize(out, 0.5);
    }
    case "handle": {
      // Shell body knocking the guard while it is swung toward the breech.
      addModes(out, rate, 0, [[140 + variant * 20, 0.05, 0.6]], random);
      const band = new Band(rate).tune(1300 + variant * 250, 3);
      addNoise(
        out,
        rate,
        0,
        0.1,
        (t) => 0.35 * Math.exp(-t / 0.03),
        random,
        (x) => band.run(x) * 2,
      );
      return normalize(out, 0.32);
    }
    case "case": {
      // Spent 75 mm brass case hitting the turret floor and bouncing.
      const brass: Mode[] = [
        [612, 0.55, 0.3],
        [1484, 0.45, 0.35],
        [2622, 0.36, 0.28],
        [3894, 0.27, 0.2],
        [5380, 0.18, 0.12],
      ];
      const hits = [
        [0, 1],
        [0.24 + variant * 0.03, 0.45],
        [0.41 + variant * 0.04, 0.25],
        [0.53 + variant * 0.04, 0.12],
      ];
      for (const [time, gain] of hits) {
        addModes(out, rate, time, [[115, 0.05, 0.9]], random, gain);
        addModes(
          out,
          rate,
          time,
          brass.map(([f, d, a]) => [f, d * (0.4 + gain * 0.6), a]),
          random,
          gain,
        );
      }
      return normalize(out, 0.55);
    }
    case "clack": {
      // One track link meeting the sprocket / road wheel.
      steelHit(
        out,
        rate,
        0,
        random,
        260 + random() * 260,
        0.012 + random() * 0.016,
        1,
      );
      addModes(out, rate, 0, [[150 + random() * 40, 0.02, 0.6]], random);
      return normalize(out, 0.7);
    }
    case "tick":
      // Elevation hand-wheel pawl.
      addModes(
        out,
        rate,
        0,
        [
          [3100 + variant * 300, 0.006, 0.5],
          [5200, 0.004, 0.3],
        ],
        random,
      );
      return normalize(out, 0.25);
    case "clunk":
      // Traverse gear taking up backlash as the turret starts or stops.
      steelHit(out, rate, 0, random, 150 + variant * 40, 0.07, 1);
      return normalize(out, 0.4);
    case "click": {
      // Intercom key before the loader's call-out.
      addNoise(out, rate, 0, 0.003, () => 1, random);
      const band = new Band(rate).tune(2400, 1.2);
      addNoise(
        out,
        rate,
        0.004,
        0.12,
        (t) => 0.25 * Math.exp(-t / 0.05),
        random,
        (x) => band.run(x),
      );
      return normalize(out, 0.25);
    }
    case "starter": {
      // Electric starter cranking the engine through its compression strokes.
      let phase = 0;
      const low = new Low(rate);
      for (let i = 0; i < out.length; i++) {
        const t = i / rate;
        const motor = 300 + 140 * Math.min(1, t / 0.3);
        phase += (2 * Math.PI * motor) / rate;
        const fade =
          Math.min(1, t / 0.03) * Math.min(1, (out.length / rate - t) / 0.05);
        const cycle = (t * 9.5) % 1;
        const compression = Math.exp(-cycle / 0.12);
        out[i] =
          fade *
          (0.12 * Math.sign(Math.sin(phase)) * 0.5 +
            0.08 * Math.sin(phase * 2.01) +
            compression *
              (0.7 * Math.sin((2 * Math.PI * 52 * cycle) / 9.5) +
                low.run(random() * 2 - 1, 500) * 1.6));
      }
      return normalize(out, 0.5);
    }
    case "outdoor-space": {
      // Impulse response for open countryside: sparse early echoes off
      // hedgerows and buildings, then a darkening diffuse tail.
      const low = new Low(rate);
      for (let i = 0; i < out.length; i++) {
        const t = i / rate;
        out[i] =
          low.run(random() * 2 - 1, 5000 * Math.exp(-t / 0.6) + 300) *
          Math.exp(-t / 0.55) *
          0.6;
      }
      for (const [time, gain] of [
        [0, 1],
        [0.19, 0.35],
        [0.43, 0.25],
        [0.77, 0.15],
      ])
        out[Math.floor(time * rate)] += gain;
      return normalize(out, 0.9);
    }
  }
}

/** Mono 16-bit PCM WAV, used by the offline preview tool. */
export function wav(samples: Float32Array, rate: number) {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      data.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  data.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, rate, true);
  data.setUint32(28, rate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  text(36, "data");
  data.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) =>
    data.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true),
  );
  return new Uint8Array(data.buffer);
}
