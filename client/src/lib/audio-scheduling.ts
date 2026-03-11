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
