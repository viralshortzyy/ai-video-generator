// ── Generation orchestration service ──────────────────────────────────────
// Owns the full pipeline: validate → credits → prompt structuring →
// provider dispatch → status syncing → completion/refund. API routes are
// thin wrappers over this module.

import type { Generation, GenerationStatus } from "../types";
import type { GenerationInput } from "../validation";
import {
  createGeneration as dbCreate,
  getGeneration,
  getVideoModel,
  listGenerations,
  logEvent,
  updateGeneration,
} from "../db/repositories";
import { getPromptEngine } from "../prompt";
import { getProviderForModel } from "../providers/registry";
import { creditsForGeneration, getBalance, refundCredits, spendCredits, InsufficientCreditsError } from "../credits";
import { logGenerationToSheet } from "../admin/sheetsLog";
import { logger } from "../logger";

const TERMINAL: GenerationStatus[] = ["completed", "failed", "cancelled"];

export interface CreateResult {
  generation: Generation;
  balance: number;
}

export async function createGenerationJob(userId: string, input: GenerationInput): Promise<CreateResult> {
  // 1. Model must exist and support the requested options.
  const modelRow = getVideoModel(input.modelId);
  if (!modelRow) throw new Error(`Unknown video model: ${input.modelId}`);
  const caps = JSON.parse(modelRow.capabilitiesJson);
  if (!caps.durations?.includes(input.durationSec)) {
    throw new Error(`Model ${modelRow.displayName} does not support ${input.durationSec}s duration.`);
  }

  // 2. Credits.
  const cost = creditsForGeneration(input.durationSec, input.quality);
  const balanceAfter = spendCredits(userId, cost, "generation_create");

  // 3. Structure the prompt (Claude or mock).
  const engine = getPromptEngine();
  const structured = await engine.structure({
    prompt: input.prompt,
    durationSec: input.durationSec,
    aspectRatio: input.aspectRatio,
    quality: input.quality,
    negativePrompt: input.negativePrompt,
  });

  // 4. Persist as queued.
  const generation = dbCreate({
    userId,
    projectId: input.projectId,
    originalPrompt: input.prompt,
    structuredPromptJson: JSON.stringify(structured),
    providerId: modelRow.providerId,
    modelId: modelRow.id,
    durationSec: input.durationSec,
    aspectRatio: input.aspectRatio,
    quality: input.quality,
    negativePrompt: input.negativePrompt,
    referenceImageUrl: input.referenceImageUrl,
    creditsUsed: cost,
  });

  // 5. Dispatch to the provider.
  try {
    const { provider } = getProviderForModel(modelRow.id);
    const { providerJobId } = await provider.createGeneration({
      structured,
      directorText: structured.directorText,
      modelId: modelRow.id,
      durationSec: input.durationSec,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      negativePrompt: input.negativePrompt,
      referenceImageUrl: input.referenceImageUrl,
    });
    const updated = updateGeneration(userId, generation.id, { providerJobId })!;
    logEvent(generation.id, "dispatched", `provider job ${providerJobId}`);
    logGenerationToSheet(updated).catch(() => {});
    return { generation: updated, balance: balanceAfter };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateGeneration(userId, generation.id, { status: "failed", stage: "Failed", error: message, completedAt: new Date().toISOString() });
    refundCredits(userId, cost, "generation_dispatch_failed", generation.id);
    logEvent(generation.id, "failed", message);
    throw err;
  }
}

/**
 * Poll the provider and sync state into the DB. Called on every status read,
 * so the frontend's polling loop drives progress without a worker process.
 * (Production: move to a queue worker calling this same function.)
 */
export async function syncGeneration(userId: string, id: string): Promise<Generation | null> {
  const gen = getGeneration(userId, id);
  if (!gen || TERMINAL.includes(gen.status) || !gen.providerJobId) return gen;

  const { provider } = getProviderForModel(gen.modelId);
  let result;
  try {
    result = await provider.getGenerationStatus(gen.providerJobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Provider status check failed", { generationId: id, error: message });
    return gen;
  }

  const statusMap: Record<string, GenerationStatus> = {
    queued: "queued",
    processing: "processing",
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled",
  };
  const nextStatus = statusMap[result.status] ?? gen.status;

  const patch: Parameters<typeof updateGeneration>[2] = {
    status: nextStatus,
    stage: result.stage ?? gen.stage,
    progressPercent: result.progressPercent ?? gen.progressPercent,
  };
  if (result.status === "completed") {
    patch.videoUrl = result.videoUrl ?? null;
    patch.thumbnailUrl = result.thumbnailUrl ?? null;
    patch.completedAt = new Date().toISOString();
    patch.progressPercent = 100;
  }
  if (result.status === "failed" || result.status === "cancelled") {
    patch.error = result.error ?? (result.status === "cancelled" ? "Cancelled by user." : "Generation failed.");
    patch.completedAt = new Date().toISOString();
    if (gen.creditsUsed > 0 && gen.status !== "failed" && gen.status !== "cancelled") {
      refundCredits(userId, gen.creditsUsed, `generation_${result.status}`, gen.id);
    }
  }

  const updated = updateGeneration(userId, id, patch)!;
  if (updated.status !== gen.status) {
    logEvent(id, updated.status, updated.stage ?? undefined);
  }
  return updated;
}

export async function cancelGenerationJob(userId: string, id: string): Promise<Generation | null> {
  const gen = getGeneration(userId, id);
  if (!gen || TERMINAL.includes(gen.status)) return gen;
  if (gen.providerJobId) {
    try {
      const { provider } = getProviderForModel(gen.modelId);
      await provider.cancelGeneration?.(gen.providerJobId);
    } catch (err) {
      logger.warn("Provider cancel failed", { generationId: id, error: String(err) });
    }
  }
  if (gen.creditsUsed > 0) refundCredits(userId, gen.creditsUsed, "generation_cancelled", gen.id);
  logEvent(id, "cancelled", "Cancelled by user");
  return updateGeneration(userId, id, {
    status: "cancelled",
    stage: "Cancelled",
    error: "Cancelled by user.",
    completedAt: new Date().toISOString(),
  });
}

export { listGenerations, getBalance };
export { InsufficientCreditsError };
