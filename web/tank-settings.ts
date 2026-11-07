/** Approved starting balance. Geometry/map data and fixed five-second stun stay outside tuning. */
export const TANK_RULES = { maxHp: 100, waves: 3 } as const;
export const REPAIR_RULES = {
  hpPerSecond: 2,
  damageWait: 3,
  stoppedSpeed: 0.01,
  stoppedTurnRate: 0.01,
} as const;
export const DRIVING = {
  reverse: 3,
  forward: 6,
  acceleration: 2.6,
  coast: 3.5,
  turnRate: 0.65,
  turnAcceleration: 1.4,
} as const;
export const AIMING = {
  impulse: 0.18,
  maxYawRate: 0.85,
  maxPitchRate: 0.5,
  drag: 0.23,
  minPitch: -0.18,
  maxPitch: 0.5,
} as const;
export const MG_AIMING = {
  yawSpeed: 0.8,
  pitchSpeed: 0.6,
  minPitch: -0.6,
  maxPitch: 0.8,
} as const;
export const JAM_RULES = {
  chance: 0.25,
  progress: 0.4,
  width: 0.24,
  speed: 0.65,
  retry: 1,
  zoneStart: 0.12,
  zoneSpan: 0.52,
} as const;
export const WEAPON_TIMING = { load: 3, eject: 0.8 } as const;
export const SHELL_DAMAGE = {
  he: { direct: 100, radius: 5, splash: 60 },
  ap: { direct: 180, radius: 0, splash: 0 },
  smoke: { direct: 0, radius: 0, splash: 0 },
} as const;
export const BALLISTICS = { speed: 32, gravity: 9.81, lifetime: 5 } as const;
export const MG_RULES = {
  burst: 5,
  cooldown: 3,
  cooling: 0.3,
  interval: 0.1,
  damage: 1,
  range: 100,
} as const;
export const SMOKE_SECONDS = 8;
export const SMOKE_RADIUS = 5;
export const LAST_SEEN_SECONDS = 2.5;
export const ENEMY_RULES = {
  hp: { panzer: 200, tiger: 360 },
  speed: { panzer: 1.25, tiger: 0.9 },
  turn: { panzer: 0.7, tiger: 0.45 },
  damage: { panzer: 6, tiger: 10 },
  cooldown: { panzer: 7, tiger: 9 },
  searchFrequency: 0.8,
  searchAmplitude: 0.6,
  searchStop: 6,
  fightingStop: 11,
  fireRange: 34,
  alignment: 0.06,
  warning: 1.6,
  projectileSpeed: 23,
  projectileLifetime: 5,
  waveCooldownReduction: 0.15,
  spawnGrace: 12,
  initialTigerGrace: 18,
} as const;
/** Recovery is real wall time; transport timings are not gameplay balance. */
export const RECONNECT_GRACE_MS = 60_000;
export const TRANSPORT = {
  open: 18_000,
  handshake: 10_000,
  retry: 650,
  heartbeat: 1_000,
  stale: 6_500,
  snapshot: 50,
} as const;

/** Presentation lifetime on the shared gameplay clock; these cues do not affect damage. */
export const FIRING_FEEDBACK = { cannon: 0.18, machineGun: 0.07 } as const;
