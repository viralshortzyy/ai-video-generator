// ── Request validation (no external deps) ─────────────────────────────────

import type { AspectRatio, VideoQuality } from "./types";

export interface GenerationInput {
  prompt: string;
  modelId: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  quality: VideoQuality;
  negativePrompt?: string;
  projectId?: string;
  /** Must be a URL previously returned by /api/uploads (ownership enforced). */
  referenceImageUrl?: string;
}

const ASPECTS: AspectRatio[] = ["16:9", "9:16", "1:1"];
const QUALITIES: VideoQuality[] = ["draft", "standard", "high"];
const DURATIONS = [2, 4, 6, 8, 10];

export function validateGenerationInput(body: unknown): { ok: true; value: GenerationInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const b = (body ?? {}) as Record<string, unknown>;

  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  if (prompt.length < 3) errors.push("Prompt must be at least 3 characters.");
  if (prompt.length > 2000) errors.push("Prompt must be 2000 characters or fewer.");

  const modelId = typeof b.modelId === "string" ? b.modelId : "";
  if (!modelId) errors.push("A video model must be selected.");

  const durationSec = Number(b.durationSec);
  if (!DURATIONS.includes(durationSec)) errors.push(`Duration must be one of: ${DURATIONS.join(", ")} seconds.`);

  const aspectRatio = b.aspectRatio as AspectRatio;
  if (!ASPECTS.includes(aspectRatio)) errors.push(`Aspect ratio must be one of: ${ASPECTS.join(", ")}.`);

  const quality = b.quality as VideoQuality;
  if (!QUALITIES.includes(quality)) errors.push(`Quality must be one of: ${QUALITIES.join(", ")}.`);

  const negativePrompt = typeof b.negativePrompt === "string" ? b.negativePrompt.trim() : undefined;
  if (negativePrompt && negativePrompt.length > 500) errors.push("Negative prompt must be 500 characters or fewer.");

  const projectId = typeof b.projectId === "string" && b.projectId ? b.projectId : undefined;

  let referenceImageUrl: string | undefined;
  if (typeof b.referenceImageUrl === "string" && b.referenceImageUrl) {
    // Only accept images stored through our own upload endpoint.
    if (!b.referenceImageUrl.startsWith("/api/media/")) {
      errors.push("Reference image must be uploaded through /api/uploads first.");
    } else {
      referenceImageUrl = b.referenceImageUrl;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { prompt, modelId, durationSec, aspectRatio, quality, negativePrompt, projectId, referenceImageUrl },
  };
}

export function validateProjectInput(body: unknown): { ok: true; value: { name: string; description?: string } } | { ok: false; errors: string[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const description = typeof b.description === "string" ? b.description.trim() : undefined;
  const errors: string[] = [];
  if (name.length < 1) errors.push("Project name is required.");
  if (name.length > 80) errors.push("Project name must be 80 characters or fewer.");
  if (description && description.length > 500) errors.push("Description must be 500 characters or fewer.");
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { name, description } };
}

/** Basic upload guard: image types only, ≤ 10 MB. */
export function validateImageUpload(mime: string, sizeBytes: number): string | null {
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(mime)) return `Unsupported image type. Allowed: ${allowed.join(", ")}.`;
  if (sizeBytes > 10 * 1024 * 1024) return "Image must be 10 MB or smaller.";
  return null;
}
