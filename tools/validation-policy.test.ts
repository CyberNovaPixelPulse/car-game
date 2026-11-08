import { test } from "node:test";
import assert from "node:assert/strict";
import { browserPolicyError, e2eArgumentError } from "./validation-policy";
const ready = { TANK_E2E_RESOURCE_READY: "1" };
const targeted = [
  "tests/tank-entry.spec.ts",
  "-g",
  "入口",
  "--global-timeout=300000",
];
test("collection remains browser-free on local Mac", () =>
  assert.equal(browserPolicyError(["--list"], {}, "darwin"), undefined));
test("local Mac cannot accidentally launch even approved multi-scene E2E", () =>
  assert.match(browserPolicyError(targeted, ready, "darwin")!, /Mac/));
test("other hosts require explicit resource confirmation", () =>
  assert.match(browserPolicyError(targeted, {}, "linux")!, /資源/));
test("targeted host run requires bounded selection", () => {
  assert.equal(browserPolicyError(targeted, ready, "linux"), undefined);
  assert.match(
    browserPolicyError(["--global-timeout=300000"], ready, "linux")!,
    /指定/,
  );
});
test("missing, duplicate and invalid budgets fail closed", () => {
  for (const args of [
    [],
    ["--global-timeout=NaN"],
    ["--global-timeout=-1"],
    ["--global-timeout=0"],
    ["--global-timeout=10", "--global-timeout=20"],
  ])
    assert.match(browserPolicyError(args, ready, "linux")!, /單一正整數/);
});
test("full suite requires explicit opt-in and bounded cost", () => {
  assert.equal(
    browserPolicyError(
      ["--global-timeout=4200000"],
      { ...ready, TANK_FULL_REGRESSION: "1" },
      "linux",
    ),
    undefined,
  );
  assert.match(
    browserPolicyError(
      ["--global-timeout=4500001"],
      { ...ready, TANK_FULL_REGRESSION: "1" },
      "linux",
    )!,
    /75/,
  );
  assert.match(
    browserPolicyError(
      [...targeted.slice(0, 3), "--global-timeout=600001"],
      ready,
      "linux",
    )!,
    /10/,
  );
});

test("E2E entry protects capture destinations and avoids repeated aliases", () => {
  for (const arg of [
    "--output=old",
    "--output",
    "-oold",
    "--repeat-each=3",
    "--config=other",
    "--ui",
    "--debug",
    "--workers=3",
    "-j",
    "-j3",
    "--reporter=json",
    "--list",
  ])
    assert.ok(e2eArgumentError([arg]));
  assert.equal(e2eArgumentError(targeted), undefined);
});

test("UI flags cannot turn collection into an unbounded local browser run", () =>
  assert.match(browserPolicyError(["--list", "--ui"], {}, "darwin")!, /Mac/));
