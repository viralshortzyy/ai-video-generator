// ── Billing plans + Stripe seam ───────────────────────────────────────────
// The credit economy (src/lib/credits.ts) is live in the MVP. Stripe is
// prepared but NOT required: BillingProvider is implemented by StripeBilling
// (future), which currently throws a clear "not configured" error.

import type { PlanId } from "../types";

export interface Plan {
  id: PlanId;
  name: string;
  priceUsdPerMonth: number;
  monthlyCredits: number;
  maxProjects: number;
}

export const PLANS: Record<PlanId, Plan> = {
  free: { id: "free", name: "Free", priceUsdPerMonth: 0, monthlyCredits: 600, maxProjects: 3 },
  starter: { id: "starter", name: "Starter", priceUsdPerMonth: 12, monthlyCredits: 3_000, maxProjects: 10 },
  pro: { id: "pro", name: "Pro", priceUsdPerMonth: 39, monthlyCredits: 12_000, maxProjects: 50 },
  enterprise: { id: "enterprise", name: "Enterprise", priceUsdPerMonth: 199, monthlyCredits: 60_000, maxProjects: 500 },
};

export interface BillingProvider {
  readonly id: string;
  createCheckoutSession(userId: string, plan: PlanId): Promise<{ url: string }>;
  createBillingPortalSession(userId: string): Promise<{ url: string }>;
  handleWebhook(rawBody: Buffer, signature: string): Promise<void>;
}

/**
 * Future Stripe implementation. Activate by:
 *   1. `npm i stripe`
 *   2. Set STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_* env vars
 *   3. Implement the three methods with the Stripe SDK.
 * Never store card details ourselves — Stripe Checkout + webhooks only.
 */
export class StripeBillingNotConfigured implements BillingProvider {
  readonly id = "stripe";
  private boom(): Error {
    return new Error(
      "Stripe billing is not configured. See src/lib/billing/stripe.ts for activation steps. " +
      "The MVP runs fully without Stripe."
    );
  }
  async createCheckoutSession(): Promise<{ url: string }> { throw this.boom(); }
  async createBillingPortalSession(): Promise<{ url: string }> { throw this.boom(); }
  async handleWebhook(): Promise<void> { throw this.boom(); }
}
