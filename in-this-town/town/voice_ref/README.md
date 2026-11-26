# Your narrator voice (optional)

Put a clean 10-20 second recording of the narrator here as `narrator.wav` (mono, no music) and its exact words
in `narrator.txt`. Then set `"voxcpm_python"` in `config.json` to a Python that has `voxcpm`, `torch` (CUDA),
`soundfile` and `faster-whisper`. The stories' `"clone"` setting then speaks every line in that voice.

With no sample here, the kit uses the free edge-tts voice (`"voice"` / `"rate"` in the story file), which needs
the internet. Only clone a voice you own or have permission to use.
