# MedGraph v11.4 calibrated-recognition report

## Root causes fixed

1. **The old 80%+ "letter confidence" was misleading.**
   It was a leave-one-out nearest-prototype calculation where inferred and synthetic samples could still help classify a direct real letter. Those derived samples can be near-duplicates of the same writing style, so the displayed percentage could be high without proving generalization.

   v11.4 reports strict direct-real-letter cross-validation only. A letter with fewer than 3 direct examples is shown as `n=<count>` instead of a percentage; ≥5 direct examples is the preferred minimum.

2. **The old Test tab was not testing the same problem you cared about.**
   It used an equal-width character split and then aggressively mapped the resulting string to MedGraph vocabulary. This is why it could predict a real word that was nowhere close to the ink.

   v11.4 defaults to RAW OPEN SPELLING. MedGraph vocabulary is opt-in and displayed separately.

3. **A single accidental nearest prototype could dominate a letter.**
   v11.4 uses a composite kNN score across up to three prototypes per label:
   - raster/shape overlap,
   - aspect ratio,
   - stroke count,
   - direction histogram.
   Multiple examples vote instead of one maximum match winning.

4. **Word segmentation and letter recognition were being conflated.**
   v11.4 shows two separate metrics:
   - strict isolated-letter CV,
   - held-out exact word accuracy.
   High letter accuracy no longer implies high word accuracy.

5. **Bad low-confidence guesses were still being surfaced.**
   Whiteboard and smart-node recognition now reject weak/ambiguous raw spellings instead of forcing an unrelated known word.

## Checks
- index JavaScript syntax: PASS
- Ink Lab JavaScript syntax: PASS
- lazy Whiteboard module syntax: PASS
- strict direct-letter metric present: PASS
- raw open-spelling Test path present: PASS
- vocabulary opt-in/separate path present: PASS
- low-ink-density character segmentation present: PASS
- pair/trio contextual scoring present: PASS
- Whiteboard letter-only prototype restriction present: PASS
- composite kNN scorer present: PASS
- weak-guess rejection logic behavioral test: PASS
- cache/service-worker versions bumped: PASS
