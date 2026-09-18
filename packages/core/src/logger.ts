type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

function minLevel(): Level {
  const v = process.env.LOG_LEVEL;
  return v === "debug" || v === "warn" || v === "error" ? v : "info";
}

export function createLogger(scope = "jobhunt"): Logger {
  const json = process.env.NODE_ENV === "production";
  const write = (level: Level, msg: string, data?: Record<string, unknown>) => {
    if (order[level] < order[minLevel()]) return;
    const out = level === "error" || level === "warn" ? console.error : console.log;
    if (json) {
      out(JSON.stringify({ t: new Date().toISOString(), level, scope, msg, ...data }));
    } else {
      const extra = data && Object.keys(data).length ? ` ${JSON.stringify(data)}` : "";
      out(`[${new Date().toLocaleTimeString("fr-FR")}] ${level.toUpperCase()} ${scope} — ${msg}${extra}`);
    }
  };
  return {
    debug: (m, d) => write("debug", m, d),
    info: (m, d) => write("info", m, d),
    warn: (m, d) => write("warn", m, d),
    error: (m, d) => write("error", m, d),
    child: (s) => createLogger(`${scope}:${s}`),
  };
}

export const logger = createLogger();

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
