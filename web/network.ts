import { isCrewRole, type CrewRole } from "./crew";
import Peer, { type DataConnection, type PeerOptions } from "peerjs";

export const COLORS = ["#fc7039", "#765cd4", "#1ea1b3", "#efbb31", "#e1669f"];
export interface Member {
  slot: number;
  name: string;
  connected: boolean;
  role?: CrewRole | null;
  ready?: boolean;
}
export interface Room {
  code: string;
  members: Member[];
  phase: "lobby" | "racing" | "battle" | "results";
  game: "race" | "tank";
  epoch: string;
}
interface HostMember extends Member {
  token: string;
  link?: DataConnection;
  sequence: number;
  seen: number;
}
interface Credentials {
  code: string;
  name: string;
  token: string;
  epoch: string;
}

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function roomCode() {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (n) => alphabet[n % alphabet.length],
  ).join("");
}
function options(): PeerOptions {
  const host =
    import.meta.env.VITE_PEER_HOST ||
    (import.meta.env.DEV ? location.hostname : "");
  if (!host) return {};
  const local = ["localhost", "127.0.0.1"].includes(host);
  return {
    host,
    port: Number(import.meta.env.VITE_PEER_PORT || 4274),
    path: import.meta.env.VITE_PEER_PATH || "/peer",
    secure: import.meta.env.VITE_PEER_SECURE === "true",
    ...(local ? { config: { iceServers: [] } } : {}),
  };
}
function validRoom(value: unknown, game: "race" | "tank"): value is Room {
  if (
    !record(value) ||
    typeof value.code !== "string" ||
    !/^[A-Z2-9]{6}$/.test(value.code) ||
    !["lobby", "racing", "battle", "results"].includes(String(value.phase)) ||
    value.game !== game ||
    typeof value.epoch !== "string" ||
    !Array.isArray(value.members) ||
    value.members.length > (game === "tank" ? 3 : 5)
  )
    return false;
  const slots = new Set<number>();
  return value.members.every((member) => {
    if (
      !record(member) ||
      !Number.isInteger(member.slot) ||
      Number(member.slot) < 0 ||
      Number(member.slot) >= (game === "tank" ? 3 : 5) ||
      typeof member.name !== "string" ||
      member.name.length > 16 ||
      typeof member.connected !== "boolean" ||
      (game === "tank" &&
        (typeof member.ready !== "boolean" ||
          (member.role !== null && !isCrewRole(member.role)))) ||
      slots.has(Number(member.slot))
    )
      return false;
    slots.add(Number(member.slot));
    return true;
  });
}
export class Session {
  constructor(readonly game: "race" | "tank" = "race") {}
  private get storageKey() {
    return `${this.game === "tank" ? "tank-crew" : "pocket-circuit"}-seat-v1`;
  }
  private get peerPrefix() {
    return this.game === "tank" ? "tank-crew-v1" : "pocket-circuit-v1";
  }
  private get playing() {
    return this.room?.phase === "racing" || this.room?.phase === "battle";
  }
  slot = 0;
  room?: Room;
  private peer?: Peer;
  private uplink?: DataConnection;
  private members = new Map<number, HostMember>();
  private sequence = 0;
  private stateSequence = 0;
  private receivedSequence = -1;
  private generation = 0;
  private heartbeat?: ReturnType<typeof setInterval>;
  private retry?: ReturnType<typeof setTimeout>;
  private seen = 0;
  private latestState = "";
  private credentials?: Credentials;
  onRoom: (room: Room) => void = () => {};
  onError: (message: string) => void = () => {};
  onStart: (mask: number, seed: number) => void = () => {};
  onState: (data: string) => void = () => {};
  onInput: (slot: number, keys: number) => void = () => {};
  onAction: (slot: number, action: number) => void = () => {};
  onEnded: (message: string) => void = () => {};
  onRetryAvailable: () => void = () => {};
  get isHost() {
    return this.slot === 0;
  }

