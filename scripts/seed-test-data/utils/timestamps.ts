export interface SessionTimestamps {
  sessionStart: Date;
  baseTimestamps: number[];
  totalDurationMs: number;
}

export function generateSessionTimestamps(questionCount: number): SessionTimestamps {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 30);
  const sessionStart = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  sessionStart.setHours(9 + Math.floor(Math.random() * 8));
  sessionStart.setMinutes(Math.floor(Math.random() * 60));
  
  const baseTimestamps: number[] = [];
  let currentTime = sessionStart.getTime();
  
  currentTime += 30000 + Math.random() * 30000;
  
  for (let i = 0; i < questionCount; i++) {
    baseTimestamps.push(currentTime);
    currentTime += 120000 + Math.random() * 180000;
  }
  
  const totalDurationMs = currentTime - sessionStart.getTime();
  
  return { sessionStart, baseTimestamps, totalDurationMs };
}

export function generateTurnTimestamps(
  baseTimestamp: number,
  turnCount: number
): number[] {
  const timestamps: number[] = [];
  let currentTime = baseTimestamp;
  
  for (let i = 0; i < turnCount; i++) {
    timestamps.push(currentTime);
    currentTime += 3000 + Math.random() * 15000;
  }
  
  return timestamps;
}
