# Sounds and music: what each folder allows

Checked 2026-11-04. Search everything with `python drama/tools/find_sfx.py <words>`; each result
shows its license.

| Folder | Source | License | Credit needed? |
|---|---|---|---|
| `sfx/gdc26/` | Sonniss GDC 2026 Game Audio Bundle (7.5 GB) | Royalty-free, commercial OK. Full text: `License - GDC Game Audio.pdf` inside | No. **Don't** resell or share the raw files, don't use them to train AI |
| `sfx/sfx-kit/` | github.com/wyzowl/sfx-kit (whooshes, risers, hits, UI, phone) | CC0 | No |
| `sfx/Meta-open-sound/` (instruments) | github.com/facebookincubator/Meta-open-sound | CC0 | No |
| `sfx/Meta-open-sound/corpora/oculus-audio-pack/` | Oculus Audio Pack 1 (footsteps, doors, fights, laughs, ambience) | CC BY 4.0 | **Yes**: "Sound effects: Oculus Audio Pack (Meta), CC BY 4.0" |
| `sfx/own/` | Made here with FFmpeg (heartbeats, slap) | CC0 | No |
| `music/incompetech/` | Kevin MacLeod, incompetech.com | CC BY 4.0 | **Yes**: copy the line for each track used from `music/incompetech/CREDITS.csv` |

Some long Sonniss file names were shortened (a `_NNN` number at the end) to fit Windows' path limit.

## Not included on purpose

- Freesound, Pixabay, YouTube Audio Library: need an account to download.
- archive.org "free" SFX packs: unclear where they came from; some are pirated.
- Netflix's "ta-dum" sound or N logo: trademarked. Make your own studio intro instead.
