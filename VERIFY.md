# Verify

1. `npm install && npm run build` succeeds.
2. `npm run preview` shows charcoal `#0d0e0f` full-viewport stage.
3. Hero is the detailed `public/demon-detailed.svg` (~190KB, ~599 paths, 38 gradients) — not the flat cartoon layers.
4. Sequence: soft orb → light expand / mask reveal of detailed figure → living idle (breathe, bloom, parallax) → Replay.
5. `prefers-reduced-motion: reduce` shows static detailed SVG.
6. Tab hide pauses animation; show resumes.
