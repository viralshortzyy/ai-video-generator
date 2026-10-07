# FrameForge — AI Video Studio

**Describe the shot. FrameForge directs the rest.**

FrameForge is an original AI video-generation web application. You write a natural-language prompt, an AI prompt engine (Claude, or a zero-cost local engine) expands it into a structured cinematic shot plan, and a video-provider abstraction renders the video asynchronously while you watch each stage complete.

This is an independent, original product. It is not affiliated with, endorsed by, or a copy of Seedance, Hailuo, Kling, Runway, or any other video-generation company — no branding, UI, code, or proprietary technology was taken from them.

---

## Quick start

```bash
npm install
cp .env.example .env   # optional — sane mock defaults work out of the box
npm run dev            # http://localhost:3000
```

Out of the box the app runs in **mock mode**: no API keys, no spend, fully testable end-to-end. The mock provider renders a real playable MP4 with ffmpeg so you can exercise the entire pipeline (prompt → stages → player → download → history).

**Requirements:** Node.js ≥ 22.6 (uses the built-in `node:sqlite`), ffmpeg on PATH (mock video rendering only).

## The pipeline

```
Prompt → Prompt Engine (Claude / mock) → Structured shot plan
       → Video Provider (mock / real) → queued → processing → completed
       → Player · Download · Regenerate · Variation · Save · History
```

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind. Pages: Studio `/`, result `/g/[id]`, history `/history`, projects `/projects`.
- **Prompt engine:** `src/lib/prompt/` — `PromptEngine` interface; `ClaudePromptEngine` (real, via Anthropic SDK) and `MockPromptEngine` (free, keyword-based). Selected by `MOCK_CLAUDE` / `ANTHROPIC_API_KEY`.
- **Video providers:** `src/lib/providers/` — `VideoProvider` interface (`createGeneration`, `getGenerationStatus`, `cancelGeneration`). `MockVideoProvider` simulates the async lifecycle and renders sample MP4s. Real providers plug in as new classes + one registry line.
- **Database:** SQLite (zero-dependency `node:sqlite`), auto-migrated on boot from `src/lib/db/schema.sql`. Tables: `users`, `projects`, `generations`, `scenes`, `video_models`, `assets`, `credits_ledger`, `subscriptions`, `generation_events`. Every query is scoped by `userId`.
- **Credits:** duration × quality matrix, ledger-audited, auto-refund on failure/cancel. Stripe is prepared (`src/lib/billing/stripe.ts`) but not required.
- **Storage:** `StorageProvider` abstraction; local disk in the MVP, Google Drive / Dropbox / Box adapters later.

## Key environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MOCK_VIDEO_MODE` | `true` | Simulate video generation locally (no paid APIs) |
| `MOCK_CLAUDE` | `true` | Use the free local prompt structurer instead of the Claude API |
| `ANTHROPIC_API_KEY` | — | Enables real Claude prompt enhancement when `MOCK_CLAUDE=false` |
| `CLAUDE_MODEL` | `claude-sonnet-4-5` | Claude model for prompt structuring |
| `DATABASE_PATH` | `./data/frameforge.db` | SQLite file |
| `STORAGE_DIR` | `./data/media` | Uploaded media |
| `NEW_USER_CREDITS` | `600` | Starting credit grant |

See `.env.example` for the full list, including future Stripe / Sheets keys.

## API

| Method | Route | Purpose |
|---|---|---|
| `GET/POST` | `/api/generations` | List / create generations |
| `GET/PATCH/DELETE` | `/api/generations/[id]` | Status (auto-syncs) / save / delete |
| `POST` | `/api/generations/[id]/cancel` | Cancel + refund |
| `GET/POST` | `/api/projects` | List / create projects |
| `GET/PATCH/DELETE` | `/api/projects/[id]` | Project detail (with generations) |
| `GET` | `/api/models` | Available video models + capabilities |
| `GET` | `/api/me` | User + credit balance |
| `POST` | `/api/uploads` | Reference-image upload (image-to-video ready) |
| `GET` | `/api/media/[...key]` | Ownership-checked media serving |

## Roadmap

MVP (this repo) covers: prompt → structured plan → mock/real provider → live stages → result → history → projects → credits. Prepared next: real video providers, Auth.js, Stripe billing, Google Sheets admin logging, cloud storage adapters, image-to-video UI, multi-scene generation (schema + types already in place).

See `docs/ARCHITECTURE.md` for the full technical design.
