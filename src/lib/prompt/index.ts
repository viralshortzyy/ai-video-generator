// ── Prompt engine selector ──────────────────────────────────────────────

import { config } from "../config";
import { logger } from "../logger";
import type { PromptEngine } from "./types";
import { MockPromptEngine } from "./mockEngine";
import { ClaudePromptEngine } from "./claudeEngine";

let cached: PromptEngine | null = null;

/** Real Claude when configured, otherwise the zero-cost mock engine. */
export function getPromptEngine(): PromptEngine {
  if (cached) return cached;
  if (!config.mockClaude && config.anthropicApiKey) {
    cached = new ClaudePromptEngine();
  } else {
    cached = new MockPromptEngine();
  }
  logger.info("Prompt engine active", { engine: cached.name });
  return cached;
}
