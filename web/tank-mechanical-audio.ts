import { ratchetAngle, RATCHET_REGRIP_SECONDS } from "./tank-ratchet";
import type { CrewRole } from "./crew";
import { lastCannonFiredAt } from "./tank-weapons";
import type { TankState } from "./tank-core";

/** Short, original synthesized metal/transient sounds. Snapshot edges are cues, never rule clocks. */
export class TankMechanicalAudio {
  private cannonShots?: number;
  private cannonBuffer?: AudioBuffer;
  private ratchetBuffer?: AudioBuffer;
  private lastTooth?: number;
  private regripEndsAt = 0;
  private chamber = "empty";
  private jam = false;
  private progressStep = 0;
  private shots = 0;
  private cooling = false;
  private mode = "loading";
  private calibrationId?: number;
  private calibrationResult = "idle";
  reset() {
    // The first valid snapshot seeds every edge before playback resumes.
    this.calibrationId = undefined;
    this.cannonShots = undefined;
    this.lastTooth = undefined;
    this.regripEndsAt = 0;
  }
  present(
    state: TankState,
    audio: AudioContext | undefined,
    enabled: boolean,
    role: CrewRole = "loader",
  ) {
    const w = state.weapon;
    const previousShots = this.cannonShots;
    this.cannonShots = w.shotsFired;
    if (
      role === "gunner" &&
      previousShots !== undefined &&
      w.shotsFired > previousShots &&
      enabled &&
      audio?.state === "running" &&
      state.time - lastCannonFiredAt(w) < 0.6
    ) {
      if (this.cannonBuffer?.sampleRate !== audio.sampleRate)
        this.cannonBuffer = cannonBlast(audio);
      playBuffer(audio, this.cannonBuffer);
    }
    if (role !== "loader") return;
    const calibration = state.repair.calibration;
    const audible =
      this.calibrationId !== undefined && enabled && audio?.state === "running";
    if (audible) {
      if (
        calibration.id !== this.calibrationId &&
        calibration.result === "active"
      )
        this.calibrationCue(audio, "active");
      else if (
        this.calibrationResult === "active" &&
        calibration.id === this.calibrationId &&
        ["success", "perfect", "failed"].includes(calibration.result)
      )
        this.calibrationCue(audio, calibration.result);
    }
    const { activeSeconds } = state.repair;
    const failed = calibration.result === "failed";
    // Success returns the hand on the game clock even when R is released.
    // After failure the hands reach again only as the host credits new work.
    const gripClock = failed ? activeSeconds : state.time;
    if (this.calibrationId !== calibration.id) this.regripEndsAt = 0;
    else if (
      this.calibrationResult === "active" &&
      calibration.result !== "active"
    )
      this.regripEndsAt = failed
        ? activeSeconds + RATCHET_REGRIP_SECONDS.failed
        : (calibration.confirmedAt ?? state.time) +
          RATCHET_REGRIP_SECONDS.success;
    const ratcheting =
      w.mode === "repair" &&
      state.repair.status === "repairing" &&
      calibration.result !== "active" &&
      gripClock >= this.regripEndsAt;
    const tooth = ratcheting
      ? Math.floor(ratchetAngle(activeSeconds) / (Math.PI / 12))
      : undefined;
    // A pawl clicks only on the upwards return. Seed the first tooth whenever
    // the hand takes up the tool, and never burst through missed network frames.
    if (
      audible &&
      tooth !== undefined &&
      this.lastTooth !== undefined &&
      tooth > this.lastTooth
    ) {
      if (this.ratchetBuffer?.sampleRate !== audio.sampleRate)
        this.ratchetBuffer = ratchetClick(audio);
      playBuffer(audio, this.ratchetBuffer);
    }
    this.lastTooth = tooth;
    this.calibrationId = calibration.id;
    this.calibrationResult = calibration.result;
    const step = Math.floor(w.loadProgress * 6);
    const cooling = state.time < w.mg.coolUntil;
    const play = (kind: "slide" | "latch" | "case" | "shot" | "jam") => {
      if (audible) this.strike(audio, kind);
    };
    if (w.chamber !== this.chamber)
      play(
        w.chamber === "loaded"
          ? "latch"
          : w.chamber === "ejecting"
            ? "case"
            : "slide",
      );
    else if (w.chamber === "loading" && step > this.progressStep) play("slide");
    if (w.jam.active && !this.jam) play("jam");
    if (w.mg.shots > this.shots) play("shot");
    if (cooling && !this.cooling) play("jam");
    if (w.mode !== this.mode) play("latch");
    this.chamber = w.chamber;
    this.jam = w.jam.active;
    this.progressStep = step;
    this.shots = w.mg.shots;
    this.cooling = cooling;
    this.mode = w.mode;
  }
  private calibrationCue(audio: AudioContext, result: string) {
    const notes =
      result === "perfect"
        ? [880, 1320, 1760]
        : result === "success"
          ? [760, 1040]
          : result === "failed"
            ? [220, 110]
            : [620, 930];
    notes.forEach((frequency, index) => {
      const start = audio.currentTime + index * 0.1;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.1);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    });
  }
  private strike(
    audio: AudioContext,
    kind: "slide" | "latch" | "case" | "shot" | "jam",
  ) {
    const start = audio.currentTime;
    const duration = kind === "slide" ? 0.16 : kind === "case" ? 0.22 : 0.09;
    const buffer = audio.createBuffer(
      1,
      Math.ceil(audio.sampleRate * duration),
      audio.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.exp((-i / data.length) * 6);
    const noise = audio.createBufferSource();
    noise.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value =
      kind === "shot" ? 480 : kind === "slide" ? 1600 : 2400;
    filter.Q.value = 0.65;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(kind === "shot" ? 0.22 : 0.12, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    noise.connect(filter).connect(gain).connect(audio.destination);
    noise.start(start);
    noise.stop(start + duration);
    noise.onended = () => {
      noise.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    if (kind === "slide") return;
    const ring = audio.createOscillator();
    ring.type = "sine";
    ring.frequency.setValueAtTime(
      kind === "jam" ? 320 : kind === "shot" ? 100 : 1250,
      start,
    );
    ring.frequency.exponentialRampToValueAtTime(
      kind === "shot" ? 45 : kind === "jam" ? 180 : 830,
      start + duration,
    );
    const ringGain = audio.createGain();
    ringGain.gain.setValueAtTime(0.07, start);
    ringGain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    ring.connect(ringGain).connect(audio.destination);
    ring.start(start);
    ring.stop(start + duration);
    ring.onended = () => {
      ring.disconnect();
      ringGain.disconnect();
    };
  }
}

// A pitched low body beneath the short crack keeps the cannon distinct from
// the existing small metallic shots, including on speakers with little bass.
function cannonBlast(audio: AudioContext) {
  const buffer = audio.createBuffer(
    1,
    Math.ceil(audio.sampleRate * 0.52),
    audio.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  const smoothing = 1 - Math.exp((-2 * Math.PI * 450) / audio.sampleRate);
  let rumble = 0;
  let phase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / audio.sampleRate;
    const noise = Math.random() * 2 - 1;
    rumble += (noise - rumble) * smoothing;
    phase += (2 * Math.PI * (46 + 100 * Math.exp(-t * 24))) / audio.sampleRate;
    const attack = Math.min(1, t / 0.002);
    const body =
      (0.28 * Math.sin(phase) + 0.11 * Math.sin(2 * phase)) * Math.exp(-t * 10);
    samples[i] =
      attack *
      (body +
        0.42 * noise * Math.exp(-t * 64) +
        0.49 * rumble * Math.exp(-t * 11));
  }
  return buffer;
}

function ratchetClick(audio: AudioContext) {
  const buffer = audio.createBuffer(
    1,
    Math.ceil(audio.sampleRate * 0.035),
    audio.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    const t = i / audio.sampleRate;
    const strike = (Math.random() * 2 - 1) * 0.13 * Math.exp(-t * 520);
    const ring =
      0.15 * Math.sin(2 * Math.PI * 2080 * t) +
      0.07 * Math.sin(2 * Math.PI * 3460 * t);
    samples[i] = Math.min(1, t / 0.0007) * (strike + ring * Math.exp(-t * 185));
  }
  return buffer;
}

function playBuffer(audio: AudioContext, buffer: AudioBuffer) {
  const sound = audio.createBufferSource();
  sound.buffer = buffer;
  sound.connect(audio.destination);
  sound.onended = () => sound.disconnect();
  sound.start(audio.currentTime);
}
