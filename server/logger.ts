const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

function getLevel(): Level {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LEVELS) return env as Level;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const threshold = LEVELS[getLevel()];

function shouldLog(level: Level): boolean {
  return LEVELS[level] >= threshold;
}

export const log = {
  debug(...args: unknown[]) {
    if (shouldLog("debug")) console.log(...args);
  },
  info(...args: unknown[]) {
    if (shouldLog("info")) console.log(...args);
  },
  warn(...args: unknown[]) {
    if (shouldLog("warn")) console.warn(...args);
  },
  error(...args: unknown[]) {
    if (shouldLog("error")) console.error(...args);
  },
};
