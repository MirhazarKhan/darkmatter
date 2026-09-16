# Verify — Demon Morph app

**Date:** 2026-09-16 (Asia/Karachi)

## Build

```bash
cd /workspace/demon-morph/app
npm install
npm run build
```

**Result:** SUCCESS (`tsc -b && vite build`, Vite v8.3.0, ~22 modules, dist emitted).

## Dev server

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

If 5173 is occupied, Vite picks the next free port (verified serving **Demon Morph** on `http://127.0.0.1:5174/` with HTTP 200 for `/`, `/src/main.tsx`, and JSON data).

## Morph sanity (Node)

`flubber.interpolate(orb → glowCore)` and `smokeA → smokeB` produce mid-path strings (non-empty).

## How to run

```bash
npm install && npm run dev
```

Open the Local URL. Click **Replay** (bottom-right) after the reveal phase to restart the cinematic loop early.
