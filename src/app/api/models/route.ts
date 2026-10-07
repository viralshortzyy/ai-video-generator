import { ok } from "@/lib/api";
import { listProviders } from "@/lib/providers/registry";

export const runtime = "nodejs";
// The catalog depends on server env (MOCK_VIDEO_MODE / API keys), so it must
// never be statically prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * Live model catalog, driven by the provider registry — the UI only ever
 * offers models whose provider is actually registered and can dispatch.
 * (The video_models DB table remains as an admin/audit copy.)
 */
export async function GET() {
  const models = listProviders().flatMap((p) => {
    const meta = p.metadata();
    return meta.models.map((m) => ({
      id: m.id,
      providerId: meta.id,
      displayName: m.displayName,
      description: m.description ?? meta.description ?? null,
      capabilities: m.capabilities,
      enabled: true,
      isMock: meta.id === "mock",
      sortOrder: 0,
    }));
  });
  return ok({ models });
}
