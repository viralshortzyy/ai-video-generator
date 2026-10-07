// ── MVP authentication ──────────────────────────────────────────────────
// MVP: single demo user, seeded on boot. A `ff_uid` cookie is honored when
// present so the data model is already multi-user safe — every repository
// call is scoped by userId. Production upgrade path: replace getSessionUser()
// with Auth.js (NextAuth) session lookup; no other code changes required.

import { cookies } from "next/headers";
import { getUserById } from "./db/repositories";
import type { User } from "./types";

const COOKIE_NAME = "ff_uid";
const DEMO_USER_ID = "demo-user";

export async function getSessionUser(): Promise<User> {
  try {
    const store = cookies();
    const cookieId = store.get(COOKIE_NAME)?.value;
    if (cookieId) {
      const u = getUserById(cookieId);
      if (u) return u;
    }
  } catch {
    // cookies() unavailable (e.g. plain node context) — fall through to demo.
  }
  const demo = getUserById(DEMO_USER_ID);
  if (!demo) throw new Error("Demo user not seeded — database failed to initialize.");
  return demo;
}

export function getSessionUserIdSync(): string {
  return DEMO_USER_ID;
}
