"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Generation } from "@/lib/types";
import { api, formatDate } from "@/lib/client/api";
import { Header } from "@/components/Header";
import { GenerationProgress } from "@/components/GenerationProgress";

const TERMINAL = ["completed", "failed", "cancelled"];

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-forge-line bg-forge-panel p-3.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-forge-mute">{label}</p>
      <p className="mt-1 text-sm font-medium text-forge-cream">{value}</p>
    </div>
  );
}

export default function ResultPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [gen, setGen] = useState<Generation | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ generation }, me] = await Promise.all([api.getGeneration(id), api.me()]);
      setGen(generation);
      setBalance(me.balance);
      return generation;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
      return null;
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const g = await load();
      if (!g || cancelled) return;
      if (!TERMINAL.includes(g.status)) {
        pollRef.current = setInterval(async () => {
          const latest = await load();
          if (!latest || TERMINAL.includes(latest.status)) {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }, 2500);
      }
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  async function regenerate() {
    if (!gen || busy) return;
    setBusy(true);
    try {
      const { generation, balance: b } = await api.createGeneration({
        prompt: gen.originalPrompt,
        modelId: gen.modelId,
        durationSec: gen.durationSec,
        aspectRatio: gen.aspectRatio,
        quality: gen.quality,
        negativePrompt: gen.negativePrompt ?? undefined,
        projectId: gen.projectId ?? undefined,
        referenceImageUrl: gen.referenceImageUrl ?? undefined,
      });
      setBalance(b);
      router.push(`/g/${generation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regeneration failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSave() {
    if (!gen) return;
    try {
      const { generation } = await api.updateGeneration(gen.id, { saved: !gen.saved });
      setGen(generation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    }
  }

  async function remove() {
    if (!gen || !confirm("Delete this generation permanently?")) return;
    try {
      await api.deleteGeneration(gen.id);
      router.push("/history");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  async function copyPrompt() {
    if (!gen) return;
    try {
      await navigator.clipboard.writeText(gen.originalPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  if (error && !gen) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-300">{error}</p>
      </div>
    );
  }
  if (!gen) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-forge-mute">Loading…</p>
      </div>
    );
  }

  const active = !TERMINAL.includes(gen.status);
  let structured: any = null;
  try {
    structured = JSON.parse(gen.structuredPromptJson);
  } catch { /* ignore */ }

  return (
    <div className="min-h-screen">
      <Header balance={balance} userName="Creator" />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <button onClick={() => router.back()} className="mb-4 text-sm text-forge-mute hover:text-forge-cream">
          ← Back
        </button>

        {error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="animate-fade-up">
            {gen.status === "completed" && gen.videoUrl ? (
              <div className="overflow-hidden rounded-2xl border border-forge-line bg-black">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video key={gen.videoUrl} src={gen.videoUrl} poster={gen.thumbnailUrl ?? undefined} controls playsInline className="max-h-[70vh] w-full" />
              </div>
            ) : (
              <GenerationProgress
                stage={gen.stage}
                progressPercent={gen.progressPercent}
                status={gen.status}
                onCancel={active ? async () => { const { generation } = await api.cancelGeneration(gen.id); setGen(generation); } : undefined}
              />
            )}
            {gen.status === "failed" && gen.error && (
              <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{gen.error}</p>
            )}

            <div className="mt-4 rounded-2xl border border-forge-line bg-forge-panel p-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-forge-mute">Original prompt</p>
              <p className="text-[15px] leading-relaxed text-forge-cream">{gen.originalPrompt}</p>
            </div>

            {structured && (
              <div className="mt-4 rounded-2xl border border-forge-line bg-forge-panel p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-forge-mute">Directed shot plan</p>
                <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
                  {[
                    ["Subject", structured.subject],
                    ["Environment", structured.environment],
                    ["Action", structured.action],
                    ["Camera", `${structured.camera?.angle} · ${structured.camera?.movement} · ${structured.camera?.lens}`],
                    ["Lighting", structured.lighting],
                    ["Style", structured.style],
                    ["Mood", structured.mood],
                    ["Color", structured.colorTreatment],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-forge-mute">{k}</dt>
                      <dd className="mt-0.5 text-forge-cream">{String(v ?? "—")}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          <aside className="animate-fade-up space-y-3 lg:sticky lg:top-24 lg:self-start">
            <div className="grid grid-cols-2 gap-2.5">
              <Detail label="Status" value={gen.status} />
              <Detail label="Model" value={gen.modelId} />
              <Detail label="Duration" value={`${gen.durationSec}s`} />
              <Detail label="Aspect" value={gen.aspectRatio} />
              <Detail label="Quality" value={gen.quality} />
              <Detail label="Credits" value={`${gen.creditsUsed}`} />
            </div>
            <Detail label="Created" value={formatDate(gen.createdAt)} />

            {gen.status === "completed" && (
              <div className="space-y-2 pt-1">
                <a
                  href={gen.videoUrl!}
                  download
                  className="block rounded-xl bg-gradient-to-r from-forge-amber to-forge-ember px-4 py-3 text-center font-display font-bold text-forge-bg transition hover:shadow-glow"
                >
                  ⬇ Download video
                </a>
                <button
                  onClick={regenerate}
                  disabled={busy}
                  className="w-full rounded-xl border border-forge-line bg-forge-panel2 px-4 py-2.5 text-sm font-semibold text-forge-cream transition hover:border-forge-amber/50 disabled:opacity-40"
                >
                  {busy ? "Forging…" : "↻ Regenerate"}
                </button>
                <button
                  onClick={() => router.push(`/?prompt=${encodeURIComponent(gen.originalPrompt)}`)}
                  className="w-full rounded-xl border border-forge-line bg-forge-panel2 px-4 py-2.5 text-sm font-semibold text-forge-cream transition hover:border-forge-amber/50"
                >
                  ✦ Create variation
                </button>
                <button
                  onClick={copyPrompt}
                  className="w-full rounded-xl border border-forge-line bg-forge-panel2 px-4 py-2.5 text-sm font-semibold text-forge-cream transition hover:border-forge-amber/50"
                >
                  {copied ? "✓ Copied!" : "⧉ Copy prompt"}
                </button>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={toggleSave}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                  gen.saved
                    ? "border-forge-amber/60 bg-forge-amber/10 text-forge-amber"
                    : "border-forge-line bg-forge-panel2 text-forge-cream hover:border-forge-amber/50"
                }`}
              >
                {gen.saved ? "★ Saved" : "☆ Save"}
              </button>
              <button
                onClick={remove}
                className="rounded-xl border border-forge-line bg-forge-panel2 px-4 py-2.5 text-sm font-semibold text-forge-mute transition hover:border-red-500/50 hover:text-red-400"
              >
                Delete
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
