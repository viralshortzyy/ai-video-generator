// ── Hugging Face Gradio Space backend (free shared GPU) ───────────────────
// Calls a Gradio Space's PUBLIC, documented REST API — no scraping, no hacks:
//   POST {space}/gradio_api/call/{endpoint}   {"data": [...]} → {"event_id"}
//   GET  {space}/gradio_api/call/{endpoint}/{event_id}        → SSE stream
//
// Honest limits (documented, not hidden):
// - Free/unauthenticated callers share a small daily ZeroGPU quota
//   (~2 min/day anonymous, ~5 min/day with a free HF account). A single
//   Wan2.1 video can take minutes — expect queues and quota exhaustion.
// - Spaces sleep when idle; the first call may take a while to wake them.
// - We never hard-code a Space URL: set FREE_GRADIO_URL to your own Space
//   (recommended — you control the quota) or a public demo Space.
// - No payment is ever involved. If the Space is unreachable, generation
//   fails with a clear message instead of falling back to a paid provider.
//
// Expected Space signature (documented default; override via
// FREE_GRADIO_ENDPOINT): predict(prompt: str, duration: int, ratio: str)
// returning a video file. See docs/FREE_SETUP.md.

import type {
  ProviderGenerationRequest,
  ProviderModelInfo,
  ProviderStatusResult,
} from "../types";
import { logger } from "../../logger";
import { FreeUnavailableError } from "./backend";

const RATIO_FOR_ASPECT: Record<string, string> = {
  "16:9": "1280x720",
  "9:16": "720x1280",
};

export class GradioSpaceBackend {
  readonly id = "gradio-space";
  readonly label = "Free AI video (Gradio Space)";

  constructor(
    private spaceUrl: string,
    private endpoint = "predict"
  ) {
    this.spaceUrl = spaceUrl.replace(/\/$/, "");
  }

  models(): ProviderModelInfo[] {
    return [
      {
        id: "free-gradio-video",
        displayName: "Free AI video (shared GPU)",
        description: `Open video model via Gradio Space. $0 — shared free quota, expect queues.`,
        capabilities: {
          durations: [2, 4, 5],
          aspectRatios: ["16:9", "9:16"],
          qualities: ["standard"],
          supportsImageToVideo: false,
          maxScenes: 1,
        },
      },
    ];
  }

  private api(path: string): string {
    return `${this.spaceUrl}/gradio_api/${path}`;
  }

