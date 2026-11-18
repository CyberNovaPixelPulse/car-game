import type { MotionSource } from "./tank-camera-motion";
import { AIMING, FIRING_FEEDBACK, MG_RULES } from "./tank-settings";

export const addMachineGunKick: MotionSource = (state, station, since, mix) => {
  if (station !== "machine-gun") return;
  const mg = state.weapon.mg;
  const firedAt = mg.flashUntil - FIRING_FEEDBACK.machineGun;
  if (!mg.shots || firedAt <= since + 1e-8) return;
  const phase = (state.time - firedAt) / MG_RULES.interval;
  if (phase < 0 || phase >= 1) return;

  // Each real round has a short, self-contained kick. Alternating the side
  // motion makes a burst readable without integrating an upward drift.
  const pulse = Math.min(phase * 9, 1) * (1 - phase) ** 2;
  const side = mg.shots % 2 ? pulse : -pulse;
  mix.impact.pitch += 0.012 * pulse;
  mix.impact.z += 0.014 * pulse;
  mix.impact.yaw += 0.004 * side;
  mix.impact.roll += 0.002 * side;
};

export function createTurretInertia(): MotionSource {
  let baseline = -1;
  let lastTime = -1;
  let followingYaw = 0;
  let followingPitch = 0;
  return (state, station, since, mix) => {
    if (station === "driver" || station === "machine-gun") return;
    const { yawRate, pitchRate } = state.turret;
    const dt = state.time - lastTime;
    if (baseline !== since || dt < 0 || dt > 0.35) {
      followingYaw = yawRate;
      followingPitch = pitchRate;
    } else if (dt > 0) {
      // The head follows the actual rotation with a short lag. At a steady
      // rate the lag in angular velocity decays, then reverses during braking.
      const follow = -Math.expm1(-dt / 0.095);
      followingYaw += (yawRate - followingYaw) * follow;
      followingPitch += (pitchRate - followingPitch) * follow;
    }
    lastTime = state.time;
    baseline = since;
    const yawLag = (yawRate - followingYaw) / AIMING.maxYawRate;
    const pitchLag = (pitchRate - followingPitch) / AIMING.maxPitchRate;
    const seat = station === "gunner" ? 1 : 0.75;
    mix.continuous.yaw += 0.075 * yawLag * seat;
    mix.continuous.roll -= 0.023 * yawLag * seat;
    mix.continuous.pitch -= 0.055 * pitchLag * seat;
  };
}
