# FrameForge $0 test Space — Wan 2.1 T2V 1.3B on ZeroGPU
#
# Minimal, legitimate text-to-video Space. Deploy steps:
#   1. Create a Hugging Face Space (Gradio SDK) with these files.
#   2. In Space settings, select ZeroGPU hardware (free for accounts in
#      good standing: verified email, account older than 30 days).
#   3. The Space exposes predict(prompt, duration_sec, ratio) -> video file,
#      matching FrameForge's GradioSpaceBackend default mapping.
#
# Cost: $0. No payment, no credits. Free-tier ZeroGPU quota applies to the
# CALLER (~5 min/day for free accounts, ~2 min/day unauthenticated).

import spaces  # preinstalled on ZeroGPU hardware
import gradio as gr
import torch
from diffusers import AutoencoderKLWan, WanPipeline
from diffusers.utils import export_to_video

MODEL_ID = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"

# Official diffusers quickstart for Wan2.1-T2V-1.3B. Weights load at module
# level; ZeroGPU's CUDA emulation lets .to("cuda") run here, with real CUDA
# inside the @spaces.GPU function.
vae = AutoencoderKLWan.from_pretrained(MODEL_ID, subfolder="vae", torch_dtype=torch.float32)
pipe = WanPipeline.from_pretrained(MODEL_ID, vae=vae, torch_dtype=torch.bfloat16)
pipe.to("cuda")

NEGATIVE_PROMPT = (
    "Bright tones, overexposed, static, blurred details, subtitles, style, works, "
    "paintings, images, overall gray, worst quality, low quality, JPEG compression "
    "residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, "
    "deformed, disfigured, misshapen limbs, fused fingers, still picture, "
    "messy background, three legs, many people in the background, walking backwards"
)


def _size_for_ratio(ratio: str) -> tuple[int, int]:
    """Wan2.1-1.3B is trained for 480p. Map request ratio to 832x480 / 480x832."""
    r = (ratio or "").lower()
    if r.startswith("480") or "x1280" in r or "9:16" in r or "portrait" in r:
        return (480, 832)
    return (832, 480)


@spaces.GPU(duration=300)
def predict(prompt: str, duration_sec: int = 5, ratio: str = "1280x720") -> str:
    """Text prompt -> AI-generated MP4. ~4 min on 4090-class GPU for 81 frames."""
    prompt = (prompt or "").strip()[:500]
    if not prompt:
        raise gr.Error("Prompt is empty.")
    width, height = _size_for_ratio(ratio)
    # 81 frames @ 15 fps ≈ 5.4s — the model's native 1.3B clip length.
    frames = pipe(
        prompt=prompt,
        negative_prompt=NEGATIVE_PROMPT,
        height=height,
        width=width,
        num_frames=81,
        guidance_scale=5.0,
    ).frames[0]
    out_path = "/tmp/frameforge_wan21.mp4"
    export_to_video(frames, out_path, fps=15)
    return out_path


demo = gr.Interface(
    fn=predict,
    inputs=[
        gr.Textbox(label="Prompt", lines=3, placeholder="A cinematic aerial shot of a futuristic city…"),
        gr.Number(label="Duration (seconds)", value=5, minimum=2, maximum=6, step=1),
        gr.Textbox(label="Ratio (1280x720 or 720x1280)", value="1280x720"),
    ],
    outputs=gr.Video(label="AI-generated video (Wan 2.1 T2V 1.3B)"),
    title="FrameForge $0 test — Wan 2.1 text-to-video (1.3B)",
    description=(
        "Minimal proof-of-concept: real AI video generation at $0 on Hugging Face ZeroGPU. "
        "One generation takes ~4 minutes of shared free GPU time."
    ),
)

if __name__ == "__main__":
    demo.launch()
