import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { validateProjectInput } from "@/lib/validation";
import { createProject, listProjects } from "@/lib/db/repositories";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  return ok({ projects: listProjects(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body.", 400);
  }
  const parsed = validateProjectInput(body);
  if (!parsed.ok) return fail("Invalid request.", 400, parsed.errors);
  const project = createProject(user.id, parsed.value.name, parsed.value.description);
  return ok({ project }, 201);
}
