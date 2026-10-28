export interface CarView {
  x: number;
  y: number;
  angle: number;
  speed: number;
  present: number;
  connected: number;
  lap: number;
  finished: number;
  rank: number;
  boost: number;
  drifting: number;
  held: number;
  boostKind: number;
  slow: number;
}
export interface GameView {
  track: { cx: number; cy: number; rx: number; ry: number };
  phase: number;
  time: number;
  cars: CarView[];
  boxes: { x: number; y: number; active: number }[];
  effects: { x: number; y: number; kind: number }[];
}
interface Wasm {
  HEAPU8: Uint8Array;
  UTF8ToString(ptr: number): string;
  _game_init(): number;
  _game_reset(mask: number, seed: number, practice: number): void;
  _game_input(slot: number, keys: number): void;
  _game_connected(slot: number, connected: number): void;
  _game_step(dt: number): void;
  _game_draw(local: number): void;
  _game_json(): number;
  _game_state_ptr(): number;
  _game_state_size(): number;
}
export class Engine {
  private constructor(private wasm: Wasm) {}
  static async load(canvas: HTMLCanvasElement) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/wasm/game.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("遊戲載入失敗，請重新整理。"));
      document.head.append(script);
    });
    const factory = (
      window as unknown as { PocketGame: (options: object) => Promise<Wasm> }
    ).PocketGame;
    const wasm: Wasm = await factory({
      canvas,
      locateFile: (file: string) => `/wasm/${file}`,
    });
    if (!wasm._game_init())
      throw new Error("無法啟動賽道，請使用支援 WebGL 的瀏覽器。");
    return new Engine(wasm);
  }
  reset(mask: number, seed = 1, practice = 1) {
    this.wasm._game_reset(mask, seed, practice);
  }
  input(slot: number, keys: number) {
    this.wasm._game_input(slot, keys);
  }
  connected(slot: number, connected: boolean) {
    this.wasm._game_connected(slot, +connected);
  }
  step(dt: number) {
    this.wasm._game_step(dt);
  }
  draw(local: number) {
    this.wasm._game_draw(local);
  }
  view(): GameView {
    return JSON.parse(this.wasm.UTF8ToString(this.wasm._game_json()));
  }
  snapshot(): string {
    const ptr = this.wasm._game_state_ptr();
    return btoa(
      String.fromCharCode(
        ...this.wasm.HEAPU8.subarray(ptr, ptr + this.wasm._game_state_size()),
      ),
    );
  }
  restore(data: string) {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    if (bytes.length !== this.wasm._game_state_size())
      throw new Error("遊戲版本不同，請重新整理後再加入。");
    this.wasm.HEAPU8.set(bytes, this.wasm._game_state_ptr());
  }
}
