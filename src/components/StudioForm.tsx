"use client";

import { useMemo, useState } from "react";
import type { AspectRatio, Generation, Project, VideoQuality } from "@/lib/types";
import { api, previewCost, type ModelInfo } from "@/lib/client/api";

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-forge-mute">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              o.value === value
                ? "border-forge-amber/60 bg-forge-amber/10 text-forge-amber"
                : "border-forge-line bg-forge-panel2 text-forge-mute hover:text-forge-cream"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StudioForm({
  models,
  projects,
  initialPrompt,
  onCreated,
  onBalanceChange,
}: {
  models: ModelInfo[];
  projects: Project[];
  initialPrompt: string;
  onCreated: (g: Generation) => void;
  onBalanceChange: (b: number) => void;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [durationSec, setDurationSec] = useState(8);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [quality, setQuality] = useState<VideoQuality>("standard");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [showNegative, setShowNegative] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [refImage, setRefImage] = useState<{ url: string; key: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const model = useMemo(() => models.find((m) => m.id === modelId), [models, modelId]);
  const caps = model?.capabilities;
  const cost = previewCost(durationSec, quality);

  // Keep selections valid when the model changes.
  function applyModel(id: string) {
    setModelId(id);
    const m = models.find((x) => x.id === id);
    const c = m?.capabilities;
    if (c) {
      if (!c.durations.includes(durationSec)) setDurationSec(c.durations[0]);
      if (!c.aspectRatios.includes(aspectRatio)) setAspectRatio(c.aspectRatios[0]);
      if (!c.qualities.includes(quality)) setQuality(c.qualities[0]);
    }
  }

  // Keep duration valid when the model changes.
  const durations = (caps?.durations ?? [2, 4, 6, 8, 10]).map((d) => ({ value: d, label: `${d}s` }));
  const aspects = (caps?.aspectRatios ?? (["16:9", "9:16", "1:1"] as AspectRatio[])).map((a) => ({ value: a, label: a }));
  const qualities = (caps?.qualities ?? (["draft", "standard", "high"] as VideoQuality[])).map((q) => ({ value: q, label: q[0].toUpperCase() + q.slice(1) }));

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const saved = await api.uploadReferenceImage(file);
      setRefImage(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || prompt.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const { generation, balance } = await api.createGeneration({
        prompt: prompt.trim(),
        modelId,
        durationSec,
        aspectRatio,
        quality,
        negativePrompt: negativePrompt.trim() || undefined,
        projectId: projectId || undefined,
        referenceImageUrl: refImage?.url,
      });
      onBalanceChange(balance);
      onCreated(generation);
      setPrompt("");
      setRefImage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-forge-line bg-forge-panel p-5 sm:p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-forge-cream">New generation</h2>
        {model?.isMock && (
          <span className="rounded-full border border-forge-amber/40 bg-forge-amber/10 px-2.5 py-1 text-[11px] font-medium text-forge-amber">
            Mock mode · free testing
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-forge-mute">Describe the shot. FrameForge directs the rest.</p>

      {models.length === 0 && (
        <p className="mb-4 rounded-lg border border-forge-amber/30 bg-forge-amber/10 px-3 py-2 text-sm text-forge-amber">
          No video models are available. In mock mode this never happens — if you turned off
          MOCK_VIDEO_MODE, configure a provider API key (e.g. RUNWAY_API_KEY) and restart.
        </p>
      )}

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        placeholder="Create a cinematic aerial shot of a futuristic city at night, heavy rain, neon reflections, realistic camera movement, dramatic lighting."
        className="w-full resize-y rounded-xl border border-forge-line bg-forge-bg p-4 text-[15px] leading-relaxed text-forge-cream placeholder:text-forge-mute/60 focus:border-forge-amber/60 focus:outline-none focus:ring-1 focus:ring-forge-amber/40"
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-forge-mute">Model</p>
          <select
            value={modelId}
            onChange={(e) => applyModel(e.target.value)}
            className="w-full rounded-lg border border-forge-line bg-forge-panel2 px-3 py-2 text-sm text-forge-cream focus:border-forge-amber/60 focus:outline-none"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
          {model?.description && <p className="mt-1 text-xs text-forge-mute">{model.description}</p>}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-forge-mute">Project <span className="normal-case text-forge-mute/60">(optional)</span></p>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-lg border border-forge-line bg-forge-panel2 px-3 py-2 text-sm text-forge-cream focus:border-forge-amber/60 focus:outline-none"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Segmented label="Duration" options={durations} value={durationSec} onChange={setDurationSec} />
        <Segmented label="Aspect ratio" options={aspects} value={aspectRatio} onChange={setAspectRatio} />
        <Segmented label="Quality" options={qualities} value={quality} onChange={setQuality} />
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowNegative((v) => !v)}
          className="text-sm font-medium text-forge-mute transition hover:text-forge-amber"
        >
          {showNegative ? "−" : "+"} Negative prompt <span className="text-forge-mute/60">(optional)</span>
        </button>
        {showNegative && (
          <input
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="blurry, watermark, distorted faces…"
            className="mt-2 w-full rounded-lg border border-forge-line bg-forge-bg px-3 py-2 text-sm text-forge-cream placeholder:text-forge-mute/60 focus:border-forge-amber/60 focus:outline-none"
          />
        )}
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-forge-mute">
          Reference image <span className="normal-case text-forge-mute/60">(optional · image-to-video ready)</span>
        </p>
        {refImage ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={refImage.url} alt="Reference" className="h-16 w-16 rounded-lg border border-forge-line object-cover" />
            <button type="button" onClick={() => setRefImage(null)} className="text-sm text-forge-mute hover:text-red-400">
              Remove
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-forge-mute transition hover:text-forge-cream">
            <span className="rounded-lg border border-dashed border-forge-line px-3 py-2">
              {uploading ? "Uploading…" : "＋ Upload image (PNG/JPG/WebP, ≤10MB)"}
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleImage} disabled={uploading} />
          </label>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      <div className="mt-5 flex items-center gap-4">
        <button
          type="submit"
          disabled={busy || prompt.trim().length < 3}
          className="flex-1 rounded-xl bg-gradient-to-r from-forge-amber to-forge-ember px-6 py-3.5 font-display text-base font-bold text-forge-bg transition enabled:hover:shadow-glow enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Sending to forge…" : "⚒ Generate video"}
        </button>
        <div className="text-right text-xs text-forge-mute">
          <p className="font-semibold text-forge-cream">{cost} credits</p>
          <p>this generation</p>
        </div>
      </div>
    </form>
  );
}
