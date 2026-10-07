import { ok } from "@/lib/api";
import { listVideoModels } from "@/lib/db/repositories";

export const runtime = "nodejs";

export async function GET() {
  const models = listVideoModels().map((m) => ({
    ...m,
    capabilities: JSON.parse(m.capabilitiesJson),
  }));
  return ok({ models });
}
