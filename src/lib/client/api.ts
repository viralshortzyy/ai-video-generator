// ── Client-side API helpers ───────────────────────────────────────────────
// Thin typed wrappers over the /api routes. Server-only modules are never
// imported here — only types (erased at build).

import type { Generation, Project, User, VideoModel } from "@/lib/types";
import type { ModelCapability } from "@/lib/providers/types";
import type { Plan } from "@/lib/billing/stripe";

export interface ModelInfo extends VideoModel {
  capabilities: ModelCapability;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    const details = json.details ? `: ${(json.details as string[]).join(" ")}` : "";
    throw new Error(`${json.error ?? `Request failed (${res.status})`}${details}`);
  }
  return json.data as T;
}

export interface CreateGenerationInput {
  prompt: string;
  modelId: string;
  durationSec: number;
  aspectRatio: string;
  quality: string;
  negativePrompt?: string;
  projectId?: string;
  referenceImageUrl?: string;
}

export const api = {
  me: () => request<{ user: User; balance: number; plan: Plan }>("/api/me"),
  models: () => request<{ models: ModelInfo[] }>("/api/models"),

  createGeneration: (input: CreateGenerationInput) =>
    request<{ generation: Generation; balance: number }>("/api/generations", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listGenerations: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return request<{ items: Generation[]; total: number; balance: number }>(
      `/api/generations${q ? `?${q}` : ""}`
    );
  },
  getGeneration: (id: string) => request<{ generation: Generation }>(`/api/generations/${id}`),
  updateGeneration: (id: string, patch: { saved?: boolean; projectId?: string | null }) =>
    request<{ generation: Generation }>(`/api/generations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  cancelGeneration: (id: string) =>
    request<{ generation: Generation; balance: number }>(`/api/generations/${id}/cancel`, {
      method: "POST",
    }),
  deleteGeneration: (id: string) =>
    request<{ deleted: boolean }>(`/api/generations/${id}`, { method: "DELETE" }),

  listProjects: () => request<{ projects: Project[] }>("/api/projects"),
  createProject: (name: string, description?: string) =>
    request<{ project: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    }),
  getProject: (id: string) =>
    request<{ project: Project; generations: Generation[] }>(`/api/projects/${id}`),
  deleteProject: (id: string) =>
    request<{ deleted: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),

  uploadReferenceImage: async (file: File): Promise<{ url: string; key: string }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) throw new Error(json.error ?? "Upload failed.");
    return json.data;
  },
};

/** Client-side mirror of the server credit-cost matrix (for previews only). */
export function previewCost(durationSec: number, quality: string): number {
  const perSec = quality === "high" ? 6 : quality === "standard" ? 3 : 1;
  return durationSec * perSec;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
