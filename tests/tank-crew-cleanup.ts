type PageOwner = {
  label: string;
  observe: () => Promise<void>;
  beforeClose?: () => Promise<void>;
  close: () => Promise<void>;
  afterClose?: () => Promise<void>;
};
type BrowserOwner = { label: string; close: () => Promise<void> };
type Phase = {
  owner: string;
  phase: string;
  start: number;
  end: number;
  ok: boolean;
};

/** Join repeated calls, finalize every independent owner, and retain every
 * failure. One slow context must not postpone starting the other contexts. */
export function createCrewCleanup(
  pages: PageOwner[],
  browsers: BrowserOwner[],
  record?: (phases: Phase[]) => Promise<void>,
) {
  let closing: Promise<void> | undefined;
  return () =>
    (closing ??= (async () => {
      const errors: Error[] = [];
      const phases: Phase[] = [];
      const settle = async (label: string, tasks: Promise<unknown>[]) => {
        const results = await Promise.allSettled(tasks);
        for (const result of results)
          if (result.status === "rejected")
            errors.push(new Error(label, { cause: result.reason }));
      };
      const run = async (
        owner: string,
        phase: string,
        action?: () => Promise<void>,
      ) => {
        if (!action) return true;
        const start = Date.now();
        let ok = true;
        try {
          await action();
        } catch (cause) {
          ok = false;
          errors.push(new Error(`${owner}: ${phase}`, { cause }));
        }
        phases.push({ owner, phase, start, end: Date.now(), ok });
        return ok;
      };
      // Preserve the observations even if context finalization consumes the
      // runner's cleanup deadline. Final flushes include later close events.
      await settle(
        "pre-close observation orchestration",
        pages.map((page) =>
          run(page.label, "observe-before-close", page.observe),
        ),
      );
      await settle(
        "page cleanup orchestration",
        pages.map(async (page) => {
          await run(page.label, "audio", page.beforeClose);
          const closed = await run(page.label, "context-close", page.close);
          await run(page.label, "observe-after-close", page.observe);
          if (closed) await run(page.label, "media", page.afterClose);
        }),
      );
      await settle(
        "browser cleanup orchestration",
        browsers.map((browser) =>
          run(browser.label, "browser-close", browser.close),
        ),
      );
      await run("crew", "cleanup-manifest", record && (() => record(phases)));
      if (errors.length)
        throw new AggregateError(errors, "Crew cleanup failed");
    })());
}
