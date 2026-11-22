// Lip-sync data for scenes. `voice.mjs make` writes voice/mouth.json from the voice itself: for every video frame, how
// open the mouth is (loudness) and whether the sound is bright ("ee": wide) or dark ("oo": round). No AI model.
//   create:  state.mouth = await loadMouth()
//   update:  kid.speak(kidIsTalking ? mouthAt(state.mouth, globalT) : null)
let loading = null
export const loadMouth = () => (loading ??= fetch('voice/mouth.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null))
/** The mouth at second t of the whole video: { open, wide, round } (0..1), or null when there is no voice data. */
export function mouthAt(mouth, t) {
  if (!mouth?.frames?.length) return null
  const [open, wide, round] = mouth.frames[Math.min(mouth.frames.length - 1, Math.max(0, Math.round((t + 0.04) * mouth.fps)))]
  return { open, wide, round }
}
