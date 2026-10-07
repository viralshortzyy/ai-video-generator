"use client";

import type { GenerationStatus } from "@/lib/types";

const STEPS = [
  "Analyzing prompt",
  "Preparing video instructions",
  "Sending to video model",
  "Generating video",
  "Finalizing video",
];

/** Which step is currently active, derived from the provider stage label. */
function activeIndex(stage: string | null, status: GenerationStatus): number {
  if (status === "completed") return STEPS.length;
  if (status === "failed" || status === "cancelled") return -2;
  if (!stage) return -1;
  const s = stage.toLowerCase();
  if (s.includes("analyz")) return 0;
  if (s.includes("prepar")) return 1;
  if (s.includes("sending")) return 2;
  if (s.includes("generat")) return 3;
  if (s.includes("final")) return 4;
  if (s.includes("queued")) return -1;
  return 2;
}

export function GenerationProgress({
  stage,
  progressPercent,
  status,
  onCancel,
}: {
  stage: string | null;
  progressPercent: number;
  status: GenerationStatus;
  onCancel?: () => void;
}) {
  const active = activeIndex(stage, status);
  const failed = status === "failed";
  const cancelled = status === "cancelled";

  return (
    <div className="rounded-2xl border border-forge-line bg-forge-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-forge-cream">
          {failed ? "Generation failed" : cancelled ? "Generation cancelled" : "Forging your video"}
        </h3>
        {!failed && !cancelled && status !== "completed" && onCancel && (
          <button
            onClick={onCancel}
            className="rounded-lg border border-forge-line px-3 py-1.5 text-xs font-medium text-forge-mute transition hover:border-red-500/50 hover:text-red-400"
          >
            Cancel
          </button>
        )}
      </div>

      <ul className="space-y-2.5">
        {STEPS.map((label, i) => {
          const done = active === STEPS.length || i < active;
          const isActive = i === active;
          return (
            <li key={label} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                  done
                    ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400"
                    : isActive
                      ? "border-forge-amber/60 bg-forge-amber/10 text-forge-amber"
                      : "border-forge-line text-forge-mute"
                }`}
              >
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6.5 5 9l4.5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : isActive ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-forge-amber" />
                ) : (
                  <span className="text-[10px]">{i + 1}</span>
                )}
              </span>
              <span className={done ? "text-forge-cream" : isActive ? "text-forge-cream" : "text-forge-mute"}>
                {label}
                {done && <span className="ml-1.5 text-emerald-400">✓</span>}
                {isActive && <span className="ml-1.5 text-forge-amber">…</span>}
              </span>
            </li>
          );
        })}
      </ul>

      {!failed && !cancelled && (
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-forge-panel2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-forge-amber to-forge-ember transition-all duration-700"
              style={{ width: `${Math.min(100, Math.max(2, progressPercent))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-forge-mute">
            {stage ?? "Queued"} · {progressPercent}%
          </p>
        </div>
      )}
    </div>
  );
}
