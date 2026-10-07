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

export type ProviderMode = "mock" | "free" | "runway";

/**
 * Which video provider family to use. Explicit VIDEO_PROVIDER wins;
 * otherwise we preserve the legacy MOCK_VIDEO_MODE behavior.
 * Default is "mock" — always free, never a paid call by surprise.
 */
function resolveProviderMode(): ProviderMode {
  const explicit = str("VIDEO_PROVIDER", "").toLowerCase();
  if (explicit === "mock" || explicit === "free" || explicit === "runway") return explicit;
  if (!bool("MOCK_VIDEO_MODE", true)) return "runway";
  return "mock";
}

export const config = {
  mockVideoMode: bool("MOCK_VIDEO_MODE", true),
  mockClaude: bool("MOCK_CLAUDE", true),

  // --- Provider selection (free-first) -----------------------------------
  // "mock"   = simulated demo renderer (default, always free)
  // "free"   = real free/open-source backend (see FREE_BACKEND)
  // "runway" = paid Runway API (only when explicitly selected + key set)
  providerMode: resolveProviderMode(),

  // --- Free backend -------------------------------------------------------
  // "auto"   = try local GPU, then Gradio Space
  // "local"  = self-hosted model on this machine's GPU (needs setup)
  // "gradio" = Hugging Face Gradio Space (FREE_GRADIO_URL, your own or public)
  freeBackend: str("FREE_BACKEND", "auto"),
  freeGradioUrl: str("FREE_GRADIO_URL", "").replace(/\/$/, ""),
  freeGradioEndpoint: str("FREE_GRADIO_ENDPOINT", "predict"),

  // --- Prompt engine -------------------------------------------------------
  // "local"  = free on-device heuristics (default when no Claude key)
  // "claude" = Anthropic API (requires ANTHROPIC_API_KEY; never without it)
  // ""       = auto (Claude only if key present and MOCK_CLAUDE=false)
  promptEngine: str("PROMPT_ENGINE", "").toLowerCase(),

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