  async createGeneration(req: ProviderGenerationRequest): Promise<{ providerJobId: string }> {
    const promptText = req.directorText.slice(0, 1000);
    const data = [promptText, req.durationSec, RATIO_FOR_ASPECT[req.aspectRatio] ?? "1280x720"];

    let res: Response;
    try {
      res = await fetch(this.api(`call/${encodeURIComponent(this.endpoint)}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
        // Cold/waking Spaces can be slow to accept the job.
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      throw new FreeUnavailableError(
        `Could not reach the free Space at ${this.spaceUrl} (${err instanceof Error ? err.message : "network error"}). ` +
          "The Space may be asleep — try again in a minute, or check FREE_GRADIO_URL."
      );
    }
    if (res.status === 503 || res.status === 429) {
      throw new FreeUnavailableError(
        "The free Space is at capacity right now (shared free GPU quota). Try again later."
      );
    }
    if (!res.ok) {
      throw new FreeUnavailableError(`The free Space rejected the request (HTTP ${res.status}).`);
    }
    const body = (await res.json().catch(() => ({}))) as { event_id?: string };
    if (!body.event_id) {
      throw new FreeUnavailableError("The free Space did not return a job id.");
    }
    const providerJobId = `gradio:${this.endpoint}:${body.event_id}`;
    logger.info("Free Space job created", { space: this.spaceUrl, endpoint: this.endpoint });
    return { providerJobId };
  }

  async getGenerationStatus(providerJobId: string): Promise<ProviderStatusResult> {
    const parts = providerJobId.split(":");
    if (parts[0] !== "gradio" || parts.length < 3) {
      return { status: "failed", stage: "Failed", error: "Unknown free-backend job id." };
    }
    const endpoint = parts[1];
    const eventId = parts.slice(2).join(":");

    // Read the SSE stream briefly: if the job isn't done, the stream stays
    // open and we time out → still processing. This is a safe read (GET).
    let text = "";
    try {
      const res = await fetch(this.api(`call/${encodeURIComponent(endpoint)}/${encodeURIComponent(eventId)}`), {
        headers: { Accept: "text/event-stream" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok || !res.body) {
        return { status: "processing", stage: "Waiting on free Space…", progressPercent: 15 };
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        if (text.includes("event: complete") || text.includes("event: error")) break;
      }
      reader.cancel().catch(() => {});
    } catch {
      // Timeout with no terminal event = still queued/running on the Space.
      return this.queueStatus(text);
    }
    return this.parseStream(text);
  }

  private queueStatus(text: string): ProviderStatusResult {
    const m = text.match(/"queue_position"\s*:\s*(\d+)/) ?? text.match(/queue[^0-9]*(\d+)/i);
    const pos = m ? ` (queue position ${m[1]})` : "";
    return { status: "queued", stage: `Queued on free Space${pos}`, progressPercent: 10 };
  }

  private parseStream(text: string): ProviderStatusResult {
    if (text.includes("event: error")) {
      const m = text.match(/data:\s*(\[[\s\S]*\])/);
      return {
        status: "failed",
        stage: "Failed",
        error: `The free Space reported an error${m ? `: ${m[1].slice(0, 200)}` : "."}`,
      };
    }
    const completeIdx = text.lastIndexOf("event: complete");
    if (completeIdx === -1) {
      return this.queueStatus(text);
    }
    const dataChunk = text.slice(completeIdx);
    const m = dataChunk.match(/data:\s*(\[[\s\S]*\])\s*$/m) ?? dataChunk.match(/data:\s*(\[[\s\S]*\])/);
    if (!m) {
      return { status: "processing", stage: "Finalizing on free Space…", progressPercent: 85 };
    }
    let data: any[];
    try {
      data = JSON.parse(m[1]);
    } catch {
      return { status: "processing", stage: "Finalizing on free Space…", progressPercent: 85 };
    }
    const url = this.extractVideoUrl(data?.[0]);
    if (!url) {
      logger.warn("Free Space returned unrecognized output shape", { keys: data?.[0] ? Object.keys(data[0]) : [] });
      return { status: "failed", stage: "Failed", error: "The free Space returned an unrecognized result format." };
    }
    // Absolute https URL — the service layer downloads it into our storage.
    return { status: "completed", stage: "Completed", progressPercent: 100, videoUrl: url };
  }

  /** Normalize Gradio's common video-output shapes to an absolute URL. */
  private extractVideoUrl(first: any): string | null {
    if (!first) return null;
    if (typeof first === "string") {
      if (/^https?:\/\//.test(first)) return first;
      if (first.endsWith(".mp4")) return `${this.spaceUrl}/gradio_api/file=${first}`;
      return null;
    }
    const v = first.video ?? first;
    if (typeof v === "object") {
      if (typeof v.url === "string") {
        return v.url.startsWith("http") ? v.url : `${this.spaceUrl}${v.url.startsWith("/") ? "" : "/"}${v.url}`;
      }
      if (typeof v.path === "string" && v.path.endsWith(".mp4")) {
        return `${this.spaceUrl}/gradio_api/file=${v.path}`;
      }
    }
    return null;
  }

  async cancelGeneration(_providerJobId: string): Promise<void> {
    // Gradio's public API has no cancel for event-stream jobs; the job simply
    // stops being polled and FrameForge marks it cancelled locally.
    logger.info("Free Space job released (no remote cancel in Gradio API)");
  }
}
