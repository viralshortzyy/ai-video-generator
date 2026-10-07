// ── Prompt engine selector (free-first) ─────────────────────────────────
// PROMPT_ENGINE=local  → always the free local engine
// PROMPT_ENGINE=claude → Anthropic API (requires ANTHROPIC_API_KEY; never without it)
// unset                → Claude only when explicitly configured (MOCK_CLAUDE=false + key),
//                        otherwise the free local engine. No paid call ever happens silently.

import { config } from "../config";
import { logger } from "../logger";
import type { PromptEngine } from "./types";
import { LocalPromptEngine } from "./localEngine";
import { ClaudePromptEngine } from "./claudeEngine";

let cached: PromptEngine | null = null;

export function getPromptEngine(): PromptEngine {
  if (cached) return cached;

  const explicit = config.promptEngine;
  if (explicit === "local") {
    cached = new LocalPromptEngine();
  } else if (explicit === "claude") {
    if (!config.anthropicApiKey) {
      logger.warn("PROMPT_ENGINE=claude but ANTHROPIC_API_KEY is not set — using local engine");
      cached = new LocalPromptEngine();
    } else {
      cached = new ClaudePromptEngine();
    }
  } else if (!config.mockClaude && config.anthropicApiKey) {
    cached = new ClaudePromptEngine();
  } else {
    cached = new LocalPromptEngine();
  }

  logger.info("Prompt engine active", { engine: cached.name });
  return cached;
}
