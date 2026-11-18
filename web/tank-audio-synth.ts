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
  | "outdoor-space"
  | "enemy-cannon"
  | "armour-hit"
  | "near-miss"
  | "explosion"
  | "ap-impact"
  | "smoke-pop"
  | "cook-off"
  | "mg"
  | "m2"
  | "mg-brass"
  | "artillery"
  | "wrench"
  | "hammer"
  | "backfire"
  | "ricochet";

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
  "enemy-cannon",
  "armour-hit",
  "near-miss",
  "explosion",
  "ap-impact",
  "smoke-pop",
  "cook-off",
  "mg",
  "m2",
  "mg-brass",
  "artillery",
  "wrench",
  "hammer",
  "backfire",
  "ricochet",
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
  "enemy-cannon": 2,
  "armour-hit": 3,
  "near-miss": 2,
  explosion: 3,
  "ap-impact": 2,
  "smoke-pop": 1,
  "cook-off": 2,
  mg: 4,
  m2: 4,
  "mg-brass": 4,
  artillery: 3,
  wrench: 2,
  hammer: 3,
  backfire: 4,
  ricochet: 4,
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

/** Generic outdoor detonation: pressure thump, filtered blast, rolling tail. */
function blast(
  out: Float32Array,
  rate: number,
  random: () => number,
  low: number,
  body: number,
  tail: number,
  crack: number,
) {
  let phase = 0;
  const lp = new Low(rate);
  const roll = new Low(rate);
  let brown = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    phase +=
      (2 * Math.PI * (low * 0.5 + low * 1.6 * Math.exp(-t / 0.06))) / rate;
    const white = random() * 2 - 1;
    brown = brown * 0.997 + white * 0.04;
    out[i] += Math.tanh(
      1.5 *
        (Math.min(1, t / 0.003) *
          Math.exp(-t / (body * 1.5)) *
          Math.sin(phase) +
          lp.run(white, 150 + 2500 * Math.exp(-t / 0.04)) *
            Math.exp(-t / body) *
            3 +
          (t < 0.04 ? crack * white * Math.exp(-t / 0.006) : 0) +
          roll.run(brown, 110) * Math.exp(-t / tail) * 2.6),
    );
  }
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
    case: 2.6,
    clack: 0.09,
    tick: 0.045,
    clunk: 0.35,
    click: 0.14,
    starter: 1.5,
    "outdoor-space": 2.4,
    "enemy-cannon": 3,
    "armour-hit": 1.8,
    "near-miss": 0.6,
    explosion: 3,
    "ap-impact": 1,
    "smoke-pop": 2.2,
    "cook-off": 4,
    mg: 0.3,
    m2: 0.9,
    "mg-brass": 0.35,
    artillery: 4,
    wrench: 0.45,
    hammer: 0.5,
    backfire: 0.45,
    ricochet: 0.7,
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
      // Then it rolls across the floor plates: an irregular, fading rattle.
      for (
        let t = 0.66 + variant * 0.04;
        t < 1.9;
        t += 0.035 + random() * 0.07
      ) {
        const fade = Math.exp(-(t - 0.66) / 0.45);
        addModes(
          out,
          rate,
          t,
          brass.map(([f, d, a]) => [f * (1 + random() * 0.02), d * 0.15, a]),
          random,
          0.09 * fade * (0.5 + random()),
        );
      }
      return normalize(out, 0.75);
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
        const cycle = (t * 11) % 1;
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
    case "enemy-cannon":
      // 75 / 88 mm gun heard from tens of metres away: the crack is softer
      // and the ground carries a longer roll. Distance filtering is live.
      blast(out, rate, random, 34 + variant * 6, 0.22, 1.2, 0.5);
      return normalize(out, 0.95);
    case "armour-hit": {
      // An enemy round striking our hull: a bell-like armour clang from
      // inside, plus spall and loose kit rattling around the compartment.
      addModes(out, rate, 0, [[48, 0.12, 1.4]], random);
      steelHit(out, rate, 0, random, 88 + variant * 11, 0.55, 1.4);
      steelHit(out, rate, 0.002, random, 410 + variant * 40, 0.25, 0.6);
      const low = new Low(rate);
      addNoise(
        out,
        rate,
        0,
        0.3,
        (t) => 1.2 * Math.exp(-t / 0.05),
        random,
        (x) => low.run(x, 1800),
      );
      for (let n = 0; n < 12; n++)
        steelHit(
          out,
          rate,
          0.03 + random() * 0.7,
          random,
          700 + random() * 2600,
          0.015 + random() * 0.03,
          0.1 + random() * 0.25,
        );
      for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * 1.3);
      return normalize(out, 0.98);
    }
    case "near-miss": {
      // Supersonic shot passing close: a sharp N-wave crack then air tearing.
      const band = new Band(rate);
      for (let i = 0; i < out.length; i++) {
        const t = i / rate;
        const n = t < 0.0012 ? 1 - t / 0.0006 : 0;
        out[i] =
          n * 1.2 +
          band
            .tune(3200 - 2600 * Math.min(1, t / 0.4), 1.4)
            .run(random() * 2 - 1) *
            Math.min(1, t / 0.01) *
            Math.exp(-t / 0.16) *
            2.2;
      }
      return normalize(out, 0.8);
    }
    case "explosion":
      // High-explosive shell bursting downrange, with dirt falling back.
      blast(out, rate, random, 40 + variant * 7, 0.18, 0.9, 0.9);
      for (let n = 0; n < 25; n++) {
        const at = 0.25 + random() * 1.4;
        const band = new Band(rate).tune(500 + random() * 2500, 1.5);
        addNoise(
          out,
          rate,
          at,
          0.05,
          (t) => 0.08 * Math.exp(-t / 0.012),
          random,
          (x) => band.run(x) * 3,
        );
      }
      return normalize(out, 0.95);
    case "ap-impact":
      // Solid shot striking steel or masonry: a hard clang and a dull thud.
      steelHit(out, rate, 0, random, 190 + variant * 40, 0.3, 1);
      blast(out, rate, random, 60, 0.05, 0.3, 0.4);
      return normalize(out, 0.85);
    case "smoke-pop": {
      // Burster charge popping open, then the canister hissing out smoke.
      blast(out, rate, random, 70, 0.04, 0.15, 0.3);
      const band = new Band(rate).tune(5200, 0.8);
      addNoise(
        out,
        rate,
        0.05,
        2.1,
        (t) => 0.22 * Math.min(1, t / 0.15) * Math.exp(-t / 0.9),
        random,
        (x) => band.run(x) * 2,
      );
      return normalize(out, 0.7);
    }
    case "cook-off": {
      // Knocked-out tank: the main blast, then its ammunition crackling off.
      blast(out, rate, random, 30, 0.35, 1.6, 0.8);
      for (let n = 0; n < 18; n++) {
        const at = 0.4 + random() * 3.2;
        const sub = new Float32Array(Math.ceil(0.3 * rate));
        blast(sub, rate, random, 70 + random() * 60, 0.025, 0.08, 0.6);
        const first = Math.floor(at * rate);
        const gain = 0.15 + random() * 0.35;
        for (let i = 0; i < sub.length && first + i < out.length; i++)
          out[first + i] += sub[i] * gain;
      }
      return normalize(out, 0.95);
    }
    case "mg": {
      // Browning .50 cal on the turret roof: muzzle crack, low punch and the
      // heavy bolt slamming forward.
      blast(out, rate, random, 85 + variant * 6, 0.025, 0.09, 1);
      steelHit(out, rate, 0.012, random, 520 + variant * 35, 0.03, 0.35);
      return normalize(out, 0.9);
    }
    case "m2": {
      // M2HB "Ma Deuce", matched to a range recording: each round is a deep
      // chest thump (energy around 120-160 Hz) with a flat, broadband crack
      // on top, the heavy bolt slamming the receiver, and an outdoor slap
      // that is still ringing when the next round goes at ~410 rounds/min.
      blast(out, rate, random, 128 + variant * 7, 0.04, 0.18, 1.5);
      {
        let phase = 0;
        for (let i = 0; i < out.length; i++) {
          const t = i / rate;
          phase += (2 * Math.PI * (140 + 60 * Math.exp(-t / 0.01))) / rate;
          out[i] +=
            0.9 *
            Math.min(1, t / 0.002) *
            Math.exp(-t / 0.035) *
            Math.sin(phase);
        }
      }
      steelHit(out, rate, 0.004, random, 360 + variant * 25, 0.05, 0.45);
      steelHit(out, rate, 0.075, random, 610 + variant * 30, 0.03, 0.22);
      {
        const band = new Band(rate).tune(900, 0.7);
        addNoise(
          out,
          rate,
          0.11 + variant * 0.01,
          0.4,
          (t) => 0.25 * Math.min(1, t / 0.01) * Math.exp(-t / 0.09),
          random,
          (x) => band.run(x),
        );
      }
      return normalize(out, 0.95);
    }
    case "mg-brass": {
      // Spent .50 cases bouncing on the turret roof.
      const ring: Mode[] = [
        [2150 + variant * 140, 0.09, 0.5],
        [4870 + variant * 260, 0.06, 0.35],
        [7340, 0.04, 0.2],
      ];
      addModes(out, rate, 0, ring, random);
      addModes(out, rate, 0.07 + variant * 0.015, ring, random, 0.4);
      addModes(out, rate, 0.14 + variant * 0.02, ring, random, 0.18);
      return normalize(out, 0.3);
    }
    case "artillery":
      // Distant guns well beyond the field: almost all low-frequency roll.
      blast(out, rate, random, 24 + variant * 4, 0.6, 1.6, 0);
      {
        const low = new Low(rate);
        const low2 = new Low(rate);
        for (let i = 0; i < out.length; i++)
          out[i] = low2.run(low.run(out[i], 220), 220);
      }
      return normalize(out, 0.7);
    case "wrench": {
      // Ratchet spanner: a quick run of pawl clicks with a little drift.
      const clicks = 6 + variant * 2;
      for (let n = 0; n < clicks; n++)
        steelHit(
          out,
          rate,
          n * (0.045 + random() * 0.01),
          random,
          1400 + random() * 300,
          0.008,
          0.4 + random() * 0.2,
        );
      return normalize(out, 0.35);
    }
    case "ricochet": {
      // A bullet glancing off armour: sharp tick, then a falling whine.
      steelHit(out, rate, 0, random, 1800 + variant * 300, 0.01, 0.8);
      let phase = 0;
      const start = 3600 + variant * 500;
      for (let i = 0; i < out.length; i++) {
        const t = i / rate;
        phase += (2 * Math.PI * start * Math.exp(-t / 0.35)) / rate;
        out[i] +=
          0.35 *
          Math.min(1, t / 0.01) *
          Math.exp(-t / 0.22) *
          Math.sin(phase + 0.6 * Math.sin(phase * 0.031));
      }
      return normalize(out, 0.6);
    }
    case "backfire":
      // Unburnt fuel lighting off in the exhaust stacks: a sharp pop with
      // a short, hollow boom from the pipe.
      blast(out, rate, random, 70 + variant * 15, 0.035, 0.12, 1.2);
      addModes(
        out,
        rate,
        0,
        [
          [95 + variant * 12, 0.06, 0.8],
          [210, 0.03, 0.3],
        ],
        random,
      );
      return normalize(out, 0.9);
    case "hammer":
      // Hammer tapping a track pin or hull fitting.
      addModes(out, rate, 0, [[180 + variant * 25, 0.03, 0.8]], random);
      steelHit(out, rate, 0, random, 640 + variant * 90, 0.12, 0.8);
      return normalize(out, 0.5);
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
