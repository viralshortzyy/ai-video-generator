import { ok } from "@/lib/api";
import { listProviders } from "@/lib/providers/registry";

export const runtime = "nodejs";
// The catalog depends on server env (VIDEO_PROVIDER / API keys), so it must
// never be statically prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * Live model catalog, driven by the provider registry — the UI only ever
 * offers models whose provider is actually registered and can dispatch.
 * Provider notices (e.g. "free backend not configured") are surfaced so the
 * UI can explain WHY no models are available instead of failing silently.
 * (The video_models DB table remains as an admin/audit copy.)
 */
export async function GET() {
  const notices: string[] = [];
  const models = listProviders().flatMap((p) => {
    const meta = p.metadata();
    if (meta.notice) notices.push(meta.notice);
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
  return ok({ models, notices });
}
