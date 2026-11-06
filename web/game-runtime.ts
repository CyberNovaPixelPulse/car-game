import type { Room, Session } from "./network";

export interface GameStart {
  participants: number[];
  seed: number;
  practice: boolean;
}

/** A game owns simulation and presentation; the room transports opaque snapshots. */
export interface GameCore<View> {
  start(options: GameStart): void;
  input(participant: number, keys: number): void;
  action?(participant: number, action: number): void;
  connected(participant: number, connected: boolean): void;
  step(dt: number): void;
  draw(participant: number): void;
  view(): View;
  snapshot(): string;
  restore(snapshot: string): void;
}

/** Runs a core locally or under the room's existing host-authority contract. */
export class GameRuntime<View> {
  mode: "idle" | "practice" | "online" = "idle";
  onStart: () => void = () => {};
  onRoom: (room: Room) => void = () => {};
  onRestoreError: (error: Error) => void = () => {};
  private held = 0;
  private queued = 0;
  private previous = performance.now();
  private lastNetwork = 0;
  get paused() {
    return (
      this.session.game === "tank" &&
      this.session.room?.phase === "battle" &&
      this.session.room.members.some((member) => !member.connected)
    );
  }

  constructor(
    private core: GameCore<View>,
    private session: Session,
  ) {
    session.onInput = (participant, keys) => {
      if (!this.paused) core.input(participant, keys);
    };
    session.onAction = (participant, action) => {
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
      if (this.paused !== wasPaused) {
        this.clearInput();
        for (const member of room.members) core.input(member.slot, 0);
        this.previous = performance.now();
        wasPaused = this.paused;
      }
      for (const member of room.members)
        core.connected(member.slot, member.connected);
      this.onRoom(room);
    };
    session.onStart = (mask, seed) => {
      this.mode = "online";
      this.clearInput();
      // The legacy wire format uses a seat mask. Keep that detail out of cores.
      const participants = Array.from({ length: 5 }, (_, slot) => slot).filter(
        (slot) => mask & (1 << slot),
      );
      core.start({ participants, seed, practice: false });
      this.previous = performance.now();
      this.lastNetwork = 0;
      this.onStart();
    };
  }

  idle() {
    this.startLocal("idle");
  }

  practice() {
    this.startLocal("practice");
  }

  private startLocal(mode: "idle" | "practice") {
    this.mode = mode;
    this.clearInput();
    this.core.start({ participants: [0], seed: 1, practice: true });
    this.previous = performance.now();
    this.lastNetwork = 0;
  }

  setInput(held: number) {
    this.held = this.paused ? 0 : held;
  }

  queueInput(keys: number) {
    this.queued |= keys;
  }

  /** Discrete actions keep their multiplicity; held input remains coalesced. */
  action(action: number) {
    if (this.mode !== "online" || this.paused) return;
    // Preserve key-release → action causality instead of waiting for the next held update.
    if (this.session.isHost) {
      this.core.input(this.session.slot, this.held);
      this.core.action?.(this.session.slot, action);
    } else {
      // Input and action share the reliable ordered channel and sequence counter.
      this.session.input(this.held);
      this.session.action(action);
    }
  }

  clearInput() {
    this.held = 0;
    this.queued = 0;
  }

  frame(now: number): { participant: number; view: View } {
    const online = this.mode === "online";
    const participant = online ? this.session.slot : 0;
    if ((!online || this.session.isHost) && !this.paused) {
      this.core.input(
        participant,
        this.mode === "idle" ? 0 : this.held | this.queued,
      );
      this.core.step((now - this.previous) / 1000);
      this.queued = 0;
    }
    if (online && now - this.lastNetwork > 50) {
      this.lastNetwork = now;
      if (this.session.isHost) this.session.state(this.core.snapshot());
      else {
        this.session.input(this.held | this.queued);
        this.queued = 0;
      }
    }
    this.previous = now;
    this.core.draw(participant);
    return { participant, view: this.core.view() };
  }

  finish() {
    if (this.session.isHost) this.session.finish(this.core.snapshot());
  }
}