  private save() {
    if (this.credentials)
      sessionStorage.setItem(this.storageKey, JSON.stringify(this.credentials));
  }
  private async open(id?: string): Promise<Peer> {
    const peer = id ? new Peer(id, options()) : new Peer(options());
    this.peer = peer;
    const generation = this.generation;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        peer.destroy();
        reject(new Error("連線逾時，請確認網路後再試。"));
      }, 18000);
      peer.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      peer.once("error", (error) => {
        clearTimeout(timer);
        reject(
          new Error(
            error.type === "unavailable-id"
              ? "代碼衝突，請重新建立房間。"
              : "無法連線，請確認網路後再試。",
          ),
        );
      });
    });
    if (generation !== this.generation) {
      peer.destroy();
      throw new Error("已取消連線。");
    }
    peer.on("disconnected", () => {
      if (generation === this.generation && !peer.destroyed) peer.reconnect();
    });
    return peer;
  }
  async create(name: string) {
    this.leave();
    this.slot = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = roomCode();
      let peer: Peer;
      try {
        peer = await this.open(`${this.peerPrefix}-${code}`);
      } catch (error) {
        if (attempt < 2 && (error as Error).message.includes("代碼衝突")) {
          this.leave();
          continue;
        }
        throw error;
      }
      this.room = {
        code,
        members: [],
        phase: "lobby",
        epoch: "",
        game: this.game,
      };
      this.members.set(0, {
        slot: 0,
        name: name.trim().slice(0, 16),
        connected: true,
        role: null,
        ready: false,
        token: crypto.randomUUID(),
        sequence: -1,
        seen: Date.now(),
      });
      const generation = this.generation;
      peer.on("connection", (link) => {
        if (generation === this.generation) this.accept(link);
        else link.close();
      });
      peer.on("error", () => this.onError("房間連線發生錯誤，請確認網路。"));
      this.publishRoom();
      this.watch();
      return;
    }
  }
  async join(code: string, name: string) {
    await this.connect(code, name);
  }
  async resumeSaved() {
    let saved: unknown;
    try {
      saved = JSON.parse(sessionStorage.getItem(this.storageKey) || "null");
    } catch {
      sessionStorage.removeItem(this.storageKey);
    }
    if (
      !record(saved) ||
      typeof saved.code !== "string" ||
      typeof saved.name !== "string" ||
      typeof saved.token !== "string" ||
      typeof saved.epoch !== "string"
    )
      return;
    this.onError("正在重新連回原本的比賽…");
    try {
      await this.connect(
        saved.code,
        saved.name,
        saved as unknown as Credentials,
      );
    } catch (error) {
      if (this.credentials) {
        this.leave(false);
        this.onRetryAvailable();
      }
      this.onError((error as Error).message);
    }
  }
  private async connect(code: string, name: string, resume?: Credentials) {
    this.leave(!resume);
    this.slot = -1;
    this.credentials = resume;
    const peer = await this.open();
    const generation = this.generation;
    const link = peer.connect(`${this.peerPrefix}-${code}`, {
      reliable: true,
      serialization: "json",
    });
    this.uplink = link;
    await new Promise<void>((resolve, reject) => {
      let welcomed = false,
        rejected = false;
      const fail = (message: string, ended = false) => {
        if (generation !== this.generation) return;
        rejected = true;
        clearTimeout(timer);
        if (ended) {
          this.leave();
          this.onEnded(message);
        }
        reject(new Error(message));
      };
      const timer = setTimeout(() => fail("連線逾時，請稍後重新加入。"), 18000);
      peer.on("error", (error) => {
        if (error.type === "peer-unavailable")
          fail(
            resume
              ? "房主已離線，本場比賽已結束。"
              : "找不到這個房間，請確認代碼。",
            !!resume,
          );
        else if (!welcomed) fail("無法連線，請確認網路後再試。");
        else this.onError("網路連線不穩，正在確認房間…");
      });
      link.on("open", () =>
        link.send(
          resume
            ? { type: "resume", token: resume.token, epoch: resume.epoch }
            : { type: "join", name },
        ),
      );
      link.on("data", (data) => {
        if (generation !== this.generation || !record(data)) return;
        this.seen = Date.now();
        if (
          data.type === "welcome" &&
          Number.isInteger(data.slot) &&
          Number(data.slot) > 0 &&
          Number(data.slot) < (this.game === "tank" ? 3 : 5) &&
          typeof data.token === "string" &&
          validRoom(data.room, this.game)
        ) {
          clearTimeout(timer);
          welcomed = true;
          this.slot = Number(data.slot);
          this.room = data.room;
          this.credentials = {
            code,
            name,
            token: data.token,
            epoch: this.room.epoch,
          };
          this.save();
          this.onRoom(this.room);
          this.sequence = 0;
          this.receivedSequence = -1;
          if (data.resumed === true && typeof data.payload === "string") {
            this.onStart(this.mask(), 1);
            this.onState(data.payload);
          }
          this.watch();
          resolve();
        } else if (
          data.type === "room" &&
          validRoom(data.room, this.game) &&
          welcomed
        ) {
          this.room = data.room;
          this.onRoom(this.room);
        } else if (data.type === "notice" && typeof data.message === "string")
          this.onError(data.message);
        else if (data.type === "error" && typeof data.message === "string")
          fail(data.message, !!resume);
        else if (data.type === "ended") {
          this.leave();
          this.onEnded("房主已離線，本場比賽已結束。");
        } else if (data.type === "ping") link.send({ type: "pong" });
        else if (
          data.type === "start" &&
          welcomed &&
          typeof data.epoch === "string" &&
          Number.isInteger(data.mask) &&
          typeof data.seed === "number" &&
          this.room
        ) {
          this.room.epoch = data.epoch;
          this.room.phase = this.game === "tank" ? "battle" : "racing";
          this.sequence = 0;
          this.receivedSequence = -1;
          if (this.credentials) {
            this.credentials.epoch = data.epoch;
            this.save();
          }
          this.onStart(Number(data.mask), data.seed);
        } else if (
          data.type === "state" &&
          welcomed &&
          data.epoch === this.room?.epoch &&
          Number.isSafeInteger(data.sequence) &&
          Number(data.sequence) > this.receivedSequence &&
          typeof data.payload === "string" &&
          data.payload.length < 16000
        ) {
          this.receivedSequence = Number(data.sequence);
          this.onState(data.payload);
        }
      });
      link.on("close", () => {
        clearTimeout(timer);
        if (generation !== this.generation || rejected) return;
        if (!welcomed) {
          reject(new Error("連線中斷，請重新加入。"));
          return;
        }
        this.onError("連線中斷，正在重新連回比賽…");
        this.retry = setTimeout(() => {
          void this.resumeSaved();
        }, 650);
      });
      link.on("error", () => {
        if (generation === this.generation) link.close();
      });
    }).catch((error) => {
      if (generation === this.generation) this.leave(!resume);
      throw error;
    });
  }
  private accept(link: DataConnection) {
    const generation = this.generation;
    let assigned = -1;
    const timer = setTimeout(() => {
      if (assigned < 0) link.close();
    }, 10000);
    link.on("data", (data) => {
      if (generation !== this.generation || !record(data)) return;
      if (assigned >= 0) {
        const member = this.members.get(assigned);
        if (!member || member.link !== link) return;
        member.seen = Date.now();
        if (
          data.type === "input" &&
          this.playing &&
          data.epoch === this.room?.epoch &&
          Number.isSafeInteger(data.sequence) &&
          Number(data.sequence) > member.sequence &&
          Number.isInteger(data.keys) &&
          Number(data.keys) >= 0 &&
          Number(data.keys) <= 63
        ) {
          member.sequence = Number(data.sequence);
          this.onInput(assigned, Number(data.keys));
        } else if (
          data.type === "action" &&
          this.game === "tank" &&
          this.playing &&
          data.epoch === this.room?.epoch &&
          Number.isSafeInteger(data.sequence) &&
          Number(data.sequence) > member.sequence &&
          Number.isInteger(data.action) &&
          Number(data.action) >= 0 &&
          Number(data.action) <= 63
        ) {
          member.sequence = Number(data.sequence);
          this.onAction(assigned, Number(data.action));
        } else if (data.type === "crew") {
          this.updateCrew(assigned, data.role, data.ready);
        }
        return;
      }
      const deny = (message: string) => {
        clearTimeout(timer);
        link.send({ type: "error", message });
        setTimeout(() => link.close(), 200);
      };
      if (data.type === "resume") {
        const member = [...this.members.values()].find(
          (m) => m.slot !== 0 && m.token === data.token,
        );
        if (
          !member ||
          !this.playing ||
          data.epoch !== this.room?.epoch ||
          !this.latestState
        ) {
          deny("原本的賽局已結束或已更換，請重新加入。");
          return;
        }
        const old = member.link;
        assigned = member.slot;
        member.link = link;
        member.connected = true;
        member.sequence = -1;
        member.seen = Date.now();
        old?.close();
        clearTimeout(timer);
        this.publishRoom();
        link.send({
          type: "welcome",
          slot: assigned,
          token: member.token,
          room: this.room,
          resumed: true,
          payload: this.latestState,
        });
        return;
      }
      if (data.type !== "join") return;
      if (this.room?.phase !== "lobby") {
        deny(
          this.game === "tank"
            ? "戰鬥已開始，請等下一場再加入。"
            : "比賽已開始，請等下一場再加入。",
        );
        return;
      }
      const name =
        typeof data.name === "string" ? data.name.trim().slice(0, 16) : "";
      if (!name) {
        deny(this.game === "tank" ? "請輸入乘員名稱。" : "請輸入車手名。");
        return;
      }
      const slot = (this.game === "tank" ? [1, 2] : [1, 2, 3, 4]).find(
        (i) => !this.members.has(i),
      );
      if (slot === undefined) {
        deny(
          this.game === "tank"
            ? "房間已滿，最多三名乘員。"
            : "房間已滿，最多五位車手。",
        );
        return;
      }
      clearTimeout(timer);
      assigned = slot;
      const member: HostMember = {
        slot,
        name,
        connected: true,
        role: null,
        ready: false,
        token: crypto.randomUUID(),
        link,
        sequence: -1,
        seen: Date.now(),
      };
      this.members.set(slot, member);
      this.publishRoom();
      link.send({
        type: "welcome",
        slot,
        token: member.token,
        room: this.room,
      });
    });
    link.on("close", () => {
      clearTimeout(timer);
      if (generation !== this.generation || assigned < 0) return;
      const member = this.members.get(assigned);
      if (!member || member.link !== link) return;
      if (this.room?.phase === "lobby") this.members.delete(assigned);
      else {
        member.connected = false;
        member.link = undefined;
        this.onInput(assigned, 0);
      }
      this.publishRoom();
    });
    link.on("error", () => link.close());
  }
  private publishRoom() {
    if (!this.room) return;
    this.room.members = [...this.members.values()]
      .map(({ slot, name, connected, role, ready }) => ({
        slot,
        name,
        connected,
        role,
        ready,
      }))
      .sort((a, b) => a.slot - b.slot);
    this.onRoom(this.room);
    this.broadcast({ type: "room", room: this.room });
  }
  private broadcast(data: object) {
    for (const member of this.members.values())
      if (member.link?.open) member.link.send(data);
  }
  private mask() {
    return (
      this.room?.members.reduce(
        (mask, member) => mask | (1 << member.slot),
        0,
      ) || 0
    );
  }
  private watch() {
    clearInterval(this.heartbeat);
    this.seen = Date.now();
    this.heartbeat = setInterval(() => {
      if (this.isHost) {
        for (const member of this.members.values())
          if (
            member.slot &&
            member.connected &&
            Date.now() - member.seen > 6500
          )
            member.link?.close();
        this.broadcast({ type: "ping" });
      } else if (this.uplink?.open && Date.now() - this.seen > 6500)
        this.uplink.close();
    }, 1000);
  }
  chooseRole(role: CrewRole) {
    if (this.isHost) this.updateCrew(this.slot, role, undefined);
    else if (this.room?.phase === "lobby")
      this.uplink?.send({ type: "crew", role });
  }
  setReady(ready: boolean) {
    if (this.isHost) this.updateCrew(this.slot, undefined, ready);
    else if (this.room?.phase === "lobby")
      this.uplink?.send({ type: "crew", ready });
  }
  private updateCrew(slot: number, role: unknown, ready: unknown) {
    if (this.game !== "tank" || this.room?.phase !== "lobby") return;
    const member = this.members.get(slot);
    if (!member?.connected) return;
    const notice = (message: string) => {
      if (slot === 0) this.onError(message);
      else member.link?.send({ type: "notice", message });
    };
    if (isCrewRole(role)) {
      if (
        [...this.members.values()].some(
          (m) => m.slot !== slot && m.role === role,
        )
      ) {
        notice("這個職位已有人擔任，請選擇其他職位。");
        return;
      }
      if (member.role !== role) {
        member.role = role;
        member.ready = false;
      }
    }
    if (typeof ready === "boolean") {
      if (!member.role) {
        notice("請先選擇職位再準備。");
        return;
      }
      member.ready = ready;
    }
    this.publishRoom();
  }
  start() {
    if (
      !this.isHost ||
      !this.room ||
      this.playing ||
      [...this.members.values()].filter((m) => m.connected).length < 2 ||
      (this.game === "tank" &&
        (this.members.size !== 3 ||
          [...this.members.values()].some(
            (m) => !m.connected || !m.role || !m.ready,
          )))
    )
      return;
    for (const [slot, member] of this.members)
      if (!member.connected) this.members.delete(slot);
    this.room.phase = this.game === "tank" ? "battle" : "racing";
    this.room.epoch = crypto.randomUUID();
    this.sequence = 0;
    this.stateSequence = 0;
    this.latestState = "";
    for (const member of this.members.values()) member.sequence = -1;
    this.publishRoom();
    const mask = this.mask(),
      seed = crypto.getRandomValues(new Uint32Array(1))[0];
    this.broadcast({ type: "start", epoch: this.room.epoch, mask, seed });
    this.onStart(mask, seed);
  }
  input(keys: number) {
    if (this.uplink?.open && this.room && this.playing)
      this.uplink.send({
        type: "input",
        epoch: this.room.epoch,
        sequence: this.sequence++,
        keys,
      });
  }
  action(action: number) {
    if (this.game === "tank" && this.uplink?.open && this.room && this.playing)
      this.uplink.send({
        type: "action",
        epoch: this.room.epoch,
        sequence: this.sequence++,
        action,
      });
  }
  state(payload: string) {
    if (this.isHost && this.room && this.playing) {
      this.latestState = payload;
      this.broadcast({
        type: "state",
        epoch: this.room.epoch,
        sequence: this.stateSequence++,
        payload,
      });
    }
  }
  finish(payload: string) {
    if (this.isHost && this.room && this.playing) {
      this.state(payload);
      this.room.phase = "results";
      this.publishRoom();
    }
  }
  leave(clearCredentials = true) {
    if (this.isHost && this.room) this.broadcast({ type: "ended" });
    this.generation++;
    clearInterval(this.heartbeat);
    clearTimeout(this.retry);
    this.peer?.destroy();
    this.peer = undefined;
    this.uplink = undefined;
    this.members.clear();
    this.room = undefined;
    if (clearCredentials) {
      sessionStorage.removeItem(this.storageKey);
      this.credentials = undefined;
    }
  }
}
