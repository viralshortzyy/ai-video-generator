// ── FrameForge domain types ─────────────────────────────────────────────
// Shared across DB layer, services, API routes, and UI.

export type GenerationStatus =
  | "draft"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type AspectRatio = "16:9" | "9:16" | "1:1";
export type VideoQuality = "draft" | "standard" | "high";

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  generationCount?: number;
}

export interface Generation {
  id: string;
  userId: string;
  projectId: string | null;
  originalPrompt: string;
  /** JSON-serialized StructuredPrompt (see src/lib/prompt/types.ts) */
  structuredPromptJson: string;
  providerId: string;
  modelId: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  quality: VideoQuality;
  negativePrompt: string | null;
  referenceImageUrl: string | null;
  status: GenerationStatus;
  /** Human-readable pipeline stage, e.g. "Generating video…" */
  stage: string | null;
  progressPercent: number;
  providerJobId: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  creditsUsed: number;
  saved: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Scene {
  id: string;
  generationId: string;
  position: number;
  prompt: string;
  durationSec: number;
  camera: string | null;
  style: string | null;
  transition: string | null;
  status: GenerationStatus;
  videoUrl: string | null;
  createdAt: string;
}

export interface VideoModel {
  id: string;
  providerId: string;
  displayName: string;
  description: string | null;
  /** JSON: { durations, aspectRatios, qualities, supportsImageToVideo } */
  capabilitiesJson: string;
  enabled: boolean;
  isMock: boolean;
  sortOrder: number;
}

export interface CreditEntry {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  generationId: string | null;
  createdAt: string;
}

export type PlanId = "free" | "starter" | "pro" | "enterprise";

export interface Subscription {
  id: string;
  userId: string;
  plan: PlanId;
  status: string;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
}
