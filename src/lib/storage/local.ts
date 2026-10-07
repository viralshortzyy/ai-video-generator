// ── Local disk storage (MVP) ──────────────────────────────────────────────
// Files land under STORAGE_DIR/<userId>/<kind>/<uuid>.<ext> and are served
// via /api/media/[...key] with an ownership check. Future cloud adapters
// (Google Drive, Dropbox, Box) implement the same StorageProvider surface.

import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import type { SavedFile, SaveOptions, StorageProvider } from "./types";

export class LocalStorageProvider implements StorageProvider {
  readonly id = "local";

  private absKey(key: string): string {
    return join(config.storageDir, key);
  }

  async save(data: Buffer, opts: SaveOptions): Promise<SavedFile> {
    const ext = extname(opts.filename) || "";
    const key = `${opts.userId}/${opts.kind}/${randomUUID()}${ext}`;
    const abs = this.absKey(key);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, data);
    return { key, url: `/api/media/${key}`, sizeBytes: data.byteLength };
  }

  async delete(key: string): Promise<void> {
    const abs = this.absKey(key);
    if (existsSync(abs)) unlinkSync(abs);
  }

  /** Resolve a key to an absolute path (used by the media API route). */
  resolvePath(key: string): string {
    return this.absKey(key);
  }
}
