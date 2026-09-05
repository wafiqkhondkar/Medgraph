# MedGraph PWA

This folder is ready for static HTTPS hosting (GitHub Pages, Cloudflare Pages, Netlify, etc.).

## Easiest GitHub Pages setup
1. Create a new GitHub repository.
2. Upload every file in this folder to the repository root.
3. In the repository, open Settings → Pages.
4. Under Build and deployment, choose "Deploy from a branch".
5. Choose the `main` branch and `/ (root)`, then Save.
6. Open the Pages URL in Safari.
7. On iPad/iPhone: Share → Add to Home Screen → Open as Web App.

Do NOT upload your exported MedGraph JSON to a public repository. The app code can be public; your graph/training data stays in browser storage unless you explicitly export it.

## Backups
Inside MedGraph, tap Export:
- Save / Share full JSON — complete backup
- Save / Share handwriting JSON — personal handwriting/gesture data only
- Import handwriting JSON — merge handwriting training back in

On iOS, Save / Share uses the system share sheet when available; choose Save to Files.

## Offline
After the PWA loads successfully once, the service worker caches the app shell so it can reopen offline. Browser-local MedGraph data is stored separately in localStorage.

## Handwriting Lab v1.2
- Letter confidence dashboard identifies weak/confused letters using leave-one-out testing.
- Guided training adds Weakest letters, Common letter pairs, and Common letter trios.
- Corrected real words produce inferred letters plus pair/trio samples.
- Segment tab lets you move every character divider using a slider or by tapping the canvas.

## PWA v4 — open vocabulary
- Whiteboard handwriting recognition is no longer restricted to words already in the graph.
- Direct letter decoding, trained letter-pair chunks, and trained letter-trio chunks can compose unseen words.
- Existing MedGraph terms are used only as reranking/correction suggestions.
- Every node-name field explicitly accepts a brand-new typed word or phrase.
- Handwriting Lab training automatically syncs into the main MedGraph browser storage when both pages are on the same PWA origin.

## PWA v5 — shared handwriting + true open spelling
- Ink Lab and Whiteboard share a dedicated `medgraph_handwriting_shared_v5` browser record instead of relying on the graph's storage adapter.
- Whiteboard syncs the shared model before every recognition and shows the number of personal ink samples loaded.
- Raw letter/pair/trio spellings are kept ahead of known-term suggestions. Existing graph vocabulary cannot remove unseen spellings.
- Recent freehand guesses are editable: type any new word or phrase before creating the node.
- Service worker uses network-first navigation so deploying a new HTML build is less likely to leave the installed PWA on stale code.

## PWA v6 — durable handwriting + long words
This build fixes three v5 bugs:
1. The Ink Lab no longer changes its training array when the main MedGraph graph is detected. All handwriting samples are kept in one canonical personal model.
2. The personal handwriting corpus is stored once in IndexedDB instead of duplicated in localStorage. Existing v1/v5 trainer, shared-store, and graph-owned samples are automatically merged into the IndexedDB corpus on first launch.
3. Whiteboard live-word clustering no longer discards strokes older than 2.6 seconds. It follows spatially connected ink for up to 60 seconds and supports much wider words. Open-vocabulary decoding estimates full word length, tries multiple plausible character counts, and places character cuts near low-ink-density valleys.

When moving from Ink Lab back to MedGraph, the Lab awaits the IndexedDB write before navigation. This prevents newly collected training from disappearing during page switches.

## PWA v7 — performance, navigation stability, verified backups
- Ink Lab no longer rewrites the entire training corpus whenever you pan, change tabs, zoom, or change a setting. Workspace state and training data are persisted separately.
- Dashboard confidence analytics are bounded/cached and validation runs only on request.
- The Data tab renders 100 samples at a time instead of every sample at once.
- Whiteboard recognition no longer rereads IndexedDB for every word and no longer brute-forces every possible word length. Pair/trio training is used as contextual scoring rather than scanning every pair/trio class at every character.
- The service worker is network-first for HTML navigation, reducing stale `index.html` / `handwriting-lab.html` version mismatches that could produce a blank screen after switching.
- Training exports use the canonical IndexedDB corpus, include sample/category counts and a checksum, and are parsed/count-checked before download. The Ink Lab Data tab also has a Verify stored data button.
- Import accepts v7 packs, older packs with root `samples`, full MedGraph exports, and graph-wrapped exports, then merges every training sample into the canonical model.

## PWA v8 — recognition audit + Apple Pencil segmentation
- Segment editor orange character boundaries can be grabbed and dragged directly with Apple Pencil, touch, or mouse. Pencil hit targets are enlarged without enlarging the visible character boxes.
- Whiteboard recognition deskews a copy of slanted handwriting before character-count estimation and slicing. Original ink is never altered.
- Pair/trio context scoring precomputes each span once instead of rerasterizing it for every beam-search candidate.
- Spatial word grouping now trims at strong whitespace or pause+gap boundaries so neighboring words are less likely to be combined.
- Estimated 2–3 character novel words stay on the open-vocabulary path instead of falling back to the older known-word path.
- Delayed recognition results are discarded if newer strokes changed the word cluster before the result returned.

## V8 checked follow-up
- Apple Pencil character-boundary dragging is requestAnimationFrame-throttled so high-frequency Pencil pointer events do not force a full segmentation repaint for every coalesced sample.
- Lasso recognition can split obvious spaces and stacked lines, recognize each word independently, and join the result into a phrase.
- Full MedGraph and handwriting-only backups now embed Ink Lab validation examples, segmentation boundary corrections, guided-training progress, and generator settings in addition to the entire canonical training corpus.
- Import restores that embedded trainer state into IndexedDB for the next Ink Lab launch.

