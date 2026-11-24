# Roblox shorts — hard lessons (from the rejected "SNOW" render)

These are production rules, not preferences. Apply them to every future short.

1. **Full resolution only.** Final deliverable is 1080x1920. Never render 540x960 "fast mode". If GitHub Actions is too slow, shard the timeline across parallel jobs and stitch the H.264 chunks with ffmpeg. Do not trade resolution for time.
2. **Stable, readable camera.** Every speaking line uses `d.shot('face' | 'medium', <speaker>)`. One eyeline per scene. No frantic angles, no camera aimed past the subject, no wide shots that lose the face.
3. **Fewer, motivated cuts.** One continuous shot per line by default. If a line needs two beats, cut once on a spoken word and stay on the same character. No 2–3 sub-shot cuts in every line.
4. **No object pop-in.** Props must be in place before the shot starts or enter from off-screen with `d.walk`, `d.fall`, `d.drive`. Never call `d.appear()` on something already inside the frame.
5. **Clean foreground.** No prop, particle system or background model between camera and speaker. Check the face is unobstructed in every still.
6. **Continuity check.** Sample stills 0.5s apart around every cut and action. Nothing teleports, pops, flips direction, or changes size between neighbouring frames.
7. **Automated checks are necessary but not sufficient.** A clean CLIP/FRAME report does not mean the video looks good. Review composition on the still sheet before rendering.
EOF