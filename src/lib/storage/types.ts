// ── Storage provider abstraction ──────────────────────────────────────────
// Media (reference images, renders) goes through this interface. MVP uses
// local disk; Google Drive / Dropbox / Box adapters can be added later by
// implementing StorageProvider and switching getStorage().

export interface SaveOptions {
  userId: string;
  kind: "reference-image" | "video" | "thumbnail" | "misc";
  filename: string;
  mime: string;
}

export interface SavedFile {
  key: string;
  url: string;
  sizeBytes: number;
}

export interface StorageProvider {
  readonly id: string;
  save(data: Buffer, opts: SaveOptions): Promise<SavedFile>;
  delete(key: string): Promise<void>;
}
