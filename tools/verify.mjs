import { e2eArgumentError } from "./validation-policy.ts";
import { mkdirSync, writeFileSync, readFileSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
const root = resolve(import.meta.dirname, "..");
const base = join(root, "output/qa");
const mode = process.argv[2] || "fast";
if (mode === "status") {
  const index = JSON.parse(readFileSync(join(base, "latest.json"), "utf8"));
  const report = JSON.parse(readFileSync(index.report, "utf8"));
  if (report.status === "running") {
    try {
      process.kill(report.pid, 0);
    } catch {
      report.status = "interrupted";
    }
  }
  console.log(JSON.stringify(report, null, 2));
} else {
  if (!["fast", "e2e"].includes(mode))
    throw new Error("Supported modes: fast, status, e2e");
  const selected = process.argv.slice(3);
  if (mode === "e2e" && e2eArgumentError(selected))
    throw new Error(e2eArgumentError(selected));
  mkdirSync(base, { recursive: true });
  const run = join(base, `${Date.now()}-${randomUUID().slice(0, 8)}`);
  mkdirSync(run); // Exclusive directory: existing evidence is never reused.
  const reportPath = join(run, "report.json");
  const report = {
    source: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    dirty: Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ),
    pid: process.pid,
    scope:
      mode === "fast"
        ? "typecheck + policy checks + test collection; no browsers/gameplay"
        : "requested bounded E2E; resource guard may reject before browser launch",
    status: "running",
    startedAt: new Date().toISOString(),
    steps: [],
  };
  const save = () => {
    writeFileSync(`${reportPath}.tmp`, JSON.stringify(report, null, 2));
    renameSync(`${reportPath}.tmp`, reportPath);
  };
  save();
  const indexTmp = join(base, `latest-${randomUUID()}.tmp`);
  writeFileSync(indexTmp, JSON.stringify({ report: reportPath }));
  renameSync(indexTmp, join(base, "latest.json"));
  const commands =
    mode === "e2e"
      ? [
          [
            "npx",
            [
              "--no-install",
              "playwright",
              "test",
              ...selected,
              "--output",
              join(run, "test-results"),
              "--reporter=list,json",
            ],
          ],
        ]
      : [
          [
            "node",
            ["--import", "tsx", "--test", "tools/validation-policy.test.ts"],
          ],
          ["npm", ["run", "check"]],
          ["npx", ["--no-install", "playwright", "test", "--list"]],
        ];
  for (const [command, args] of commands) {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      timeout: mode === "fast" ? 120000 : 4_560_000,
      env: {
        ...process.env,
        TANK_EVIDENCE_DIR: join(run, "evidence"),
        TANK_FLASH_EVIDENCE: join(run, "evidence/flash"),
        PLAYWRIGHT_JSON_OUTPUT_FILE: join(run, "results.json"),
        PLAYWRIGHT_JSON_OUTPUT_NAME: join(run, "results.json"),
      },
    });
    const log = join(run, `${report.steps.length + 1}.log`);
    writeFileSync(log, (result.stdout || "") + (result.stderr || ""));
    report.steps.push({
      command: [command, ...args],
      status: result.status,
      signal: result.signal,
      error: result.error?.message,
      log,
    });
    save();
    if (result.status !== 0) {
      console.error(
        ((result.stdout || "") + (result.stderr || "")).slice(-6000),
      );
      report.status = "failed";
      break;
    }
  }
  if (report.status === "running") report.status = "passed";
  report.endedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "passed" ? 0 : 1;
}
