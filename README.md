# Dark Matter — Demon

Premium full-viewport motion graphic built around the **detailed auto-traced SVG** (painterly grayscale depth), not a flat cartoon silhouette composite.

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

- Hero asset: `public/demon-detailed.svg` (optimized from the original ~413KB auto-trace)
- Source of truth for fidelity: `/workspace/source-art.svg` (598–599 paths, 38 linearGradients)
- Preview renders: `../assets/preview-detailed.png`, `../assets/preview-fidelity-compare.png`

Optimization uses SVGO multipass at float precision 2 while keeping gradients, viewBox, and path fidelity (see `UPGRADE.md`).

## Experience

1. Soft luminous orb breathes in charcoal darkness (`#0d0e0f`)
2. Light expands and **mask-reveals the detailed figure** (no cartoon morph)
3. Living idle: subtle breathe (≈1.0–1.015), atmospheric smoke/glow plates, soft bloom, micro parallax
4. Film grain + vignette for cinematic depth
5. **Replay** restarts the sequence

`prefers-reduced-motion: reduce` shows the static detailed SVG. Animation pauses while the document is hidden.

Stack: Vite + React + TypeScript. Inline SVG for the hero, CSS depth plates from the same SVG URL, canvas grain overlay.
