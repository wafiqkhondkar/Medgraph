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
