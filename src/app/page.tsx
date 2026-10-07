"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Generation, Project, User } from "@/lib/types";
import { api, type ModelInfo } from "@/lib/client/api";
import { Header } from "@/components/Header";
import { StudioForm } from "@/components/StudioForm";
import { GenerationProgress } from "@/components/GenerationProgress";
import { GenerationCard } from "@/components/GenerationCard";

const TERMINAL = ["completed", "failed", "cancelled"];

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-forge-bg"><p className="animate-pulse text-forge-mute">Heating up the forge…</p></div>}>
      <StudioPageInner />
    </Suspense>
  );
}

function StudioPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Generation | null>(null);
  const [recent, setRecent] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const initialPrompt = searchParams.get("prompt") ?? "";

  useEffect(() => {
    (async () => {
      try {
        const [me, ms, ps, gens] = await Promise.all([
          api.me(),
          api.models(),
          api.listProjects(),
          api.listGenerations({ limit: "8" }),
        ]);
        setUser(me.user);
        setBalance(me.balance);
        setModels(ms.models);
        setProjects(ps.projects);
        setRecent(gens.items);
        const running = gens.items.find((g) => !TERMINAL.includes(g.status));
        if (running) setActive(running);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollActive = useCallback(
    (id: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const { generation } = await api.getGeneration(id);
          setActive(generation);
          setRecent((rs) => rs.map((r) => (r.id === id ? generation : r)));
          if (TERMINAL.includes(generation.status)) stopPolling();
        } catch {
          stopPolling();
        }
      }, 2000);
    },
    []
  );

  useEffect(() => {
    if (active && !TERMINAL.includes(active.status)) pollActive(active.id);
    return stopPolling;
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreated = (g: Generation) => {
    setActive(g);
    setRecent((rs) => [g, ...rs].slice(0, 8));
  };

  const handleCancel = async () => {
    if (!active) return;
    try {
      const { generation, balance: b } = await api.cancelGeneration(active.id);
      setActive(generation);
      setBalance(b);
      stopPolling();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-forge-bg">
        <p className="animate-pulse text-forge-mute">Heating up the forge…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header balance={balance} userName={user?.name ?? "Creator"} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="animate-fade-up">
            <StudioForm
              models={models}
              projects={projects}
              initialPrompt={initialPrompt}
              onCreated={handleCreated}
              onBalanceChange={setBalance}
            />

            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-forge-cream">Recent generations</h2>
                <button
                  onClick={() => router.push("/history")}
                  className="text-sm font-medium text-forge-amber hover:underline"
                >
                  View all →
                </button>
              </div>
              {recent.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-forge-line p-10 text-center">
                  <p className="text-forge-mute">Nothing forged yet. Your first video is one prompt away.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {recent.map((g) => (
                    <GenerationCard key={g.id} generation={g} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="animate-fade-up lg:sticky lg:top-24 lg:self-start">
            {active ? (
              <div className="space-y-4">
                <GenerationProgress
                  stage={active.stage}
                  progressPercent={active.progressPercent}
                  status={active.status}
                  onCancel={TERMINAL.includes(active.status) ? undefined : handleCancel}
                />
                {active.status === "completed" && active.videoUrl && (
                  <button
                    onClick={() => router.push(`/g/${active.id}`)}
                    className="w-full rounded-xl bg-gradient-to-r from-forge-amber to-forge-ember px-4 py-3 font-display font-bold text-forge-bg transition hover:shadow-glow"
                  >
                    View result →
                  </button>
                )}
                {active.status === "failed" && active.error && (
                  <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                    {active.error}
                  </p>
                )}
                <div className="rounded-2xl border border-forge-line bg-forge-panel p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-forge-mute">Prompt</p>
                  <p className="line-clamp-2 text-sm text-forge-cream">{active.originalPrompt}</p>
                  <p className="mt-2 text-xs text-forge-mute">
                    {active.durationSec}s · {active.aspectRatio} · {active.quality}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-forge-line p-8 text-center">
                <p className="text-sm text-forge-mute">
                  Your generation progress will appear here — watch each stage complete in real time.
                </p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
