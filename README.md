# Dark Matter — Demon

Cinematic full-viewport motion graphic: the **user glitch-orb** (126 Path2D frames) detonates into the **detailed auto-traced SVG**. Pure black stage, cover-fit, heavy VFX — not a letterboxed postcard.

## Run

```bash
npm install
npm run dev
```

Production:

```bash
npm run build
npm run preview
```

## Art

- Glitch orb: `public/frames-data.js` (126 white-on-black Path2D frames, `600×338`, FILL `#FFFFFF` / BG `#000000`) — classic script loaded once via `<script>`, not bundled into TSX
- Hero figure: `public/demon-detailed.svg` (optimized auto-trace, ~599 paths, 38 gradients)
- Source of truth for figure fidelity: `/workspace/source-art.svg`

## Experience

Full-bleed `#000000` stage (`100vw × 100dvh`). Time-driven (no scroll / Lenis / ScrollTrigger).

1. **Orb reel** — 126 Path2D frames, cover-fit into the viewport, original black↔white colorway, optical glow, glitch slices
2. **Detonation** — chromatic aberration, film burn, white flash, mask wipe, shockwave, ember burst, canvas blend punch into the figure
3. **Alive idle** — cover-cropped detailed figure, bloom pulse, breathe, parallax, grain, vignette, occasional glitch ticks
4. **Replay**

`prefers-reduced-motion: reduce` shows the static detailed SVG full-bleed (no orb). Animation **pauses rAF** while `document.hidden`.

Stack: Vite + React + TypeScript. Canvas orb engine + HTML/SVG composite.
