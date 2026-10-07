// ── Provider registry ───────────────────────────────────────────────────
// Single place where providers are wired up. To add a provider:
//   1. Create src/lib/providers/<id>.ts implementing VideoProvider.
//   2. Add it to `buildProviders()` below.
//   3. Seed its models into video_models (or return them via metadata()).

import { config } from "../config";
import { logger } from "../logger";
import type { VideoProvider, ProviderModelInfo } from "./types";
import { MockVideoProvider } from "./mockProvider";
import { FreeVideoProvider } from "./freeProvider";
import { RunwayProvider } from "./runway";
import { RealProviderStub } from "./realStub";

let cached: VideoProvider[] | null = null;

function buildProviders(): VideoProvider[] {
  const mode = config.providerMode;

  // Mock mode is untouched: local simulation, zero cost, always available.
  // (Legacy MOCK_VIDEO_MODE=true resolves here too.)
  if (mode === "mock") {
    logger.info('VIDEO_PROVIDER=mock — only mock providers registered');
    return [new MockVideoProvider()];
  }

  // Free mode: real $0 generation via a free backend (local GPU / Gradio).
  // Never calls paid APIs. If no backend can serve, the provider advertises
  // no models and explains why — it never fakes output.
  if (mode === "free") {
    logger.info('VIDEO_PROVIDER=free — free backend provider registered');
    return [new FreeVideoProvider()];
  }

  // Paid mode: Runway ONLY when explicitly selected, paid providers allowed,
  // and the key is configured. Otherwise a stub explains exactly why.
  // (Legacy MOCK_VIDEO_MODE=false resolves here too.)
  const providers: VideoProvider[] = [];
  if (!config.allowPaidProviders) {
    const reason =
      "Paid providers are disabled (ALLOW_PAID_PROVIDERS=false). " +
      "No paid API will be called. Set ALLOW_PAID_PROVIDERS=true to enable Runway deliberately.";
    logger.warn(reason);
    providers.push(new RealProviderStub("runway", "Runway", "RUNWAY_API_KEY", reason));
  } else if (config.runwayApiKey) {
    providers.push(
      new RunwayProvider({
        apiKey: config.runwayApiKey,
        modelId: config.runwayVideoModel,
        baseUrl: config.runwayBaseUrl,
      })
    );
    logger.info("Runway provider registered", { model: config.runwayVideoModel });
  } else {
    providers.push(new RealProviderStub("runway", "Runway", "RUNWAY_API_KEY"));
  }
  providers.push(new RealProviderStub("kling", "Kling", "KLING_API_KEY"));
  providers.push(new RealProviderStub("luma", "Luma", "LUMA_API_KEY"));
  return providers;
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
