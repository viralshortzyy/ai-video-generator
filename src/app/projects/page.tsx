"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, User } from "@/lib/types";
import { api } from "@/lib/client/api";
import { Header } from "@/components/Header";

export default function ProjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [me, ps] = await Promise.all([api.me(), api.listProjects()]);
      setUser(me.user);
      setBalance(me.balance);
      setProjects(ps.projects);
    })();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { project } = await api.createProject(name.trim(), description.trim() || undefined);
      setProjects((ps) => [project, ...ps]);
      setName("");
      setDescription("");
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Header balance={balance} userName={user?.name ?? "Creator"} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-forge-cream">Projects</h1>
            <p className="mt-1 text-sm text-forge-mute">Group generations into productions — multi-scene stories build on these.</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-xl bg-gradient-to-r from-forge-amber to-forge-ember px-4 py-2.5 text-sm font-bold text-forge-bg transition hover:shadow-glow"
          >
            ＋ New project
          </button>
        </div>

        {showForm && (
          <form onSubmit={create} className="mb-6 animate-fade-up rounded-2xl border border-forge-line bg-forge-panel p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name — e.g. YouTube Advertisement"
                className="rounded-lg border border-forge-line bg-forge-bg px-3 py-2.5 text-sm text-forge-cream placeholder:text-forge-mute/60 focus:border-forge-amber/60 focus:outline-none"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="rounded-lg border border-forge-line bg-forge-bg px-3 py-2.5 text-sm text-forge-cream placeholder:text-forge-mute/60 focus:border-forge-amber/60 focus:outline-none"
              />
            </div>
            {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button type="submit" disabled={busy || !name.trim()} className="rounded-lg bg-forge-amber px-4 py-2 text-sm font-bold text-forge-bg disabled:opacity-40">
                {busy ? "Creating…" : "Create project"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-forge-line px-4 py-2 text-sm text-forge-mute hover:text-forge-cream">
                Cancel
              </button>
            </div>
          </form>
        )}

        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-forge-line p-12 text-center">
            <p className="text-forge-mute">No projects yet. Create one to organize your generations — e.g. “Product Videos”, “Short Film”.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}`)}
                className="rounded-2xl border border-forge-line bg-forge-panel p-5 text-left transition hover:border-forge-amber/40 hover:shadow-glow"
              >
                <h3 className="font-display text-base font-semibold text-forge-cream">{p.name}</h3>
                {p.description && <p className="mt-1 line-clamp-2 text-sm text-forge-mute">{p.description}</p>}
                <p className="mt-3 text-xs text-forge-mute">
                  {p.generationCount ?? 0} generation{(p.generationCount ?? 0) === 1 ? "" : "s"}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
