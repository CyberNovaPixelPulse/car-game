import type { TankState } from "./tank-core";

/** Short, original synthesized metal/transient sounds. Snapshot edges are cues, never rule clocks. */
export class TankMechanicalAudio {
  private chamber = "empty";
  private jam = false;
  private progressStep = 0;
  private shots = 0;
  private cooling = false;
  private mode = "loading";
  reset() {
    this.chamber = "empty";
    this.jam = false;
    this.progressStep = 0;
    this.shots = 0;
    this.cooling = false;
    this.mode = "loading";
  }
  present(state: TankState, audio: AudioContext | undefined, enabled: boolean) {
    const w = state.weapon;
    const step = Math.floor(w.loadProgress * 6);
    const cooling = state.time < w.mg.coolUntil;
    const play = (kind: "slide" | "latch" | "case" | "shot" | "jam") => {
      if (enabled && audio?.state === "running") this.strike(audio, kind);
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
