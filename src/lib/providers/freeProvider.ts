// ── Free video provider ($0, honest) ───────────────────────────────────────
// Real, free video generation through a configured FreeBackend (local GPU or
// Gradio Space). This provider NEVER calls a paid API and NEVER fabricates
// output: if no backend can serve, models() is empty and createGeneration()
// throws FreeUnavailableError with setup guidance.
//
// Selection: VIDEO_PROVIDER=free, backend via FREE_BACKEND (auto/local/gradio).

import { config } from "../config";
import { logger } from "../logger";
import type {
  ProviderGenerationRequest,
  ProviderMetadata,
  ProviderStatusResult,
  VideoProvider,
} from "./types";
import { FreeUnavailableError, type FreeBackend } from "./free/backend";
import { LocalWanBackend } from "./free/localBackend";
import { GradioSpaceBackend } from "./free/gradioBackend";

function resolveBackend(): { backend: FreeBackend | null; reason: string | null } {
  const which = (config.freeBackend || "auto").toLowerCase();

  if (which === "local" || which === "auto") {
    const local = new LocalWanBackend();
    const probe = local.probe();
    if (probe.ok) {
      logger.info("Free backend: local GPU runner", { runner: probe.runner });
      // NOTE: the local runner executes an operator-provided script; the
      // stub createGeneration keeps this honest until the runner is wired.
      return { backend: local, reason: null };
    }
    if (which === "local") {
      return { backend: null, reason: probe.reason };
    }
    logger.info("Free backend: no local GPU, trying Gradio Space", { probe: probe.reason });
  }

  if (which === "gradio" || which === "auto") {
    if (!config.freeGradioUrl) {
      return {
        backend: null,
        reason:
          "No free inference backend is configured. Set FREE_GRADIO_URL to a Gradio Space " +
          "(e.g. your own hosted Wan 2.1 Space — free Hugging Face accounts can host up to 2 " +
          "ZeroGPU Spaces), or run FrameForge on a GPU machine with FREE_BACKEND=local. " +
          "See docs/FREE_SETUP.md.",
      };
    }
    try {
      // eslint-disable-next-line no-new
      new URL(config.freeGradioUrl);
    } catch {
      return { backend: null, reason: `FREE_GRADIO_URL is not a valid URL: ${config.freeGradioUrl}` };
    }
    logger.info("Free backend: Gradio Space", { space: config.freeGradioUrl });
    return {
      backend: new GradioSpaceBackend(config.freeGradioUrl, config.freeGradioEndpoint),
      reason: null,
    };
  }

  return {
    backend: null,
    reason: `Unknown FREE_BACKEND="${config.freeBackend}". Use "auto", "local", or "gradio".`,
  };
}

export class FreeVideoProvider implements VideoProvider {
  readonly id = "free";
  private backend: FreeBackend | null;
  private reason: string | null;

  constructor() {
    const { backend, reason } = resolveBackend();
    this.backend = backend;
    this.reason = reason;
    if (!backend) {
      logger.warn("FreeVideoProvider has no working backend", { reason });
    }
  }

  metadata(): ProviderMetadata {
    const base = {
      id: "free",
      displayName: "Free AI",
      description: "Real AI video generation at $0 via a free/open backend (local GPU or Gradio Space).",
      supportsCancel: true,
    };
    if (!this.backend) {
      return { ...base, models: [], notice: this.reason ?? "Free backend unavailable." };
    }
    return { ...base, models: this.backend.models() };
  }

  async createGeneration(req: ProviderGenerationRequest): Promise<{ providerJobId: string }> {
    if (!this.backend) throw new FreeUnavailableError(this.reason ?? "No free backend is configured.");
    // No retries on creation — same cost-safety rule as paid providers
    // (a retry could double-spend shared free quota).
    return this.backend.createGeneration(req);
  }

  async getGenerationStatus(providerJobId: string): Promise<ProviderStatusResult> {
    if (!this.backend) throw new FreeUnavailableError(this.reason ?? "No free backend is configured.");
    return this.backend.getGenerationStatus(providerJobId);
  }

  async cancelGeneration(providerJobId: string): Promise<void> {
    if (!this.backend) return;
    await this.backend.cancelGeneration?.(providerJobId);
  }
}

export { FreeUnavailableError };
