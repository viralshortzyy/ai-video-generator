import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { validateGenerationInput } from "@/lib/validation";
import { checkRateLimit, LIMITS } from "@/lib/rateLimit";
import {
  createGenerationJob,
  listGenerations,
  getBalance,
  InsufficientCreditsError,
} from "@/lib/generations/service";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const url = new URL(req.url);
  const filter = {
    projectId: url.searchParams.get("projectId") ?? undefined,
    status: (url.searchParams.get("status") as any) ?? undefined,
    savedOnly: url.searchParams.get("saved") === "1",
    limit: Number(url.searchParams.get("limit") ?? 24),
    offset: Number(url.searchParams.get("offset") ?? 0),
  };
  const result = listGenerations(user.id, filter);
  return ok({ ...result, balance: getBalance(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();

  const rl = checkRateLimit(`gen:${user.id}`, LIMITS.createGeneration.limit, LIMITS.createGeneration.windowMs);
  if (!rl.allowed) {
    return fail(`Rate limit exceeded. Try again in ${rl.retryAfterSec}s.`, 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body.", 400);
  }

  const parsed = validateGenerationInput(body);
  if (!parsed.ok) return fail("Invalid request.", 400, parsed.errors);

  try {
    const { generation, balance } = await createGenerationJob(user.id, parsed.value);
    return ok({ generation, balance }, 201);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return fail(err.message, 402, { needed: err.needed, balance: err.balance });
    }
    logger.error("Generation creation failed", { error: err instanceof Error ? err.message : String(err) });
    return fail(err instanceof Error ? err.message : "Generation failed.", 500);
  }
}
