import { CrewCameraMotion } from "./tank-camera-motion";
import type { CameraPreferences } from "./tank-motion-preferences";
import type { CrewRole } from "./crew";
import { validViewAspect } from "./tank-battle-view";
import type { TankState } from "./tank-core";
import { InteriorLook } from "./tank-interior-look";
import { TankInteriorScene } from "./tank-interior-scene";
import { TankScene } from "./tank-scene";
import type { SceneQuality } from "./tank-scene-quality";

export interface RoleViewContext {
  readonly match: symbol;
  readonly role: CrewRole;
}

interface ViewCanvas<Scene> {
  canvas: HTMLCanvasElement;
  scene: Scene;
}

interface RoleViews {
  context: RoleViewContext;
  motion: CrewCameraMotion;
  phase: "preparing" | "ready" | "mounted";
  exterior?: ViewCanvas<TankScene>;
  interior?: ViewCanvas<TankInteriorScene>;
  loader?: {
    mgViewport: HTMLElement;
    look: InteriorLook;
  };
  onRestoreError?: (error: unknown) => void;
}

function artCanvas(label: string) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", label);
  canvas.setAttribute("role", "img");
  return canvas;
}

export class TankRoleViews {
  private current?: RoleViews;
  private quality: SceneQuality = "medium";

  get preparing() {
    return this.current?.phase === "preparing";
  }

  get exteriorAspect() {
    const canvas = this.current?.exterior?.canvas;
    if (
      this.current?.phase !== "mounted" ||
      !canvas?.isConnected ||
      (canvas.checkVisibility &&
        !canvas.checkVisibility({ visibilityProperty: true })) ||
      !canvas.clientHeight
    )
      return undefined;
    const aspect = canvas.clientWidth / canvas.clientHeight;
    return validViewAspect(aspect) ? aspect : undefined;
  }

  async prepare(
    context: RoleViewContext,
    state: TankState,
    callbacks: { onReady: () => void; onError: (error: unknown) => void },
  ) {
    const views = this.begin(context);
    try {
      // Let the pending status paint before starting expensive graphics work.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (this.current !== views) return;
      if (context.role === "loader") this.createInterior(views);
      this.createExterior(views);
      if (views.interior) await views.interior.scene.prepare(state);
      if (this.current !== views) return;
      await views.exterior!.scene.prepare(state);
    } catch (error) {
      if (this.current !== views) return;
      this.clear();
      callbacks.onError(error);
      return;
    }
    if (this.current !== views) return;
    views.phase = "ready";
    callbacks.onReady();
  }

  mount(context: RoleViewContext, station: HTMLElement): boolean {
    const views = this.current;
    if (
      views?.phase !== "ready" ||
      views.context.match !== context.match ||
      views.context.role !== context.role ||
      station.dataset.role !== context.role
    )
      return false;
    this.attach(views, station);
    return true;
  }

  restore(
    context: RoleViewContext,
    station: HTMLElement,
    state: TankState,
    onError: (error: unknown) => void,
  ) {
    const views = this.begin(context);
    try {
      if (context.role === "loader") {
        this.createInterior(views);
        // Reconnect can return straight to the machine gun. For interior work,
        // keep the original lazy creation when the player next uses the gun.
        if (state.weapon.mode === "machine-gun") this.createExterior(views);
        else views.onRestoreError = onError;
      } else this.createExterior(views);
      this.attach(views, station);
    } catch (error) {
      this.clear();
      onError(error);
    }
  }

  lookKey(code: string, down: boolean, repeat = false) {
    return this.current?.loader?.look.key(code, down, repeat) ?? false;
  }

  releaseLook() {
    this.current?.loader?.look.release();
  }

  render(
    state: TankState,
    paused: boolean,
    preferences: CameraPreferences,
    held = 0,
  ) {
    const views = this.current;
    if (views?.phase !== "mounted") return;
    const station =
      views.context.role === "loader" ? state.weapon.mode : views.context.role;
    const offset = views.motion.sample(state, station, paused, preferences);
    const loader = views.loader;
    if (!loader) {
      views.exterior!.scene.render(state, offset, paused ? 0 : held);
      return;
    }

    const lookYaw = loader.look.sample(
      state.weapon.mode,
      paused || state.battle.failed || state.battle.won,
    );
    const machineGun = state.weapon.mode === "machine-gun";
    if (machineGun) {
      if (!views.exterior && views.onRestoreError) {
        const onError = views.onRestoreError;
        views.onRestoreError = undefined;
        try {
          this.createExterior(views);
        } catch (error) {
          onError(error);
        }
      }
      if (views.exterior && !views.exterior.canvas.isConnected) {
        loader.mgViewport.prepend(views.exterior.canvas);
        views.interior!.scene.invalidate();
      }
      views.exterior?.scene.render(state, offset);
    } else {
      if (views.exterior?.canvas.isConnected) {
        views.exterior.scene.leaveMachineGun();
        views.exterior.canvas.remove();
      }
      views.interior!.scene.render(
        state,
        offset,
        preferences.enabled && !state.battle.failed && !state.battle.won
          ? preferences.overall * preferences.impact
          : 0,
        lookYaw,
      );
    }
  }

  setQuality(quality: SceneQuality) {
    this.quality = quality;
    this.current?.exterior?.scene.setQuality(quality);
    this.current?.interior?.scene.setQuality(quality);
  }

  clear() {
    const views = this.current;
    this.current = undefined;
    views?.exterior?.canvas.remove();
    views?.interior?.canvas.remove();
    views?.exterior?.scene.dispose();
    views?.interior?.scene.dispose();
  }

  private begin(context: RoleViewContext) {
    this.clear();
    const views: RoleViews = {
      context,
      phase: "preparing",
      motion: new CrewCameraMotion(),
    };
    this.current = views;
    return views;
  }

  private createInterior(views: RoleViews) {
    const canvas = artCanvas("車內炮膛與彈藥架");
    views.interior = {
      canvas,
      scene: new TankInteriorScene(canvas, this.quality),
    };
  }

  private createExterior(views: RoleViews) {
    const role = views.context.role;
    const canvas = artCanvas(
      role === "driver"
        ? "駕駛裝甲觀察窗"
        : role === "gunner"
          ? "主炮戰場視野"
          : "機槍戰場視野",
    );
    views.exterior = {
      canvas,
      scene: new TankScene(
        canvas,
        role === "loader" ? "machine-gun" : role,
        this.quality,
      ),
    };
  }

  private attach(views: RoleViews, station: HTMLElement) {
    if (views.context.role === "loader") {
      const interiorViewport =
        station.querySelector<HTMLElement>(".interior-viewport")!;
      const mgWorkspace = station.querySelector<HTMLElement>(".mg-workspace")!;
      const mgViewport =
        mgWorkspace.querySelector<HTMLElement>(".battle-viewport")!;
      views.loader = { mgViewport, look: new InteriorLook() };
      interiorViewport.prepend(views.interior!.canvas);
    } else {
      station
        .querySelector(".battle-viewport")!
        .prepend(views.exterior!.canvas);
    }
    views.phase = "mounted";
  }
}
