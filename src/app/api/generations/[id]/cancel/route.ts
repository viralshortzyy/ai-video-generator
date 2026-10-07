import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { cancelGenerationJob, getBalance } from "@/lib/generations/service";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  const gen = await cancelGenerationJob(user.id, params.id);
  if (!gen) return fail("Generation not found.", 404);
  return ok({ generation: gen, balance: getBalance(user.id) });
}
