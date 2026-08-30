# MedGraph v11.2 smart-node text fix

Checked/fixed smart-node edge cases:

- Write word first, then circle/box it: supported.
- Draw circle/box first, then write the word inside: supported after the normal writing pause.
- Existing smart word guess already inside the shape: reused as a fallback if enclosed-word recognition is weak.
- Long word close to enclosure edge: no longer rejected by the old overly-strict 0.96 size gate.
- Existing node/arrow structural strokes inside a larger enclosure are excluded from node-text recognition.
- Auto-created semantic node uses the enclosure bounds rather than only the inner word bounds.
- Semantic node label is rendered inside the node rather than above it.
- JavaScript syntax: PASS for index, Ink Lab, and lazy Whiteboard module.
- Service-worker/module cache versions bumped.
