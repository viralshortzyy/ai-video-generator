import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { validateProjectInput } from "@/lib/validation";
import {
  deleteProject,
  getProject,
  listGenerations,
  updateProject,
} from "@/lib/db/repositories";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  const project = getProject(user.id, params.id);
  if (!project) return fail("Project not found.", 404);
  const generations = listGenerations(user.id, { projectId: params.id, limit: 100 });
  return ok({ project, generations: generations.items });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body.", 400);
  }
  const parsed = validateProjectInput(body);
  if (!parsed.ok) return fail("Invalid request.", 400, parsed.errors);
  const project = updateProject(user.id, params.id, parsed.value);
  if (!project) return fail("Project not found.", 404);
  return ok({ project });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  const deleted = deleteProject(user.id, params.id);
  if (!deleted) return fail("Project not found.", 404);
  return ok({ deleted: true });
}
