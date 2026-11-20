import { TRANSPORT } from "./tank-settings";
import type { Room, Session } from "./network";
import type { CrewRole } from "./crew";
import { TankCore, type TankState } from "./tank-core";
import type { OccupationLevel } from "./tank-occupation";
import { PracticeCrew, type PracticeCommand } from "./tank-practice-crew";

export interface GameStart {
  participants: number[];
  seed: number;
  practice?: boolean;
  occupation?: OccupationLevel;
}

/** A game owns simulation and presentation; the room transports opaque snapshots. */
export interface GameCore<View> {
  start(options: GameStart): void;
  input(participant: number, keys: number, aspect?: number): void;
  action?(participant: number, action: number): void;
  connected(participant: number, connected: boolean): void;
  /** Whole-room suspension precedes physical-input clearing. */
  pause?(paused: boolean): void;
  step(dt: number): void;
  draw(participant: number): void;
  view(): View;
  snapshot(): string;
  restore(snapshot: string): void;
}

/** Runs a core locally or under the room's existing host-authority contract. */
export class GameRuntime {
  private readonly core: TankCore;
  readonly presentation: Pick<TankCore, "view" | "draw" | "present">;
  mode: "idle" | "online" | "practice" = "idle";
  private localPaused = false;
  private practiceCrew?: PracticeCrew;
  onStart: () => void = () => {};
  onRoom: (room: Room) => void = () => {};
  onRestoreError: (error: Error) => void = () => {};
  private held = 0;
  private viewAspect?: number;
  private previous: number;
  private lastNetwork = 0;
  awaitingFirstSnapshot = false;
  // Session.room is replaced before callbacks. Keep the OLD authority pause state.
  private tankPaused = false;
  get paused() {
    if (this.mode === "practice") return this.localPaused;
    return (
      this.session.room?.phase === "battle" &&
      this.session.room.members.some((member) => !member.connected)
    );
  }

  get practice() {
    if (this.mode === "practice") return this.practiceCrew?.status;
  }

  constructor(
    private session: Session,
    private readonly now = () => performance.now(),
  ) {
    this.previous = this.now();
    const core = new TankCore((slot) =>
      this.mode === "practice"
        ? this.practiceCrew?.roleOf(slot)
        : (session.room?.members.find((member) => member.slot === slot)?.role ??
          undefined),
    );
    this.core = core;
    this.presentation = core;
    session.onInput = (participant, keys, aspect) => {
      this.advanceTankAuthority();
      core.input(participant, this.paused ? 0 : keys, aspect);
    };
    session.onAction = (participant, action) => {
      this.advanceTankAuthority();
      if (!this.paused) core.action?.(participant, action);
    };
    session.onState = (snapshot) => {
      try {
        core.restore(snapshot);
        this.awaitingFirstSnapshot = false;
      } catch (error) {
        this.onRestoreError(error as Error);
      }
    };
    let wasPaused = false;
    session.onRoom = (room) => {
      // Finish the pre-disconnect interval before clearing controls/connection.
      this.advanceTankAuthority();
      if (this.paused !== wasPaused) {
        core.pause?.(this.paused);
        this.clearInput();
        for (const member of room.members) core.input(member.slot, 0);
        this.previous = this.now();
        wasPaused = this.paused;
      }
      this.tankPaused = this.paused;
      for (const member of room.members)
        core.connected(member.slot, member.connected);
      this.onRoom(room);
    };
    session.onStart = (participants, seed) => {
      this.mode = "online";
      this.awaitingFirstSnapshot = !this.session.isHost;
      this.practiceCrew = undefined;
      this.held = 0;
      this.viewAspect = undefined;
      this.tankPaused = this.paused;
      wasPaused = this.paused;
      core.start({ participants, seed });
      this.previous = this.now();
      this.lastNetwork = 0;
      this.onStart();
    };
  }

  /** Consume past time under old controls, then install a newly received state. */
  private advanceTankAuthority() {
    if (this.mode === "practice") {
      const now = this.now();
      const elapsed = Math.max(0, now - this.previous) / 1000;
      this.previous = now;
      if (!this.localPaused) this.practiceCrew?.step(elapsed);
      return;
    }
    if (this.mode !== "online" || !this.session.isHost) return;
    const now = this.now();
    const elapsed = Math.max(0, now - this.previous);
    this.previous = Math.max(this.previous, now);
    if (!this.tankPaused && elapsed > 0) this.core.step(elapsed / 1000);
  }

