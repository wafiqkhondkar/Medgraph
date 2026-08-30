# MedGraph v11.1 re-check

Additional issues found after the v11 modular split:

1. **Ink Lab close timeout could sacrifice the newest unsaved batch.**
   Fixed: after 8 seconds the parent stays open and offers Force close; it never auto-closes a possibly active save.

2. **Ink Lab close/background path still forced a full handwriting-corpus rewrite even when training had not changed.**
   Fixed: the large training record is written only when `LAB_V7_TRAIN_DIRTY` is true. Workspace state is still saved.

3. **Very short / single-letter Whiteboard recognition could fall into a historical fallback wrapper that reread IndexedDB.**
   Fixed: v11.1 has a final memory-only short-ink recognizer after the one canonical lazy load.

Verification:
- index JavaScript syntax: PASS
- Ink Lab JavaScript syntax: PASS
- lazy Whiteboard module syntax: PASS
- no recognizer implementation in initial index: PASS
- no forced full-corpus visibility save: PASS
- no automatic close on slow Ink Lab save: PASS
- final letter path is memory-only after canonical load: PASS
- service worker/cache version updated: PASS
