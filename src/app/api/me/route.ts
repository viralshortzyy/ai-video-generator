import { ok } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { getBalance } from "@/lib/generations/service";
import { PLANS } from "@/lib/billing/stripe";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  return ok({
    user,
    balance: getBalance(user.id),
    plan: PLANS.free,
  });
}
