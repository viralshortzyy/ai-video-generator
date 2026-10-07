// ── Runway video provider ─────────────────────────────────────────────────
// Real AI video generation via the Runway Dev API (https://api.dev.runwayml.com).
// Implements the standard VideoProvider interface — the rest of the app does
// not know or care that this one spends real API credits.
//
// API contract (verified against the official docs, X-Runway-Version 2024-11-06):
//   POST /v1/text_to_video   { model, promptText, ratio, duration, seed? } → { id }
//   POST /v1/image_to_video  { model, promptText, promptImage, ratio, duration } → { id }
//   GET  /v1/tasks/{id}      → { id, status, progress?, output?, failure?, failureCode? }
//   DELETE /v1/tasks/{id}    → cancel a pending/running task
// Task statuses: PENDING, THROTTLED, RUNNING, SUCCEEDED, FAILED, CANCELLED.
// Output URLs expire in 24–48h — the service layer downloads them into our
// own storage on completion (see src/lib/generations/service.ts).
//
// Cost safety: creation is NEVER retried automatically (each POST spends
// credits). Status polling is a safe GET and is throttled to ≥5s per task,
// per Runway's guidance.

import type {
  ProviderGenerationRequest,
  ProviderMetadata,
  ProviderStatusResult,
  VideoProvider,
} from "./types";
import { logger } from "../logger";

const RUNWAY_VERSION = "2024-11-06";
const MIN_POLL_INTERVAL_MS = 5_000;

export interface RunwayProviderOptions {
  apiKey: string;
  /** Runway model id, e.g. "gen4.5". Configurable via RUNWAY_VIDEO_MODEL. */
  modelId?: string;
  baseUrl?: string;
}

interface CachedStatus {
  at: number;
  result: ProviderStatusResult;
}

export class RunwayApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RunwayApiError";
    this.status = status;
  }
}

const RATIO_FOR_ASPECT: Record<string, string> = {
  "16:9": "1280:720",
  "9:16": "720:1280",
};

export class RunwayProvider implements VideoProvider {
  readonly id = "runway";
  private apiKey: string;
  private baseUrl: string;
  private modelId: string;
  private statusCache = new Map<string, CachedStatus>();

  constructor(opts: RunwayProviderOptions) {
    if (!opts.apiKey) {
      throw new Error(
        "RUNWAY_API_KEY is not configured. Set it in your .env (server-side only, never commit it)."
      );
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.dev.runwayml.com").replace(/\/$/, "");
    this.modelId = opts.modelId ?? "gen4.5";
  }

  metadata(): ProviderMetadata {
    return {
      id: "runway",
      displayName: "Runway",
      description: "Runway Gen 4.5 — real AI video generation. Uses your Runway API credits.",
      supportsCancel: true,
      models: [
        {
          // FrameForge model id (stable); the Runway-side model is configurable.
          id: "runway-gen4.5",
          displayName: `Runway Gen 4.5`,
          description: `Text-to-video via Runway (${this.modelId}). Billed in Runway credits.`,
          capabilities: {
            durations: [2, 4, 5, 6, 8, 10],
            aspectRatios: ["16:9", "9:16"],
            qualities: ["standard", "high"],
            supportsImageToVideo: true,
            maxScenes: 1,
          },
        },
      ],
    };
  }

  // ── HTTP ──────────────────────────────────────────────────────────────

  private async request(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<any> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          // The key travels only in this server-side header. It is never
          // logged, never returned to the client, never committed.
          Authorization: `Bearer ${this.apiKey}`,
          "X-Runway-Version": RUNWAY_VERSION,
          "Content-Type": "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new RunwayApiError(0, `Could not reach the Runway API (${err instanceof Error ? err.message : "network error"}). Check your connection and try again.`);
    }
    if (!res.ok) throw await this.toApiError(res);
    if (res.status === 204) return null;
    return res.json();
  }

  private async toApiError(res: Response): Promise<RunwayApiError> {
    const status = res.status;
    let detail = "";
    try {
      const data = await res.json();
      const raw = data?.error ?? data?.message ?? data?.failure ?? "";
      detail = typeof raw === "string" ? raw : JSON.stringify(raw);
    } catch {
      /* ignore parse errors */
    }
    detail = detail.slice(0, 300);

    switch (status) {
      case 400:
        return new RunwayApiError(status, `Runway rejected the request: ${detail || "invalid parameters or prompt"}.`);
      case 401:
      case 403:
        return new RunwayApiError(status, "Runway authentication failed. Check that RUNWAY_API_KEY is set correctly.");
      case 402:
        return new RunwayApiError(status, "Your Runway organization is out of API credits. Top up at dev.runwayml.com/billing.");
      case 404:
        return new RunwayApiError(status, "Runway task not found. It may have been deleted.");
      case 429:
        return new RunwayApiError(status, "Runway rate limit reached. Wait a moment and try again.");
      default:
        if (status >= 500) {
          return new RunwayApiError(status, "Runway is having trouble right now. Try again in a bit.");
        }
        return new RunwayApiError(status, `Runway request failed (HTTP ${status})${detail ? `: ${detail}` : "."}`);
    }
  }

