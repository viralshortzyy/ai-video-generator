import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { validateImageUpload } from "@/lib/validation";
import { checkRateLimit, LIMITS } from "@/lib/rateLimit";
import { getStorage } from "@/lib/storage";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/** Upload a reference image for image-to-video (stored via the storage provider). */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();

  const rl = checkRateLimit(`upload:${user.id}`, LIMITS.upload.limit, LIMITS.upload.windowMs);
  if (!rl.allowed) return fail("Upload rate limit exceeded.", 429);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Invalid multipart body.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Missing 'file' field.", 400);

  const problem = validateImageUpload(file.type, file.size);
  if (problem) return fail(problem, 400);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await getStorage().save(buffer, {
      userId: user.id,
      kind: "reference-image",
      filename: file.name || "reference.png",
      mime: file.type,
    });
    logger.info("Reference image uploaded", { userId: user.id, key: saved.key });
    return ok({ url: saved.url, key: saved.key }, 201);
  } catch (err) {
    logger.error("Upload failed", { error: String(err) });
    return fail("Upload failed.", 500);
  }
}
