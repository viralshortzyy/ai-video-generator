// ── Video provider abstraction ────────────────────────────────────────────
// Every video model (mock or real) implements VideoProvider. Adding a new
// provider = new class + one registry line. Nothing else changes.

import type { AspectRatio, VideoQuality } from "../types";
import type { StructuredPrompt } from "../prompt/types";

export type ProviderJobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface ProviderGenerationRequest {
  structured: StructuredPrompt;
  directorText: string;
  modelId: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  quality: VideoQuality;
  negativePrompt?: string;
  referenceImageUrl?: string;
  /**
   * Optional data-URI of the reference image (populated server-side by the
   * orchestration service). Providers that support image-to-video can send
   * this directly without needing fetch access to our media URLs.
   */
  referenceImageDataUri?: string;
}

export interface ProviderStatusResult {
  status: ProviderJobStatus;
  /** Human-readable pipeline stage, e.g. "Generating video…" */
  stage?: string;
  progressPercent?: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface ModelCapability {
  durations: number[];
  aspectRatios: AspectRatio[];
  qualities: VideoQuality[];
  supportsImageToVideo: boolean;
  maxScenes: number;
}

export interface ProviderModelInfo {
  id: string;
  displayName: string;
  description?: string;
  capabilities: ModelCapability;
}

export interface ProviderMetadata {
  id: string;
  displayName: string;
  description?: string;
  models: ProviderModelInfo[];
  supportsCancel: boolean;
  /**
   * Optional human-readable notice, e.g. why a provider currently offers no
   * models ("free backend not configured"). Surfaced in the UI — never an
   * error, just honesty.
   */
  notice?: string;
}

export interface VideoProvider {
  readonly id: string;
  metadata(): ProviderMetadata;
  createGeneration(req: ProviderGenerationRequest): Promise<{ providerJobId: string }>;
  getGenerationStatus(providerJobId: string): Promise<ProviderStatusResult>;
  cancelGeneration?(providerJobId: string): Promise<void>;
}
