import type { TankState } from "./tank-core";

/** A local head turn is independent of the crew's networked work and aim inputs. */
export class InteriorLook {
  private mode?: TankState["weapon"]["mode"];
  private keys = new Set<string>();
  private yaw = 0;
  private lastFrame = 0;

  key(code: string, down: boolean, repeat = false) {
    if (!this.mode || (code !== "ArrowLeft" && code !== "ArrowRight"))
      return false;
    if (!down) this.keys.delete(code);
    else if (!repeat) this.keys.add(code);
    return true;
  }

  release() {
    this.keys.clear();
  }

  sample(mode: TankState["weapon"]["mode"], paused: boolean) {
    const interior = paused || mode === "machine-gun" ? undefined : mode;
    const now = performance.now();
    if (interior !== this.mode) {
      this.mode = interior;
      this.release();
      this.yaw = 0;
    }
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const direction =
      Number(this.keys.has("ArrowLeft")) - Number(this.keys.has("ArrowRight"));
    const target = (direction * Math.PI) / 13; // Just under fourteen degrees to either side.
    if (target === this.yaw) return this.yaw;
    this.yaw += (target - this.yaw) * (1 - Math.exp(-12 * dt));
    if (Math.abs(this.yaw - target) < 0.0002) this.yaw = target;
    return this.yaw;
  }
}
