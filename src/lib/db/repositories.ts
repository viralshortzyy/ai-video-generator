// ── Typed repositories over SQLite ──────────────────────────────────────
// Every query is scoped by userId: users can only ever touch their own rows.
// If we move to Postgres, only this file's SQL changes — callers stay the same.

import { randomUUID } from "node:crypto";
import { getDb, nowIso } from "./client";
import type {
  AspectRatio,
  Generation,
  GenerationStatus,
  Project,
  Scene,
  User,
  VideoModel,
  VideoQuality,
} from "../types";

function rowToGeneration(r: any): Generation {
  return {
    id: r.id,
    userId: r.user_id,
    projectId: r.project_id,
    originalPrompt: r.original_prompt,
    structuredPromptJson: r.structured_prompt,
    providerId: r.provider_id,
    modelId: r.model_id,
    durationSec: r.duration_sec,
    aspectRatio: r.aspect_ratio as AspectRatio,
    quality: r.quality as VideoQuality,
    negativePrompt: r.negative_prompt,
    referenceImageUrl: r.reference_image_url,
    status: r.status as GenerationStatus,
    stage: r.stage,
    progressPercent: r.progress_percent,
    providerJobId: r.provider_job_id,
    videoUrl: r.video_url,
    thumbnailUrl: r.thumbnail_url,
    error: r.error,
    creditsUsed: r.credits_used,
    saved: r.saved === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
  };
}

// ── Users ────────────────────────────────────────────────────────────────

export function getUserById(id: string): User | null {
  const r = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
  if (!r) return null;
  return { id: r.id, email: r.email, name: r.name, createdAt: r.created_at };
}

// ── Projects ─────────────────────────────────────────────────────────────

export function listProjects(userId: string): Project[] {
  const rows = getDb()
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM generations g WHERE g.project_id = p.id) AS generation_count
       FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC`
    )
    .all(userId) as any[];
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    generationCount: r.generation_count,
  }));
}

export function getProject(userId: string, id: string): Project | null {
  const r = getDb()
    .prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
    .get(id, userId) as any;
  if (!r) return null;
  return {
    id: r.id, userId: r.user_id, name: r.name, description: r.description,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function createProject(userId: string, name: string, description?: string): Project {
  const id = randomUUID();
  const now = nowIso();
  getDb()
    .prepare("INSERT INTO projects (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, userId, name, description ?? null, now, now);
  return getProject(userId, id)!;
}

export function updateProject(userId: string, id: string, patch: { name?: string; description?: string }): Project | null {
  const existing = getProject(userId, id);
  if (!existing) return null;
  getDb()
    .prepare("UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .run(patch.name ?? existing.name, patch.description ?? existing.description, nowIso(), id, userId);
  return getProject(userId, id);
}

export function deleteProject(userId: string, id: string): boolean {
  const res = getDb().prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(id, userId);
  return (res.changes as number) > 0;
}

// ── Generations ──────────────────────────────────────────────────────────

export interface CreateGenerationInput {
  userId: string;
  projectId?: string | null;
  originalPrompt: string;
  structuredPromptJson: string;
  providerId: string;
  modelId: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  quality: VideoQuality;
  negativePrompt?: string | null;
  referenceImageUrl?: string | null;
  creditsUsed: number;
}

export function createGeneration(input: CreateGenerationInput): Generation {
  const id = randomUUID();
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO generations
       (id, user_id, project_id, original_prompt, structured_prompt, provider_id, model_id,
        duration_sec, aspect_ratio, quality, negative_prompt, reference_image_url,
        status, stage, progress_percent, credits_used, saved, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'Queued', 0, ?, 0, ?, ?)`
    )
    .run(
      id, input.userId, input.projectId ?? null, input.originalPrompt,
      input.structuredPromptJson, input.providerId, input.modelId,
      input.durationSec, input.aspectRatio, input.quality,
      input.negativePrompt ?? null, input.referenceImageUrl ?? null,
      input.creditsUsed, now, now
    );
  logEvent(id, "created", `Queued on ${input.providerId}/${input.modelId}`);
  return getGeneration(input.userId, id)!;
}

export function getGeneration(userId: string, id: string): Generation | null {
  const r = getDb()
    .prepare("SELECT * FROM generations WHERE id = ? AND user_id = ?")
    .get(id, userId) as any;
  return r ? rowToGeneration(r) : null;
}

