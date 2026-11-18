import type { MotionSource } from "./tank-camera-motion";
import { stationHeading } from "./tank-station-heading";
import { ENEMY_RULES } from "./tank-settings";

/** Project the incoming impulse into the occupied seat, even when its turret is turned. */
export const addTankHit: MotionSource = (state, station, since, mix) => {
  for (const hit of state.battle.shellEvents) {
    if (hit.kind !== "hull-hit") continue;
    const age = state.time - hit.at;
    if (hit.at <= since || age < 0 || age >= 0.64) continue;
    const phase = age / 0.64;
    const pulse =
      Math.min(1, age / 0.055) *
      Math.cos(phase * 12) *
      Math.exp(-phase * 4.8) *
      (1 - phase);
    const severity = Math.min(1, hit.damage / ENEMY_RULES.damage.tiger);
    const seatGain =
      station === "machine-gun" ? 1.15 : station === "gunner" ? 0.9 : 1;
    const kick = pulse * severity * seatGain;
    const relative = hit.heading - stationHeading(state, station);
    const right = Math.sin(relative) * kick;
    const back = -Math.cos(relative) * kick;
    mix.impact.x += right * 0.06;
    mix.impact.z += back * 0.075;
    mix.impact.pitch += back * 0.08;
    mix.impact.yaw -= right * 0.065;
    mix.impact.roll -= right * 0.035;
  }
};
