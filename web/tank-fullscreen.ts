/** Local browser display ownership; no room or simulation state is changed. */
export function attachFullscreenControl(station: HTMLElement) {
  const button = station.querySelector<HTMLButtonElement>(
    "#station-fullscreen",
  )!;
  const status = station.querySelector<HTMLElement>("#station-display-status")!;
  let disposed = false;
  let pending = false;
  let failure = "";
  const available =
    document.fullscreenEnabled &&
    typeof station.requestFullscreen === "function";

  function sync() {
    if (disposed) return;
    const active = document.fullscreenElement === station;
    button.textContent = active ? "退出全螢幕" : "進入全螢幕";
    button.setAttribute("aria-pressed", String(active));
    button.disabled = pending || (!available && !active);
    status.textContent =
      failure ||
      (active
        ? "按 Esc 或「退出全螢幕」返回視窗。"
        : available
          ? ""
          : "此瀏覽器無法使用全螢幕，仍可在鋪滿頁面模式遊玩。");
    status.hidden = !status.textContent;
  }
  function failed() {
    failure =
      document.fullscreenElement === station
        ? "無法退出全螢幕，請按 Esc 或使用瀏覽器的退出控制。"
        : "無法進入全螢幕，仍可在鋪滿頁面模式遊玩；可重試或檢查瀏覽器權限。";
    sync();
  }
  function changed() {
    failure = "";
    sync();
  }
  function escapeFullscreen(event: KeyboardEvent) {
    if (
      event.isTrusted &&
      event.key === "Escape" &&
      document.fullscreenElement === station
    ) {
      // Preserve the browser's normal Escape action as well. Some browser
      // input paths deliver the key to the page without performing that exit.
      void document.exitFullscreen().catch(() => {
        if (!disposed && document.fullscreenElement === station) failed();
      });
    }
  }
  // Invoke directly inside the local trusted click, before any asynchronous work.
  button.onclick = async (event) => {
    if (disposed || pending) return;
    pending = true;
    failure = "";
    sync();
    // Pointer activation returns physical keys to the battle. Keyboard users
    // keep native button focus so Space/Enter/Tab retain their usual meaning.
    if (event.detail > 0) button.blur();
    try {
      if (document.fullscreenElement === station)
        await document.exitFullscreen();
      else await station.requestFullscreen();
    } catch {
      if (!disposed) failed();
    } finally {
      pending = false;
      // A room transition may have invalidated the station while the browser
      // was deciding its request. Never retain fullscreen for a stale station.
      if (disposed && document.fullscreenElement === station)
        void document.exitFullscreen().catch(() => {});
      sync();
    }
  };
  document.addEventListener("fullscreenchange", changed);
  document.addEventListener("keydown", escapeFullscreen);
  station.addEventListener("fullscreenerror", failed);
  sync();
  return () => {
    disposed = true;
    button.onclick = null;
    document.removeEventListener("fullscreenchange", changed);
    document.removeEventListener("keydown", escapeFullscreen);
    station.removeEventListener("fullscreenerror", failed);
    if (document.fullscreenElement === station)
      void document.exitFullscreen().catch(() => {});
  };
}
