// ── Prompt engine contracts ─────────────────────────────────────────────
// Claude (or the mock stand-in) turns a raw user prompt into a structured
// shot plan. The video provider only ever receives this structured form,
// so swapping prompt engines never touches provider code.

import type { AspectRatio, VideoQuality } from "../types";

export interface CameraSpec {
  angle: string;
  movement: string;
  lens: string;
}

export interface StructuredPrompt {
  subject: string;
  environment: string;
  action: string;
  camera: CameraSpec;
  lighting: string;
  style: string;
  mood: string;
  motion: string;
  composition: string;
  physics: string;
  background: string;
  colorTreatment: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  quality: VideoQuality;
  negativePrompt: string;
  /** Final composed text handed to the video model. */
  directorText: string;
}

export interface StructureInput {
  prompt: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  quality: VideoQuality;
  negativePrompt?: string;
}

export interface PromptEngine {
  readonly name: string;
  structure(input: StructureInput): Promise<StructuredPrompt>;
}

/** Compose the single text block sent to the video model. */
export function composeDirectorText(sp: Omit<StructuredPrompt, "directorText">): string {
  return [
    `${sp.style} video. ${sp.subject} ${sp.action} in ${sp.environment}.`,
    `Camera: ${sp.camera.angle} angle, ${sp.camera.movement}, ${sp.camera.lens}.`,
    `Composition: ${sp.composition}. Lighting: ${sp.lighting}.`,
    `Mood: ${sp.mood}. Motion: ${sp.motion}. Physics: ${sp.physics}.`,
    `Background: ${sp.background}. Color treatment: ${sp.colorTreatment}.`,
    `Duration: ${sp.durationSec}s.`,
  ].join(" ");
}

export function emptyStructuredPrompt(input: StructureInput): Omit<StructuredPrompt, "directorText"> {
  return {
    subject: "",
    environment: "",
    action: "",
    camera: { angle: "", movement: "", lens: "" },
    lighting: "",
    style: "",
    mood: "",
    motion: "",
    composition: "",
    physics: "",
    background: "",
    colorTreatment: "",
    durationSec: input.durationSec,
    aspectRatio: input.aspectRatio,
    quality: input.quality,
    negativePrompt: input.negativePrompt ?? "",
  };
}
