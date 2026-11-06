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

  constructor(
    private core: GameCore<View>,
    private session: Session,
  ) {
    session.onInput = (participant, keys) => core.input(participant, keys);
    session.onAction = (participant, action) =>
      core.action?.(participant, action);
    session.onState = (snapshot) => {
      try {
        core.restore(snapshot);
      } catch (error) {
        this.onRestoreError(error as Error);
      }
    };
    session.onRoom = (room) => {
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
    this.held = held;
  }

  queueInput(keys: number) {
    this.queued |= keys;
  }

  /** Discrete actions keep their multiplicity; held input remains coalesced. */
  action(action: number) {
    if (this.mode !== "online") return;
    if (this.session.isHost) this.core.action?.(this.session.slot, action);
    else this.session.action(action);
  }

  clearInput() {
    this.held = 0;
    this.queued = 0;
  }

  frame(now: number): { participant: number; view: View } {
    const online = this.mode === "online";
    const participant = online ? this.session.slot : 0;
    if (!online || this.session.isHost) {
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
