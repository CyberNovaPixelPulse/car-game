import type { CrewRole } from "./crew";
import type { TankState } from "./tank-core";
import { AIMING, DRIVING } from "./tank-settings";
import type { ShellType } from "./tank-weapons";
import { BattleSounds, type PlayOptions } from "./tank-battle-audio";
import { VARIANTS, renderOneShot, type OneShot } from "./tank-audio-synth";

export interface TankAudioFrame {
  role: CrewRole;
  /** The crew member's own sound switch. */
  enabled: boolean;
  /** False while the battle is paused; continuous layers fall silent. */
  active: boolean;
}

/** M4A3 Sherman, Ford GAA V8: idle and governed speeds. */
const ENGINE = { idle: 650, governed: 2600, cylinders: 8 } as const;
/** Audible track-link spacing on the sprocket, metres. */
const LINK_PITCH = 0.34;
/**
 * US tank crews: the loader slaps the gunner's shoulder and yells "UP!" once
 * the breech closes. Speech engines read "HE" as a word, so it is spelled out.
 */
const CALLOUTS: Record<ShellType, string[]> = {
  he: ["H! E! UP!", "UP! H E loaded!", "H E in, UP!"],
  ap: ["A! P! UP!", "UP! A P loaded!", "A P in, UP!"],
  smoke: ["Smoke, UP!", "UP! Smoke loaded!"],
};
/** Prefer a male US voice; Edge/Windows "Natural" voices sound least robotic. */
const VOICE_PREFERENCE =
  /(guy|christopher|eric|roger|steffan|andrew|brian|davis|tony|jason|ryan|david|mark|alex|aaron|fred)/i;
/** Sounds made inside the turret are not muffled by the armour. */
const INTERIOR = new Set<OneShot>([
  "recoil",
  "runout",
  "rattle",
  "breech",
  "ram",
  "rack",
  "handle",
  "case",
  "tick",
  "clunk",
  "click",
  "armour-hit",
]);

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

interface Graph {
  master: GainNode;
  cabin: BiquadFilterNode;
  space: ConvolverNode;
  spaceSend: GainNode;
  wind: GainNode;
  voice: AudioNode;
  sources: AudioScheduledSourceNode[];
  engine: {
    firing: OscillatorNode;
    lope: OscillatorNode;
    exhaust: BiquadFilterNode;
    drive: GainNode;
    tone: BiquadFilterNode;
    level: GainNode;
    fan: BiquadFilterNode;
    fanLevel: GainNode;
  };
  tracks: {
    rumble: GainNode;
    grind: GainNode;
    squeal: GainNode;
  };
  turret: {
    whine: OscillatorNode;
    whineHigh: OscillatorNode;
    whineLevel: GainNode;
    gearRate: OscillatorNode;
    gearLevel: GainNode;
  };
}

/**
 * Presentation-only tank sound. Continuous layers follow the snapshot's
 * motion; one-shots fire on snapshot edges. Nothing here feeds back into rules.
 */
