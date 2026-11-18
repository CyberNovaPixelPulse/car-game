import type { MotionSource, MotionStation } from "./tank-camera-motion";
import type { TankState } from "./tank-core";
import { DRIVING } from "./tank-settings";

const stationGain: Record<
  MotionStation,
  { inertia: number; vibration: number }
> = {
  driver: { inertia: 1, vibration: 0.85 },
  gunner: { inertia: 0.46, vibration: 0.36 },
  loading: { inertia: 0.72, vibration: 0.7 },
  repair: { inertia: 0.72, vibration: 0.7 },
  "machine-gun": { inertia: 0.82, vibration: 1.15 },
};

/** Yaw from hull-forward to this station's nominal line of sight. */
export function stationHullYaw(state: TankState, station: MotionStation) {
  if (station === "driver") return 0;
  if (station === "machine-gun") return state.weapon.mg.yaw;
  if (station === "gunner") return state.turret.yaw;
  // The interior eye looks across the turret at the breech, not down the barrel.
  return state.turret.yaw + Math.atan2(-1.4, 2.25);
}

interface Lean {
  position: number;
  velocity: number;
}

// Exact underdamped return for a constant target over this authority interval.
// The small overshoot is the crew settling after the hull stops accelerating.
function settle(lean: Lean, target: number, dt: number) {
  const decay = 6.5;
  const frequency = 8;
  const distance = lean.position - target;
  const sineWeight = (lean.velocity + decay * distance) / frequency;
  const angle = frequency * dt;
  const cosine = Math.cos(angle),
    sine = Math.sin(angle);
  const envelope = Math.exp(-decay * dt);
  const next = distance * cosine + sineWeight * sine;
  lean.position = target + envelope * next;
  lean.velocity =
    envelope *
    (frequency * (sineWeight * cosine - distance * sine) - decay * next);
}

export function createDrivingMotion(): MotionSource {
  let previousTime = -1;
  let previousSpeed = 0;
  let baseline = -1;
  let longitudinal: Lean = { position: 0, velocity: 0 };
  let lateral: Lean = { position: 0, velocity: 0 };
  return (state, station, since, mix) => {
    const { time, tank } = state;
    const dt = time - previousTime;
    if (since !== baseline || dt < 0 || dt > 0.35) {
      longitudinal = { position: 0, velocity: 0 };
      lateral = { position: 0, velocity: 0 };
    } else if (dt > 0) {
      const acceleration = (tank.speed - previousSpeed) / dt;
      // A collision can zero speed in one authority substep. That event has its
      // own feedback; even a snapshot received after the blocked tick is safe.
      const drive =
        !tank.blocked && Math.abs(acceleration) <= DRIVING.coast + 0.01
          ? acceleration / DRIVING.coast
          : 0;
      const turning = tank.turnRate / DRIVING.turnRate;
      settle(longitudinal, drive, dt);
      settle(
        lateral,
        -turning * (0.14 + (0.86 * tank.speed) / DRIVING.forward),
        dt,
      );
    }
    baseline = since;
    previousTime = time;
    previousSpeed = tank.speed;
    const { inertia, vibration } = stationGain[station];
    const yaw = stationHullYaw(state, station);
    const cos = Math.cos(yaw),
      sin = Math.sin(yaw);
    const back =
      (longitudinal.position * cos - lateral.position * sin) * inertia;
    const side =
      (lateral.position * cos + longitudinal.position * sin) * inertia;
    const head = mix.continuous;
    head.z += back * 0.042;
    head.x += side * 0.023;
    head.pitch += back * 0.023;
    head.roll -= side * 0.018;

    const travel = Math.min(
      1,
      Math.abs(tank.speed) / DRIVING.forward +
        (Math.abs(tank.turnRate) / DRIVING.turnRate) * 0.16,
    );
    const idle = Math.sin(time * 2 * Math.PI * 2.2);
    const tracks =
      travel *
      (0.7 * Math.sin(time * 2 * Math.PI * 6.8) +
        0.3 * Math.sin(time * 2 * Math.PI * 9.1));
    head.y += vibration * (0.001 * idle + 0.007 * tracks);
    head.pitch += vibration * (0.0007 * idle + 0.0033 * tracks);
    head.roll += vibration * 0.0024 * tracks;
  };
}
