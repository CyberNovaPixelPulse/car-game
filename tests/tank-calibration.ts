import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test, type CDPSession, type Frame, type Page } from "@playwright/test";
import { dispatchNativeTap } from "./tank-helpers";

type CalibrationWindow = {
  appearanceTimeoutMs: number;
  inputTimeoutMs: number;
  aim?: "early-center";
  evidenceDir?: string;
};

type Sample = {
  needle: number;
  perfectStart: number;
  perfectEnd: number;
  health: number;
};
type Observation = { observedAt: number; sample?: Sample; error?: string };

let observationId = 0;

function observeCalibration({
  binding,
  appearanceTimeoutMs,
  inputTimeoutMs,
  aim,
  captureTiming,
}: CalibrationWindow & { binding: string; captureTiming: boolean }) {
  const globals = window as unknown as Record<string, unknown>;
  const panel = document.querySelector<HTMLElement>(
    '[data-testid="repair-calibration"]',
  );
  const readout = panel?.querySelector(
    '[data-testid="repair-calibration-position"]',
  );
  const health = document.querySelector('[data-testid="tank-health"]');
  const result = document.querySelector(
    '[data-testid="repair-calibration-result"]',
  );
  const notify = globals[binding] as (payload: string) => void;
  if (!panel || !readout || !health || typeof notify !== "function")
    throw new Error("Public calibration HUD or Chromium binding is missing");
  if (!panel.hidden && panel.checkVisibility({ visibilityProperty: true }))
    throw new Error(
      "Expected the next calibration, but the HUD is already active",
    );

  const timing = {
    appearedAt: null as number | null,
    position: "",
    health: "",
    result: "",
    keys: [] as object[],
  };
  const wallTime = () => performance.timeOrigin + performance.now();
  const key = (event: KeyboardEvent) => {
    if (event.code !== "Space") return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    timing.keys.push({
      at: wallTime(),
      type: event.type,
      trusted: event.isTrusted,
      targetTag: target?.tagName,
      targetTestId: target?.dataset.testid,
      focused: document.hasFocus(),
      visibility: document.visibilityState,
      readout: readout.textContent,
      health: health.textContent,
      result: result?.textContent,
    });
  };

  let timer: ReturnType<typeof setTimeout>;
  let expiresAt: number;
  const stop = () => {
    clearTimeout(timer);
    observer.disconnect();
  };
  const report = (reading: Omit<Observation, "observedAt">) => {
    stop();
    notify(JSON.stringify({ ...reading, observedAt: wallTime() }));
  };
  const expire = () =>
    report({
      error:
        timing.appearedAt === null
          ? "Public calibration did not appear before the deadline"
          : "Public needle did not reach the requested perfect window before the deadline",
    });
  const startDeadline = (timeout: number) => {
    clearTimeout(timer);
    expiresAt = performance.now() + timeout;
    timer = setTimeout(expire, timeout);
  };
  const observer = new MutationObserver(() => {
    if (performance.now() >= expiresAt) return expire();
    if (panel.hidden || !panel.checkVisibility({ visibilityProperty: true }))
      return;
    if (timing.appearedAt === null) {
      timing.appearedAt = wallTime();
      startDeadline(inputTimeoutMs);
    }
    timing.position = readout.textContent ?? "";
    timing.health = health.textContent ?? "";
    timing.result = result?.textContent ?? "";
    const angles = timing.position.match(/[\d.]+/g)?.map(Number);
    const hp = Number.parseFloat(timing.health.split("/")[0]);
    if (
      angles?.length !== 5 ||
      !angles.every(Number.isFinite) ||
      !Number.isFinite(hp)
    )
      return report({
        error: "Invalid public calibration angle or HP readout",
      });

    const [needle, , , perfectStart, perfectEnd] = angles;
    const center = (perfectStart + perfectEnd) / 2;
    const [start, end] =
      aim === "early-center"
        ? [center - 8, center]
        : [perfectStart, perfectEnd];
    if (needle >= start && needle <= end)
      report({ sample: { needle, perfectStart, perfectEnd, health: hp } });
  });
  // Register disposal before starting the observer, listeners or timers.
  globals[`${binding}Observer`] = () => {
    stop();
    document.removeEventListener("keydown", key, true);
    document.removeEventListener("keyup", key, true);
    return timing;
  };
  if (captureTiming) {
    document.addEventListener("keydown", key, true);
    document.addEventListener("keyup", key, true);
  }
  observer.observe(panel.parentElement!, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
  startDeadline(appearanceTimeoutMs);
}

/** Start the next calibration with R and tap genuine Space on a public HUD
 * sample. Check the result while R is still held. The operation releases R
 * and joins all observation cleanup before returning. */
export async function withPerfectCalibration(
  page: Page,
  options: CalibrationWindow,
  verify: (healthBefore: number) => Promise<void>,
) {
  const binding = `__tankPublicCalibration${++observationId}`;
  const captureTiming = process.env.TANK_PUBLIC_INPUT_TIMING === "1";
  const failures: unknown[] = [];
  const timing: {
    notification?: { value: Observation; receivedAt: number };
    inputSentAt?: number;
    inputReturnedAt?: number;
    publicHud?: unknown;
  } = {};
  let session: CDPSession | undefined;
  let bindingAttempted = false;
  let holdStarted = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let cancelled: Error | undefined;
  let rejectObservation: ((reason: unknown) => void) | undefined;
  const cancel = (error: Error) => {
    cancelled ??= error;
    rejectObservation?.(error);
  };
  const close = () => cancel(new Error("Calibration page closed"));
  const crash = () => cancel(new Error("Calibration page crashed"));
  const navigate = (frame: Frame) => {
    if (frame === page.mainFrame())
      cancel(new Error("Calibration page navigated"));
  };
  const cleanup = async (step: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (cause) {
      failures.push(new Error(step, { cause }));
    }
  };
  page.on("close", close);
  page.on("crash", crash);
  page.on("framenavigated", navigate);
  try {
    const chromium = await page.context().newCDPSession(page);
    session = chromium;
    await chromium.send("Runtime.enable");
    bindingAttempted = true;
    await chromium.send("Runtime.addBinding", { name: binding });
    if (cancelled) throw cancelled;

    let receive!: (notice: { name: string; payload: string }) => void;
    const input = new Promise<Sample>((resolve, reject) => {
      rejectObservation = reject;
      receive = ({ name, payload }) => {
        if (name !== binding) return;
        chromium.off("Runtime.bindingCalled", receive);
        clearTimeout(watchdog);
        try {
          if (cancelled) throw cancelled;
          const value: Observation = JSON.parse(payload);
          timing.notification = { value, receivedAt: Date.now() };
          if (!value.sample)
            throw new Error(value.error ?? "No calibration reading");
          if (!holdStarted)
            throw new Error("Calibration appeared before the repair key");
          resolve(value.sample);
        } catch (error) {
          reject(error);
        }
      };
    }).then(async (sample) => {
      if (cancelled) throw cancelled;
      timing.inputSentAt = Date.now();
      await dispatchNativeTap(chromium, "Space");
      timing.inputReturnedAt = Date.now();
      return sample;
    });
    input.catch(() => {}); // Keep the result for the join if setup is still pending.
    chromium.on("Runtime.bindingCalled", receive);
    try {
      await page.evaluate(observeCalibration, {
        ...options,
        binding,
        captureTiming,
      });
      if (cancelled) throw cancelled;
      holdStarted = true;
      // This backstop also covers loss of the browser notification itself.
      watchdog = setTimeout(
        () =>
          cancel(
            new Error(
              "Calibration observation did not report before the deadline",
            ),
          ),
        options.appearanceTimeoutMs + options.inputTimeoutMs,
      );
      const down = page.keyboard.down("r").catch((error) => {
        rejectObservation?.(error);
        throw error;
      });
      const [pressed, sampled] = await Promise.allSettled([down, input]);
      if (pressed.status === "rejected") failures.push(pressed.reason);
      if (sampled.status === "rejected" && !failures.includes(sampled.reason))
        failures.push(sampled.reason);
      clearTimeout(watchdog);
      if (failures.length === 0 && sampled.status === "fulfilled") {
        if (cancelled) throw cancelled;
        await verify(sampled.value.health);
        if (cancelled) throw cancelled;
      }
    } finally {
      chromium.off("Runtime.bindingCalled", receive);
      rejectObservation?.(new Error("Calibration observation ended"));
      await input.catch(() => {});
    }
  } catch (error) {
    failures.push(error);
  } finally {
    clearTimeout(watchdog);
    page.off("close", close);
    page.off("crash", crash);
    page.off("framenavigated", navigate);
    await Promise.all([
      holdStarted && cleanup("Release repair key", () => page.keyboard.up("r")),
      bindingAttempted &&
        cleanup("Dispose public calibration observation", async () => {
          await cleanup("Remove Chromium calibration binding", () =>
            session!.send("Runtime.removeBinding", { name: binding }),
          );
          timing.publicHud = await page.evaluate((name) => {
            const globals = window as unknown as Record<string, unknown>;
            const entry = `${name}Observer`;
            try {
              return (globals[entry] as (() => unknown) | undefined)?.();
            } finally {
              delete globals[entry];
              delete globals[name];
            }
          }, binding);
        }),
    ]);
    if (session)
      await cleanup("Detach calibration CDP session", () => session!.detach());
    if (captureTiming || failures.length)
      await cleanup("Save calibration evidence", async () => {
        const evidenceDir = options.evidenceDir ?? test.info().outputDir;
        await mkdir(evidenceDir, { recursive: true });
        await writeFile(
          join(
            evidenceDir,
            `perfect-public-input-${Date.now()}-${binding}.json`,
          ),
          JSON.stringify(
            {
              ...timing,
              aim: options.aim ?? "full",
              appearanceTimeoutMs: options.appearanceTimeoutMs,
              inputTimeoutMs: options.inputTimeoutMs,
              failures: failures.map(errorDetails),
            },
            null,
            2,
          ),
        );
      });
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      "Calibration operation and cleanup failed",
    );
}

function errorDetails(error: unknown): object {
  if (!(error instanceof Error)) return { message: String(error) };
  return {
    message: error.message,
    stack: error.stack,
    cause: error.cause === undefined ? undefined : errorDetails(error.cause),
    errors:
      error instanceof AggregateError
        ? error.errors.map(errorDetails)
        : undefined,
  };
}
