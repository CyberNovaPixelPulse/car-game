import assert from "node:assert/strict";
import test from "node:test";
import { TankCore } from "../web/tank-core";
import { TankMechanicalAudio } from "../web/tank-mechanical-audio";
import { fireWeapon } from "../web/tank-weapons";

// Observe output at the browser's audio destination; keep game and cue selection real.
function recordingOutput() {
  const starts: number[] = [];
  const param = {
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  };
  const context = {
    currentTime: 0,
    state: "running",
    sampleRate: 48000,
    destination: {},
    createBuffer(_channels: number, length: number, sampleRate: number) {
      const data = new Float32Array(length);
      return { length, sampleRate, getChannelData: () => data };
    },
    createBufferSource: node,
    createBiquadFilter: node,
    createGain: node,
    createOscillator: node,
  };
  function node() {
    return {
      frequency: param,
      Q: param,
      gain: param,
      connect(destination: unknown) {
        return destination;
      },
      disconnect() {},
      start(time = context.currentTime) {
        starts.push(time);
      },
      stop() {},
    };
  }
  return { context: context as unknown as AudioContext, starts };
}

test("the gunner hears a fresh accepted cannon shot once, including after mounting mid-battle", () => {
  const state = new TankCore(() => "gunner").view();
  const audio = new TankMechanicalAudio();
  const { context, starts } = recordingOutput();
  const fire = () =>
    fireWeapon(state.weapon, { x: 0, z: 0, yaw: 0, pitch: 0 }, state.time);
  const load = () => {
    state.weapon.chamber = "loaded";
    state.weapon.chamberShell = "ap";
  };
  const present = (enabled = true) =>
    audio.present(state, context, enabled, "gunner");
  load();
  fire();
  present();
  assert.deepEqual(
    starts,
    [],
    "entering a station does not replay an old blast",
  );
  fire(); // Rejected while the previous shell is ejecting.
  present();
  assert.deepEqual(starts, []);

  state.time += 5;
  load();
  fire();
  present();
  assert.ok(
    starts.length > 0,
    "the next accepted shot reaches the gunner speaker",
  );
  const afterShot = starts.length;
  present();
  assert.equal(
    starts.length,
    afterShot,
    "the same shot snapshot is silent on the next frame",
  );

  state.time += 5;
  load();
  fire();
  present(false);
  present();
  assert.equal(
    starts.length,
    afterShot,
    "unmuting does not play a missed shot",
  );
  audio.reset();
  state.time += 5;
  load();
  fire();
  present();
  assert.equal(
    starts.length,
    afterShot,
    "restoring a later authoritative snapshot seeds the baseline",
  );
});

test("the loader hears clicks on the return stroke and silence while pushing, releasing, or turning the dial", () => {
  const state = new TankCore(() => "loader").view();
  state.weapon.mode = "repair";
  state.repair.status = "repairing";
  const audio = new TankMechanicalAudio();
  const { context, starts } = recordingOutput();
  const frame = (at: number, enabled = true) => {
    state.time = state.repair.activeSeconds = at;
    audio.present(state, context, enabled, "loader");
  };
  frame(0);
  for (const at of [0.05, 0.1, 0.15, 0.2]) frame(at);
  const clicks = starts.length;
  assert.ok(
    clicks > 0,
    "the first upwards stroke drives the pawl over the ratchet teeth",
  );
  for (const at of [0.25, 0.3, 0.4, 0.5, 0.6, 0.7]) frame(at);
  assert.equal(starts.length, clicks, "the loaded downstroke does not rattle");
  state.repair.status = "ready";
  frame(0.7);
  frame(0.7);
  assert.equal(starts.length, clicks, "a stationary tool stays quiet");
  state.repair.calibration.id += 1;
  state.repair.calibration.result = "active";
  state.repair.status = "repairing";
  frame(0.72);
  const calibrationTones = starts.length;
  for (const at of [0.8, 0.9, 1.0]) frame(at);
  assert.equal(
    starts.length,
    calibrationTones,
    "working on the ring parks the wrench",
  );

  state.repair.calibration.result = "perfect";
  state.repair.calibration.confirmedAt = 1;
  frame(1);
  const confirmation = starts.length;
  for (const at of [1.1, 1.2, 1.3, 1.4]) frame(at);
  assert.equal(
    starts.length,
    confirmation,
    "no ratchet while the hand returns to the grip",
  );
  for (let i = 15; i <= 25; i++) frame(i / 10);
  assert.ok(
    starts.length > confirmation,
    "the next actual strokes click again",
  );

  audio.reset();
  const afterStrokes = starts.length;
  frame(4.4);
  frame(4.4);
  assert.equal(
    starts.length,
    afterStrokes,
    "reconnect never catches up missed ratchet teeth",
  );
});

test("releasing R after a successful calibration lets the return animation finish without accruing work", () => {
  const state = new TankCore(() => "loader").view();
  const audio = new TankMechanicalAudio();
  const { context, starts } = recordingOutput();
  state.weapon.mode = "repair";
  state.repair.calibration.id = 1;
  state.repair.calibration.result = "active";
  state.repair.status = "repairing";
  const frame = () => audio.present(state, context, true, "loader");
  frame();
  state.repair.calibration.result = "success";
  state.repair.calibration.confirmedAt = 0;
  frame();
  const afterResult = starts.length;
  state.repair.status = "ready";
  state.time = 1;
  frame();
  assert.equal(starts.length, afterResult);
  state.repair.status = "repairing";
  frame();
  state.repair.activeSeconds = 0.1;
  state.time += 0.1;
  frame();
  assert.ok(
    starts.length > afterResult,
    "the first return stroke after the player resumes can sound",
  );
});

test("a skipped return stroke never plays a click on the following downstroke", () => {
  const state = new TankCore(() => "loader").view();
  state.weapon.mode = "repair";
  state.repair.status = "repairing";
  const audio = new TankMechanicalAudio();
  const { context, starts } = recordingOutput();
  // These two visible frames straddle the peak; the handle is higher on the
  // second frame than the first, but it has already started moving down.
  for (const at of [1, 1.2]) {
    state.time = state.repair.activeSeconds = at;
    audio.present(state, context, true, "loader");
  }
  assert.deepEqual(starts, []);
});

test("an accepted gunner shot survives a long foreground frame without replay on restore", () => {
  const state = new TankCore(() => "gunner").view();
  const audio = new TankMechanicalAudio();
  const { context, starts } = recordingOutput();
  const present = () => audio.present(state, context, true, "gunner");
  const fire = () => {
    state.weapon.chamber = "loaded";
    state.weapon.chamberShell = "ap";
    fireWeapon(state.weapon, { x: 0, z: 0, yaw: 0, pitch: 0 }, state.time);
  };
  present();
  fire();
  state.time += 0.61;
  present();
  assert.ok(
    starts.length > 0,
    "a delayed frame can still present a new foreground shot",
  );
  const afterShot = starts.length;
  present();
  assert.equal(starts.length, afterShot);
  audio.reset();
  fire();
  present();
  assert.equal(
    starts.length,
    afterShot,
    "a newly visible station seeds its first snapshot",
  );
});
