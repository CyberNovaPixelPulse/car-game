import { createDrivingMotion } from "./tank-driving-motion";
import type { TankState } from "./tank-core";
import type { CameraPreferences } from "./tank-motion-preferences";
import { FIRING_FEEDBACK } from "./tank-settings";

export type MotionStation = "driver" | "gunner" | TankState["weapon"]["mode"];

/** Metres and radians in the station eye's local right/up/back coordinate system. */
export interface HeadOffset {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  roll: number;
}
export const STILL_HEAD: Readonly<HeadOffset> = {
  x: 0,
  y: 0,
  z: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
};

const cannonGain: Record<MotionStation, number> = {
  driver: 0.76,
  gunner: 1,
  loading: 0.91,
  repair: 0.91,
  "machine-gun": 0.88,
};

function cannonPulse(age: number) {
  if (age < 0 || age >= 0.7) return 0;
  if (age < 0.09) return Math.sin(((Math.PI / 2) * age) / 0.09);
  const release = (age - 0.09) / 0.61;
  return Math.cos(release * 13) * Math.exp(-release * 5.6) * (1 - release);
}

export interface MotionMix {
  impact: HeadOffset;
  continuous: HeadOffset;
}

/** Each source adds its local offsets for the current game time. Ignore events
 * at or before the station baseline, including those supplied by reconnect. */
export type MotionSource = (
  state: TankState,
  station: MotionStation,
  since: number,
  mix: MotionMix,
) => void;

const addCannon: MotionSource = (state, station, since, mix) => {
  // The latest accepted shot is sufficient: ejection alone outlasts the envelope.
  const firedAt = state.weapon.flashUntil - FIRING_FEEDBACK.cannon;
  if (!state.weapon.shotsFired || firedAt <= since + 1e-8) return;
  const kick = cannonPulse(state.time - firedAt) * cannonGain[station];
  mix.impact.z += kick * 0.055;
  mix.impact.pitch += kick * 0.049;
  mix.impact.roll += kick * 0.009;
};

const cap: HeadOffset = {
  x: 0.04,
  y: 0.035,
  z: 0.065,
  pitch: 0.055,
  yaw: 0.045,
  roll: 0.024,
};
const axes = Object.keys(cap) as (keyof HeadOffset)[];

function compose(mix: MotionMix, preferences: CameraPreferences): HeadOffset {
  const head = { ...STILL_HEAD };
  let impactLevel = 0;
  for (const axis of axes) {
    impactLevel = Math.max(impactLevel, Math.abs(mix.impact[axis]) / cap[axis]);
  }
  const fineGain =
    preferences.continuous *
    (1 - 0.8 * Math.min(1, impactLevel * preferences.impact));
  for (const axis of axes) {
    const movement =
      (mix.impact[axis] * preferences.impact +
        mix.continuous[axis] * fineGain) *
      preferences.overall;
    head[axis] = Math.max(-cap[axis], Math.min(cap[axis], movement));
  }
  return head;
}

/** Compose fresh offsets for this game time. Re-reading a snapshot never adds a kick. */
export class CrewCameraMotion {
  private readonly sources: MotionSource[] = [addCannon, createDrivingMotion()];
  private station?: MotionStation;
  private since = 0;
  private lastTime = -1;
  private muted = true;

  sample(
    state: TankState,
    station: MotionStation,
    paused: boolean,
    preferences: CameraPreferences,
  ): Readonly<HeadOffset> {
    const muted = paused || !preferences.enabled || preferences.overall === 0;
    if (
      station !== this.station ||
      state.time < this.lastTime ||
      muted ||
      this.muted
    )
      this.since = state.time;
    this.station = station;
    this.lastTime = state.time;
    this.muted = muted;
    if (muted) return STILL_HEAD;

    const mix = { impact: { ...STILL_HEAD }, continuous: { ...STILL_HEAD } };
    for (const source of this.sources) source(state, station, this.since, mix);
    return compose(mix, preferences);
  }
}
