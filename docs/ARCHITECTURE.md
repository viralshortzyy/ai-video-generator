# FrameForge Architecture

## System overview

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   Next.js   │────▶│  API routes      │────▶│  Service layer    │
│  UI (React) │◀────│  /api/*          │◀────│  generations/     │
└─────────────┘     └──────────────────┘     │  service.ts       │
                                             └────────┬──────────┘
                                                      │
                    ┌──────────────┐     ┌─────────────▼────────────┐
                    │ PromptEngine │◀────┤  1. validate + rate limit │
                    │ Claude/mock  │     │  2. spend credits         │
                    └──────────────┘     │  3. structure prompt      │
                                         │  4. provider.dispatch     │
                    ┌──────────────┐     │  5. poll → sync → refund  │
                    │VideoProvider │◀────└───────────────────────────┘
                    │ mock / real  │
                    └──────────────┘
```

Status syncing is **poll-driven**: every `GET /api/generations/[id]` asks the
provider for the job status and persists it. The frontend polls every ~2s while
a job is active. Production upgrade: move `syncGeneration()` into a queue
worker (BullMQ, Inngest, or a cron sweep) — the function itself doesn't change.

## Module map

| Path | Responsibility |
|---|---|
| `src/app/` | Pages + API routes (thin wrappers over services) |
| `src/components/` | React UI (Header, StudioForm, GenerationProgress, GenerationCard) |
| `src/lib/config.ts` | Typed env config — the only place `process.env` is read |
| `src/lib/db/` | SQLite client (auto-migrate + seed), typed repositories (all user-scoped) |
| `src/lib/prompt/` | `PromptEngine` interface; Claude + mock implementations |
| `src/lib/providers/` | `VideoProvider` interface; mock renderer; **Runway provider**; stubs; registry |
| `src/lib/storage/` | `StorageProvider` interface; local-disk MVP |
| `src/lib/generations/service.ts` | Orchestration: credits → prompt → dispatch → sync → remote-output persistence → refund |
| `src/lib/credits.ts` | Ledger-based credit economy |
| `src/lib/billing/stripe.ts` | Plans + `BillingProvider` seam (Stripe not required) |
| `src/lib/admin/sheetsLog.ts` | Optional Sheets logging — never on the critical path |
| `src/lib/auth.ts` | MVP demo-user session; swap for Auth.js later |
| `src/lib/rateLimit.ts` | In-memory sliding window (Redis for multi-instance) |

## Data model

`users` → `projects` → `generations` → `scenes` (future multi-scene).
`video_models` catalogs provider capabilities. `assets` tracks uploads.
`credits_ledger` is append-only (grants +, spends −). `subscriptions` holds the
plan + future Stripe customer id. `generation_events` is the audit trail.

## Key design decisions

- **Provider abstraction, not integration.** Runway (`src/lib/providers/runway.ts`)
  was added as one class implementing `VideoProvider` + registry wiring — no
  changes to the UI, API routes, or orchestration flow. Adding Kling/Luma is
  the same shape. API keys live in env, never in client code.
- **The live model catalog is the registry.** `/api/models` serves provider
  metadata directly, so the UI can never offer a model that can't dispatch.
  The `video_models` DB table is an admin/audit copy.
- **Mock mode is a first-class provider**, not a hack: it implements the same
  interface, honors the same timeline semantics, and renders a real MP4 via
  ffmpeg so the UI exercises the genuine completed path. `MOCK_VIDEO_MODE=true`
  registers only the mock provider; `false` + `RUNWAY_API_KEY` registers Runway.
- **Expiring provider outputs are persisted.** Runway's output URLs die in
  24–48h, so on completion the service downloads the video into our own
  `StorageProvider` (and extracts a thumbnail) before marking the generation
  complete. No cloud storage is forced into the request path.
- **Cost safety by construction.** Generation creation is never auto-retried
  (each POST spends credits); only the safe GET status poll repeats, throttled
  to ≥5s per task per Runway's guidance.
- **Credits are ledger-based.** Balance is derived, never stored — no drift.
- **Sheets/Canva/Stripe are seams, not dependencies.** Each is an interface
  with a disabled default; the app is fully functional without them.
- **Multi-scene + image-to-video are modeled, not bolted on.** `scenes` table,
  `reference_image_url` column, `supportsImageToVideo` capability, and the
  upload endpoint already exist; the UI editor is the remaining work.

## Deployment notes

- **Local / VPS:** `npm run build && npm start`. Needs ffmpeg for mock mode and
  a writable disk for SQLite + media. `public/` must exist at server startup
  (a `.gitkeep` is committed) — Next.js resolves the static dir on boot.
- **Vercel/serverless:** real providers + Postgres (swap `src/lib/db/client.ts`
  for a pool; repositories isolate the SQL). Mock video rendering needs a
  writable volume, so prefer real providers there.

## Security checklist (MVP)

- All secrets in env; none bundled to the client.
- Every repository query scoped by `userId`; media URLs ownership-checked.
- Prompt/upload/API-input validation; image type + size limits.
- Rate limits on generation creation and uploads.
- Auth is the deliberate MVP gap: single demo user today, Auth.js session
  lookup drops into `getSessionUser()` with no other changes.
