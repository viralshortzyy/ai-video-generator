"use client";

import { useRouter } from "next/navigation";
import type { Generation } from "@/lib/types";
import { formatDate } from "@/lib/client/api";

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  cancelled: "bg-forge-panel2 text-forge-mute border-forge-line",
  queued: "bg-forge-amber/10 text-forge-amber border-forge-amber/30",
  processing: "bg-forge-amber/10 text-forge-amber border-forge-amber/30",
  draft: "bg-forge-panel2 text-forge-mute border-forge-line",
};

export function GenerationCard({ generation }: { generation: Generation }) {
  const router = useRouter();
  const g = generation;
  const active = g.status === "queued" || g.status === "processing";

  return (
    <button
      onClick={() => router.push(`/g/${g.id}`)}
      className="group overflow-hidden rounded-2xl border border-forge-line bg-forge-panel text-left transition hover:border-forge-amber/40 hover:shadow-glow"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-forge-panel2">
        {g.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={g.thumbnailUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-forge-panel2 via-[#1a1a2e] to-[#0f3460]">
            <span className="px-4 text-center text-xs text-forge-mute">
              {active ? "Rendering…" : g.status === "failed" ? "Failed" : "No preview"}
            </span>
          </div>
        )}
        <span className={`absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[g.status]}`}>
          {g.status}
        </span>
        {g.saved && (
          <span className="absolute right-2 top-2 rounded-full border border-forge-amber/40 bg-black/50 px-2 py-0.5 text-[11px] text-forge-amber">
            ★ Saved
          </span>
        )}
        {active && (
          <span className="absolute bottom-2 left-2 right-2 h-1 overflow-hidden rounded-full bg-black/40">
            <span
              className="block h-full bg-forge-amber transition-all duration-700"
              style={{ width: `${g.progressPercent}%` }}
            />
          </span>
        )}
      </div>
      <div className="p-3.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-forge-cream">{g.originalPrompt}</p>
        <p className="mt-2 text-xs text-forge-mute">
          {g.durationSec}s · {g.aspectRatio} · {g.quality} · {formatDate(g.createdAt)}
        </p>
      </div>
    </button>
  );
}
