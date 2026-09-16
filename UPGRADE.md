# Fidelity upgrade — canvas VFX pipeline

## Honest admission

Prior passes called CSS blur plates + grain overlay + flash on top of an inline SVG
“heavy full-bleed VFX.” That was insufficient. When the runtime still resolved to the
4/5-path cartoon (`demon-layers.svg`) or rendered the detailed art as a floating card
on charcoal, the result looked exactly like the user’s complaint screenshot: flat
cutouts, no painterly depth, no real post stack. Blurring a vector plate is not bloom.
A postcard on `#0d0e0f` is not full-bleed cinema.

## What this pass actually does

1. **Full-bleed `#000` canvas** — one viewport-sized `<canvas>` (`100vw × 100dvh`). No
   CSS depth plates, no SVG DOM hero, no cine HUD labels.
2. **Painterly hero source of truth** — `public/demon-hero.png` (≈1013×1800), rasterized
   with `rsvg-convert` from `demon-detailed.svg` (599 paths) with the charcoal plate
   forced to `#000`. Loaded as `ImageBitmap` and drawn with **cover** fit so the figure
   fills the viewport. The 4-path cartoon is not referenced in the runtime UI.
3. **Real canvas VFX stack** (see `src/lib/vfx.ts`):
   - Multi-pass bloom (downsample → threshold → box-blur → upsample + screen composite)
   - Animated film grain (tiled noise, overlay)
   - Radial vignette
   - Subtle chromatic aberration on the hero draw
   - Soft light rays behind the figure
   - Embers + shockwave + film-burn + glitch slices during the hard transition
4. **Opener** — time-driven 126-frame Path2D glitch-orb reel from `public/frames-data.js`,
   then a hard cinematic transition into the detailed raster hero.
5. **Minimal chrome** — Replay button only. `prefers-reduced-motion` → static detailed
   hero. Pause on `document.hidden`.

## Asset notes

| Asset | Role |
|---|---|
| `public/demon-hero.png` | Visual source of truth for the alive stage |
| `public/demon-detailed.svg` | Kept for sharp reference / re-raster; not the live hero |
| `public/frames-data.js` | Glitch orb Path2D reel (~5.2MB, classic script) |
| `demon-layers.svg` / morph-keys | **Not used** in the app runtime |

## Limits (still honest)

- Bloom is a 2D canvas approximation, not a HDR mip-chain in WebGL.
- Chromatic aberration uses filtered offset draws, not true per-channel buffers.
- Hero is a high-res raster; extreme zooms will soft-pixel vs pure SVG edges.
