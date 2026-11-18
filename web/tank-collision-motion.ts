import type { MotionSource } from "./tank-camera-motion";
import { DRIVING } from "./tank-settings";
import { stationHeading } from "./tank-station-heading";

export const addCollision: MotionSource = (state, station, since, mix) => {
  const { impact, blocked } = state.tank;
  if (blocked) {
    // A low, continuous shudder while pushing, independent of the impact envelope.
    mix.continuous.pitch += 0.0018 * Math.sin(state.time * 54);
    mix.continuous.y += 0.0025 * Math.sin(state.time * 69);
  }
  if (!impact || impact.at <= since) return;
  const age = state.time - impact.at;
  if (age < 0 || age >= 0.55) return;
  const intensity = Math.min(1, impact.normalSpeed / DRIVING.forward);
  const kick =
    intensity * Math.sin(age * 23) * Math.exp(-age * 6.2) * (1 - age / 0.55);
  const angle = impact.heading - stationHeading(state, station);
  const forward = kick * Math.cos(angle);
  const right = kick * Math.sin(angle);
  mix.impact.z -= forward * 0.075;
  mix.impact.pitch -= forward * 0.076;
  mix.impact.x += right * 0.06;
  mix.impact.roll -= right * 0.04;
};
