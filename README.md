# Dark Matter — Demon

Full-viewport **canvas** motion graphic: the user glitch-orb (126 Path2D frames) hard-cuts into a painterly detailed demon hero. Pure `#000` stage, cover-fit, real post stack — not CSS blur plates on a floating cartoon card.

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

`/?phase=alive` skips the orb opener.

## Art / runtime

| Asset | Role |
|---|---|
| `public/demon-hero.png` | **Visual source of truth** — high-res raster (~1013×1800) from detailed SVG |
| `public/demon-detailed.svg` | 599-path source kept for re-raster / reference |
| `public/frames-data.js` | Glitch orb Path2D reel (~5.2MB classic script) |

Cartoon `demon-layers.svg` / morph-keys are **not** used in the runtime UI.

## VFX (canvas)

Bloom (downsample blur upsample), film grain, vignette, chromatic aberration, light rays, embers, glitch slices on transition. See `UPGRADE.md`.