  setInput(held: number) {
    this.advanceTankAuthority();
    this.held = this.paused ? 0 : held;
    if (this.mode === "practice")
      this.core.input(0, this.held, this.viewAspect);
    if (this.mode === "online" && this.session.isHost)
      this.core.input(this.session.slot, this.held, this.viewAspect);
  }

  /** Actual mounted exterior CSS projection, reported on the existing ordered
   * identity-bound input channel. Resize changes no simulation clock/input. */
  setViewAspect(aspect: number | undefined) {
    if (this.mode === "practice") {
      this.viewAspect = aspect;
      this.core.input(0, this.paused ? 0 : this.held, aspect);
      return;
    }
    if (aspect === this.viewAspect) {
      // The active canvas can re-enter with identical CSS dimensions after an
      // interior mode. Its host observer was invalidated on that mode change.
      if (aspect !== undefined && this.mode === "online" && this.session.isHost)
        this.core.input(this.session.slot, this.paused ? 0 : this.held, aspect);
      return;
    }
    this.advanceTankAuthority();
    this.viewAspect = aspect;
    if (this.mode === "online") {
      if (this.session.isHost)
        this.core.input(this.session.slot, this.paused ? 0 : this.held, aspect);
      else this.session.input(this.paused ? 0 : this.held, aspect);
    }
  }

  /** Discrete actions keep their multiplicity; held input remains coalesced. */
  action(action: number) {
    if (this.mode === "practice") {
      this.advanceTankAuthority();
      if (!this.paused) {
        this.core.input(0, this.held, this.viewAspect);
        this.core.action?.(0, action);
      }
      return;
    }
    if (this.mode !== "online" || this.paused) return;
    // Preserve key-release → action causality instead of waiting for the next held update.
    if (this.session.isHost) {
      this.advanceTankAuthority();
      this.core.input(this.session.slot, this.held, this.viewAspect);
      this.core.action?.(this.session.slot, action);
    } else {
      // Input and action share the reliable ordered channel and sequence counter.
      this.session.input(this.held, this.viewAspect);
      this.session.action(action);
    }
  }

  clearInput() {
    this.advanceTankAuthority();
    this.held = 0;
    if (this.mode === "practice") this.core.input(0, 0, this.viewAspect);
    if (this.mode === "online" && this.session.isHost)
      this.core.input(this.session.slot, 0, this.viewAspect);
    else if (this.mode === "online")
      // A hidden tab may stop receiving animation frames. Release on the same
      // reliable ordered channel now, without waiting for its next frame.
      this.session.input(0, this.viewAspect);
  }

  frame(now: number): { participant: number; view: TankState } {
    const online = this.mode === "online";
    const participant = online ? this.session.slot : 0;
    if (online || this.mode === "practice") this.advanceTankAuthority();
    if (online && now - this.lastNetwork > TRANSPORT.snapshot) {
      this.lastNetwork = now;
      if (this.session.isHost) this.session.state(this.core.snapshot());
      else {
        this.session.input(this.held, this.viewAspect);
      }
    }
    // Never rewind the event-advanced authority cursor to a stale rAF timestamp.
    this.core.draw(participant);
    return { participant, view: this.core.view() };
  }

  finish() {
    if (this.session.isHost) this.session.finish(this.core.snapshot());
  }

  startPractice(seed: number, role: CrewRole, occupation?: OccupationLevel) {
    this.mode = "practice";
    this.awaitingFirstSnapshot = false;
    this.localPaused = false;
    this.held = 0;
    this.viewAspect = undefined;
    this.practiceCrew = new PracticeCrew(this.core, role);
    this.core.start({
      participants: [0, 1, 2],
      seed,
      practice: true,
      occupation,
    });
    this.previous = this.now();
  }

  switchPracticeRole(role: CrewRole) {
    if (this.mode === "practice" && this.localPaused)
      this.practiceCrew?.switchRole(role);
  }

  commandPractice(command: PracticeCommand) {
    if (this.mode !== "practice" || !this.practiceCrew) return;
    // Settle old controls first, including the locally held keys and projection.
    this.setInput(this.held);
    this.practiceCrew.applyCommand(command);
  }

  pausePractice(paused: boolean) {
    if (this.mode !== "practice") return;
    this.advanceTankAuthority();
    this.localPaused = paused;
    this.core.pause?.(paused);
    this.held = 0;
    for (const slot of [0, 1, 2]) this.core.input(slot, 0);
    this.previous = this.now();
  }
}
