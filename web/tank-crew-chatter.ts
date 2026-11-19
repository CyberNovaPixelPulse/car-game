import type { TankState } from "./tank-core";
import type { ShellType } from "./tank-weapons";

/**
 * Crew intercom chatter in the style of a WWII Sherman crew: the commander's
 * fire commands, the gunner's "On the way!", the loader's "UP!", sensings
 * after each round and the shouting when the tank takes a hit. Everything is
 * derived from snapshots, so every crew member hears the same exchange.
 * Lines are original; the procedure (clock directions, "identified",
 * "on the way", "target", "short/over") is the US Army fire-command drill.
 */
export type Speaker = "commander" | "gunner" | "loader" | "driver";

/** Each voice gets its own register so the crew can be told apart. */
const VOICE: Record<Speaker, { pitch: number; rate: number; slot: number }> = {
  commander: { pitch: 0.75, rate: 1.12, slot: 0 },
  gunner: { pitch: 1.0, rate: 1.22, slot: 1 },
  loader: { pitch: 1.35, rate: 1.38, slot: 2 },
  driver: { pitch: 1.15, rate: 1.25, slot: 3 },
};
const VOICE_PREFERENCE =
  /(guy|christopher|eric|roger|steffan|andrew|brian|davis|tony|jason|ryan|david|mark|alex|aaron|fred)/i;

const pick = <T>(list: readonly T[]) =>
  list[Math.floor(Math.random() * list.length)];

const LINES = {
  spotted: [
    (d: string) => `Gunner! Tank! ${d}!`,
    (d: string) => `Tank, ${d}! Traverse, traverse!`,
    (d: string) => `Enemy tank, ${d}! Get on him!`,
    (d: string) => `Contact! ${d}! Panzer!`,
  ],
  tiger: [
    (d: string) => `Tiger! ${d}! Hit him in the side if you can!`,
    (d: string) => `Big one, ${d}! It's a Tiger!`,
  ],
  identified: ["Identified!", "I see him! Identified!", "Got him, identified!"],
  warning: [
    "He's traversing on us! Driver, move!",
    "He's laying on us! Get us moving!",
    "Watch it, he's aiming right at us!",
  ],
  fire: ["On the way!", "On the way!", "Firing! On the way!"],
  target: ["Target! Target!", "Hit! Good hit!", "Target! He's still moving!"],
  kill: [
    "Got him! He's burning!",
    "Brewed him up! Next target!",
    "Knocked him out! Great shot!",
    "That's a kill! Scratch one!",
  ],
  short: ["Short! Add fifty!", "Short! Bring it up!"],
  over: ["Over! Drop fifty!", "Over! Bring it down!"],
  wide: ["Missed! Adjust!", "Lost it! Re-lay, re-lay!"],
  hitUs: [
    "We're hit! Everybody okay?",
    "Hit! We're hit! Keep fighting!",
    "Damn, that one rang the bell!",
    "We took one! Is anybody hurt?",
  ],
  cleared: [
    "Cease fire! Area's clear. Good work, boys.",
    "That's all of 'em. Cease fire!",
  ],
  won: ["That's it! We held! We held 'em!"],
  lost: ["Bail out! Bail out!"],
  moving: ["Moving out!", "Driver moving!", "Hang on, we're rolling!"],
  reverse: ["Backing up! Backing up!", "Reverse! Get us outta here!"],
  stuck: ["We're stuck! I can't get through!", "Blocked! I'm backing off!"],
  bow: ["Bow gun firing!", "Hosing 'em down!", "Keep their heads down!"],
  loaded: {
    he: ["H E, UP!", "UP! H E loaded!", "H E in! UP!"],
    ap: ["A P, UP!", "UP! A P loaded!", "A P in! UP!"],
    smoke: ["Smoke, UP!", "UP! Smoke loaded!"],
  } satisfies Record<ShellType, string[]>,
} as const;

interface Line {
  speaker: Speaker;
  text: string;
  priority: number;
  at: number;
  until: number;
}

export class CrewChatter {
  private voices: SpeechSynthesisVoice[] = [];
  private queue: Line[] = [];
  private speaking?: Line;
  private enabled = true;
  private primed = false;
  private clock = 0;
  private quietUntil = 0;
  private seen = new Map<number, { hp: number; phase: string }>();
  private impacts = new Set<number>();
  private last = {
    shots: 0,
    hitAt: 0,
    bowShots: 0,
    moving: 0 as -1 | 0 | 1,
    stoppedFor: 0,
    blocked: false,
    alive: 0,
    won: false,
    failed: false,
  };
  private lastSaid = new Map<string, number>();

