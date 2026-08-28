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
