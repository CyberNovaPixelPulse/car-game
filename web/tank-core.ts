import type { CrewRole } from "./crew";
import type { GameCore, GameStart } from "./game-runtime";
import {
  LOAD,
  MODE,
  loaderCanWork,
  CROUCH,
  FIRE,
  STOP_JAM,
  stopJam,
  createWeaponState,
  fireWeapon,
  stepWeapon,
  validWeapon,
  type WeaponState,
} from "./tank-weapons";

export const DRIVE = { forward: 1, reverse: 2, left: 4, right: 8 } as const;
export const AIM = { left: 0, right: 1, up: 2, down: 3 } as const;
export const AIMING = {
  impulse: 0.18,
  maxYawRate: 0.85,
  maxPitchRate: 0.5,
  drag: 0.23,
  minPitch: -0.18,
  maxPitch: 0.5,
} as const;
export const BATTLEFIELD = {
  limit: 42,
  tankRadius: 3.4,
  cover: [
    { x: 0, z: -18, width: 12, depth: 1.4, height: 3 },
    { x: -15, z: -9, width: 2, depth: 14, height: 2.5 },
    { x: 18, z: -24, width: 9, depth: 8, height: 7 },
    { x: 14, z: 16, width: 8, depth: 2, height: 2.5 },
  ],
} as const;
export interface TankState {
  version: 1;
  time: number;
  weapon: WeaponState;
  turret: { yaw: number; pitch: number; yawRate: number; pitchRate: number };
  tank: {
    x: number;
    z: number;
    yaw: number;
    speed: number;
    turnRate: number;
    blocked: boolean;
  };
}
const initial = (seed = 1): TankState => ({
  version: 1,
  time: 0,
  weapon: createWeaponState(seed),
  turret: { yaw: 0, pitch: 0, yawRate: 0, pitchRate: 0 },
  tank: { x: 0, z: 0, yaw: 0, speed: 0, turnRate: 0, blocked: false },
});
const approach = (value: number, target: number, amount: number) =>
  value < target
    ? Math.min(target, value + amount)
    : Math.max(target, value - amount);

