import * as THREE from "three";

/** One renderer owns its asset barrier. A failed asset never becomes a ready vote. */
export class ArtPreparation {
  readonly manager = new THREE.LoadingManager();
  private busy = false;
  private failure?: Error;
  private waiters: { resolve: () => void; reject: (error: Error) => void }[] =
    [];
  constructor() {
    this.manager.onStart = () => {
      this.busy = true;
    };
    this.manager.onLoad = () => {
      this.busy = false;
      for (const waiter of this.waiters.splice(0)) waiter.resolve();
    };
    this.manager.onError = () => {
      this.failure = new Error("無法載入視野材質，請重試準備。");
      for (const waiter of this.waiters.splice(0)) waiter.reject(this.failure);
    };
  }
  wait() {
    if (this.failure) return Promise.reject(this.failure);
    if (!this.busy) return Promise.resolve();
    return new Promise<void>((resolve, reject) =>
      this.waiters.push({ resolve, reject }),
    );
  }
}

/** A one-time lobby barrier, not a game-time delay: finish the submitted GPU work. */
export async function finishPreparation(
  renderer: THREE.WebGLRenderer,
  cancelled: () => boolean,
) {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if (cancelled()) throw new Error("視野準備已取消。");
  const context = renderer.getContext();
  context.finish();
  if (context.isContextLost())
    throw new Error("無法完成視野準備，請重新準備或更換支援 WebGL2 的瀏覽器。");
}
