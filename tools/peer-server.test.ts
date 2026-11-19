import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("the PeerServer entry starts and serves its health endpoint", async (t) => {
  const entry = fileURLToPath(new URL("../server/index.ts", import.meta.url));
  const relay = spawn(process.execPath, ["--import", "tsx", entry], {
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = new Promise<void>((resolve) => {
    relay.once("close", () => resolve());
  });
  t.after(async () => {
    relay.kill("SIGKILL");
    await closed;
  });

  let stdout = "";
  let stderr = "";
  relay.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `PeerServer did not announce a port within 5 seconds\n${stdout}${stderr}`,
        ),
      );
    }, 5_000);

    relay.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
      const match = /PeerServer listening on port (\d+)\r?\n/.exec(stdout);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    relay.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    relay.once("close", (code, signal) => {
      clearTimeout(timer);
      reject(
        new Error(
          `PeerServer exited before announcing a port (${code ?? signal})\n${stdout}${stderr}`,
        ),
      );
    });
  });

  const response = await fetch(`http://127.0.0.1:${port}/health`, {
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});
