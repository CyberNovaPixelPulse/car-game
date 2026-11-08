import { TRANSPORT } from "./tank-settings";
import type { Room, Session } from "./network";

export interface GameStart {
  participants: number[];
  seed: number;
  practice?: boolean;
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
export class GameRuntime<View> {
  mode: "idle" | "online" | "practice" = "idle";
  private localPaused = false;
  private localStep?: (elapsed: number) => void;
  onStart: () => void = () => {};
  onRoom: (room: Room) => void = () => {};
  onRestoreError: (error: Error) => void = () => {};
  private held = 0;
  private viewAspect?: number;
  private previous = performance.now();
  private lastNetwork = 0;
  // Session.room is replaced before callbacks. Keep the OLD authority pause state.
  private tankPaused = false;
  get paused() {
    if (this.mode === "practice") return this.localPaused;
    return (
      this.session.room?.phase === "battle" &&
      this.session.room.members.some((member) => !member.connected)
    );
  }

  constructor(
    private core: GameCore<View>,
    private session: Session,
  ) {
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
        this.previous = performance.now();
        wasPaused = this.paused;
      }
      this.tankPaused = this.paused;
      for (const member of room.members)
        core.connected(member.slot, member.connected);
      this.onRoom(room);
    };
    session.onStart = (participants, seed) => {
      this.mode = "online";
      this.held = 0;
      this.viewAspect = undefined;
      this.tankPaused = this.paused;
      wasPaused = this.paused;
      core.start({ participants, seed });
      this.previous = performance.now();
      this.lastNetwork = 0;
      this.onStart();
    };
  }

  /** Consume past time under old controls, then install a newly received state. */
  private advanceTankAuthority() {
    if (this.mode === "practice") {
      const now = performance.now();
      const elapsed = Math.max(0, now - this.previous) / 1000;
      this.previous = now;
      if (!this.localPaused)
        (this.localStep ?? ((dt) => this.core.step(dt)))(elapsed);
      return;
    }
    if (this.mode !== "online" || !this.session.isHost) return;
    const now = performance.now();
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

  frame(now: number): { participant: number; view: View } {
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

  startPractice(seed: number, step?: (elapsed: number) => void) {
    this.mode = "practice";
    this.localPaused = false;
    this.held = 0;
    this.viewAspect = undefined;
    this.localStep = step;
    this.core.start({ participants: [0, 1, 2], seed, practice: true });
    this.previous = performance.now();
  }

  pausePractice(paused: boolean) {
    if (this.mode !== "practice") return;
    this.advanceTankAuthority();
    this.localPaused = paused;
    this.core.pause?.(paused);
    this.held = 0;
    for (const slot of [0, 1, 2]) this.core.input(slot, 0);
    this.previous = performance.now();
  }
}
