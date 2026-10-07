import { NextRequest } from "next/server";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ok, fail } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { deleteGeneration, getProject, updateGeneration } from "@/lib/db/repositories";
import { syncGeneration } from "@/lib/generations/service";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  const gen = await syncGeneration(user.id, params.id);
  if (!gen) return fail("Generation not found.", 404);
  return ok({ generation: gen });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body.", 400);
  }

  const patch: { saved?: boolean; projectId?: string | null } = {};
  if (typeof body.saved === "boolean") patch.saved = body.saved;
  if (body.projectId === null || typeof body.projectId === "string") {
    if (body.projectId && !getProject(user.id, body.projectId)) {
      return fail("Project not found.", 404);
    }
    patch.projectId = body.projectId ?? null;
  }

  const updated = updateGeneration(user.id, params.id, patch);
  if (!updated) return fail("Generation not found.", 404);
  return ok({ generation: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  const gen = await syncGeneration(user.id, params.id);
  if (!gen) return fail("Generation not found.", 404);
  if (gen.status === "processing" || gen.status === "queued") {
    return fail("Cancel the generation before deleting it.", 409);
  }
  // Best-effort cleanup of mock sample files.
  for (const u of [gen.videoUrl, gen.thumbnailUrl]) {
    if (u && u.startsWith("/samples/")) {
      const abs = join(process.cwd(), "public", u);
      try {
        if (existsSync(abs)) unlinkSync(abs);
      } catch { /* ignore */ }
    }
  }
  deleteGeneration(user.id, params.id);
  return ok({ deleted: true });
}
