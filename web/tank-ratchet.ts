// Local animation angles only. The host's credited repair time drives tool,
// glove pressure and sound together, including when work is interrupted.
const strokeAmplitude = 0.52;
const strokeFrequency = 7.1;
const wristAmplitude = 0.12;
const wristFrequency = 12.3;

export function ratchetAngle(seconds: number) {
  return (
    -0.18 +
    strokeAmplitude * Math.sin(seconds * strokeFrequency) +
    wristAmplitude * Math.sin(seconds * wristFrequency)
  );
}

export function ratchetVelocity(seconds: number) {
  return (
    strokeAmplitude * strokeFrequency * Math.cos(seconds * strokeFrequency) +
    wristAmplitude * wristFrequency * Math.cos(seconds * wristFrequency)
  );
}

export const RATCHET_REGRIP_SECONDS = { success: 0.43, failed: 0.4 } as const;