export interface ListGenerationsFilter {
  projectId?: string;
  status?: GenerationStatus;
  savedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export function listGenerations(userId: string, filter: ListGenerationsFilter = {}): { items: Generation[]; total: number } {
  const where: string[] = ["user_id = ?"];
  const params: any[] = [userId];
  if (filter.projectId) { where.push("project_id = ?"); params.push(filter.projectId); }
  if (filter.status) { where.push("status = ?"); params.push(filter.status); }
  if (filter.savedOnly) { where.push("saved = 1"); }
  const whereSql = where.join(" AND ");
  const total = (getDb().prepare(`SELECT COUNT(*) AS c FROM generations WHERE ${whereSql}`).get(...params) as any).c as number;
  const limit = Math.min(filter.limit ?? 24, 100);
  const offset = filter.offset ?? 0;
  const rows = getDb()
    .prepare(`SELECT * FROM generations WHERE ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as any[];
  return { items: rows.map(rowToGeneration), total };
}

export function updateGeneration(
  userId: string,
  id: string,
  patch: Partial<Pick<Generation, "status" | "stage" | "progressPercent" | "providerJobId" | "videoUrl" | "thumbnailUrl" | "error" | "completedAt" | "saved" | "projectId">>
): Generation | null {
  const existing = getGeneration(userId, id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  getDb()
    .prepare(
      `UPDATE generations SET status = ?, stage = ?, progress_percent = ?, provider_job_id = ?,
       video_url = ?, thumbnail_url = ?, error = ?, completed_at = ?, saved = ?, project_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(
      next.status, next.stage, next.progressPercent, next.providerJobId,
      next.videoUrl, next.thumbnailUrl, next.error, next.completedAt,
      next.saved ? 1 : 0, next.projectId, nowIso(), id, userId
    );
  return getGeneration(userId, id);
}

export function deleteGeneration(userId: string, id: string): boolean {
  const res = getDb().prepare("DELETE FROM generations WHERE id = ? AND user_id = ?").run(id, userId);
  return (res.changes as number) > 0;
}

// ── Scenes (multi-scene architecture; populated by future phases) ─────────

export function listScenes(generationId: string): Scene[] {
  const rows = getDb()
    .prepare("SELECT * FROM scenes WHERE generation_id = ? ORDER BY position ASC")
    .all(generationId) as any[];
  return rows.map((r) => ({
    id: r.id, generationId: r.generation_id, position: r.position, prompt: r.prompt,
    durationSec: r.duration_sec, camera: r.camera, style: r.style,
    transition: r.transition, status: r.status as GenerationStatus,
    videoUrl: r.video_url, createdAt: r.created_at,
  }));
}

export function createScenes(
  generationId: string,
  scenes: Array<{ prompt: string; durationSec: number; camera?: string; style?: string; transition?: string }>
): Scene[] {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO scenes (id, generation_id, position, prompt, duration_sec, camera, style, transition, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)"
  );
  const now = nowIso();
  scenes.forEach((s, i) => {
    stmt.run(randomUUID(), generationId, i, s.prompt, s.durationSec, s.camera ?? null, s.style ?? null, s.transition ?? null, now);
  });
  return listScenes(generationId);
}

// ── Video models ─────────────────────────────────────────────────────────

export function listVideoModels(): VideoModel[] {
  const rows = getDb()
    .prepare("SELECT * FROM video_models WHERE enabled = 1 ORDER BY sort_order ASC")
    .all() as any[];
  return rows.map((r) => ({
    id: r.id, providerId: r.provider_id, displayName: r.display_name,
    description: r.description, capabilitiesJson: r.capabilities,
    enabled: r.enabled === 1, isMock: r.is_mock === 1, sortOrder: r.sort_order,
  }));
}

export function getVideoModel(id: string): VideoModel | null {
  const r = getDb().prepare("SELECT * FROM video_models WHERE id = ? AND enabled = 1").get(id) as any;
  if (!r) return null;
  return {
    id: r.id, providerId: r.provider_id, displayName: r.display_name,
    description: r.description, capabilitiesJson: r.capabilities,
    enabled: r.enabled === 1, isMock: r.is_mock === 1, sortOrder: r.sort_order,
  };
}

// ── Events ───────────────────────────────────────────────────────────────

export function logEvent(generationId: string, event: string, detail?: string) {
  getDb()
    .prepare("INSERT INTO generation_events (id, generation_id, event, detail, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(randomUUID(), generationId, event, detail ?? null, nowIso());
}

export function listEvents(generationId: string): Array<{ event: string; detail: string | null; createdAt: string }> {
  const rows = getDb()
    .prepare("SELECT event, detail, created_at FROM generation_events WHERE generation_id = ? ORDER BY created_at ASC")
    .all(generationId) as any[];
  return rows.map((r) => ({ event: r.event, detail: r.detail, createdAt: r.created_at }));
}
