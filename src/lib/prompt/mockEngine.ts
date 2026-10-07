// ── Mock prompt engine (zero-cost, deterministic) ─────────────────────────
// Used when MOCK_CLAUDE=true (default) or as a safe fallback when the
// Claude API call fails. It preserves the user's original idea verbatim and
// fills the shot plan with sensible cinematic defaults via keyword spotting.

import type { PromptEngine, StructureInput, StructuredPrompt } from "./types";
import { composeDirectorText, emptyStructuredPrompt } from "./types";

function pick(text: string, pairs: Array<[RegExp, string]>, fallback: string): string {
  const lower = text.toLowerCase();
  for (const [re, value] of pairs) {
    if (re.test(lower)) return value;
  }
  return fallback;
}

const ANGLES: Array<[RegExp, string]> = [
  [/aerial|drone|bird.?s.?eye|from above/, "aerial"],
  [/close.?up|macro/, "extreme close-up"],
  [/wide|panorama|landscape/, "wide"],
  [/low angle|from below/, "low angle"],
  [/overhead|top.?down/, "overhead"],
  [/pov|first.?person/, "POV"],
  [/selfie/, "selfie-style close"],
];

const MOVEMENTS: Array<[RegExp, string]> = [
  [/\borbit|rotat|circle around/, "slow orbit around subject"],
  [/dolly|push in|move (in|toward|forward)/, "slow dolly push-in"],
  [/pull back|reveal/, "gradual pull-back reveal"],
  [/pan\b|panning/, "smooth lateral pan"],
  [/tilt/, "slow vertical tilt"],
  [/tracking|follow|chase/, "tracking shot following the action"],
  [/crane|rise|ascend/, "rising crane movement"],
  [/static|still|tripod/, "locked-off static frame"],
  [/handheld|shaky/, "subtle handheld drift"],
  [/flythrough|fly through/, "continuous flythrough"],
];

const LIGHTING: Array<[RegExp, string]> = [
  [/neon/, "neon-drenched night lighting with wet reflections"],
  [/golden hour|sunset|sunrise/, "warm golden-hour light, long soft shadows"],
  [/moon|night/, "cool moonlit night lighting with deep shadows"],
  [/rain/, "moody overcast lighting with rain sheen"],
  [/studio/, "clean three-point studio lighting"],
  [/candle|fire/, "warm flickering firelight"],
  [/cyberpunk|futuristic/, "high-contrast cyberpunk lighting, cyan/magenta rim light"],
];

const STYLES: Array<[RegExp, string]> = [
  [/anime|ghibli/, "anime"],
  [/cartoon|pixar/, "stylized 3D animation"],
  [/cyberpunk/, "cyberpunk cinematic"],
  [/horror|scary/, "dark horror cinematic"],
  [/documentary/, "documentary realism"],
  [/vintage|retro|film/, "vintage film look with grain"],
  [/realistic|photoreal|cinematic/, "photorealistic cinematic"],
];

const MOODS: Array<[RegExp, string]> = [
  [/epic|dramatic/, "epic and dramatic"],
  [/calm|peaceful|serene/, "calm and serene"],
  [/tense|suspense|dark/, "tense and suspenseful"],
  [/joy|happy|celebrat/, "joyful and uplifting"],
  [/mysterious|mystery/, "mysterious and enigmatic"],
  [/romantic/, "romantic and tender"],
  [/melanchol/, "melancholic and reflective"],
];

export class MockPromptEngine implements PromptEngine {
  readonly name = "mock-prompt-engine";

  async structure(input: StructureInput): Promise<StructuredPrompt> {
    const base = emptyStructuredPrompt(input);
    const p = input.prompt;

    const cameraAngle = pick(p, ANGLES, "eye-level medium");
    const cameraMovement = pick(p, MOVEMENTS, "slow cinematic drift");
    const style = pick(p, STYLES, "photorealistic cinematic");
    const lighting = pick(p, LIGHTING, "natural cinematic lighting with soft contrast");
    const mood = pick(p, MOODS, "immersive and atmospheric");

    // Keep the user's words intact as the subject/action core.
    const subject = p.length > 120 ? p.slice(0, 117).trimEnd() + "…" : p;

    const filled = {
      ...base,
      subject,
      environment: "as described in the prompt, rendered with depth and atmosphere",
      action: "natural, physically-plausible motion true to the described scene",
      camera: {
        angle: cameraAngle,
        movement: cameraMovement,
        lens: cameraAngle.includes("aerial") ? "wide-angle aerial lens" : "35mm cinematic prime, shallow depth of field",
      },
      lighting,
      style,
      mood,
      motion: "smooth, continuous motion; no warping or morphing artifacts",
      composition: "rule-of-thirds framing with clear subject focus and layered depth",
      physics: "realistic gravity, inertia, and material behavior",
      background: "richly detailed, softly defocused where appropriate",
      colorTreatment: style.includes("cyberpunk")
        ? "teal-and-magenta grade with glowing highlights"
        : "balanced cinematic grade, natural skin tones, gentle contrast curve",
    };
    return { ...filled, directorText: composeDirectorText(filled) };
  }
}
