import type { MotionSource } from "./tank-camera-motion";
import { stationHeading } from "./tank-station-heading";
import { SHELL_IMPACT_SECONDS } from "./tank-weapons";

export const addNearbyBlasts: MotionSource = (
  state,
  station,
  since,
  mix,
  time,
) => {
  const eyeYaw = stationHeading(state, station);
  const seatGain =
    station === "machine-gun" ? 1.15 : station === "driver" ? 0.85 : 1;
  function addWave(x: number, z: number, at: number, strength: number) {
    const age = time - at;
    if (at <= since + 1e-8 || age < 0 || age >= 0.46) return;
    const dx = state.tank.x - x,
      dz = state.tank.z - z;
    const distance = Math.hypot(dx, dz);
    const attenuation = Math.max(0, 1 - distance / 46) ** 2;
    if (!attenuation) return;
    const phase = age / 0.46;
    const kick =
      Math.sin(phase * 14) *
      Math.exp(-phase * 4.6) *
      (1 - phase) *
      attenuation *
      strength *
      seatGain;
    const relative = Math.atan2(dx, -dz) - eyeYaw;
    const side = distance > 0.001 ? Math.sin(relative) : 0;
    const back = distance > 0.001 ? -Math.cos(relative) : 0;
    mix.impact.y += kick * 0.018;
    mix.impact.x += kick * side * 0.027;
    mix.impact.z += kick * back * 0.032;
    mix.impact.pitch += kick * (0.006 + back * 0.033);
    mix.impact.yaw -= kick * side * 0.032;
    mix.impact.roll -= kick * side * 0.022;
  }

  for (const event of state.battle.shellEvents) {
    if (event.kind !== "hull-hit")
      addWave(event.x, event.z, event.at, event.kind === "muzzle" ? 0.8 : 0.6);
  }
  for (const strike of state.weapon.impacts) {
    const strength =
      strike.shell === "he" ? 1 : strike.shell === "ap" ? 0.6 : 0.35;
    addWave(strike.x, strike.z, strike.until - SHELL_IMPACT_SECONDS, strength);
  }
};
