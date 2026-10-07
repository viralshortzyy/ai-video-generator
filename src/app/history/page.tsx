"use client";

import { useEffect, useState } from "react";
import type { Generation, User } from "@/lib/types";
import { api } from "@/lib/client/api";
import { Header } from "@/components/Header";
import { GenerationCard } from "@/components/GenerationCard";

export default function HistoryPage() {
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [items, setItems] = useState<Generation[]>([]);
  const [total, setTotal] = useState(0);
  const [savedOnly, setSavedOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [me, gens] = await Promise.all([
          api.me(),
          api.listGenerations({ limit: "48", ...(savedOnly ? { saved: "1" } : {}) }),
        ]);
        setUser(me.user);
        setBalance(me.balance);
        setItems(gens.items);
        setTotal(gens.total);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [savedOnly]);

  return (
    <div className="min-h-screen">
      <Header balance={balance} userName={user?.name ?? "Creator"} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-forge-cream">Generation history</h1>
            <p className="mt-1 text-sm text-forge-mute">{total} generation{total === 1 ? "" : "s"} total</p>
          </div>
          <div className="flex gap-1.5">
            {[
              { v: false, label: "All" },
              { v: true, label: "★ Saved" },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => setSavedOnly(o.v)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  savedOnly === o.v
                    ? "border-forge-amber/60 bg-forge-amber/10 text-forge-amber"
                    : "border-forge-line bg-forge-panel text-forge-mute hover:text-forge-cream"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="animate-pulse text-forge-mute">Loading history…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-forge-line p-12 text-center">
            <p className="text-forge-mute">
              {savedOnly ? "No saved generations yet — tap ☆ Save on any result." : "No generations yet. Head to the Studio to forge your first video."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((g) => (
              <GenerationCard key={g.id} generation={g} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