  constructor() {
    if (typeof speechSynthesis === "undefined") return;
    const load = () => (this.voices = speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener?.("voiceschanged", load);
  }

  setEnabled(enabled: boolean) {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  stop() {
    this.queue = [];
    this.speaking = undefined;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }

  reset() {
    this.stop();
    this.primed = false;
    this.seen.clear();
    this.impacts.clear();
  }

  /** The loader's call-out when no recording replaces it. */
  loaded(shell: ShellType) {
    this.say("loader", pick(LINES.loaded[shell]), 3, 0.15);
  }

  present(state: TankState) {
    const now = state.time;
    if (now < this.clock - 0.5) this.reset();
    const dt = Math.max(0, Math.min(0.2, now - this.clock));
    this.clock = now;
    const w = state.weapon;
    const t = state.tank;
    const alive = w.targets.filter((e) => e.hp > 0);
    if (!this.primed) {
      this.primed = true;
      for (const e of w.targets)
        this.seen.set(e.id, { hp: e.hp, phase: e.phase });
      for (const i of w.impacts) this.impacts.add(i.id);
      Object.assign(this.last, {
        shots: w.shotsFired,
        hitAt: state.battle.lastHitAt,
        bowShots: w.bow?.shots ?? 0,
        alive: alive.length,
        won: state.battle.won,
        failed: state.battle.failed,
      });
      this.pump();
      return;
    }

    // New contacts: the commander calls direction and range, the gunner
    // acknowledges a moment later.
    for (const e of w.targets) {
      const before = this.seen.get(e.id);
      if (!before && e.hp > 0) {
        const call = e.kind === "tiger" ? LINES.tiger : LINES.spotted;
        if (
          this.say("commander", pick(call)(this.direction(t, e)), 2, 0, "spot")
        )
          this.say("gunner", pick(LINES.identified), 1, 1.2, "identified");
      }
      if (
        before &&
        e.hp > 0 &&
        e.phase === "warning" &&
        before.phase !== "warning"
      )
        this.say("commander", pick(LINES.warning), 3, 0, "warning", 6);
      if (before && before.hp > 0 && e.hp <= 0)
        this.say(
          Math.random() < 0.5 ? "commander" : "gunner",
          pick(LINES.kill),
          3,
          0.3,
          "kill",
          1,
        );
      this.seen.set(e.id, { hp: e.hp, phase: e.phase });
    }
    for (const id of [...this.seen.keys()])
      if (!w.targets.some((e) => e.id === id)) this.seen.delete(id);

    if (w.shotsFired > this.last.shots)
      this.say("gunner", pick(LINES.fire), 3, 0, "fire", 0.5);

    // Sensing each round: hit, or where it fell against the nearest enemy.
    for (const hit of w.impacts) {
      if (this.impacts.has(hit.id)) continue;
      this.impacts.add(hit.id);
      if (hit.shell === "smoke") continue;
      const struck = w.targets.some((e) => {
        const before = this.seen.get(e.id);
        return (
          Math.hypot(hit.x - e.x, hit.z - e.z) < Math.max(e.width, e.depth) &&
          before !== undefined
        );
      });
      if (struck) {
        // A kill is announced by the target loop; plain hits get "Target!".
        const killed = w.targets.some(
          (e) =>
            e.hp <= 0 &&
            Math.hypot(hit.x - e.x, hit.z - e.z) < Math.max(e.width, e.depth),
        );
        if (!killed) this.say("commander", pick(LINES.target), 2, 0.2, "sense");
        continue;
      }
      const nearest = alive
        .map((e) => ({ e, d: Math.hypot(hit.x - e.x, hit.z - e.z) }))
        .sort((a, b) => a.d - b.d)[0];
      if (!nearest || nearest.d > 40) continue;
      const range = Math.hypot(nearest.e.x - t.x, nearest.e.z - t.z);
      const fell = Math.hypot(hit.x - t.x, hit.z - t.z);
      const lateral = nearest.d > 12 && Math.abs(fell - range) < 6;
      const call = lateral
        ? LINES.wide
        : fell < range
          ? LINES.short
          : LINES.over;
      this.say("commander", pick(call), 2, 0.25, "sense");
    }
    if (this.impacts.size > 64)
      this.impacts = new Set(w.impacts.map((i) => i.id));

    if (state.battle.lastHitAt !== this.last.hitAt && t.hp > 0)
      this.say(
        Math.random() < 0.6 ? "commander" : "driver",
        pick(LINES.hitUs),
        4,
        0.15,
        "hit",
        3,
      );

    const bowShots = w.bow?.shots ?? 0;
    if (bowShots > this.last.bowShots)
      this.say("driver", pick(LINES.bow), 1, 0, "bow", 14);

    // The driver talks when he gets going, reverses, or runs into something.
    const moving: -1 | 0 | 1 =
      t.speed > 1
        ? 1
        : t.speed < -0.8
          ? -1
          : Math.abs(t.speed) < 0.2
            ? 0
            : this.last.moving;
    if (moving === 0) this.last.stoppedFor += dt;
    if (moving !== this.last.moving) {
      if (moving === 1 && this.last.stoppedFor > 4)
        this.say("driver", pick(LINES.moving), 1, 0, "drive", 12);
      if (moving === -1)
        this.say("driver", pick(LINES.reverse), 1, 0, "drive", 12);
      if (moving !== 0) this.last.stoppedFor = 0;
    }
    if (t.blocked && !this.last.blocked)
      this.say("driver", pick(LINES.stuck), 1, 0, "stuck", 15);

    if (
      this.last.alive > 0 &&
      alive.length === 0 &&
      !state.battle.won &&
      !state.battle.failed
    )
      this.say("commander", pick(LINES.cleared), 2, 1.6, "cleared", 5);
    if (state.battle.won && !this.last.won)
      this.say("commander", pick(LINES.won), 5, 1.2, "won");
    if (state.battle.failed && !this.last.failed)
      this.say("commander", pick(LINES.lost), 5, 0.3, "lost");

    Object.assign(this.last, {
      shots: w.shotsFired,
      hitAt: state.battle.lastHitAt,
      bowShots,
      moving,
      blocked: t.blocked,
      alive: alive.length,
      won: state.battle.won,
      failed: state.battle.failed,
    });
    this.pump();
  }

  /** "two o'clock, three hundred yards" relative to the hull's nose. */
  private direction(
    t: { x: number; z: number; yaw: number },
    e: { x: number; z: number },
  ) {
    const dx = e.x - t.x,
      dz = e.z - t.z;
    const bearing = Math.atan2(dx, -dz) - t.yaw;
    let hour = Math.round(
      (((bearing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) /
        (Math.PI / 6),
    );
    if (hour === 0) hour = 12;
    const yards = Math.max(
      50,
      Math.round((Math.hypot(dx, dz) * 1.094) / 50) * 50,
    );
    return `${hour} o'clock, ${yards} yards`;
  }

  /**
   * Queue a line. `topic` + `cooldown` keep repeated events from turning into
   * a babble; higher priority lines cut lower ones off mid-sentence.
   */
  private say(
    speaker: Speaker,
    text: string,
    priority: number,
    delay = 0,
    topic = text,
    cooldown = 3,
  ) {
    if (!this.enabled || typeof speechSynthesis === "undefined") return false;
    const clock = performance.now() / 1000;
    const lastSaid = this.lastSaid.get(topic);
    if (lastSaid !== undefined && clock - lastSaid < cooldown) return false;
    this.lastSaid.set(topic, clock);
    this.queue.push({
      speaker,
      text,
      priority,
      at: clock + delay,
      until: clock + delay + 2.5 + priority * 0.5,
    });
    this.queue.sort((a, b) => b.priority - a.priority || a.at - b.at);
    if (this.queue.length > 6) this.queue.length = 6;
    return true;
  }

  private pump() {
    if (!this.enabled || typeof speechSynthesis === "undefined") return;
    const clock = performance.now() / 1000;
    this.queue = this.queue.filter((l) => l.until > clock);
    const next = this.queue.find((l) => l.at <= clock);
    if (!next) return;
    const busy = this.speaking && clock < this.quietUntil;
    if (busy && next.priority <= this.speaking!.priority) return;
    this.queue.splice(this.queue.indexOf(next), 1);
    this.speak(next, clock);
  }

  private speak(line: Line, clock: number) {
    const style = VOICE[line.speaker];
    const utterance = new SpeechSynthesisUtterance(line.text);
    const us = this.voices.filter((v) => /^en[-_]US$/i.test(v.lang));
    const ranked = [
      ...us.filter(
        (v) => /natural|online/i.test(v.name) && VOICE_PREFERENCE.test(v.name),
      ),
      ...us.filter((v) => VOICE_PREFERENCE.test(v.name)),
      ...us,
    ].filter((v, i, all) => all.indexOf(v) === i);
    const voice =
      ranked[style.slot % Math.max(1, ranked.length)] ??
      this.voices.find((v) => v.lang.toLowerCase().startsWith("en"));
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "en-US";
    utterance.pitch = style.pitch;
    utterance.rate = style.rate;
    utterance.volume = 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
    this.speaking = line;
    // Roughly how long the line takes at this rate; onend is unreliable on some engines.
    this.quietUntil = clock + 0.35 + (line.text.length * 0.065) / style.rate;
    utterance.onend = () => {
      if (this.speaking === line) this.quietUntil = 0;
    };
  }
}
