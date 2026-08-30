# MedGraph v11.3 node recognition test report

Root cause:
The smart-node proposal awaited Safari's browser Handwriting Recognition API. On some iPad/Safari builds, `getPrediction()` can remain pending, so the final render never ran and the node field stayed on `recognizing…`.

Fixes:
- Native handwriting recognition now has a 900 ms hard timeout.
- Smart nodes use the personal letter/pair/trio/whole-word model first.
- Smart-node personal recognition is bounded at 1.8 s.
- Native handwriting is optional background evidence only; it cannot block the node UI.
- If an idle-word/ghost guess already exists inside the enclosure, it appears immediately.
- Every node-recognition path ends in `done`, `no_guess`, or `error`.
- A no-guess result changes the field to `type or correct ANY word/phrase`; it never remains on `recognizing…`.

Checks:
- index syntax: PASS
- Ink Lab syntax: PASS
- lazy Whiteboard module syntax: PASS
- hanging-promise timeout behavior: PASS
- native OCR timeout present: PASS
- personal-model-first node path present: PASS
- ghost-word immediate fallback present: PASS
- recognition completion state present: PASS
- cache/service-worker version bumped: PASS
