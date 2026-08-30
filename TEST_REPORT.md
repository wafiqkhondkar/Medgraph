# MedGraph v9 stabilization test report

Build: `9.0-stable`

## Automated checks passed
- JavaScript syntax: `index.html`, `handwriting-lab.html`, and `sw.js`.
- Package completeness: manifest, service worker, both HTML apps, and all icons exist.
- Final-recognizer ordering: v9 recognition override is the active last implementation before boot.
- Navigation guard: Main → Ink Lab waits for graph + handwriting persistence.
- Pencil segmentation: pointer cancel/lost-capture path persists the latest corrected boundary.
- Signature optimization: 300 randomized bitset-Jaccard comparisons matched the original Set-based result exactly.
- Geometry edge test: a synthetic 12-character word with ordinary inter-letter gaps remains one word.
- Geometry edge test: a clear inter-word gap is split into two words.
- Calibration test: per-character pitch calibration returns the expected 12-character estimate.
- Backup schema round trip: direct letters, inferred letters, pairs, trios, synthetic context, whole words, arrow training, validation, segmentation overrides, guided state, and generator state survive JSON serialization.
- v9 import code checks declared sample count/checksum when the source provides them.
- Service-worker cache name: `medgraph-pwa-v9-stable-r1`; HTML navigation is network-first.

## Edge cases explicitly hardened
- Long words written slowly.
- Late `i` dots / `t` crossbars.
- Short unseen 2–3 character words.
- Slanted writing.
- Stacked/multiword lasso selections.
- Accidental stale recognition finishing after newer ink.
- Apple Pencil divider drag interrupted by pointer cancellation.
- Immediate page switching after writing/training.
- Safari back-forward cache restoring stale model state.
- Duplicate same-ID samples from older backups.
- Truncated/mismatched v9 backup count/checksum.

## Limitation of this build-time test
The environment permits static and algorithmic testing but blocks browser navigation to a local test server, so an actual iPad/Safari Pencil hardware event cannot be physically generated here. The app uses standard Pointer Events (`pointerType === "pen"`, pointer capture, move/up/cancel handling) and the Pencil-specific path is covered by source/integrity tests, but real-device feel still depends on Safari/iPadOS event behavior.

## Additional integration checks
- Full-header MedGraph import now validates v9 sample count/checksum before merging.
- Full-header import restores embedded Ink Lab state and persists canonical training before completing.
- Raw Export-panel JSON is asynchronously refreshed from the canonical v9 backup builder, so Select/Copy fallback does not rely on the graph's stripped runtime training copy.
- Integrity check now compares both count and canonical checksum between memory and IndexedDB.

## Segment/Pencil edge cases
- Pencil can grab a divider on an unselected word in one motion.
- `pointercancel` saves the last valid drag position instead of recalculating from possibly-invalid cancel-event coordinates.
- A known single-word label is automatically merged back to one word region if geometry over-splits its strokes.
- Re-derived contextual letters use the corrected word boundaries/labels rather than the original sample label.

## Recognition edge cases added after audit
- Starting a new Pencil stroke cancels the pending partial-word timer and clears the stale ghost guess.
- Uppercase single-letter prototypes are no longer collapsed into lowercase in the active prototype index.
- Weak/missing single-letter evidence can be rescued by a matching trained pair/trio rather than causing the whole open-word decoder to fail.
- Relationship-label recognition uses relation vocabulary for its secondary suggestions instead of node vocabulary.

## Final audit run
- Automated assertions passed: **43**
- Automated assertion failures: **0**
- Recognition geometry/bitset suite: **PASS**
- Canonical full-export checksum test: **PASS**
