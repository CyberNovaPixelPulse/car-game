import * as THREE from "three";
import { disposeArt } from "./tank-art-materials";
import type { TankState } from "./tank-core";
import type { LoaderHands } from "./tank-loader-hands";

/** Contact points are children of the exported panel, shared with the artist's model. */
export class LoaderRepair {
  private readonly wrist = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly fingers = new THREE.Vector3();
  private readonly palm = new THREE.Vector3();

  static bind(asset: THREE.Group, scene: THREE.Scene, hands: LoaderHands) {
    const panel = asset.getObjectByName("RepairPanel");
    const brace = asset.getObjectByName("Brace");
    const fastener = asset.getObjectByName("Fastener");
    const tool = asset.getObjectByName("SocketWrench");
    if (!panel || !brace || !fastener || !tool) {
      disposeArt(asset);
      return;
    }
    asset.traverse((part) => {
      if (part instanceof THREE.Mesh)
        part.castShadow = part.receiveShadow = true;
    });
    scene.add(asset);
    panel.position.set(0.8, 1.49, 0.38);
    panel.rotation.y = 0.55;
    panel.visible = false;
    panel.updateWorldMatrix(true, true);
    // The tool's origin is the open socket. The handle passes between palm and curled fingers.
    hands.right.glove.add(tool);
    tool.position.set(-0.162, 0.056, -0.066);
    tool.visible = false;
    return new LoaderRepair(panel, brace, fastener, tool, hands);
  }

  private constructor(
    private readonly panel: THREE.Object3D,
    private readonly brace: THREE.Object3D,
    private readonly fastener: THREE.Object3D,
    private readonly tool: THREE.Object3D,
    private readonly hands: LoaderHands,
  ) {}

  present(state: TankState) {
    this.panel.visible = state.weapon.mode === "repair";
    this.tool.visible =
      this.panel.visible && state.repair.status === "repairing";
    if (!this.tool.visible) return;

    this.hands.group.visible = true;
    this.brace.getWorldPosition(this.wrist);
    this.wrist.addScaledVector(
      this.palm.set(0, 0, 1).transformDirection(this.panel.matrixWorld),
      0.033,
    );
    this.palm.negate();
    this.fingers.set(0, 1, 0);
    this.hands.left.place(this.wrist, this.fingers, this.palm);

    // Ratchet about the fastener. Only work credited to the shared tank advances the stroke.
    const seconds = state.repair.activeSeconds;
    const swing =
      -0.18 + 0.52 * Math.sin(seconds * 7.1) + 0.12 * Math.sin(seconds * 12.3);
    this.tangent
      .set(Math.cos(swing), Math.sin(swing), 0)
      .transformDirection(this.panel.matrixWorld);
    this.fingers
      .set(-Math.sin(swing), Math.cos(swing), 0)
      .transformDirection(this.panel.matrixWorld);
    this.fastener.getWorldPosition(this.wrist);
    const grip = this.tool.position;
    const scale = this.hands.right.glove.scale.x;
    this.wrist
      .addScaledVector(this.tangent, -grip.x * scale)
      .addScaledVector(this.fingers, -grip.y * scale)
      .addScaledVector(this.palm, grip.z * scale);
    this.hands.right.place(this.wrist, this.fingers, this.palm);
  }
}
