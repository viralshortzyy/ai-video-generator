// ── Free inference backend contract ───────────────────────────────────────
// A FreeBackend is one concrete way to generate video for $0: a local GPU
// runner, a Hugging Face Gradio Space, etc. FreeVideoProvider picks the
// configured backend; if none can serve, it reports unavailability honestly
// instead of faking output or silently calling a paid API.

import type {
  ProviderGenerationRequest,
  ProviderModelInfo,
  ProviderStatusResult,
} from "../types";

/** Thrown when no free backend can serve. Never triggers paid fallbacks. */
export class FreeUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `Free AI video generation is currently unavailable. ${reason} ` +
        `No paid provider was called. Switch VIDEO_PROVIDER to "mock" for the simulated demo, ` +
        `or configure a free backend (see docs/FREE_SETUP.md).`
    );
    this.name = "FreeUnavailableError";
  }
}

export interface FreeBackend {
  readonly id: string;
  /** Human-readable label, e.g. "Local Wan 2.1 (GPU)". */
  readonly label: string;
  /** Models this backend can serve right now (empty = cannot serve). */
  models(): ProviderModelInfo[];
  createGeneration(req: ProviderGenerationRequest): Promise<{ providerJobId: string }>;
  getGenerationStatus(providerJobId: string): Promise<ProviderStatusResult>;
  cancelGeneration?(providerJobId: string): Promise<void>;
}
