import {
  createRepairState,
  stepRepair,
  stopRepairCalibration,
  validRepair,
  type RepairState,
} from "./tank-repair";
import {
  AIMING,
  DRIVING,
  MG_AIMING,
  TANK_RULES,
  ENEMY_RULES,
} from "./tank-settings";
import {
  createEnemyBattle,
  createWaveTargets,
  stepEnemies,
  validEnemyShellEvents,
  type EnemyBattle,
} from "./tank-enemies";
import {
  MG_FIRE,
  BOW_FIRE,
  stepMachineGun,
  stepBowGun,
} from "./tank-machine-gun";
import type { CrewRole } from "./crew";
import type { GameCore, GameStart } from "./game-runtime";
import {
  LOAD,
  MODE,
  CROUCH,
  FIRE,
  SELECT_HE,
  SELECT_AP,
  SELECT_SMOKE,
  STOP_JAM,
  stopJam,
  loaderCanWork,
  createWeaponState,
  createEnemyTarget,
  fireWeapon,
  stepWeapon,
  validWeapon,
  type WeaponState,
} from "./tank-weapons";
import {
  collisionHeading,
  validHullImpact,
  type HullImpact,
} from "./tank-collision";
import { validViewAspect } from "./tank-battle-view";
import {
  createTeamIntel,
  stepTeamIntel,
  validTeamIntel,
  type TeamIntel,
} from "./tank-intel";
import {
  FIRST_OCCUPATION_ENEMY_ID,
  stepOccupation,
  type OccupationLevel,
  type OccupationState,
  type TankBattlefield,
} from "./tank-occupation";
import { terrainHeightAt } from "./tank-terrain";
import { restingHullPitch, stepHullPitch } from "./tank-suspension";
import { cannonWorldPose } from "./tank-world-pose";

export const DRIVE = { forward: 1, reverse: 2, left: 4, right: 8 } as const;
/** Role-scoped held bits; cannon fire remains a separate discrete action. */
export const AIM = { up: 1, down: 2, left: 4, right: 8 } as const;
export { AIMING } from "./tank-settings";
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

export { HILL_192_LEVEL } from "./hill192-level";

export interface TankState {
  version: 6;
  intel: TeamIntel;
  repair: RepairState;
  time: number;
  weapon: WeaponState;
  battle: EnemyBattle;
  occupation?: OccupationState;
  turret: { yaw: number; pitch: number; yawRate: number; pitchRate: number };
  tank: {
    hp: number;
    x: number;
    y?: number;
    z: number;
    yaw: number;
    pitch?: number;
    speed: number;
    turnRate: number;
    blocked: boolean;
    impact: HullImpact | null;
  };
}
const initial = (seed = 1): TankState => ({
  version: 6,
  intel: createTeamIntel(),
  repair: createRepairState(seed),
  time: 0,
  weapon: createWeaponState(seed),
  battle: createEnemyBattle(),
  turret: { yaw: 0, pitch: 0, yawRate: 0, pitchRate: 0 },
  tank: {
    hp: TANK_RULES.maxHp,
    x: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    turnRate: 0,
    blocked: false,
    impact: null,
  },
});
const approach = (value: number, target: number, amount: number) =>
  value < target
    ? Math.min(target, value + amount)
    : Math.max(target, value - amount);

/** Host-owned tank rules. Presentation reads the same snapshots on each crew client. */
export class TankCore implements GameCore<TankState> {
  private state = initial();
  private contact?: { cover: number; heading: number; x: number; z: number };
  private controls = new Map<number, number>();
  private aspects = new Map<number, number>();
  private participants: number[] = [];
  private paused = false;
  private practice = false;
  private occupationLevel?: OccupationLevel;
  private round = 0;
  get battlefield(): TankBattlefield {
    return this.occupationLevel?.battlefield ?? BATTLEFIELD;
  }

