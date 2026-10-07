// ── Claude prompt engine (real AI prompt structuring) ───────────────────
// Active when MOCK_CLAUDE=false and ANTHROPIC_API_KEY is set. Asks Claude to
// expand the user's idea into the full shot-plan schema. Any failure falls
// back to the mock engine so generation never hard-breaks.

import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { logger } from "../logger";
import type { PromptEngine, StructureInput, StructuredPrompt } from "./types";
import { composeDirectorText, emptyStructuredPrompt } from "./types";
import { LocalPromptEngine } from "./localEngine";

const SYSTEM_PROMPT = `You are the prompt director for FrameForge, an AI video-generation studio.
Given a user's raw video idea, expand it into a precise cinematic shot plan.
Preserve the user's original creative intention — enhance, do not replace it.
Respond with ONLY a JSON object matching this schema (no markdown, no commentary):
{
  "subject": "the main subject, concise",
  "environment": "where the scene takes place",
  "action": "what happens / what moves",
  "camera": { "angle": "e.g. aerial, eye-level, low angle", "movement": "e.g. slow dolly push-in", "lens": "e.g. 35mm cinematic prime" },
  "lighting": "lighting design",
  "style": "visual style, e.g. photorealistic cinematic",
  "mood": "emotional tone",
  "motion": "how things move; demand smooth artifact-free motion",
  "composition": "framing guidance",
  "physics": "physical plausibility notes",
  "background": "background detail",
  "colorTreatment": "color grade description",
  "negativePrompt": "things to avoid in the render"
}`;

function sanitize(input: StructureInput, parsed: any): Omit<StructuredPrompt, "directorText"> {
  const base = emptyStructuredPrompt(input);
  const s = (v: unknown, fb: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 600) : fb);
  const cam = parsed?.camera ?? {};
  return {
    ...base,
    subject: s(parsed?.subject, input.prompt.slice(0, 200)),
    environment: s(parsed?.environment, "as described in the prompt"),
    action: s(parsed?.action, "natural motion true to the scene"),
    camera: {
      angle: s(cam.angle, "eye-level medium"),
      movement: s(cam.movement, "slow cinematic drift"),
      lens: s(cam.lens, "35mm cinematic prime"),
    },
    lighting: s(parsed?.lighting, "natural cinematic lighting"),
    style: s(parsed?.style, "photorealistic cinematic"),
    mood: s(parsed?.mood, "immersive and atmospheric"),
    motion: s(parsed?.motion, "smooth, continuous, artifact-free motion"),
    composition: s(parsed?.composition, "rule-of-thirds framing, clear subject focus"),
    physics: s(parsed?.physics, "realistic gravity and material behavior"),
    background: s(parsed?.background, "richly detailed background"),
    colorTreatment: s(parsed?.colorTreatment, "balanced cinematic grade"),
    negativePrompt: s(parsed?.negativePrompt, input.negativePrompt ?? ""),
  };
}

export class ClaudePromptEngine implements PromptEngine {
  readonly name = "claude-prompt-engine";
  private client: Anthropic;
  private fallback = new LocalPromptEngine();

  constructor(apiKey: string = config.anthropicApiKey) {
    this.client = new Anthropic({ apiKey });
  }

  async structure(input: StructureInput): Promise<StructuredPrompt> {
    try {
      const msg = await this.client.messages.create({
        model: config.claudeModel,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Video idea: "${input.prompt}"\nDuration: ${input.durationSec}s. Aspect ratio: ${input.aspectRatio}. Quality: ${input.quality}.` +
              (input.negativePrompt ? `\nUser negative prompt: "${input.negativePrompt}"` : ""),
          },
        ],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const parsed = JSON.parse(text);
      const filled = sanitize(input, parsed);
      logger.info("Claude structured prompt", { model: config.claudeModel });
      return { ...filled, directorText: composeDirectorText(filled) };
    } catch (err) {
      logger.warn("Claude prompt engine failed, using mock fallback", {
        error: err instanceof Error ? err.message : String(err),
      });
      return this.fallback.structure(input);
    }
  }
}
