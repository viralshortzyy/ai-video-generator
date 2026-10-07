# Free ($0) video generation with FrameForge

FrameForge is **free-first**: it must be usable for development and testing
without Runway credits, paid APIs, or paid cloud infrastructure. This guide
explains the free paths and their honest limits.

## Modes

| `VIDEO_PROVIDER` | What it does | Cost | Honesty |
|---|---|---|---|
| `mock` (default) | Procedural demo renderer (ffmpeg) | $0 | Clearly labeled "Demo — simulated, not AI-generated" in the UI |
| `free` | Real AI video via a free backend | $0 | Fails with a clear setup message if no backend can serve — never faked, never paid |
| `runway` | Runway API (gen4.5) | Paid | Only when you explicitly choose it AND configure `RUNWAY_API_KEY` |

The app **never silently calls a paid provider**. Claude is likewise optional:
`PROMPT_ENGINE=local` (default without a key) uses on-device heuristics;
Claude is only used when `ANTHROPIC_API_KEY` is explicitly set.

## Free backend options (`FREE_BACKEND`)

### Option A — your own Gradio Space (recommended)

Host Wan 2.1 (or another open video model) on Hugging Face:

1. Create a free Hugging Face account (verified email, 30+ days old).
2. Create a **Gradio** Space with **ZeroGPU** hardware — free accounts can
   host up to 2 ZeroGPU Spaces (NVIDIA RTX Pro 6000, shared pool).
3. Deploy a text-to-video app exposing `predict(prompt, duration, ratio)`
   that returns a video file. Community Wan 2.1 Gradio demos are a good
   starting template — fork one rather than building from scratch.
4. Set `FREE_GRADIO_URL=https://<your-space>.hf.space` and
   `VIDEO_PROVIDER=free`, restart FrameForge.

**Honest limits you should know:**
- ZeroGPU quota is per *caller*: ~5 min/day for free accounts, ~2 min/day
  unauthenticated. A Wan2.1-1.3B video takes ~4 min on a 4090-class GPU —
  expect queues and daily quota exhaustion. This is a *validation* path,
  not a production backend.
- Spaces sleep when idle; the first call wakes them (slow).
- Pointing FrameForge at someone else's public demo Space works but is
  fragile and consumes their shared quota — host your own for real testing.

### Option B — local GPU (`FREE_BACKEND=local`)

On a machine with an NVIDIA GPU:

1. Install a Wan 2.1 runner (e.g. the official Wan2.1 inference code or a
   diffusers-based script). Requirements: **~8GB VRAM for T2V-1.3B**,
   **~24GB VRAM for T2V-14B**, plus ~20GB disk for weights.
2. Set `WAN_RUNNER_SCRIPT=/path/to/your/runner.py`.

**Runner contract** (what FrameForge will eventually invoke):
- Input: JSON on stdin — `{prompt, duration_sec, width, height, output_path}`
- Output: writes an MP4 to `output_path`, exits 0 on success.

The backend probes `nvidia-smi` at startup and stays honestly unavailable
without a GPU — it will never attempt a multi-GB download on a GPU-less
server.

### Option C — mock (default)

`VIDEO_PROVIDER=mock` renders procedural demo videos locally with ffmpeg.
It exercises the entire pipeline (prompt → stages → MP4 → history) for $0.
The UI labels every mock output as simulated — mock output is never
presented as AI generation.

## Verifying zero-cost operation

1. Set `VIDEO_PROVIDER=free` with no `FREE_GRADIO_URL`.
2. Open the Studio: you should see the notice
   *"Free AI video generation is currently unavailable… / No free inference
   backend is configured…"* and no models offered.
3. Attempting a generation returns a clear error. Check your Runway
   dashboard: **zero API calls, zero spend**. That is the guarantee.
