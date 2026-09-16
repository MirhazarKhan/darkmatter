# Fidelity upgrade

## Why

The previous stage used a 5-layer flattened cartoon (`demon-layers.svg` / flubber morph). That looked childish and discarded the painterly depth of the original auto-trace. This upgrade restores the **detailed SVG** as the hero and rebuilds the experience as cinematic VFX around it.

## Asset pipeline

| | Before | After |
|---|---:|---:|
| File | `source-art.svg` | `public/demon-detailed.svg` (+ `assets/` copy) |
| Size | 412,968 bytes (~403 KB) | 194,811 bytes (~190.2 KB) |
| Paths | 598 | 599 |
| linearGradients | 38 | 38 |
| Visual delta (MAE RGB @500px) | — | ~0.03 (effectively lossless) |

Steps:

1. Flatten nested `<svg>` wrapper
2. Normalize viewBox to `0 0 168.81 300`
3. SVGO multipass, float precision 2, keep viewBox/gradients, avoid aggressive `mergePaths`
4. Re-add `xmlns` for standalone validity

## App changes

- Replaced Canvas/flubber morph stage with **inline detailed SVG** + atmospheric depth plates
- Charcoal stage `#0d0e0f`, full `100vw × 100dvh`, no scroll
- Techniques: blurred far/mid SVG plates, soft bloom, clip-path light reveal, breathe idle, pointer+drift parallax, film grain, vignette
- Removed flubber + morph key JSON from the runtime path
- `prefers-reduced-motion` → static detailed figure; pause on `document.hidden`

## Limits (honest)

- Depth plates are full-SVG duplicates with blur (not true per-path luminance grouping) — still reads dimensional without destroying detail
- Inline SVG (~190 KB) is heavier than the old 8 KB cartoon; acceptable for a hero art piece
- Eye pulse is ambient via bloom/brightness, not a separately isolated eye path (paths are not labeled in the auto-trace)
- Grain is a static low-res noise texture, not animated film stock


## Full-bleed glitch orb (this pass)

User feedback: the previous stage still read as a floating portrait on charcoal. This pass:

- Stage is `#000000` edge-to-edge (`100vw × 100dvh`)
- Removed the fake CSS orb
- Ported `user-pack` Path2D engine (126 frames) into React, time-driven
- Cover-fit orb (`600×338`) and cover/slice hero SVG so figure + aura dominate
- Heavy transition VFX (flash, film burn, RGB split, shockwave, embers, glitch)
- `frames-data.js` (~5.2MB) lives in `public/` and loads once via a script tag so Vite HMR is not bloated
