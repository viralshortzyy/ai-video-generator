// ── Provider registry ───────────────────────────────────────────────────
// Single place where providers are wired up. To add a provider:
//   1. Create src/lib/providers/<id>.ts implementing VideoProvider.
//   2. Add it to `buildProviders()` below.
//   3. Seed its models into video_models (or return them via metadata()).

import { config } from "../config";
import { logger } from "../logger";
import type { VideoProvider, ProviderModelInfo } from "./types";
import { MockVideoProvider } from "./mockProvider";
import { RealProviderStub } from "./realStub";

let cached: VideoProvider[] | null = null;

function buildProviders(): VideoProvider[] {
  if (config.mockVideoMode) {
    logger.info("MOCK_VIDEO_MODE=true — only mock providers registered");
    return [new MockVideoProvider()];
  }
  // Real mode: register implemented providers here. Stubs document the seam.
  return [
    new RealProviderStub("runway", "Runway", "RUNWAY_API_KEY"),
    new RealProviderStub("kling", "Kling", "KLING_API_KEY"),
    new RealProviderStub("luma", "Luma", "LUMA_API_KEY"),
  ];
}

export function listProviders(): VideoProvider[] {
  if (!cached) cached = buildProviders();
  return cached;
}

export function getProvider(providerId: string): VideoProvider {
  const p = listProviders().find((x) => x.id === providerId);
  if (!p) throw new Error(`Unknown video provider: ${providerId}`);
  return p;
}

/** Find the provider that owns a model id (checks registry metadata). */
export function getProviderForModel(modelId: string): { provider: VideoProvider; model: ProviderModelInfo } {
  for (const provider of listProviders()) {
    const model = provider.metadata().models.find((m) => m.id === modelId);
    if (model) return { provider, model };
  }
  throw new Error(`Unknown video model: ${modelId}`);
}
