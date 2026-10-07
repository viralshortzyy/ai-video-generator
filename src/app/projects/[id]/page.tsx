"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Generation, Project, User } from "@/lib/types";
import { api } from "@/lib/client/api";
import { Header } from "@/components/Header";
import { GenerationCard } from "@/components/GenerationCard";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [me, data] = await Promise.all([api.me(), api.getProject(id)]);
        setUser(me.user);
        setBalance(me.balance);
        setProject(data.project);
        setGenerations(data.generations);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load project.");
      }
    })();
  }, [id]);

  async function remove() {
    if (!confirm(`Delete project "${project?.name}"? Its generations will be kept, unassigned.`)) return;
    try {
      await api.deleteProject(id);
      router.push("/projects");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  return (
    <div className="min-h-screen">
      <Header balance={balance} userName={user?.name ?? "Creator"} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <button onClick={() => router.push("/projects")} className="mb-4 text-sm text-forge-mute hover:text-forge-cream">
          ← All projects
        </button>
        {error && <p className="mb-4 text-sm text-red-300">{error}</p>}
        {!project && !error ? (
          <p className="animate-pulse text-forge-mute">Loading…</p>
        ) : project ? (
          <>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h1 className="font-display text-2xl font-bold text-forge-cream">{project.name}</h1>
                {project.description && <p className="mt-1 text-sm text-forge-mute">{project.description}</p>}
              </div>
              <button
                onClick={remove}
                className="rounded-lg border border-forge-line px-3 py-1.5 text-sm text-forge-mute transition hover:border-red-500/50 hover:text-red-400"
              >
                Delete project
              </button>
            </div>
            {generations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-forge-line p-12 text-center">
                <p className="text-forge-mute">No generations in this project yet. Create one from the Studio and assign it here.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {generations.map((g) => (
                  <GenerationCard key={g.id} generation={g} />
                ))}
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
