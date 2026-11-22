#!/usr/bin/env python3
"""edge-tts narration with word-level timings -> mp3 + words.json (study-3d-short pipeline).
This edge-tts build emits SentenceBoundary only; words are spread across each sentence by length.
"""
import asyncio, json, re, sys
import edge_tts

async def main():
    text_path, out_mp3, out_words, voice, rate = sys.argv[1:6]
    text = open(text_path, encoding="utf-8").read()
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    words, sentences = [], []
    with open(out_mp3, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "SentenceBoundary":
                sentences.append({"text": chunk["text"],
                                  "start": chunk["offset"] / 1e7,
                                  "end": (chunk["offset"] + chunk["duration"]) / 1e7})
    for s in sentences:
        toks = re.findall(r"[\w'-]+|[.,!?;:]", s["text"])
        if not toks: continue
        weights = [max(1, len(t)) for t in toks]
        total = sum(weights)
        span = s["end"] - s["start"]
        cur = s["start"]
        for t, w in zip(toks, weights):
            dur = span * w / total
            words.append({"word": t, "start": round(cur, 3), "end": round(cur + dur, 3)})
            cur += dur
    json.dump({"voice": voice, "rate": rate, "sentences": sentences, "words": words},
              open(out_words, "w"), indent=1)
    dur = sentences[-1]["end"] if sentences else 0
    print(f"sentences={len(sentences)} words={len(words)} duration={dur:.2f}s voice={voice}")

asyncio.run(main())
