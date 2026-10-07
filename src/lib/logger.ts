// ── Tiny structured logger ──────────────────────────────────────────────
// Keeps service code free of raw console.log sprawl. In production this
// can be swapped for a real log shipper without touching call sites.

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, msg: string, data?: Record<string, unknown>) {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(data ? { data } : {}),
  };
  if (level === "error") console.error(JSON.stringify(line));
  else if (level === "warn") console.warn(JSON.stringify(line));
  else console.log(JSON.stringify(line));
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => emit("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => emit("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => emit("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => emit("error", msg, data),
};
