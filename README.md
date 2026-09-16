# Demon Morph

Full-viewport demonic path-morph VFX (Vite + React + TypeScript + Canvas 2D + flubber).

## Run

```bash
npm install
npm run dev
```

Open the local URL Vite prints (default `http://127.0.0.1:5173`).

Production build:

```bash
npm run build
npm run preview
```

## Behavior

1. Idle white orb breathes
2. Orb morphs into jagged `glowCore`
3. Figure, eye, and outer smoke reveal
4. Alive idle: smoke A↔B morph, glow pulse, eye flicker
5. After a hold, loops back to the orb (or click **Replay**)

`prefers-reduced-motion: reduce` shows a static layered composite (no morph). Animation pauses while the document is hidden.

Art viewBox is `169×300`, contain-fitted with `#242526` letterboxing. Path keys live in `src/data/` (copied from `../assets`).
