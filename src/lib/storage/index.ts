// ── Storage selector ──────────────────────────────────────────────────────
// Cloud adapters (Google Drive / Dropbox / Box) plug in here later:
// implement StorageProvider, then return it based on env config.
// The rest of the app never touches disk paths directly.

import type { StorageProvider } from "./types";
import { LocalStorageProvider } from "./local";

let cached: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!cached) cached = new LocalStorageProvider();
  return cached;
}

export { LocalStorageProvider };