/** Host-owned tank rules. Presentation reads the same snapshots on each crew client. */
export class TankCore implements GameCore<TankState> {
  private state = initial();
  private controls = new Map<number, number>();
  present: (state: TankState, participant: number) => void = () => {};
  constructor(private roleOf: (participant: number) => CrewRole | undefined) {}
  start(options: GameStart) {
    this.state = initial(options.seed);
    this.controls.clear();
  }
  input(participant: number, keys: number) {
    this.controls.set(
      participant,
      this.roleOf(participant) === "driver"
        ? keys & 15
        : this.roleOf(participant) === "loader"
          ? keys & (15 | LOAD | CROUCH)
          : 0,
    );
  }
  action(participant: number, action: number) {
    if (this.roleOf(participant) === "loader" && action === MODE) {
      const w = this.state.weapon;
      if (loaderCanWork(w, this.state.time))
        w.mode = w.mode === "loading" ? "machine-gun" : "loading";
      return;
    }
    if (this.roleOf(participant) === "loader" && action === STOP_JAM) {
      stopJam(this.state.weapon, this.state.time);
      return;
    }
    if (this.roleOf(participant) !== "gunner") return;
    if (action === FIRE) {
      fireWeapon(
        this.state.weapon,
        {
          ...this.state.tank,
          yaw: this.state.tank.yaw + this.state.turret.yaw,
          pitch: this.state.turret.pitch,
        },
        this.state.time,
      );
      return;
    }
    const t = this.state.turret;
    const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));
    if (action === AIM.left || action === AIM.right)
      t.yawRate = clamp(
        t.yawRate + (action === AIM.right ? 1 : -1) * AIMING.impulse,
        AIMING.maxYawRate,
      );
    else if (action === AIM.up || action === AIM.down)
      t.pitchRate = clamp(
        t.pitchRate + (action === AIM.up ? 1 : -1) * AIMING.impulse,
        AIMING.maxPitchRate,
      );
  }
  connected(participant: number, connected: boolean) {
    if (!connected) this.controls.delete(participant);
  }
  step(elapsed: number) {
    if (!Number.isFinite(elapsed) || elapsed <= 0) return;
    // Preserve elapsed gameplay time under slow rendering. Small physics steps
    // prevent tunnelling without lengthening loader timers at low frame rates.
    let remaining = elapsed;
    while (remaining > 0) {
      const dt = Math.min(remaining, 0.05);
      this.advance(dt);
      remaining -= dt;
    }
  }
  private advance(dt: number) {
    this.state.time += dt;
    let loading = false;
    let loaderKeys = 0;
    this.state.weapon.crouching = false;
    for (const [participant, held] of this.controls)
      if (this.roleOf(participant) === "loader") {
        loading = Boolean(held & LOAD);
        loaderKeys = held;
        this.state.weapon.crouching =
          this.state.time >= this.state.weapon.stunnedUntil &&
          Boolean(held & CROUCH);
      }
    const w = this.state.weapon;
    if (w.mode === "machine-gun" && loaderCanWork(w, this.state.time)) {
      w.mg.yaw = (w.mg.yaw + (Number(Boolean(loaderKeys & DRIVE.right)) - Number(Boolean(loaderKeys & DRIVE.left))) * dt * 0.8 + Math.PI * 2) % (Math.PI * 2);
      w.mg.pitch = Math.max(-0.6, Math.min(0.8, w.mg.pitch + (Number(Boolean(loaderKeys & DRIVE.forward)) - Number(Boolean(loaderKeys & DRIVE.reverse))) * dt * 0.6));
    }
    stepWeapon(
      this.state.weapon,
      loading,
      dt,
      this.state.time,
      BATTLEFIELD.cover,
    );
    const turret = this.state.turret;
    turret.yaw =
      (turret.yaw + turret.yawRate * dt + Math.PI * 2) % (Math.PI * 2);
    turret.pitch = Math.max(
      AIMING.minPitch,
      Math.min(AIMING.maxPitch, turret.pitch + turret.pitchRate * dt),
    );
    if (
      (turret.pitch === AIMING.minPitch && turret.pitchRate < 0) ||
      (turret.pitch === AIMING.maxPitch && turret.pitchRate > 0)
    )
      turret.pitchRate = 0;
    turret.yawRate = approach(turret.yawRate, 0, AIMING.drag * dt);
    turret.pitchRate = approach(turret.pitchRate, 0, AIMING.drag * dt);
    const t = this.state.tank;
    let keys = 0;
    for (const [participant, held] of this.controls)
      if (this.roleOf(participant) === "driver") keys = held;
    const propulsion =
      Number(Boolean(keys & DRIVE.forward)) -
      Number(Boolean(keys & DRIVE.reverse));
    const steering =
      Number(Boolean(keys & DRIVE.right)) - Number(Boolean(keys & DRIVE.left));
    t.speed = approach(
      t.speed,
      propulsion * (propulsion < 0 ? 3 : 6),
      dt * (propulsion ? 2.6 : 3.5),
    );
    t.turnRate = approach(t.turnRate, steering * 0.65, dt * 1.4);
    t.yaw = (t.yaw + t.turnRate * dt + Math.PI * 2) % (Math.PI * 2);
    const x = t.x + Math.sin(t.yaw) * t.speed * dt;
    const z = t.z - Math.cos(t.yaw) * t.speed * dt;
    const r = BATTLEFIELD.tankRadius;
    const outside =
      Math.abs(x) + r > BATTLEFIELD.limit ||
      Math.abs(z) + r > BATTLEFIELD.limit;
    const collision = BATTLEFIELD.cover.some(
      (c) =>
        x + r > c.x - c.width / 2 &&
        x - r < c.x + c.width / 2 &&
        z + r > c.z - c.depth / 2 &&
        z - r < c.z + c.depth / 2,
    );
    t.blocked = (outside || collision) && Math.abs(t.speed) > 0.01;
    if (t.blocked) t.speed = 0;
    else {
      t.x = x;
      t.z = z;
    }
  }
  draw(participant: number) {
    this.present(this.state, participant);
  }
  view() {
    return this.state;
  }
  snapshot() {
    return JSON.stringify(this.state);
  }
  restore(snapshot: string) {
    const next: TankState = JSON.parse(snapshot);
    if (
      next.version !== 1 ||
      !next.tank ||
      !next.turret ||
      !validWeapon(next.weapon) ||
      ![
        next.time,
        next.turret.yaw,
        next.turret.pitch,
        next.turret.yawRate,
        next.turret.pitchRate,
        next.tank.x,
        next.tank.z,
        next.tank.yaw,
        next.tank.speed,
        next.tank.turnRate,
      ].every(Number.isFinite) ||
      typeof next.tank.blocked !== "boolean"
    )
      throw new Error("坦克戰況格式不符，請重新加入房間。");
    this.state = next;
  }
}
