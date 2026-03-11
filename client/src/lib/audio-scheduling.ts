const DEFAULT_OVERLAP_CAP = 0.003;

export function computeOverlap(
  chunkDuration: number,
  overlapCap: number = DEFAULT_OVERLAP_CAP,
): number {
  if (chunkDuration <= 0) return 0;
  return Math.min(overlapCap, chunkDuration * 0.1);
}

export function computeCurrentEnvelopeValue(
  now: number,
  scheduledStart: number,
  scheduledEnd: number,
  fadeTime: number,
): number {
  if (fadeTime <= 0) return 0;
  const fadeInEnd = scheduledStart + fadeTime;
  const fadeOutStart = scheduledEnd - fadeTime;
  let value: number;
  if (now < scheduledStart) {
    value = 0;
  } else if (now < fadeInEnd) {
    value = (now - scheduledStart) / fadeTime;
  } else if (now < fadeOutStart) {
    value = 1;
  } else if (now < scheduledEnd) {
    value = 1 - (now - fadeOutStart) / fadeTime;
  } else {
    value = 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function shouldDrainMore(
  nextStartTime: number,
  currentTime: number,
  maxAhead: number,
  scheduledThisPass: number,
): boolean {
  if (scheduledThisPass === 0) return true;
  const scheduleAhead = nextStartTime - currentTime;
  return scheduleAhead < maxAhead;
}

export function computeFadeTime(
  chunkDuration: number,
  overlapCap: number = DEFAULT_OVERLAP_CAP,
): number {
  return computeOverlap(chunkDuration, overlapCap);
}

export function isGenerationComplete(
  activeSources: Iterable<{ generation: number }>,
  currentGeneration: number,
  queueLength: number,
): boolean {
  if (queueLength > 0) return false;
  for (const s of activeSources) {
    if (s.generation === currentGeneration) return false;
  }
  return true;
}

export const OVERLAP_CAP = DEFAULT_OVERLAP_CAP;
