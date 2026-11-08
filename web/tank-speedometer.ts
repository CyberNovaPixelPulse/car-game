/** A 0–30 km/h instrument; authority stays in metres per second. */
export function speedometerMarkup() {
  const ticks = Array.from({ length: 16 }, (_, i) => {
    const a = ((-120 + i * 16) * Math.PI) / 180;
    const point = (r: number) =>
      `${80 + Math.sin(a) * r},${80 - Math.cos(a) * r}`;
    return `<line x1="${point(i % 5 === 0 ? 55 : 60).split(",")[0]}" y1="${point(i % 5 === 0 ? 55 : 60).split(",")[1]}" x2="${point(65).split(",")[0]}" y2="${point(65).split(",")[1]}"/>${i % 5 === 0 ? `<text x="${point(43).split(",")[0]}" y="${Number(point(43).split(",")[1]) + 4}">${i * 2}</text>` : ""}`;
  }).join("");
  return `<div class="speedometer" role="group" aria-label="駕駛時速表"><svg viewBox="0 0 160 150" aria-hidden="true"><circle cx="80" cy="80" r="72"/>${ticks}<path class="speed-needle" d="M77 91 L80 23 L83 91 Z" transform="rotate(-120 80 80)"/><circle class="speed-hub" cx="80" cy="80" r="5"/></svg><div class="speed-readout"><strong data-testid="tank-speed">0.0</strong><span>km/h</span><span data-testid="speed-direction">停止</span></div></div>`;
}

export function presentSpeedometer(root: HTMLElement, speed: number) {
  const dial = root.querySelector(".speedometer");
  if (!dial) return;
  const kmh = Math.abs(speed) * 3.6;
  dial.querySelector('[data-testid="tank-speed"]')!.textContent =
    kmh.toFixed(1);
  dial
    .querySelector(".speed-needle")!
    .setAttribute("transform", `rotate(${-120 + Math.min(kmh, 30) * 8} 80 80)`);
  dial.querySelector('[data-testid="speed-direction"]')!.textContent =
    Math.abs(speed) < 0.05 ? "停止" : speed < 0 ? "倒車" : "前進";
}
