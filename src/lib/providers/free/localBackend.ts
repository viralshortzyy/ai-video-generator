// ── Local GPU backend (self-hosted open model, e.g. Wan 2.1) ─────────────
// This backend does NOT download or run any model by itself. It detects
// whether the machine can realistically run one (NVIDIA GPU present AND an
// operator-installed runner script), and stays honestly unavailable otherwise.
//
// Why the caution: Wan2.1-T2V-1.3B needs ~8GB VRAM, the 14B needs ~24GB.
// A GPU-less server must never attempt the download. See docs/FREE_SETUP.md
// for the runner contract.

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type {
  ProviderGenerationRequest,
  ProviderModelInfo,
  ProviderStatusResult,
} from "../types";
import { FreeUnavailableError } from "./backend";

/** Env var pointing at the operator-installed inference runner script. */
const RUNNER_ENV = "WAN_RUNNER_SCRIPT";

export class LocalWanBackend {
  readonly id = "local-wan";
  readonly label = "Local Wan 2.1 (self-hosted GPU)";

  /** Synchronous capability probe — safe to run at provider registration. */
  probe(): { ok: true; runner: string } | { ok: false; reason: string } {
    let gpu = false;
    try {
      execSync("nvidia-smi -L", { stdio: "pipe", timeout: 5000 });
      gpu = true;
    } catch {
      gpu = false;
    }
    if (!gpu) {
      return {
        ok: false,
        reason:
          "No NVIDIA GPU was detected on this machine (nvidia-smi not found). " +
          "Wan2.1-T2V-1.3B needs ~8GB VRAM and the 14B needs ~24GB — CPU-only generation is not practical. " +
          "Use FREE_BACKEND=gradio with a hosted Space instead.",
      };
    }
    const runner = (process.env[RUNNER_ENV] ?? "").trim();
    if (!runner || !existsSync(runner)) {
      return {
        ok: false,
        reason:
          "A GPU was detected but no local inference runner is installed. " +
          `Set ${RUNNER_ENV} to your Wan 2.1 runner script (see docs/FREE_SETUP.md for the contract).`,
      };
    }
    return { ok: true, runner };
  }

  models(): ProviderModelInfo[] {
    return [
      {
        id: "free-wan21-t2v",
        displayName: "Wan 2.1 T2V (local GPU)",
        description: "Open-source Wan 2.1 text-to-video running on this machine's GPU. $0.",
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

  async createGeneration(_req: ProviderGenerationRequest): Promise<{ providerJobId: string }> {
    // The runner contract is documented but not bundled: executing an
    // operator-provided script is a deliberate deployment step, not magic.
    // (probe() already guarantees we never get here without a runner.)
    throw new FreeUnavailableError(
      "The local GPU runner is not installed on this server. See docs/FREE_SETUP.md."
    );
  }

  async getGenerationStatus(_providerJobId: string): Promise<ProviderStatusResult> {
    throw new FreeUnavailableError("Local backend has no jobs.");
  }
}
