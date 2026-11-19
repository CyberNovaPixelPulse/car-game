// Local animation angles only. The host's credited repair time drives tool,
// glove pressure and sound together, including when work is interrupted.
export function ratchetAngle(seconds: number) {
  return (
    -0.18 + 0.52 * Math.sin(seconds * 7.1) + 0.12 * Math.sin(seconds * 12.3)
  );
}

export function ratchetVelocity(seconds: number) {
  return (
    0.52 * 7.1 * Math.cos(seconds * 7.1) +
    0.12 * 12.3 * Math.cos(seconds * 12.3)
  );
}

export const RATCHET_REGRIP_SECONDS = { success: 0.43, failed: 0.4 } as const;
