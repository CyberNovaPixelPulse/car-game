import type { CameraPreferences } from "./tank-motion-preferences";

const levels = [
  { key: "overall", name: "整體強度" },
  { key: "impact", name: "瞬間衝擊" },
  { key: "continuous", name: "持續晃動" },
] as const;

export function motionControlsMarkup() {
  return `<button type="button" class="secondary" id="station-motion" aria-label="鏡頭震動">鏡頭震動</button>
    <button type="button" class="secondary" popovertarget="station-motion-levels" aria-label="調整鏡頭強度">震動強度</button>
    <section id="station-motion-levels" popover aria-labelledby="motion-heading">
      <header><h2 id="motion-heading">鏡頭震動</h2>
        <button type="button" popovertarget="station-motion-levels" popovertargetaction="hide" aria-label="關閉強度設定">關閉</button>
      </header>
      ${levels
        .map(
          ({ key, name }) => `<div class="motion-level">
        <label for="motion-${key}">${name}</label>
        <output for="motion-${key}" aria-hidden="true"></output>
        <input id="motion-${key}" type="range" min="0" max="100" step="5">
      </div>`,
        )
        .join("")}
      <button type="button" class="secondary" id="motion-reduce">減少持續晃動</button>
    </section>`;
}

export function mountMotionControls(
  element: HTMLElement,
  initial: CameraPreferences,
  onChange: (value: CameraPreferences) => void,
) {
  let preferences = initial;
  const toggle = element.querySelector<HTMLButtonElement>("#station-motion")!;
  const reduce = element.querySelector<HTMLButtonElement>("#motion-reduce")!;
  const sliders = levels.map(({ key }) => ({
    key,
    input: element.querySelector<HTMLInputElement>(`#motion-${key}`)!,
    output: element.querySelector<HTMLOutputElement>(
      `output[for="motion-${key}"]`,
    )!,
  }));
  function show() {
    toggle.textContent = preferences.enabled ? "鏡頭震動：開" : "鏡頭震動：關";
    toggle.setAttribute("aria-pressed", String(preferences.enabled));
    for (const { key, input, output } of sliders) {
      const percent = Math.round(preferences[key] * 100);
      input.value = String(percent);
      input.setAttribute("aria-valuetext", `${percent}%`);
      output.value = `${percent}%`;
    }
  }
  function change(update: Partial<CameraPreferences>) {
    preferences = { ...preferences, ...update };
    onChange(preferences);
    show();
  }
  toggle.onclick = () => change({ enabled: !preferences.enabled });
  reduce.onclick = () =>
    change({ continuous: Math.min(0.25, preferences.continuous) });
  for (const { key, input } of sliders)
    input.oninput = () => change({ [key]: input.valueAsNumber / 100 });
  show();
}