- Final audit also keeps dots/crossbars attached to their body line during multi-line phrase grouping, recomputes the full-backup checksum after trainer state is embedded, and normalizes restored generator state when importing from the main whiteboard.


## v9 stabilization
- Build badge is visible in both MedGraph and Handwriting Lab so stale caches are obvious.
- Main → Ink Lab now waits for graph + handwriting persistence before navigating; Ink Lab → Main already waits for its flush.
- Safari BFCache restores resync the canonical handwriting model.
- Recognition similarity uses cached 576-bit signatures rather than rebuilding JavaScript Sets for every prototype comparison.
- Word-length estimation calibrates from the user's real whole-word samples when available.
- Auto clustering no longer uses creation-time gaps, so late i-dots/t-crossbars do not cut the word in half.
- Phrase splitting is more conservative to avoid turning one long word into multiple 2–3 letter words.
- Apple Pencil boundary edits are persisted even on pointercancel/lost capture.
- v9 imports verify declared sample counts/checksums when present; v9 exports serialize, parse, recount, and re-checksum before saving.

## v10 lean architecture
The previous builds accumulated multiple migration/synchronization layers. v10 removes those from the normal startup path.

- Ordinary MedGraph startup loads the graph only. The handwriting IndexedDB record is lazy-loaded only when Whiteboard recognition or Ink Lab needs it.
- Ink Lab opens inside MedGraph as a lazy iframe overlay. Switching back does not navigate/reload the PWA.
- The Lab flushes IndexedDB before closing, then sends a same-origin message to MedGraph.
- MedGraph rereads and **replaces** its in-memory training object from IndexedDB after the Lab closes. It does not merge a stale copy.
- Legacy handwriting migration runs only when the canonical IndexedDB record is genuinely missing.
- The Ink Lab itself loads its canonical `training` and `lab-state` records directly; it does not rescan old storage on every visit.

## v11 modular cleanup

This is a structural cleanup, not another recognition patch.

- `index.html` no longer contains the historical Whiteboard/recognition stack.
- `whiteboard-module.js` is loaded only when Whiteboard or the inline Ink Trainer is opened.
- Ink Lab stays independent and lazy-loads in the existing full-screen overlay.
- Normal MedGraph startup loads graph/UI code only.
- Normal startup does not open IndexedDB for handwriting.
- Full export/import lazily loads the handwriting module only when training data is involved.
- Ink Lab closes through a save → postMessage → close handshake; the parent does not navigate away.
- The parent replaces its canonical in-memory handwriting model from IndexedDB after Ink Lab closes instead of accumulating stale copies.
- The service worker no longer pre-caches the heavy Whiteboard or Ink Lab JavaScript during installation; each is cached after first use.

## v12 — personal stroke-sequence recognizer
The primary personal recognizer now uses stroke-sequence features instead of 24×24 raster overlap.

- isolated letters: DTW kNN against personal stroke sequences
- words: joint character-boundary + character-identity Viterbi decoding
- pair/trio samples: context bonuses
- whole words: personal memory only
- no MedGraph vocabulary substitution in the raw result
- new samples preserve pressure and within-stroke timing
- Ink Lab and Whiteboard share the same `stroke-sequence.js`
- Test reports exact word accuracy and character error rate (CER)

This is a working personal sequence model that can use the existing dataset immediately. A true neural CTC base still requires large generic pretrained weights; v12 does not pretend the personal sample count is enough to train that base network from scratch.

## v12.1 — Prodrome fields
- Disease class now includes `prodrome:`.
- Virus class now includes `prodrome:`.
- New canonical clinical relation: `has_prodrome`.
- Supported wording includes `has a prodrome of`, `has prodromal symptoms of`, `is a prodrome of`, `is a prodromal symptom of`, and `occurs in the prodrome of`.
- `is a prodrome of` and similar inverse wording automatically flips the edge into the canonical disease/virus → prodrome direction.

## v12.2 — relationship parser expansion

New parser structures:
- `X activates Y causes Z` → `X activates Y` + `Y causes Z`
- `beta sheets of proteins are antiparallel` → `beta sheets of proteins` is decomposed into:
  - `beta sheets -of-> proteins`
  - `beta sheets -has_property-> antiparallel`
- `cell death occurs slowly` → `cell death -has_manner-> slowly`, while preserving `occurs` as the written wording.
- bare `if` is now a `context_dependent` condition marker. `only if` remains the stricter `only_if` condition.
- a large curated medical/science verb set was added for mechanisms, molecular biology, clinical medicine, microbiology, pharmacology, anatomy, signaling, transport, and quantitative change.

## v12.3 — possibility conditions + lexical verb presentation

- `can`, `could`, `may`, `might`, `is able to`, and `are able to` now create a `possible` condition, meaning the relationship is an option/possibility rather than a guaranteed assertion.
- The modal condition is attached before list/purpose expansion, so `X may cause A and B` keeps the possibility marker on every expanded fact.
- Graph semantics still use canonical relation keys for grouping/inference, but notes/cards now present the verb the user actually wrote.
- Example: `X exports Y` remains semantically in the transport family but is shown as `export`, not flattened to `transport`.
- Example: `X transmits Y` is shown as `transmit`; `X pumps Y` is shown as `pump`.
- The original parsed verb surface is preserved even for reversed/passive parses.
- Serialized notes include both the lexical verb and a separate `semantic relation:` line so human wording and machine semantics are both retained.
