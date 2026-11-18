import type { CrewRole } from "./crew";
import type { TankState } from "./tank-core";
import type { OneShot } from "./tank-audio-synth";

/** Speed of sound: far guns are heard after their flash. */
const SOUND_SPEED = 343;

export interface PlayOptions {
  gain?: number;
  pan?: number;
  detune?: number;
  /** Low-pass cutoff for distance; omitted means unfiltered. */
  lowpass?: number;
  /** A battlefield sound: muffled by the hull, open-air when the loader is up top. */
  world?: boolean;
}
export type Play = (kind: OneShot, at: number, options?: PlayOptions) => void;

export interface Listener {
  role: CrewRole;
  outside: boolean;
}

/**
 * Battlefield sounds read from snapshot edges: enemy guns, incoming rounds,
 * our shell impacts, knocked-out tanks, the roof machine gun, repair tools
 * and the distant front. Presentation only.
 */
export class BattleSounds {
  private enemyFlash = new Map<number, number>();
  private enemyHp = new Map<number, number>();
  private impacts = new Set<number>();
  private passed = new Set<number>();
  private hitAt = -100;
  private mgShots = 0;
  private nextArtillery = 0;
  private nextRepair = 0;

  remember(state: TankState) {
    for (const t of state.weapon.targets) {
      this.enemyFlash.set(t.id, t.flashUntil);
      this.enemyHp.set(t.id, t.hp);
    }
    for (const i of state.weapon.impacts) this.impacts.add(i.id);
    for (const p of state.battle.projectiles) this.passed.add(p.id);
    this.hitAt = state.battle.lastHitAt;
    this.mgShots = state.weapon.mg.shots;
  }

  present(state: TankState, listener: Listener, now: number, play: Play) {
    const { tank, weapon: w, battle, turret } = state;
    const facing =
      tank.yaw +
      (listener.role === "driver"
        ? 0
        : listener.outside
          ? w.mg.yaw
          : turret.yaw);
    const place = (x: number, z: number) => {
      const dx = x - tank.x;
      const dz = z - tank.z;
      const distance = Math.hypot(dx, dz);
      const bearing = Math.atan2(dx, -dz) - facing;
      return {
        distance,
        pan: Math.sin(bearing) * 0.85,
        // Behind the listener sounds a touch duller, as the head shadows it.
        lowpass:
          (600 + 15000 * Math.exp(-distance / 28)) *
          (Math.cos(bearing) < 0 ? 0.7 : 1),
        gain: Math.max(0.18, Math.min(1, 14 / Math.max(1, distance))),
        at: now + distance / SOUND_SPEED,
      };
    };

    for (const t of w.targets) {
      const flash = this.enemyFlash.get(t.id);
      if (
        flash !== undefined &&
        t.flashUntil > flash &&
        t.flashUntil > state.time
      ) {
        const p = place(t.x, t.z);
        play("enemy-cannon", p.at, {
          world: true,
          gain: p.gain * 1.3,
          pan: p.pan,
          lowpass: p.lowpass,
          // The Tiger's 88 is deeper than the Panzer IV's 75.
          detune: t.kind === "tiger" ? -250 : 0,
        });
      }
      const hp = this.enemyHp.get(t.id);
      if (hp !== undefined && hp > 0 && t.hp <= 0) {
        const p = place(t.x, t.z);
        play("cook-off", p.at, {
          world: true,
          gain: p.gain * 1.2,
          pan: p.pan,
          lowpass: p.lowpass,
        });
      }
      this.enemyFlash.set(t.id, t.flashUntil);
      this.enemyHp.set(t.id, t.hp);
    }

    for (const impact of w.impacts) {
      if (this.impacts.has(impact.id)) continue;
      this.impacts.add(impact.id);
      const p = place(impact.x, impact.z);
      play(
        impact.shell === "he"
          ? "explosion"
          : impact.shell === "ap"
            ? "ap-impact"
            : "smoke-pop",
        p.at,
        { world: true, gain: p.gain * 1.2, pan: p.pan, lowpass: p.lowpass },
      );
    }
    if (this.impacts.size > 64)
      this.impacts = new Set(w.impacts.map((i) => i.id));

    // Enemy rounds that miss but pass close by crack overhead.
    for (const shot of battle.projectiles) {
      if (this.passed.has(shot.id)) continue;
      const p = place(shot.x, shot.z);
      if (p.distance < 7) {
        this.passed.add(shot.id);
        play("near-miss", now, { world: true, gain: 0.9, pan: p.pan });
      }
    }
    if (this.passed.size > 64)
      this.passed = new Set(battle.projectiles.map((p) => p.id));

    if (battle.lastHitAt !== this.hitAt && battle.lastDamage) {
      // Struck armour rings through the whole crew compartment.
      play("armour-hit", now, {
        gain: 0.75 + 0.03 * battle.lastDamage,
        detune: battle.lastDamage >= 10 ? -150 : 0,
      });
    }
    this.hitAt = battle.lastHitAt;

    const shots = w.mg.shots - this.mgShots;
    for (let i = 0; i < Math.min(shots, 3); i++) {
      const at = now + i * 0.1;
      play("mg", at, {
        world: listener.outside,
        gain: listener.outside ? 0.85 : 0.6,
        pan: listener.outside ? 0.15 : 0,
      });
      if (Math.random() < 0.5)
        play("mg-brass", at + 0.06 + Math.random() * 0.1, {
          gain: listener.outside ? 0.7 : 0.35,
          pan: (Math.random() - 0.5) * 0.6,
        });
    }
    this.mgShots = w.mg.shots;

    if (state.repair.status === "repairing") {
      if (now >= this.nextRepair) {
        play(Math.random() < 0.6 ? "wrench" : "hammer", now, {
          gain: 0.6,
          pan: -0.3 + Math.random() * 0.2,
        });
        this.nextRepair = now + 0.55 + Math.random() * 0.7;
      }
    } else this.nextRepair = now + 0.2;

    // The wider front: guns far beyond this field, every so often.
    if (!battle.failed && !battle.won) {
      if (this.nextArtillery === 0)
        this.nextArtillery = now + 5 + Math.random() * 8;
      if (now >= this.nextArtillery) {
        const salvo = 1 + Math.floor(Math.random() * 3);
        const pan = (Math.random() - 0.5) * 1.4;
        for (let i = 0; i < salvo; i++)
          play("artillery", now + i * (0.4 + Math.random() * 0.9), {
            world: true,
            gain: 0.22 + Math.random() * 0.22,
            pan: pan + (Math.random() - 0.5) * 0.2,
            lowpass: 700,
          });
        this.nextArtillery = now + 9 + Math.random() * 18;
      }
    }
  }
}