  get practiceRound() {
    return this.round;
  }
  present: (state: TankState, participant: number) => void = () => {};
  constructor(private roleOf: (participant: number) => CrewRole | undefined) {}
  start(options: GameStart) {
    this.state = initial(options.seed);
    this.contact = undefined;
    this.practice = !!options.practice;
    this.occupationLevel = this.practice ? options.occupation : undefined;
    this.round = 0;
    const level = this.occupationLevel;
    if (level) {
      const { x, z, yaw } = level.spawn;
      Object.assign(this.state.tank, { x, z, yaw });
      if (level.battlefield.terrain) {
        const { terrain } = level.battlefield;
        const { tank, turret } = this.state;
        tank.y = terrainHeightAt(terrain, x, z);
        tank.pitch = restingHullPitch(terrain, tank);
        // Begin level with the horizon, then let the live hull take the gun
        // with it. The range demonstration uses the original starting sight.
        turret.pitch = Math.max(
          AIMING.minPitch,
          Math.min(AIMING.maxPitch, -tank.pitch),
        );
      }
      this.state.occupation = {
        levelId: level.id,
        progress: 0,
        phase: "approach",
      };
      this.state.weapon.targets = level.enemies.map((enemy, index) => {
        const target = createEnemyTarget(
          enemy.kind,
          FIRST_OCCUPATION_ENEMY_ID + index,
          enemy.x,
          enemy.z,
          enemy.readyAfter ?? ENEMY_RULES.spawnGrace,
        );
        if (enemy.yaw !== undefined) target.yaw = target.turretYaw = enemy.yaw;
        if (enemy.deployment)
          target.phase =
            enemy.deployment.mode === "guard" ? "guarding" : "patrolling";
        if (level.battlefield.terrain)
          target.y = terrainHeightAt(
            level.battlefield.terrain,
            enemy.x,
            enemy.z,
          );
        return target;
      });
    } else if (this.practice) this.state.weapon.targets = [];
    this.controls.clear();
    this.aspects.clear();
    this.participants = options.participants;
    this.paused = false;
  }
  startPracticeRound() {
    if (
      !this.practice ||
      this.occupationLevel ||
      this.paused ||
      this.state.battle.failed ||
      this.state.weapon.targets.some((target) => target.hp > 0)
    )
      return;
    const tank = this.state.tank;
    const positions = [
      [0, -13],
      [25, 4],
      [0, 28],
      [-26, 18],
      [-28, -28],
    ];
    const [x, z] =
      positions.find(([x, z]) => Math.hypot(x - tank.x, z - tank.z) >= 10) ??
      positions[0];
    this.round++;
    this.state.weapon.targets = [
      createEnemyTarget(
        "panzer",
        1000 + this.round,
        x,
        z,
        this.state.time + ENEMY_RULES.spawnGrace,
      ),
    ];
    this.state.intel = createTeamIntel();
    this.observe();
  }
  pause(paused: boolean) {
    this.paused = paused;
    if (paused && this.state.repair.calibration.result === "active")
      this.state.repair.calibration.suspended = true;
  }
  input(participant: number, keys: number, aspect?: number) {
    if (this.state.battle.failed || this.state.battle.won) return;
    if (validViewAspect(aspect)) this.aspects.set(participant, aspect);
    if (this.roleOf(participant) === "loader") {
      const w = this.state.weapon;
      w.crouching = this.state.time >= w.stunnedUntil && Boolean(keys & CROUCH);
    }
    this.controls.set(
      participant,
      this.roleOf(participant) === "driver"
        ? keys & (15 | BOW_FIRE)
        : this.roleOf(participant) === "gunner"
          ? keys & 15
          : this.roleOf(participant) === "loader"
            ? keys & (15 | LOAD | CROUCH | MG_FIRE)
            : 0,
    );
    // Ordered input precedes the discrete work action. A release/crouch must
    // settle an active calibration before a following Space can award HP.
    if (!this.paused && this.roleOf(participant) === "loader")
      stepRepair(this.state, Boolean(keys & LOAD), 0);
  }
  action(participant: number, action: number) {
    if (this.state.battle.failed || this.state.battle.won) return;
    if (this.roleOf(participant) === "loader" && action === MODE) {
      const w = this.state.weapon;
      if (loaderCanWork(w, this.state.time)) {
        // A retained MG buffer is not a currently mounted observer. Require
        // fresh actual projection metadata when exterior work is entered.
        this.aspects.delete(participant);
        w.mode =
          w.mode === "loading"
            ? "machine-gun"
            : w.mode === "machine-gun"
              ? "repair"
              : "loading";
      }
      stepRepair(this.state, false, 0);
      return;
    }
    if (
      this.roleOf(participant) === "loader" &&
      (action === SELECT_HE || action === SELECT_AP || action === SELECT_SMOKE)
    ) {
      const w = this.state.weapon;
      if (
        w.mode === "loading" &&
        loaderCanWork(w, this.state.time) &&
        w.chamberShell === null
      )
        w.selectedShell =
          action === SELECT_HE ? "he" : action === SELECT_AP ? "ap" : "smoke";
      return;
    }
    if (this.roleOf(participant) === "loader" && action === STOP_JAM) {
      if (this.state.weapon.mode === "repair")
        stopRepairCalibration(this.state);
      else stopJam(this.state.weapon, this.state.time);
      return;
    }
    if (this.roleOf(participant) !== "gunner") return;
    if (action === FIRE) {
      fireWeapon(
        this.state.weapon,
        cannonWorldPose(this.state.tank, this.state.turret),
        this.state.time,
      );
      return;
    }
  }
  connected(participant: number, connected: boolean) {
    if (!connected) this.controls.delete(participant);
  }
  step(elapsed: number) {
    if (this.paused || !Number.isFinite(elapsed) || elapsed <= 0) return;
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
    if (this.state.battle.failed || this.state.battle.won) return;
    const battlefield = this.battlefield;
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
    stepWeapon(
      this.state.weapon,
      loading,
      dt,
      this.state.time,
      battlefield.cover,
      battlefield.terrain,
    );
    if (w.mode === "machine-gun" && loaderCanWork(w, this.state.time)) {
      w.mg.yaw =
        (w.mg.yaw +
          (Number(Boolean(loaderKeys & DRIVE.right)) -
            Number(Boolean(loaderKeys & DRIVE.left))) *
            dt *
            MG_AIMING.yawSpeed +
          Math.PI * 2) %
        (Math.PI * 2);
      w.mg.pitch = Math.max(
        MG_AIMING.minPitch,
        Math.min(
          MG_AIMING.maxPitch,
          w.mg.pitch +
            (Number(Boolean(loaderKeys & DRIVE.forward)) -
              Number(Boolean(loaderKeys & DRIVE.reverse))) *
              dt *
              MG_AIMING.pitchSpeed,
        ),
      );
    }
    stepMachineGun(
      w,
      {
        ...this.state.tank,
        yaw: this.state.tank.yaw + w.mg.yaw,
        pitch: w.mg.pitch,
      },
      Boolean(loaderKeys & MG_FIRE),
      dt,
      this.state.time,
      battlefield.cover,
      battlefield.terrain,
    );
    let driverKeys = 0;
    for (const [participant, held] of this.controls)
      if (this.roleOf(participant) === "driver") driverKeys = held;
    stepBowGun(
      w,
      this.state.tank,
      Boolean(driverKeys & BOW_FIRE),
      dt,
      this.state.time,
      battlefield.cover,
      battlefield.terrain,
    );
    stepEnemies(
      this.state.battle,
      this.state.weapon.targets,
      this.state.tank,
      battlefield.cover,
      dt,
      this.state.time,
      w.smoke,
      battlefield.terrain,
      this.occupationLevel?.enemies,
    );
    // Resolve incoming damage first: zero HP always defeats the crew, even on
    // the step that destroys the last enemy. Weapon/MG/smoke work continues
    // across waves; only a new round starts from initial().
    if (this.state.battle.failed) {
      stepRepair(this.state, false, dt);
      this.observe();
      return;
    }
    if (
      !this.practice &&
      this.state.weapon.targets.every((enemy) => enemy.hp <= 0)
    ) {
      if (this.state.battle.wave === TANK_RULES.waves) {
        this.state.battle.won = true;
        stepRepair(this.state, false, dt);
        this.observe();
        return;
      }
      this.state.battle.wave++;
      this.state.weapon.targets = createWaveTargets(
        this.state.battle.wave,
        this.state.time,
      );
    }
    const turret = this.state.turret;
    let aimKeys = 0;
    for (const [participant, held] of this.controls)
      if (this.roleOf(participant) === "gunner") aimKeys = held;
    const horizontal =
      Number(Boolean(aimKeys & AIM.right)) -
      Number(Boolean(aimKeys & AIM.left));
    const vertical =
      Number(Boolean(aimKeys & AIM.up)) - Number(Boolean(aimKeys & AIM.down));
    turret.yawRate = approach(
      turret.yawRate,
      horizontal * AIMING.maxYawRate,
      (AIMING.maxYawRate / AIMING.rampSeconds) * dt,
    );
    turret.pitchRate = approach(
      turret.pitchRate,
      vertical * AIMING.maxPitchRate,
      (AIMING.maxPitchRate / AIMING.rampSeconds) * dt,
    );
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
    const t = this.state.tank;
    let keys = 0;
    for (const [participant, held] of this.controls)
      if (this.roleOf(participant) === "driver") keys = held;
    const propulsion =
      Number(Boolean(keys & DRIVE.forward)) -
      Number(Boolean(keys & DRIVE.reverse));
    const steering =
      Number(Boolean(keys & DRIVE.right)) - Number(Boolean(keys & DRIVE.left));
    const previousSpeed = t.speed;
    t.speed = approach(
      t.speed,
      propulsion * (propulsion < 0 ? DRIVING.reverse : DRIVING.forward),
      dt * (propulsion ? DRIVING.acceleration : DRIVING.coast),
    );
    t.turnRate = approach(
      t.turnRate,
      steering * DRIVING.turnRate,
      dt * DRIVING.turnAcceleration,
    );
    t.yaw = (t.yaw + t.turnRate * dt + Math.PI * 2) % (Math.PI * 2);
    const x = t.x + Math.sin(t.yaw) * t.speed * dt;
    const z = t.z - Math.cos(t.yaw) * t.speed * dt;
    const r = battlefield.tankRadius;
    const outside =
      Math.abs(x) + r > battlefield.limit ||
      Math.abs(z) + r > battlefield.limit;
    const coverIndex = battlefield.cover.findIndex(
      (c) =>
        x + r > c.x - c.width / 2 &&
        x - r < c.x + c.width / 2 &&
        z + r > c.z - c.depth / 2 &&
        z - r < c.z + c.depth / 2,
    );
    t.blocked = (outside || coverIndex >= 0) && Math.abs(t.speed) > 0.01;
    if (t.blocked) {
      const cover = outside ? -1 : coverIndex;
      const heading = collisionHeading(
        t,
        x,
        z,
        r,
        battlefield.limit,
        battlefield.cover[cover],
      );
      if (
        !this.contact ||
        this.contact.cover !== cover ||
        this.contact.heading !== heading
      ) {
        t.impact = {
          id: (t.impact?.id ?? 0) + 1,
          at: this.state.time,
          heading,
          normalSpeed: Math.abs(t.speed * Math.cos(t.yaw - heading)),
        };
      }
      this.contact = { cover, heading, x: t.x, z: t.z };
      t.speed = 0;
    } else {
      // Release only after moving away from the contact. A key release or a
      // tiny successful substep toward the same wall is not a new collision.
      const contact = this.contact;
      if (contact) {
        const away =
          (contact.x - x) * Math.sin(contact.heading) -
          (contact.z - z) * Math.cos(contact.heading);
        const obstacle = battlefield.cover[contact.cover];
        const sideFace = Math.abs(contact.heading) === Math.PI / 2;
        const clearedEnd =
          obstacle &&
          (sideFace
            ? Math.abs(z - obstacle.z) > obstacle.depth / 2 + r + 0.035
            : Math.abs(x - obstacle.x) > obstacle.width / 2 + r + 0.035);
        if (away > 0.035 || clearedEnd) this.contact = undefined;
      }
      t.x = x;
      t.z = z;
      if (battlefield.terrain) t.y = terrainHeightAt(battlefield.terrain, x, z);
    }
    if (battlefield.terrain)
      t.pitch = stepHullPitch(battlefield.terrain, t, previousSpeed, dt);
    const occupation = this.state.occupation;
    if (occupation && this.occupationLevel) {
      stepOccupation(
        occupation,
        this.occupationLevel,
        t,
        this.state.weapon.targets,
        dt,
      );
      if (occupation.phase === "secured") this.state.battle.won = true;
    }
    stepRepair(this.state, loading && !this.state.battle.won, dt);
    this.observe();
  }
  private observe() {
    stepTeamIntel(
      this.state,
      this.participants.flatMap((participant) => {
        const role = this.roleOf(participant);
        return role ? [{ role, aspect: this.aspects.get(participant) }] : [];
      }),
      this.battlefield.cover,
      this.battlefield.terrain,
    );
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
      next.version !== 6 ||
      (this.occupationLevel
        ? !next.occupation ||
          next.occupation.levelId !== this.occupationLevel.id ||
          !Number.isFinite(next.occupation.progress) ||
          next.occupation.progress < 0 ||
          next.occupation.progress > 1 ||
          ![
            "approach",
            "capturing",
            "contested",
            "retreating",
            "secured",
          ].includes(next.occupation.phase)
        : next.occupation !== undefined) ||
      !validTeamIntel(next.intel, next.time, next.weapon?.targets) ||
      !validRepair(next.repair, next.time) ||
      !next.battle ||
      typeof next.battle.failed !== "boolean" ||
      typeof next.battle.won !== "boolean" ||
      !Number.isInteger(next.battle.wave) ||
      next.battle.wave < 1 ||
      next.battle.wave > TANK_RULES.waves ||
      !validEnemyShellEvents(
        next.battle.shellEvents,
        next.time,
        next.battle.shots,
      ) ||
      !Array.isArray(next.battle.projectiles) ||
      ![next.battle.shots, next.battle.lastHitAt, next.battle.lastDamage].every(
        Number.isFinite,
      ) ||
      !next.battle.projectiles.every(
        (p) =>
          [p.id, p.x, p.y, p.z, p.vx, p.vz, p.damage, p.age].every(
            Number.isFinite,
          ) &&
          (p.vy === undefined || Number.isFinite(p.vy)),
      ) ||
      !next.tank ||
      !validHullImpact(next.tank.impact, next.time) ||
      !next.turret ||
      !validWeapon(next.weapon) ||
      ![
        next.time,
        next.turret.yaw,
        next.turret.pitch,
        next.turret.yawRate,
        next.turret.pitchRate,
        next.tank.hp,
        next.tank.x,
        next.tank.z,
        next.tank.yaw,
        next.tank.speed,
        next.tank.turnRate,
      ].every(Number.isFinite) ||
      (next.tank.y !== undefined && !Number.isFinite(next.tank.y)) ||
      (next.tank.pitch !== undefined && !Number.isFinite(next.tank.pitch)) ||
      next.tank.hp < 0 ||
      next.tank.hp > TANK_RULES.maxHp ||
      typeof next.tank.blocked !== "boolean"
    )
      throw new Error("坦克戰況格式不符，請重新加入房間。");
    this.state = next;
  }
}
