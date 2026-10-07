// ── SQLite client (node:sqlite, zero dependencies) ───────────────────────
// - Singleton DatabaseSync instance.
// - Runs schema.sql idempotently on first import (dev-friendly auto-migrate).
// - Seeds the demo user and the mock video models.
// For production, swap this module for a Postgres pool; the repositories
// only depend on the tiny `db` surface below (prepare/run/get/all).

import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import { logger } from "../logger";

let instance: DatabaseSync | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function seed(db: DatabaseSync) {
  // Demo user (MVP auth — see src/lib/auth.ts).
  const user = db.prepare("SELECT id FROM users WHERE id = 'demo-user'").get();
  if (!user) {
    db.prepare(
      "INSERT INTO users (id, email, name, created_at) VALUES ('demo-user', 'demo@frameforge.local', 'Demo Creator', ?)"
    ).run(nowIso());
    db.prepare(
      "INSERT INTO credits_ledger (id, user_id, delta, reason, generation_id, created_at) VALUES (?, 'demo-user', ?, 'new_user_grant', NULL, ?)"
    ).run(randomUUID(), config.newUserCredits, nowIso());
    db.prepare(
      "INSERT INTO subscriptions (id, user_id, plan, status, stripe_customer_id, current_period_end, created_at, updated_at) VALUES (?, 'demo-user', 'free', 'active', NULL, NULL, ?, ?)"
    ).run(randomUUID(), nowIso(), nowIso());
    logger.info("Seeded demo user", { credits: config.newUserCredits });
  }

  // Mock video models (visible in the model selector while MOCK_VIDEO_MODE=true).
  const count = db
    .prepare("SELECT COUNT(*) AS c FROM video_models WHERE is_mock = 1")
    .get() as { c: number };
  if (count.c === 0) {
    const models = [
      {
        id: "forge-mock-v1",
        provider_id: "mock",
        display_name: "Forge Mock v1",
        description: "Fast mock renderer for testing the full pipeline.",
        capabilities: {
          durations: [2, 4, 6, 8, 10],
          aspectRatios: ["16:9", "9:16", "1:1"],
          qualities: ["draft", "standard", "high"],
          supportsImageToVideo: true,
          maxScenes: 1,
        },
        sort_order: 10,
      },
      {
        id: "forge-mock-cinema",
        provider_id: "mock",
        display_name: "Forge Mock Cinema",
        description: "Slower, more dramatic mock pipeline (longer staged progress).",
        capabilities: {
          durations: [4, 6, 8, 10],
          aspectRatios: ["16:9", "9:16", "1:1"],
          qualities: ["standard", "high"],
          supportsImageToVideo: true,
          maxScenes: 4,
        },
        sort_order: 20,
      },
    ];
    const stmt = db.prepare(
      "INSERT INTO video_models (id, provider_id, display_name, description, capabilities, enabled, is_mock, sort_order) VALUES (?, ?, ?, ?, ?, 1, 1, ?)"
    );
    for (const m of models) {
      stmt.run(
        m.id,
        m.provider_id,
        m.display_name,
        m.description,
        JSON.stringify(m.capabilities),
        m.sort_order
      );
    }
    logger.info("Seeded mock video models");
  }
}

export function getDb(): DatabaseSync {
  if (instance) return instance;
  const dbPath = config.databasePath;
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");

  const schemaPath = join(__dirname, "schema.sql");
  if (existsSync(schemaPath)) {
    db.exec(readFileSync(schemaPath, "utf8"));
  } else {
    // Fallback for bundled builds where __dirname differs.
    const alt = join(process.cwd(), "src/lib/db/schema.sql");
    if (existsSync(alt)) db.exec(readFileSync(alt, "utf8"));
  }

  seed(db);
  instance = db;
  logger.info("Database ready", { path: dbPath });
  return db;
}

// Re-export for convenience.
export { nowIso };
