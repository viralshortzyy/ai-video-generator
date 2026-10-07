// ── Real-provider stub ──────────────────────────────────────────────────
// Placeholder for future paid providers (Runway, Kling, Luma, …). Each real
// provider will be its own class implementing VideoProvider, reading its API
// key from env, and registered in registry.ts. This stub exists so the
// architecture is honest: unconfigured providers fail with a clear message
// instead of silently doing nothing.

import type {
  ProviderGenerationRequest,
  ProviderMetadata,
  ProviderStatusResult,
  VideoProvider,
} from "./types";

export class RealProviderStub implements VideoProvider {
  readonly id: string;
  private label: string;
  private envVar: string;

  constructor(id: string, label: string, envVar: string) {
    this.id = id;
    this.label = label;
    this.envVar = envVar;
  }

  metadata(): ProviderMetadata {
    return { id: this.id, displayName: this.label, supportsCancel: false, models: [] };
  }

  private notConfigured(): Error {
    return new Error(
      `${this.label} is not configured. Set ${this.envVar} and implement ` +
      `src/lib/providers/${this.id}.ts (see RealProviderStub), then register it in registry.ts.`
    );
  }

  async createGeneration(_req: ProviderGenerationRequest): Promise<{ providerJobId: string }> {
    throw this.notConfigured();
  }

  async getGenerationStatus(_providerJobId: string): Promise<ProviderStatusResult> {
    throw this.notConfigured();
  }
}
