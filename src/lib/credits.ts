// ── Credit economy ──────────────────────────────────────────────────────
// Generations cost credits based on duration × quality. All movement goes
// through the ledger (auditable). Stripe plans map onto credit packs later;
// the economy itself never depends on Stripe.

import { randomUUID } from "node:crypto";
import { getDb, nowIso } from "./db/client";
import type { VideoQuality } from "./types";
import { logger } from "./logger";

const COST_PER_SECOND: Record<VideoQuality, number> = {
  draft: 1,
  standard: 3,
  high: 6,
};

export function creditsForGeneration(durationSec: number, quality: VideoQuality): number {
  return durationSec * (COST_PER_SECOND[quality] ?? COST_PER_SECOND.standard);
}

export function getBalance(userId: string): number {
  const r = getDb()
    .prepare("SELECT COALESCE(SUM(delta), 0) AS balance FROM credits_ledger WHERE user_id = ?")
    .get(userId) as { balance: number };
  return r.balance;
}

export class InsufficientCreditsError extends Error {
  needed: number;
  balance: number;
  constructor(needed: number, balance: number) {
    super(`Insufficient credits: need ${needed}, have ${balance}.`);
    this.name = "InsufficientCreditsError";
    this.needed = needed;
    this.balance = balance;
  }
}

export function grantCredits(userId: string, amount: number, reason: string): number {
  getDb()
    .prepare("INSERT INTO credits_ledger (id, user_id, delta, reason, generation_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)")
    .run(randomUUID(), userId, amount, reason, nowIso());
  const balance = getBalance(userId);
  logger.info("Credits granted", { userId, amount, reason, balance });
  return balance;
}

/** Atomically checks balance and spends. Throws InsufficientCreditsError. */
export function spendCredits(userId: string, amount: number, reason: string, generationId?: string): number {
  const db = getDb();
  const balance = getBalance(userId);
  if (balance < amount) throw new InsufficientCreditsError(amount, balance);
  db.prepare(
    "INSERT INTO credits_ledger (id, user_id, delta, reason, generation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(randomUUID(), userId, -amount, reason, generationId ?? null, nowIso());
  return balance - amount;
}

export function refundCredits(userId: string, amount: number, reason: string, generationId?: string): number {
  return grantCredits(userId, amount, `${reason}${generationId ? ` (generation ${generationId})` : ""}`);
}
