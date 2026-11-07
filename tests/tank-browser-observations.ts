import { writeFile } from "node:fs/promises";
import { test, type Page } from "@playwright/test";

/** Observation only: never suppress an event, intercept a request or read game
 * state. Redact connection URLs, credentials, peer IDs and room codes. */
export async function observeBrowser(
  page: Page,
  evidence: string,
  index: number,
) {
  const started = Date.now();
  const events: Record<string, unknown>[] = [];
  const staticPath = (value: string) => {
    try {
      const path = new URL(value).pathname;
      return /^\/(?:art|assets|web|draco)\//.test(path) ||
        /^\/favicon/.test(path)
        ? path
        : "[document-or-connection]";
    } catch {
      return "[non-URL]";
    }
  };
  const sanitize = (value: string) =>
    value
      .replace(/(?:https?|wss?):\/\/[^\s"'<>\)]+/g, staticPath)
      .replace(/tank-crew-v1-[\w-]+/g, "[peer]")
      .replace(/\b[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\b/gi, "[id]")
      .replace(/\b[A-Z2-9]{6}\b/g, "[room]")
      .replace(/\b[\w-]{24,}\b/g, "[opaque]")
      .slice(0, 2000);
  const record = (kind: string, details: Record<string, unknown>) =>
    events.push({ elapsedMs: Date.now() - started, kind, ...details });
  page.on("console", (message) => {
    if (!["warning", "error"].includes(message.type())) return;
    const text = sanitize(message.text());
    record("console", { level: message.type(), text });
  });
  page.on("pageerror", (error) =>
    record("pageerror", {
      name: error.name,
      text: sanitize(error.message),
      stack: sanitize(error.stack || ""),
    }),
  );
  page.on("crash", () => record("renderer-crash", {}));
  page.on("requestfailed", (request) =>
    record("requestfailed", {
      path: staticPath(request.url()),
      type: request.resourceType(),
      text: sanitize(request.failure()?.errorText || "unknown"),
    }),
  );
  page.on("response", (response) => {
    if (response.status() >= 400)
      record("http-error", {
        path: staticPath(response.url()),
        status: response.status(),
      });
  });
  // Public canvas event; no preventDefault, recovery, renderer or game call.
  await page.addInitScript(() =>
    document.addEventListener(
      "webglcontextlost",
      () => console.warn("Tank acceptance observation: WebGL context lost"),
      true,
    ),
  );
  const title = test.info().title;
  return async () =>
    writeFile(
      `${evidence}/browser-observations-${started}-${index}.json`,
      JSON.stringify(
        {
          sourceSha: process.env.TANK_SOURCE_SHA || "working-tree",
          title,
          index,
          independentBrowser: process.env.TANK_THREE_BROWSERS === "1",
          events,
        },
        null,
        2,
      ),
    );
}
