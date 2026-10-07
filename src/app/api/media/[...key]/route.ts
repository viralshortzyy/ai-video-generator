import { NextRequest, NextResponse } from "next/server";
import { existsSync, statSync, createReadStream } from "node:fs";
import { extname } from "node:path";
import { getSessionUser } from "@/lib/auth";
import { LocalStorageProvider } from "@/lib/storage/local";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

/** Serve stored media. Users may only fetch their own userId prefix. */
export async function GET(_req: NextRequest, { params }: { params: { key: string[] } }) {
  const user = await getSessionUser();
  const key = (params.key ?? []).join("/");

  // Ownership check + traversal guard.
  if (!key || key.includes("..") || !key.startsWith(`${user.id}/`)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const abs = new LocalStorageProvider().resolvePath(key);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const mime = MIME[extname(abs).toLowerCase()] ?? "application/octet-stream";
  const stream = createReadStream(abs);
  // @ts-expect-error — NextResponse accepts a Node Readable as body.
  return new NextResponse(stream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(statSync(abs).size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
