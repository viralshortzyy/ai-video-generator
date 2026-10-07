// ── Centralized, typed environment configuration ────────────────────────
// All secrets and tunables come from env vars. Nothing secret is imported
// into client components — this module is server-only by convention
// (only imported from API routes and server-side services).

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === "true" || raw === "1";
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  mockVideoMode: bool("MOCK_VIDEO_MODE", true),
  mockClaude: bool("MOCK_CLAUDE", true),

  anthropicApiKey: str("ANTHROPIC_API_KEY"),
  claudeModel: str("CLAUDE_MODEL", "claude-sonnet-4-5"),

  // --- Runway (real video generation; server-side only) -------------------
  runwayApiKey: str("RUNWAY_API_KEY"),
  runwayVideoModel: str("RUNWAY_VIDEO_MODEL", "gen4.5"),
  runwayBaseUrl: str("RUNWAY_BASE_URL", "https://api.dev.runwayml.com"),

  databasePath: str("DATABASE_PATH", "./data/frameforge.db"),
  storageDir: str("STORAGE_DIR", "./data/media"),

  newUserCredits: num("NEW_USER_CREDITS", 600),
  appUrl: str("APP_URL", "http://localhost:3000"),

  // Optional future integrations (never required for the MVP).
  stripeSecretKey: str("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: str("STRIPE_WEBHOOK_SECRET"),
  sheetsLogId: str("GOOGLE_SHEETS_LOG_ID"),

  isDev: process.env.NODE_ENV !== "production",
} as const;

export type AppConfig = typeof config;
