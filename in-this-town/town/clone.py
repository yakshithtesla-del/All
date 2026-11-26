"""Speak sentences in a cloned voice with VoxCPM2 (runs in the "voxcpm_python" environment from config.json, on an NVIDIA GPU; voice.py calls it).
<voxcpm python> town/clone.py <job.json>
job.json: {"ref": "voice_ref/narrator.wav", "ref_text": "...", "out": "build/clone", "seed": 41,
           "sentences": ["In this town, every laugh costs one coin.", ...]}
Writes <out>/s00.wav, s01.wav ... Continuation cloning (prompt wav + its exact words) copies the sample's
delivery and pace, not only its timbre."""
import sys, os, json
import soundfile as sf


def main(job_path):
    job = json.load(open(job_path, encoding="utf-8"))
    import torch
    if not torch.cuda.is_available():
        sys.exit("No GPU: the RTX 3060 is not available (restart the PC if nvidia-smi says 'GPU is lost').")
    from voxcpm import VoxCPM
    model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
    rate = model.tts_model.sample_rate
    os.makedirs(job["out"], exist_ok=True)
    for i, text in enumerate(job["sentences"]):
        out = os.path.join(job["out"], f"s{i:02d}.wav")
        torch.manual_seed(job.get("seed", 41) + i)
        wav = model.generate(text=text, prompt_wav_path=job["ref"], prompt_text=job["ref_text"],
                             reference_wav_path=job["ref"], cfg_value=job.get("cfg", 2.0),
                             inference_timesteps=job.get("steps", 10))
        sf.write(out, wav, rate)
        print(f"  s{i:02d}: {len(wav) / rate:.2f}s  {text}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1])
