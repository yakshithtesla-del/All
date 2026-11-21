// ambient declaration for the narration word timings (sync track for story.ts + captions.tsx)
declare module "*/words.json" {
  const words: { word: string; start: number; end: number }[];
  export default words;
}