  // ── VideoProvider ─────────────────────────────────────────────────────

  async createGeneration(req: ProviderGenerationRequest): Promise<{ providerJobId: string }> {
    const ratio = RATIO_FOR_ASPECT[req.aspectRatio];
    if (!ratio) {
      throw new Error(`Aspect ratio ${req.aspectRatio} is not supported by the Runway provider.`);
    }
    // Runway caps promptText at 1000 chars; the director text is richest first.
    const promptText = req.directorText.slice(0, 1000);

    // NOTE: no automatic retries here — each POST spends real credits.
    let data: any;
    if (req.referenceImageDataUri) {
      data = await this.request("POST", "/v1/image_to_video", {
        model: this.modelId,
        promptText,
        promptImage: req.referenceImageDataUri,
        ratio,
        duration: req.durationSec,
      });
    } else {
      data = await this.request("POST", "/v1/text_to_video", {
        model: this.modelId,
        promptText,
        ratio,
        duration: req.durationSec,
      });
    }

    const taskId = data?.id;
    if (!taskId || typeof taskId !== "string") {
      logger.error("Runway returned no task id", { keys: data ? Object.keys(data) : [] });
      throw new RunwayApiError(0, "Runway did not return a task id. No video was started.");
    }
    logger.info("Runway task created", { taskId, model: this.modelId, imageToVideo: !!req.referenceImageDataUri });
    return { providerJobId: taskId };
  }

  async getGenerationStatus(providerJobId: string): Promise<ProviderStatusResult> {
    // Throttle: Runway asks for ≥5s between polls of the same task. Our UI
    // polls faster, so serve a cached result inside the window.
    const cached = this.statusCache.get(providerJobId);
    if (cached && Date.now() - cached.at < MIN_POLL_INTERVAL_MS) {
      return cached.result;
    }

    const task = await this.request("GET", `/v1/tasks/${encodeURIComponent(providerJobId)}`);
    const result = this.mapTask(task);
    this.statusCache.set(providerJobId, { at: Date.now(), result });
    if (result.status === "completed" || result.status === "failed" || result.status === "cancelled") {
      this.statusCache.delete(providerJobId);
    }
    return result;
  }

  async cancelGeneration(providerJobId: string): Promise<void> {
    try {
      await this.request("DELETE", `/v1/tasks/${encodeURIComponent(providerJobId)}`);
      logger.info("Runway task cancelled", { taskId: providerJobId });
    } catch (err) {
      // A task that already finished can't be cancelled — not fatal.
      logger.warn("Runway cancel failed (non-fatal)", { taskId: providerJobId, error: String(err) });
    } finally {
      this.statusCache.delete(providerJobId);
    }
  }

  // ── Mapping ───────────────────────────────────────────────────────────

  private mapTask(task: any): ProviderStatusResult {
    const status = task?.status as string | undefined;
    switch (status) {
      case "PENDING":
      case "THROTTLED":
        return { status: "queued", stage: status === "THROTTLED" ? "Throttled — waiting for capacity" : "Queued", progressPercent: 5 };
      case "RUNNING": {
        const p = typeof task.progress === "number" ? Math.max(0, Math.min(1, task.progress)) : null;
        return {
          status: "processing",
          stage: "Generating video…",
          progressPercent: p !== null ? Math.round(10 + p * 85) : 40,
        };
      }
      case "SUCCEEDED": {
        const url = Array.isArray(task.output) ? task.output[0] : undefined;
        if (!url || typeof url !== "string") {
          return { status: "failed", stage: "Failed", error: "Runway finished but returned no video URL." };
        }
        // NOTE: this URL expires in 24–48h. The service layer downloads it
        // into our own storage before marking the generation complete.
        return { status: "completed", stage: "Completed", progressPercent: 100, videoUrl: url };
      }
      case "FAILED": {
        const reason = typeof task.failure === "string" && task.failure
          ? task.failure
          : "The Runway generation failed.";
        const code = typeof task.failureCode === "string" && task.failureCode ? ` (${task.failureCode})` : "";
        return { status: "failed", stage: "Failed", error: `${reason}${code}`.slice(0, 500) };
      }
      case "CANCELLED":
        return { status: "cancelled", stage: "Cancelled", progressPercent: 0 };
      default:
        logger.warn("Unknown Runway task status", { status });
        return { status: "processing", stage: "Generating video…", progressPercent: 30 };
    }
  }
}
