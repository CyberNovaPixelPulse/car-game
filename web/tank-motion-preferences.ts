export interface CameraPreferences {
  enabled: boolean;
  overall: number;
  impact: number;
  continuous: number;
}

const storageKey = "tank-camera-motion-v1";

export function readMotionPreferences(): CameraPreferences {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (
      value &&
      typeof value.enabled === "boolean" &&
      [value.overall, value.impact, value.continuous].every(
        (level) => Number.isFinite(level) && level >= 0 && level <= 1,
      )
    )
      return value;
  } catch {
    // Browsers with storage disabled still have working session controls.
  }
  return {
    enabled: true,
    overall: 1,
    impact: reduced ? 0.35 : 1,
    continuous: reduced ? 0 : 1,
  };
}

export function saveMotionPreferences(value: CameraPreferences) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // The caller retains the current session's choice.
  }
}