export class TankVehicleAudio {
  private context?: AudioContext;
  private graph?: Graph;
  private buffers = new Map<string, AudioBuffer>();
  private recorded = new Map<string, AudioBuffer | null>();
  private recordedLoad?: Promise<void>;
  private primed = false;
  private enabled = true;
  private timers: number[] = [];
  private last = {
    time: 0,
    speed: 0,
    shots: 0,
    chamber: "empty" as TankState["weapon"]["chamber"],
    step: 0,
    failed: false,
  };
  private load = 0;
  private strain = 0;
  private rpm: number = ENGINE.idle;
  private ignitionAt = Number.POSITIVE_INFINITY;
  private nextClack = 0;
  private nextTick = 0;
  private traversing = false;
  private duckUntil = 0;
  private outside = false;
  private battle = new BattleSounds();
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof speechSynthesis !== "undefined") {
      const pick = () => (this.voices = speechSynthesis.getVoices());
      pick();
      speechSynthesis.addEventListener?.("voiceschanged", pick);
    }
  }

  /** Danger beeps must stay audible over the engine: dip the tank briefly. */
  duck(seconds = 0.45) {
    if (!this.context || !this.graph) return;
    this.duckUntil = this.context.currentTime + seconds;
    this.graph.master.gain.setTargetAtTime(
      1.24 * 0.4,
      this.context.currentTime,
      0.015,
    );
  }

  /** Station changed or battle left: tear down the graph; the next frame rebuilds it. */
  reset() {
    this.stop();
    this.primed = false;
    this.battle = new BattleSounds();
  }

  stop() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    const graph = this.graph;
    this.graph = undefined;
    if (!graph || !this.context) return;
    const now = this.context.currentTime;
    graph.master.gain.cancelScheduledValues(now);
    graph.master.gain.setTargetAtTime(0, now, 0.04);
    setTimeout(() => {
      for (const source of graph.sources)
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      graph.master.disconnect();
    }, 250);
  }

  present(
    state: TankState,
    audio: AudioContext | undefined,
    frame: TankAudioFrame,
  ) {
    if (!audio || audio.state !== "running") {
      this.remember(state);
      return;
    }
    if (audio !== this.context) {
      this.stop();
      this.context = audio;
      this.buffers.clear();
    }
    const fresh = !this.graph;
    const graph = (this.graph ??= this.build(audio));
    const now = audio.currentTime;
    const w = state.weapon;
    const outside = frame.role === "loader" && w.mode === "machine-gun";
    this.outside = outside;

    if (this.enabled !== frame.enabled) {
      this.enabled = frame.enabled;
      if (!frame.enabled && typeof speechSynthesis !== "undefined")
        speechSynthesis.cancel();
    }
    const ducked = now < this.duckUntil ? 0.4 : 1;
    graph.master.gain.setTargetAtTime(
      frame.enabled ? 1.24 * ducked : 0,
      now,
      ducked < 1 ? 0.015 : 0.12,
    );
    // Closed hatches cut the highs; a loader up on the machine gun hears the open field.
    graph.cabin.frequency.setTargetAtTime(outside ? 15000 : 2600, now, 0.12);
    graph.spaceSend.gain.setTargetAtTime(outside ? 0.55 : 0.06, now, 0.12);
    // Wind over the hull: barely there behind armour, a steady gust outside.
    graph.wind.gain.setTargetAtTime(outside ? 0.09 : 0.012, now, 0.3);

    if (fresh) {
      // A new battle starts with a cold engine; a station switch mid-battle does not.
      if (state.time < 1.5) {
        this.play("starter", now + 0.05, { gain: 0.8 });
        this.ignitionAt = now + 0.95;
      } else this.ignitionAt = now;
    }
    if (!this.primed) {
      this.primed = true;
      this.remember(state);
      this.continuous(state, frame, graph, now, 0);
      return;
    }
    const dt = state.time - this.last.time;
    this.continuous(state, frame, graph, now, dt);
    if (frame.enabled) {
      this.events(state, outside, now);
      this.battle.present(
        state,
        { role: frame.role, outside },
        now,
        (kind, at, options) => this.play(kind, at, options),
      );
    } else this.battle.remember(state);
    this.remember(state);
  }

  private remember(state: TankState) {
    this.battle.remember(state);
    const w = state.weapon;
    this.last = {
      time: state.time,
      speed: state.tank.speed,
      shots: w.shotsFired,
      chamber: w.chamber,
      step: Math.floor(w.loadProgress * 4),
      failed: state.battle.failed,
    };
  }

  private continuous(
    state: TankState,
    frame: TankAudioFrame,
    graph: Graph,
    now: number,
    dt: number,
  ) {
    const { tank, turret } = state;
    const alive = !state.battle.failed;
    const running = alive && frame.active && now >= this.ignitionAt;
    const speed = clamp01(Math.abs(tank.speed) / DRIVING.forward);
    const turn = clamp01(Math.abs(tank.turnRate) / DRIVING.turnRate);

    // Engine load: acceleration, steering and pushing against a wall.
    if (dt > 0) {
      const accel = (Math.abs(tank.speed) - Math.abs(this.last.speed)) / dt;
      const k = Math.min(1, dt * 6);
      this.load += (clamp01(accel / DRIVING.acceleration) - this.load) * k;
      this.strain = tank.blocked ? 1 : Math.max(0, this.strain - dt * 1.5);
    }
    const effort = clamp01(
      0.55 * speed + 0.5 * this.load + 0.2 * turn + 0.6 * this.strain,
    );
    let rpm = ENGINE.idle + (ENGINE.governed - ENGINE.idle) * effort;
    const sinceIgnition = now - this.ignitionAt;
    // Catching on the starter: flare to ~1400 rpm, then settle to idle.
    if (sinceIgnition >= 0 && sinceIgnition < 1.6)
      rpm = Math.max(rpm, ENGINE.idle + 750 * Math.exp(-sinceIgnition / 0.45));
    // Slight idle lope: a big V8 never sits perfectly still.
    rpm *= 1 + (Math.random() - 0.5) * (0.035 - 0.025 * effort);
    this.rpm = rpm;
    const firing = (rpm / 60) * (ENGINE.cylinders / 2);
    const rev = clamp01((rpm - ENGINE.idle) / (ENGINE.governed - ENGINE.idle));
    const e = graph.engine;
    const ramp = 0.07;
    e.firing.frequency.setTargetAtTime(firing, now, ramp);
    e.lope.frequency.setTargetAtTime(firing / 2, now, ramp);
    e.exhaust.frequency.setTargetAtTime(firing * 3.2, now, ramp);
    e.drive.gain.setTargetAtTime(0.9 + 1.4 * this.load + this.strain, now, 0.1);
    e.tone.frequency.setTargetAtTime(
      260 + rev * 1500 + this.load * 900,
      now,
      0.1,
    );
    e.fan.frequency.setTargetAtTime(380 + rpm * 0.32, now, 0.2);
    e.fanLevel.gain.setTargetAtTime(running ? 0.018 + 0.03 * rev : 0, now, 0.2);
    if (!alive && !this.last.failed) {
      // Knocked out: the engine winds down and dies.
      e.firing.frequency.setTargetAtTime(14, now, 0.5);
      e.lope.frequency.setTargetAtTime(7, now, 0.5);
    }
    e.level.gain.setTargetAtTime(
      running ? 0.2 + 0.16 * rev + 0.08 * this.load : 0,
      now,
      alive ? 0.08 : 0.6,
    );

    const t = graph.tracks;
    const moving = running ? speed : 0;
    t.rumble.gain.setTargetAtTime(0.5 * moving, now, 0.1);
    t.grind.gain.setTargetAtTime(0.16 * moving, now, 0.1);
    t.squeal.gain.setTargetAtTime(
      running ? 0.09 * turn * (0.35 + 0.65 * speed) : 0,
      now,
      0.12,
    );
    // Individual link impacts, scheduled a little ahead of the audio clock.
    const linkRate = (Math.abs(tank.speed) / LINK_PITCH) * (running ? 1 : 0);
    if (linkRate < 0.6 || !frame.enabled) this.nextClack = now + 0.05;
    else {
      if (this.nextClack < now) this.nextClack = now + 0.01;
      let alternate = 0;
      while (this.nextClack < now + 0.12) {
        this.play("clack", this.nextClack, {
          gain: (0.08 + 0.12 * speed) * (alternate++ % 2 ? 0.7 : 1),
          pan: (Math.random() - 0.5) * 0.7,
          detune: (Math.random() - 0.5) * 200,
        });
        this.nextClack += (1 / linkRate) * (0.85 + Math.random() * 0.3);
      }
    }

    // Hydraulic turret traverse: pump whine rises with speed, gears chatter.
    const traverse = running
      ? clamp01(Math.abs(turret.yawRate) / AIMING.maxYawRate)
      : 0;
    const r = graph.turret;
    r.whine.frequency.setTargetAtTime(150 + 330 * traverse, now, 0.06);
    r.whineHigh.frequency.setTargetAtTime(
      (150 + 330 * traverse) * 2.03,
      now,
      0.06,
    );
    r.whineLevel.gain.setTargetAtTime(0.13 * Math.sqrt(traverse), now, 0.05);
    r.gearRate.frequency.setTargetAtTime(14 + 34 * traverse, now, 0.06);
    r.gearLevel.gain.setTargetAtTime(0.05 * traverse, now, 0.05);
    if (frame.enabled) {
      if (!this.traversing && traverse > 0.08) {
        this.traversing = true;
        this.play("clunk", now, { gain: 0.5 });
      } else if (this.traversing && traverse < 0.03) {
        this.traversing = false;
        this.play("clunk", now, { gain: 0.35, detune: -300 });
      }
      // Elevation is cranked by hand: ratchet ticks at the wheel speed.
      const elevation = running
        ? clamp01(Math.abs(turret.pitchRate) / AIMING.maxPitchRate)
        : 0;
      if (elevation < 0.05) this.nextTick = now + 0.02;
      else
        while (this.nextTick < now + 0.1) {
          this.play("tick", Math.max(now, this.nextTick), { gain: 0.6 });
          this.nextTick += 1 / (4 + 16 * elevation);
        }
    }
  }

  private events(state: TankState, outside: boolean, now: number) {
    const w = state.weapon;
    if (w.shotsFired > this.last.shots) this.cannon(outside, now);
    // The semi-automatic breech throws the case when the ejection completes.
    if (this.last.chamber === "ejecting" && w.chamber !== "ejecting") {
      // Breech block drops open, the extractor flicks the case out, and it
      // clangs onto the turret floor, bounces and rolls.
      this.play("breech", now, { gain: 0.35, detune: 500 });
      this.play("case", now + 0.09, { gain: 1, pan: -0.3 });
    }
    if (w.chamber === "loading" && this.last.chamber === "empty")
      this.play("rack", now, { gain: 0.5 });
    const step = Math.floor(w.loadProgress * 4);
    if (w.chamber === "loading" && step > this.last.step && step < 4)
      this.play("handle", now, { gain: 0.45 });
    if (w.chamber === "loaded" && this.last.chamber !== "loaded") {
      this.play("ram", now, { gain: 0.5 });
      this.play("breech", now + 0.13, { gain: 0.55 });
      this.callout(w.chamberShell ?? "he", now + 0.5);
    }
  }

  private cannon(outside: boolean, now: number) {
    const graph = this.graph!;
    if (this.recorded.get("cannon")) {
      // A recorded shot leads; the synthesized blast is blended underneath,
      // low-passed, so it only adds the chest-thumping pressure wave.
      this.play("cannon", now, {
        sample: "cannon",
        gain: outside ? 1.15 : 1,
        destination: graph.master,
      });
      if (outside)
        this.play("cannon", now, {
          sample: "cannon",
          gain: 0.7,
          destination: graph.space,
        });
      this.play("cannon", now, {
        gain: 0.9,
        lowpass: 240,
        destination: graph.master,
      });
    } else if (outside) {
      // Head out of the hatch: full crack plus the countryside answering back.
      this.play("cannon", now, { gain: 1.6, destination: graph.master });
      this.play("cannon", now, { gain: 0.9, destination: graph.space });
    } else this.play("cannon", now, { gain: 1.6 });
    this.play("recoil", now + 0.035, { gain: 0.6 });
    this.play("runout", now + 0.36, { gain: 0.45 });
    this.play("rattle", now + 0.05, { gain: 0.4 });
  }

  private callout(shell: ShellType, at: number) {
    const graph = this.graph!;
    const context = this.context!;
    this.play("click", at, { gain: 0.8 });
    const recorded =
      this.recorded.get(`loader-ready-${shell}`) ??
      this.recorded.get("loader-ready");
    if (recorded) {
      const source = context.createBufferSource();
      source.buffer = recorded;
      source.connect(graph.voice);
      source.start(at + 0.06);
      return;
    }
    if (typeof speechSynthesis === "undefined") return;
    const delay = Math.max(0, (at + 0.06 - context.currentTime) * 1000);
    this.timers.push(
      window.setTimeout(() => {
        if (!this.enabled || !this.graph) return;
        const lines = CALLOUTS[shell];
        const line = new SpeechSynthesisUtterance(
          lines[Math.floor(Math.random() * lines.length)],
        );
        const us = this.voices.filter((v) => /^en[-_]US$/i.test(v.lang));
        const voice =
          us.find(
            (v) =>
              /natural|online/i.test(v.name) && VOICE_PREFERENCE.test(v.name),
          ) ??
          us.find((v) => VOICE_PREFERENCE.test(v.name)) ??
          us[0] ??
          this.voices.find((v) => v.lang.toLowerCase().startsWith("en"));
        if (voice) line.voice = voice;
        line.lang = voice?.lang ?? "en-US";
        // Yelled over the engine in the heat of battle: fast and pitched up.
        line.rate = 1.35;
        line.pitch = 1.3;
        line.volume = 1;
        speechSynthesis.cancel();
        speechSynthesis.speak(line);
      }, delay),
    );
  }

  private play(
    kind: OneShot,
    at: number,
    options: PlayOptions & { destination?: AudioNode } = {},
  ) {
    const graph = this.graph;
    const context = this.context;
    if (!graph || !context) return;
    // A requested recording that is not available plays nothing; callers
    // layer it over synthesis rather than relying on it.
    const recorded = options.sample
      ? this.recorded.get(options.sample)
      : undefined;
    if (options.sample && !recorded) return;
    const buffer =
      recorded ?? this.buffer(kind, Math.floor(Math.random() * VARIANTS[kind]));
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.detune.value = options.detune ?? (Math.random() - 0.5) * 60;
    const level = context.createGain();
    level.gain.value = options.gain ?? 1;
    const nodes: AudioNode[] = [source, level];
    let tail: AudioNode = source.connect(level);
    if (options.lowpass) {
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = options.lowpass;
      lowpass.Q.value = 0.5;
      tail = tail.connect(lowpass);
      nodes.push(lowpass);
    }
    if (options.pan) {
      const pan = context.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, options.pan));
      tail = tail.connect(pan);
      nodes.push(pan);
    }
    if (options.destination) tail.connect(options.destination);
    else if (INTERIOR.has(kind)) tail.connect(graph.master);
    else if (options.world && this.outside) {
      tail.connect(graph.master);
      tail.connect(graph.space);
    } else tail.connect(graph.cabin);
    source.start(Math.max(context.currentTime, at));
    source.onended = () => {
      for (const node of nodes) node.disconnect();
    };
  }

  private buffer(kind: OneShot, take: number) {
    const key = `${kind}:${take}`;
    let buffer = this.buffers.get(key);
    if (!buffer) {
      const context = this.context!;
      const samples = renderOneShot(kind, context.sampleRate, take);
      buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.copyToChannel(samples, 0);
      this.buffers.set(key, buffer);
    }
    return buffer;
  }

  private noise(context: AudioContext, brown: boolean) {
    const length = context.sampleRate * 3;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = brown ? (last + 0.02 * white) / 1.02 : white;
      data[i] = brown ? last * 3.5 : white;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  private build(context: AudioContext): Graph {
    const sources: AudioScheduledSourceNode[] = [];
    const start = <T extends AudioScheduledSourceNode>(node: T) => {
      sources.push(node);
      node.start();
      return node;
    };
    const gain = (value: number) => {
      const node = context.createGain();
      node.gain.value = value;
      return node;
    };
    const filter = (type: BiquadFilterType, frequency: number, q = 0.7) => {
      const node = context.createBiquadFilter();
      node.type = type;
      node.frequency.value = frequency;
      node.Q.value = q;
      return node;
    };

    // Soft-knee ceiling instead of a compressor: WebAudio compressors add
    // make-up gain, which would lift the engine bed over the danger beeps.
    const limiter = context.createWaveShaper();
    limiter.curve = ceiling();
    // No oversampling: its resampling filter rings past full scale on clamped peaks.
    limiter.oversample = "none";
    limiter.connect(context.destination);
    const master = gain(0);
    // The ceiling curve spans ±2 over WebAudio's ±1 input, so halve first.
    master.connect(gain(0.5)).connect(limiter);
    const cabin = filter("lowpass", 2600, 0.5);
    cabin.connect(master);
    const space = context.createConvolver();
    const ir = renderOneShot("outdoor-space", context.sampleRate);
    const irBuffer = context.createBuffer(1, ir.length, context.sampleRate);
    irBuffer.copyToChannel(ir, 0);
    space.buffer = irBuffer;
    const spaceSend = gain(0.06);
    space.connect(spaceSend).connect(master);
    // Crew intercom: narrow band, slightly overdriven.
    const voiceHigh = filter("highpass", 320);
    const voiceLow = filter("lowpass", 3300);
    const voiceGrit = context.createWaveShaper();
    voiceGrit.curve = curve(1.8);
    voiceHigh
      .connect(voiceLow)
      .connect(voiceGrit)
      .connect(gain(1.1))
      .connect(master);

    const white = start(this.noise(context, false));
    const whiteB = start(this.noise(context, false));
    const brown = start(this.noise(context, true));

    // Engine: firing pulses + half-order lope through a saturating exhaust.
    const firing = start(context.createOscillator());
    firing.setPeriodicWave(
      wave(context, [1, 0.75, 0.5, 0.55, 0.32, 0.28, 0.2, 0.22, 0.12, 0.1]),
    );
    const lope = start(context.createOscillator());
    lope.setPeriodicWave(wave(context, [1, 0.25, 0.45, 0.1, 0.2]));
    const drive = gain(1);
    const shaper = context.createWaveShaper();
    shaper.curve = curve(2.4);
    shaper.oversample = "2x";
    const tone = filter("lowpass", 400, 0.9);
    const level = gain(0);
    firing.connect(gain(0.38)).connect(drive);
    lope.connect(gain(0.3)).connect(drive);
    const exhaust = filter("bandpass", 200, 0.8);
    const pulsed = gain(0.55);
    firing.connect(gain(0.5)).connect(pulsed.gain);
    white.connect(exhaust).connect(pulsed).connect(drive);
    drive.connect(shaper).connect(tone).connect(level).connect(cabin);
    const fan = filter("bandpass", 600, 5);
    const fanLevel = gain(0);
    whiteB.connect(fan).connect(fanLevel).connect(cabin);

    // Tracks: ground rumble, gravel grind and the turning squeal.
    const rumble = gain(0);
    brown.connect(filter("lowpass", 150)).connect(rumble).connect(cabin);
    const grind = gain(0);
    whiteB
      .connect(filter("bandpass", 480, 1.2))
      .connect(grind)
      .connect(cabin);
    const squealBand = filter("bandpass", 2300, 14);
    const wobble = start(context.createOscillator());
    wobble.frequency.value = 2.7;
    wobble.connect(gain(220)).connect(squealBand.frequency);
    const squeal = gain(0);
    white.connect(squealBand).connect(squeal).connect(cabin);

    // Turret: hydraulic pump whine and gear-train chatter.
    const whine = start(context.createOscillator());
    whine.type = "sawtooth";
    const whineHigh = start(context.createOscillator());
    whineHigh.type = "square";
    const whineBand = filter("bandpass", 420, 2.5);
    whine.connect(whineBand);
    whineHigh.connect(gain(0.25)).connect(whineBand);
    const whineLevel = gain(0);
    whineBand.connect(whineLevel).connect(cabin);
    const gearRate = start(context.createOscillator());
    gearRate.type = "square";
    const gated = gain(0.5);
    gearRate.connect(gain(0.5)).connect(gated.gain);
    const gearLevel = gain(0);
    whiteB
      .connect(filter("bandpass", 1150, 1.6))
      .connect(gated)
      .connect(gearLevel)
      .connect(cabin);

    const gust = gain(0.5);
    const gustSlow = start(context.createOscillator());
    gustSlow.frequency.value = 0.09;
    gustSlow.connect(gain(0.35)).connect(gust.gain);
    const gustFast = start(context.createOscillator());
    gustFast.frequency.value = 0.37;
    gustFast.connect(gain(0.12)).connect(gust.gain);
    const wind = gain(0);
    white
      .connect(filter("lowpass", 520, 0.6))
      .connect(gust)
      .connect(wind)
      .connect(master);

    void this.loadRecorded(context);
    return {
      master,
      cabin,
      space,
      spaceSend,
      wind,
      voice: voiceHigh,
      sources,
      engine: { firing, lope, exhaust, drive, tone, level, fan, fanLevel },
      tracks: { rumble, grind, squeal },
      turret: { whine, whineHigh, whineLevel, gearRate, gearLevel },
    };
  }

  /**
   * Optional real recordings of the loader's call-out. Drop files into
   * public/audio/ (see its README); without them speech synthesis is used.
   */
  private loadRecorded(context: AudioContext) {
    this.recordedLoad ??= (async () => {
      const base = `${import.meta.env?.BASE_URL ?? "/"}audio/`;
      let files: Record<string, string> = {};
      try {
        const response = await fetch(`${base}manifest.json`);
        if (response.ok) {
          const manifest = await response.json();
          files = { ...manifest.callouts, ...manifest.samples };
        }
      } catch {
        return;
      }
      for (const [name, file] of Object.entries(files)) {
        if (typeof file !== "string" || !file) continue;
        try {
          const response = await fetch(base + file);
          if (response.ok)
            this.recorded.set(
              name,
              await context.decodeAudioData(await response.arrayBuffer()),
            );
        } catch {
          /* undecodable: fall back to speech */
        }
      }
    })();
    return this.recordedLoad;
  }
}

function wave(context: AudioContext, harmonics: number[]) {
  const imag = new Float32Array(harmonics.length + 1);
  harmonics.forEach((amplitude, i) => (imag[i + 1] = amplitude));
  return context.createPeriodicWave(new Float32Array(imag.length), imag);
}

/** Linear to 0.6, then a tanh knee that never exceeds full scale. */
function ceiling() {
  const points = new Float32Array(2048);
  for (let i = 0; i < points.length; i++) {
    const x = (i / (points.length - 1)) * 4 - 2;
    const a = Math.abs(x);
    points[i] =
      Math.sign(x) * (a < 0.6 ? a : 0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4));
  }
  return points;
}

function curve(drive: number) {
  const points = new Float32Array(1024);
  for (let i = 0; i < points.length; i++) {
    const x = (i / (points.length - 1)) * 2 - 1;
    points[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  return points;
}
