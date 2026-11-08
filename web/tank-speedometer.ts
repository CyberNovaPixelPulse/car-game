/** A 0–30 km/h instrument; authority stays in metres per second. */
export function speedometerMarkup() {
  const ticks = Array.from({ length: 16 }, (_, i) => {
    const a = ((-120 + i * 16) * Math.PI) / 180;
    const point = (r: number) => ({
      x: 80 + Math.sin(a) * r,
      y: 80 - Math.cos(a) * r,
    });
    const inner = point(i % 5 === 0 ? 55 : 60),
      outer = point(65),
      label = point(43);
    return `<line x1="${inner.x}" y1="${inner.y}" x2="${outer.x}" y2="${outer.y}"/>${i % 5 === 0 ? `<text x="${label.x}" y="${label.y + 4}">${i * 2}</text>` : ""}`;
  }).join("");
  return `<div class="speedometer" role="group" aria-label="駕駛時速表"><svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="72"/>${ticks}<path class="speed-needle" d="M77 91 L80 23 L83 91 Z" transform="rotate(-120 80 80)"/><circle class="speed-hub" cx="80" cy="80" r="5"/></svg><div class="speed-readout"><strong data-testid="tank-speed">0.0</strong><span>km/h</span><span class="speed-motion"><span data-testid="tank-motion">靜止</span> · <span data-testid="tank-contact">車體正常</span></span></div></div>`;
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
}
