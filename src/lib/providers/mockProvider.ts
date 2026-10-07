// ── Mock video provider ─────────────────────────────────────────────────
// Simulates a real provider's async lifecycle (queued → processing →
// completed) and renders an actual playable sample MP4 with ffmpeg, so the
// entire product — polling, progress UI, player, download — can be tested
// with zero API spend. No paid endpoints are ever called in this mode.

import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ProviderGenerationRequest,
  ProviderMetadata,
  ProviderStatusResult,
  VideoProvider,
} from "./types";
import { logger } from "../logger";

interface MockJob {
  req: ProviderGenerationRequest;
  createdAt: number;
  cancelled: boolean;
  rendered: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
}

const jobs = new Map<string, MockJob>();

// Per-model simulated pipeline durations (ms).
const TIMELINES: Record<string, { queuedMs: number; processingMs: number }> = {
  "forge-mock-v1": { queuedMs: 2_000, processingMs: 9_000 },
  "forge-mock-cinema": { queuedMs: 4_000, processingMs: 20_000 },
};

const SIZES: Record<string, string> = {
  "16:9": "1280x720",
  "9:16": "720x1280",
  "1:1": "960x960",
};

function samplesDir(): string {
  const dir = join(process.cwd(), "public", "samples");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function findFont(): string | null {
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function escapeDrawText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:");
}

/** Render a stylized sample clip + thumbnail with ffmpeg. */
function renderSample(jobId: string, req: ProviderGenerationRequest): { videoUrl: string; thumbnailUrl: string } {
  const dir = samplesDir();
  const videoPath = join(dir, `${jobId}.mp4`);
  const thumbPath = join(dir, `${jobId}.jpg`);
  const size = SIZES[req.aspectRatio] ?? SIZES["16:9"];
  const duration = Math.min(Math.max(req.durationSec, 2), 10);
  const font = findFont();

  const title = escapeDrawText(req.structured.subject.slice(0, 42) || "FrameForge sample");
  const watermark = escapeDrawText("FRAMEFORGE · MOCK RENDER");

  // Animated gradient background + drifting highlight + text overlays.
  const vfParts = [
    `gradients=s=${size}:c0=0x1a1a2e:c1=0x16213e:c2=0x0f3460:c3=0x533483:speed=0.08`,
    "format=yuv420p",
  ];
  if (font) {
    vfParts.push(
      `drawtext=fontfile=${font}:text='${title}':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=(h-text_h)/2-40`,
      `drawtext=fontfile=${font}:text='${watermark}':fontcolor=0xF5A524:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2+40`,
      `drawtext=fontfile=${font}:text='${escapeDrawText(`${req.durationSec}s · ${req.aspectRatio} · ${req.quality}`)}':fontcolor=0x9A9AA5:fontsize=22:x=(w-text_w)/2:y=h-60`
    );
  }
  const vf = vfParts.join(",");

  execFileSync("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", vf,
    "-t", String(duration),
    "-r", "30",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    videoPath,
  ], { stdio: "pipe", timeout: 120_000 });

  execFileSync("ffmpeg", [
    "-y", "-i", videoPath,
    "-vframes", "1",
    "-q:v", "4",
    thumbPath,
  ], { stdio: "pipe", timeout: 30_000 });

  logger.info("Mock video rendered", { jobId, duration });
  return { videoUrl: `/samples/${jobId}.mp4`, thumbnailUrl: `/samples/${jobId}.jpg` };
}

function stageFor(elapsed: number, timeline: { queuedMs: number; processingMs: number }): { stage: string; progress: number; phase: "queued" | "processing" | "done" } {
  const steps = [
    { label: "Analyzing prompt", at: 0 },
    { label: "Preparing video instructions", at: 0.15 },
    { label: "Sending to video model", at: 0.3 },
    { label: "Generating video", at: 0.45 },
    { label: "Finalizing video", at: 0.85 },
  ];
  const total = timeline.queuedMs + timeline.processingMs;
  if (elapsed < timeline.queuedMs) {
    return { stage: "Queued", progress: Math.round((elapsed / total) * 20), phase: "queued" };
  }
  if (elapsed < total) {
    const p = elapsed / total;
    const current = [...steps].reverse().find((s) => p >= s.at) ?? steps[0];
    return { stage: `${current.label}…`, progress: Math.round(20 + p * 75), phase: "processing" };
  }
  return { stage: "Completed", progress: 100, phase: "done" };
}

export class MockVideoProvider implements VideoProvider {
  readonly id = "mock";

  metadata(): ProviderMetadata {
    return {
      id: "mock",
      displayName: "FrameForge Mock",
      description: "Local simulated renderer — no API calls, no cost.",
      supportsCancel: true,
      models: [
        {
          id: "forge-mock-v1",
          displayName: "Forge Mock v1",
          description: "Fast mock renderer for testing the full pipeline.",
          capabilities: {
            durations: [2, 4, 6, 8, 10],
            aspectRatios: ["16:9", "9:16", "1:1"],
            qualities: ["draft", "standard", "high"],
            supportsImageToVideo: true,
            maxScenes: 1,
          },
        },
        {
          id: "forge-mock-cinema",
          displayName: "Forge Mock Cinema",
          description: "Slower, more dramatic mock pipeline.",
          capabilities: {
            durations: [4, 6, 8, 10],
            aspectRatios: ["16:9", "9:16", "1:1"],
            qualities: ["standard", "high"],
            supportsImageToVideo: true,
            maxScenes: 4,
          },
        },
      ],
    };
  }

  async createGeneration(req: ProviderGenerationRequest): Promise<{ providerJobId: string }> {
    const providerJobId = `mock_${randomUUID()}`;
    jobs.set(providerJobId, { req, createdAt: Date.now(), cancelled: false, rendered: false });
    logger.info("Mock job created", { providerJobId, model: req.modelId });
    return { providerJobId };
  }

  async getGenerationStatus(providerJobId: string): Promise<ProviderStatusResult> {
    const job = jobs.get(providerJobId);
    if (!job) return { status: "failed", error: "Unknown mock job id." };
    if (job.cancelled) return { status: "cancelled", stage: "Cancelled" };

    const timeline = TIMELINES[job.req.modelId] ?? TIMELINES["forge-mock-v1"];
    const elapsed = Date.now() - job.createdAt;
    const { stage, progress, phase } = stageFor(elapsed, timeline);

    if (phase === "done") {
      if (!job.rendered) {
        try {
          const { videoUrl, thumbnailUrl } = renderSample(providerJobId, job.req);
          job.videoUrl = videoUrl;
          job.thumbnailUrl = thumbnailUrl;
          job.rendered = true;
        } catch (err) {
          logger.error("Mock render failed", { providerJobId, error: String(err) });
          return { status: "failed", stage: "Failed", error: "Mock renderer failed (is ffmpeg installed?)." };
        }
      }
      return { status: "completed", stage: "Completed", progressPercent: 100, videoUrl: job.videoUrl, thumbnailUrl: job.thumbnailUrl };
    }
    return {
      status: phase === "queued" ? "queued" : "processing",
      stage,
      progressPercent: progress,
    };
  }

  async cancelGeneration(providerJobId: string): Promise<void> {
    const job = jobs.get(providerJobId);
    if (job) job.cancelled = true;
  }
}
