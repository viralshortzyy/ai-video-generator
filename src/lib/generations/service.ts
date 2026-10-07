// ── Generation orchestration service ──────────────────────────────────────
// Owns the full pipeline: validate → credits → prompt structuring →
// provider dispatch → status syncing → completion/refund. API routes are
// thin wrappers over this module.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import type { Generation, GenerationStatus } from "../types";
import type { GenerationInput } from "../validation";
import {
  createGeneration as dbCreate,
  getGeneration,
  listGenerations,
  logEvent,
  updateGeneration,
} from "../db/repositories";
import { getPromptEngine } from "../prompt";
import { getProviderForModel } from "../providers/registry";
import { getStorage } from "../storage";
import { config } from "../config";
import { creditsForGeneration, getBalance, refundCredits, spendCredits, InsufficientCreditsError } from "../credits";
import { logGenerationToSheet } from "../admin/sheetsLog";
import { logger } from "../logger";

const TERMINAL: GenerationStatus[] = ["completed", "failed", "cancelled"];

export interface CreateResult {
  generation: Generation;
  balance: number;
}

/**
 * Resolve a /api/media/... reference-image URL (produced by /api/uploads)
 * into a data URI, so providers without fetch access to our media URLs
 * (e.g. Runway) can still do image-to-video.
 */
async function referenceImageToDataUri(userId: string, url: string): Promise<string | undefined> {
  if (!url.startsWith("/api/media/")) return undefined;
  const key = url.slice("/api/media/".length);
  if (!key.startsWith(`${userId}/`) || key.includes("..")) return undefined;
  const abs = join(config.storageDir, key);
  if (!existsSync(abs)) return undefined;
  const buf = readFileSync(abs);
  if (buf.byteLength > 10 * 1024 * 1024) {
    throw new Error("Reference image exceeds the 10 MB limit for provider upload.");
  }
  const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[
    extname(abs).toLowerCase()
  ] ?? "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Download a provider-hosted (expiring) video URL into our own storage and
 * extract a thumbnail. Used for real providers like Runway whose output
 * URLs expire within 24–48h.
 */
async function persistRemoteVideo(
  userId: string,
  generationId: string,
  remoteUrl: string
): Promise<{ videoUrl: string; thumbnailUrl?: string }> {
  logger.info("Downloading provider output", { generationId });
  let res: Response;
  try {
    res = await fetch(remoteUrl, { signal: AbortSignal.timeout(180_000) });
  } catch (err) {
    throw new Error(`Could not download the finished video (${err instanceof Error ? err.message : "network error"}).`);
  }
  if (!res.ok) throw new Error(`Could not download the finished video (HTTP ${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > 300 * 1024 * 1024) {
    throw new Error("Provider output exceeds the 300 MB storage cap.");
  }

  const storage = getStorage();
  const saved = await storage.save(buf, {
    userId,
    kind: "video",
    filename: `${generationId}.mp4`,
    mime: "video/mp4",
  });

  // Best-effort thumbnail (first frame) via ffmpeg.
  let thumbnailUrl: string | undefined;
  try {
    const absVideo = join(config.storageDir, saved.key);
    const thumbKey = `${userId}/thumbnail/${generationId}.jpg`;
    const absThumb = join(config.storageDir, thumbKey);
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(absThumb, ".."), { recursive: true });
    execFileSync("ffmpeg", ["-y", "-i", absVideo, "-vframes", "1", "-q:v", "5", absThumb], {
      stdio: "pipe",
      timeout: 30_000,
    });
    thumbnailUrl = `/api/media/${thumbKey}`;
  } catch (err) {
    logger.warn("Thumbnail extraction failed (non-fatal)", { generationId, error: String(err) });
  }

  logger.info("Provider output persisted", { generationId, bytes: buf.byteLength });
  return { videoUrl: saved.url, thumbnailUrl };
}

export async function createGenerationJob(userId: string, input: GenerationInput): Promise<CreateResult> {
  // 1. Model must exist in the live provider registry and support the options.
  //    (Registry-driven: the UI can only offer dispatchable models.)
  const { provider, model } = getProviderForModel(input.modelId);
  const caps = model.capabilities;
  if (!caps.durations.includes(input.durationSec)) {
    throw new Error(`Model ${model.displayName} does not support ${input.durationSec}s duration.`);
  }
  if (!caps.aspectRatios.includes(input.aspectRatio)) {
    throw new Error(`Model ${model.displayName} does not support ${input.aspectRatio} aspect ratio.`);
  }
  if (!caps.qualities.includes(input.quality)) {
    throw new Error(`Model ${model.displayName} does not support ${input.quality} quality.`);
  }
  if (input.referenceImageUrl && !caps.supportsImageToVideo) {
    throw new Error(`Model ${model.displayName} does not support reference images.`);
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
    providerId: provider.id,
    modelId: model.id,
    durationSec: input.durationSec,
    aspectRatio: input.aspectRatio,
    quality: input.quality,
    negativePrompt: input.negativePrompt,
    referenceImageUrl: input.referenceImageUrl,
    creditsUsed: cost,
  });

  // 5. Dispatch to the provider. NOTE: creation is never auto-retried —
  //    each attempt can spend real provider credits.
  try {
    const referenceImageDataUri = input.referenceImageUrl
      ? await referenceImageToDataUri(userId, input.referenceImageUrl)
      : undefined;
    const { providerJobId } = await provider.createGeneration({
      structured,
      directorText: structured.directorText,
      modelId: model.id,
      durationSec: input.durationSec,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      negativePrompt: input.negativePrompt,
      referenceImageUrl: input.referenceImageUrl,
      referenceImageDataUri,
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
 * Status polling is a safe GET — only creation is never retried.
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
    // Persist expiring provider URLs (e.g. Runway's 24–48h links) into our
    // own storage before marking complete.
    let videoUrl = result.videoUrl ?? null;
    let thumbnailUrl = result.thumbnailUrl ?? null;
    if (videoUrl && videoUrl.startsWith("http")) {
      try {
        const persisted = await persistRemoteVideo(userId, gen.id, videoUrl);
        videoUrl = persisted.videoUrl;
        thumbnailUrl = persisted.thumbnailUrl ?? thumbnailUrl;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("Output persistence failed", { generationId: id, error: message });
        patch.status = "failed";
        patch.stage = "Failed";
        patch.error = message;
        patch.completedAt = new Date().toISOString();
        const failed = updateGeneration(userId, id, patch)!;
        logEvent(id, "failed", message);
        return failed;
      }
    }
    patch.videoUrl = videoUrl;
    patch.thumbnailUrl = thumbnailUrl;
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
