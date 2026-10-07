// ── Prompt engine selector (free-first) ─────────────────────────────────
// PROMPT_ENGINE=local  → always the free local engine
// PROMPT_ENGINE=claude → Anthropic API — requires ALL of:
//                        ALLOW_PAID_PROVIDERS=true, ANTHROPIC_API_KEY set.
//                        Never called without explicit opt-in.
// unset                → Claude only when explicitly configured
//                        (ALLOW_PAID_PROVIDERS=true, MOCK_CLAUDE=false, key set),
//                        otherwise the free local engine.

import { config } from "../config";
import { logger } from "../logger";
import type { PromptEngine } from "./types";
import { LocalPromptEngine } from "./localEngine";
import { ClaudePromptEngine } from "./claudeEngine";

let cached: PromptEngine | null = null;

function claudeAllowed(): boolean {
  return config.allowPaidProviders && !!config.anthropicApiKey;
}

export function getPromptEngine(): PromptEngine {
  if (cached) return cached;

  const explicit = config.promptEngine;
  if (explicit === "local") {
    cached = new LocalPromptEngine();
  } else if (explicit === "claude") {
    if (!claudeAllowed()) {
      logger.warn(
        "PROMPT_ENGINE=claude requested but paid providers are disabled or ANTHROPIC_API_KEY is missing — using local engine"
      );
      cached = new LocalPromptEngine();
    } else {
      cached = new ClaudePromptEngine();
    }
  } else if (!config.mockClaude && claudeAllowed()) {
    cached = new ClaudePromptEngine();
  } else {
    cached = new LocalPromptEngine();
  }

  logger.info("Prompt engine active", { engine: cached.name });
  return cached;
}
