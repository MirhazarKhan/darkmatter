# Verify

1. `npm install && npm run build` succeeds.
2. Stage is pure black `#000000`, `100vw × 100dvh`, art **cover-fit** (not a floating portrait card).
3. Orb is the user pack 126 Path2D frames from `public/frames-data.js` (script-tag load), not a fake CSS orb.
4. Hero is `public/demon-detailed.svg` — not the cartoon 5-layer potrace.
5. Sequence: orb reel → heavy VFX transition → living idle → Replay.
6. `prefers-reduced-motion: reduce` shows static detailed SVG full-bleed; no orb animation.
7. Tab hide pauses rAF; show resumes.
