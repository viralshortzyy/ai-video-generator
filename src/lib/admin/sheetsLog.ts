// ── Optional Google Sheets admin logging ──────────────────────────────────
// Best-effort, fire-and-forget, and NEVER on the critical path: the app works
// identically with or without Sheets. Enable by setting GOOGLE_SHEETS_LOG_ID
// (a sheet with headers: timestamp, id, prompt, model, duration, status).
// Uses a plain HTTPS append via API key when GOOGLE_SHEETS_API_KEY is set;
// for private sheets, wire a service-account token here instead.

import { config } from "../config";
import { logger } from "../logger";
import type { Generation } from "../types";

export async function logGenerationToSheet(gen: Generation): Promise<void> {
  if (!config.sheetsLogId) return; // disabled — this is the normal MVP state
  try {
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!apiKey) {
      logger.debug("Sheets logging skipped: no API key");
      return;
    }
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetsLogId}` +
      `/values/Generations!A:F:append?valueInputOption=RAW&key=${apiKey}`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        values: [[
          gen.createdAt,
          gen.id,
          gen.originalPrompt.slice(0, 200),
          gen.modelId,
          gen.durationSec,
          gen.status,
        ]],
      }),
    });
    logger.debug("Logged generation to Sheets", { generationId: gen.id });
  } catch (err) {
    // Never break generation for an admin log.
    logger.warn("Sheets logging failed (non-fatal)", { error: String(err) });
  }
}
