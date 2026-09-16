import { useCallback, useEffect, useRef, useState } from 'react';
import { easeInOutCubic, easeOutCubic, easeSineInOut, smoothstep } from '../lib/easing';
import {
  spawnBurst,
  spawnIdle,
  tickEmbers,
  drawEmbers,
  type Ember,
} from '../lib/embers';
import {
  FRAME_COUNT,
  FRAME_H,
  FRAME_W,
  TRACE_SCALE,
  calculateColorway,
  loadFramesPack,
  parseAllFrames,
  type FrameLayer,
} from '../lib/frames';
import { coverFit, lerp, rgbGray, rgba } from '../lib/geom';
import {
  applyBloom,
  drawGlitchSlices,
  drawHeroWithCA,
  drawLightRays,
  drawShockwave,
  drawTearBars,
  drawVignette,
  paintGrain,
} from '../lib/vfx';

type Phase = 'boot' | 'orb' | 'reveal' | 'alive' | 'static';

const BG = '#000000';
const HERO_URL = '/demon-hero.png';

const DUR = {
  orb: 3400,
  reveal: 2200,
} as const;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function clamp(n: number, a = 0, b = 1) {
  return Math.min(b, Math.max(a, n));
}

function paintGlow(
  ctx: CanvasRenderingContext2D,
  fit: { scale: number; ox: number; oy: number },
  bgVal: number,
  pulse: number,
) {
  const cx = fit.ox + FRAME_W * fit.scale * 0.5;
  const cy = fit.oy + FRAME_H * fit.scale * 0.5;
  const r = Math.min(FRAME_W, FRAME_H) * fit.scale * (0.72 + pulse * 0.12);
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  const isDark = bgVal < 128;
  if (isDark) {
    const peak = lerp(0.42, 0.7, pulse);
    g.addColorStop(0, rgba(255, 255, 255, peak));
    g.addColorStop(0.32, rgba(255, 244, 220, peak * 0.45));
    g.addColorStop(0.62, rgba(255, 80, 40, peak * 0.12));
    g.addColorStop(1, rgba(0, 0, 0, 0));
  } else {
    const peak = lerp(0.2, 0.4, pulse);
    g.addColorStop(0, rgba(0, 0, 0, peak));
    g.addColorStop(0.4, rgba(0, 0, 0, peak * 0.35));
    g.addColorStop(1, rgba(255, 255, 255, 0));
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintOrbFrame(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  layers: FrameLayer[] | undefined,
  bgVal: number,
  vectorVal: number,
  zoom: number,
  glitch: number,
  fillBg: boolean,
  rgbSplit: number,
  pulse: number,
) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (fillBg) {
    ctx.fillStyle = rgbGray(bgVal);
    ctx.fillRect(0, 0, viewW, viewH);
  } else {
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, viewW, viewH);
  }
  if (!layers) return;

  const fit = coverFit(viewW, viewH, FRAME_W, FRAME_H, zoom);
  paintGlow(ctx, fit, fillBg ? bgVal : 0, pulse);

  const drawVectors = (ox: number, oy: number, color: string, alpha = 1) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(fit.ox + ox, fit.oy + oy);
    ctx.scale(fit.scale, fit.scale);
    ctx.translate(0, FRAME_H);
    ctx.scale(TRACE_SCALE, -TRACE_SCALE);
    ctx.fillStyle = color;
    for (let L = 0; L < layers.length; L++) {
      const paths = layers[L].paths;
      for (let i = 0; i < paths.length; i++) {
        ctx.fill(paths[i], 'evenodd');
      }
    }
    ctx.restore();
  };

  if (rgbSplit > 1) {
    ctx.globalCompositeOperation = 'screen';
    drawVectors(-rgbSplit, 0, '#ff2038', 0.9);
    drawVectors(rgbSplit, 0, '#18f0ff', 0.9);
    ctx.globalCompositeOperation = 'source-over';
  }

  drawVectors(0, 0, rgbGray(vectorVal));

  if (glitch > 0.08) {
    const slices = Math.min(7, 2 + ((glitch * 8) | 0));
    for (let i = 0; i < slices; i++) {
      if (Math.random() > glitch * 0.85) continue;
      const y = Math.random() * viewH;
      const h = 3 + Math.random() * 26 * glitch;
      const dx = (Math.random() - 0.5) * 90 * glitch;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, viewW, h);
      ctx.clip();
      ctx.translate(dx, (Math.random() - 0.5) * 8 * glitch);
      drawVectors(0, 0, rgbGray(vectorVal));
      ctx.restore();
    }
  }
}

export function DemonStage() {
  const mainRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>('boot');
  const phaseStartRef = useRef(0);
  const rafRef = useRef(0);
  const hiddenRef = useRef(false);
  const reducedRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const parallaxRef = useRef({ x: 0, y: 0 });
  const layersRef = useRef<FrameLayer[][] | null>(null);
  const heroRef = useRef<ImageBitmap | null>(null);
  const heroSizeRef = useRef({ w: 1013, h: 1800 });
  const embersRef = useRef<Ember[]>([]);
  const lastTsRef = useRef(0);
  const nextGlitchRef = useRef(0);
  const glitchUntilRef = useRef(0);
  const grainTickRef = useRef(0);
  const burstDoneRef = useRef(false);
  const viewRef = useRef({ w: 0, h: 0, dpr: 1 });
  const replayArmedRef = useRef(false);
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  const bloomRef = useRef<HTMLCanvasElement | null>(null);
  const tmpBufRef = useRef<{ data: Uint8ClampedArray | null; w: number; h: number }>({
    data: null,
    w: 0,
    h: 0,
  });

  const [showReplay, setShowReplay] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const restart = useCallback(() => {
    if (reducedRef.current) return;
    phaseRef.current = 'orb';
    phaseStartRef.current = performance.now();
    burstDoneRef.current = false;
    replayArmedRef.current = false;
    embersRef.current = [];
    setShowReplay(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const reduced = prefersReducedMotion();
        const skipFrames =
          reduced ||
          new URLSearchParams(window.location.search).get('phase') === 'alive';

        const heroPromise = fetch(HERO_URL)
          .then((res) => {
            if (!res.ok) throw new Error(`Failed to load ${HERO_URL}: ${res.status}`);
            return res.blob();
          })
          .then((blob) => createImageBitmap(blob));

        const framesPromise = skipFrames
          ? Promise.resolve<FrameLayer[][] | null>(null)
          : loadFramesPack().then((pack) => parseAllFrames(pack.markups));

        const [bmp, layers] = await Promise.all([heroPromise, framesPromise]);
        if (cancelled) {
          bmp.close();
          return;
        }
        heroRef.current = bmp;
        heroSizeRef.current = { w: bmp.width, h: bmp.height };
        layersRef.current = layers;
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      heroRef.current?.close();
      heroRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    reducedRef.current = prefersReducedMotion();
    sceneRef.current = document.createElement('canvas');
    bloomRef.current = document.createElement('canvas');

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(window.innerWidth));
      const h = Math.max(1, Math.floor(window.innerHeight));
      viewRef.current = { w, h, dpr };
      const main = mainRef.current;
      const scene = sceneRef.current;
      if (main) {
        main.width = Math.floor(w * dpr);
        main.height = Math.floor(h * dpr);
        main.style.width = `${w}px`;
        main.style.height = `${h}px`;
      }
      if (scene) {
        scene.width = Math.floor(w * dpr);
        scene.height = Math.floor(h * dpr);
      }
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => {
      reducedRef.current = mq.matches;
      if (mq.matches) {
        phaseRef.current = 'static';
        setShowReplay(false);
      } else if (phaseRef.current === 'static') {
        restart();
      }
    };
    mq.addEventListener('change', onMq);

    const onPointer = (e: PointerEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      pointerRef.current.x = clamp((e.clientX - cx) / cx, -1, 1);
      pointerRef.current.y = clamp((e.clientY - cy) / cy, -1, 1);
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    const forced = new URLSearchParams(window.location.search).get('phase');
    if (reducedRef.current) {
      phaseRef.current = 'static';
    } else if (forced === 'alive') {
      phaseRef.current = 'alive';
      phaseStartRef.current = performance.now();
      nextGlitchRef.current = performance.now() + 8000;
      replayArmedRef.current = true;
      setShowReplay(true);
    } else {
      phaseRef.current = 'orb';
      phaseStartRef.current = performance.now();
      nextGlitchRef.current = performance.now() + 2800;
    }

    const compositeHeroScene = (
      sceneCtx: CanvasRenderingContext2D,
      viewW: number,
      viewH: number,
      dpr: number,
      zoom: number,
      panX: number,
      panY: number,
      caPx: number,
      alpha: number,
      brightness: number,
    ) => {
      const hero = heroRef.current;
      if (!hero) return;
      sceneCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sceneCtx.globalCompositeOperation = 'source-over';
      sceneCtx.globalAlpha = 1;
      sceneCtx.fillStyle = '#000';
      sceneCtx.fillRect(0, 0, viewW, viewH);
      sceneCtx.filter =
        brightness !== 1
          ? `brightness(${brightness}) contrast(1.08)`
          : 'contrast(1.06)';
      drawHeroWithCA(
        sceneCtx,
        hero,
        viewW,
        viewH,
        heroSizeRef.current.w,
        heroSizeRef.current.h,
        zoom,
        panX,
        panY,
        caPx,
        alpha,
      );
      sceneCtx.filter = 'none';
    };

    const blitSceneToMain = (
      mainCtx: CanvasRenderingContext2D,
      scene: HTMLCanvasElement,
      viewW: number,
      viewH: number,
      dpr: number,
      bloomAmt: number,
      grainAmt: number,
      vignetteAmt: number,
      rayPulse: number,
      now: number,
      glitchAmt: number,
      shockT: number,
      flashAmt: number,
      burnAmt: number,
    ) => {
      mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mainCtx.globalAlpha = 1;
      mainCtx.globalCompositeOperation = 'source-over';
      mainCtx.fillStyle = '#000';
      mainCtx.fillRect(0, 0, viewW, viewH);
      mainCtx.drawImage(scene, 0, 0, viewW, viewH);

      const bloomCanvas = bloomRef.current;
      const bloomCtx = bloomCanvas?.getContext('2d');
      if (bloomCanvas && bloomCtx && bloomAmt > 0.02) {
        applyBloom(
          mainCtx,
          scene,
          bloomCanvas,
          bloomCtx,
          tmpBufRef.current,
          bloomAmt,
          viewW,
          viewH,
        );
      }

      drawLightRays(
        mainCtx,
        viewW * 0.5 + parallaxRef.current.x * 20,
        viewH * 0.36 + parallaxRef.current.y * 12,
        Math.max(viewW, viewH) * 0.85,
        rayPulse,
        now,
      );

      if (glitchAmt > 0.05) {
        drawGlitchSlices(mainCtx, scene, viewW, viewH, glitchAmt);
        drawTearBars(mainCtx, viewW, viewH, glitchAmt);
      }

      if (shockT > 0 && shockT < 1) {
        drawShockwave(mainCtx, viewW * 0.5, viewH * 0.4, shockT);
      }

      if (burnAmt > 0.01) {
        mainCtx.save();
        mainCtx.globalCompositeOperation = 'screen';
        const g = mainCtx.createRadialGradient(
          viewW * 0.5,
          viewH * 0.4,
          0,
          viewW * 0.5,
          viewH * 0.4,
          Math.max(viewW, viewH) * 0.7,
        );
        g.addColorStop(0, rgba(255, 255, 255, burnAmt));
        g.addColorStop(0.18, rgba(255, 220, 170, burnAmt * 0.85));
        g.addColorStop(0.4, rgba(255, 70, 30, burnAmt * 0.4));
        g.addColorStop(1, rgba(0, 0, 0, 0));
        mainCtx.fillStyle = g;
        mainCtx.fillRect(0, 0, viewW, viewH);
        mainCtx.restore();
      }

      if (flashAmt > 0.01) {
        mainCtx.save();
        mainCtx.globalCompositeOperation = 'screen';
        mainCtx.fillStyle = rgba(255, 255, 255, flashAmt);
        mainCtx.fillRect(0, 0, viewW, viewH);
        mainCtx.restore();
      }

      drawEmbers(mainCtx, embersRef.current);

      drawVignette(mainCtx, viewW, viewH, vignetteAmt);

      grainTickRef.current += 1;
      if (grainTickRef.current % 2 === 0 || grainAmt > 30) {
        paintGrain(mainCtx, viewW, viewH, grainAmt, (now * 0.1) | 0);
      } else {
        paintGrain(mainCtx, viewW, viewH, Math.max(18, grainAmt - 4), grainTickRef.current);
      }
    };

    const frame = (now: number) => {
      if (hiddenRef.current) {
        rafRef.current = 0;
        return;
      }

      try {
        const dt = lastTsRef.current ? Math.min(48, now - lastTsRef.current) : 16;
        lastTsRef.current = now;

        const main = mainRef.current;
        const scene = sceneRef.current;
        if (!main || !scene) return;
        const mainCtx = main.getContext('2d', { alpha: false, desynchronized: true });
        const sceneCtx = scene.getContext('2d', { alpha: false, desynchronized: true });
        if (!mainCtx || !sceneCtx) return;

        const { w: viewW, h: viewH, dpr } = viewRef.current;
        const layersPack = layersRef.current;

        const driftX = Math.sin(now * 0.00022) * 0.35;
        const driftY = Math.cos(now * 0.00018) * 0.25;
        const tx = pointerRef.current.x * 0.55 + driftX;
        const ty = pointerRef.current.y * 0.45 + driftY;
        parallaxRef.current.x += (tx - parallaxRef.current.x) * 0.045;
        parallaxRef.current.y += (ty - parallaxRef.current.y) * 0.045;
        const px = parallaxRef.current.x;
        const py = parallaxRef.current.y;

        // advance ember physics with real dt
        tickEmbers(embersRef.current, dt);

        if (phaseRef.current === 'static') {
          compositeHeroScene(sceneCtx, viewW, viewH, dpr, 1.08, 0, 0, 0, 1, 1.02);
          // clear embers draw path by temporarily swapping — blit handles draw
          const saved = embersRef.current;
          embersRef.current = [];
          blitSceneToMain(
            mainCtx,
            scene,
            viewW,
            viewH,
            dpr,
            0.72,
            26,
            0.95,
            0.55,
            now,
            0,
            0,
            0,
            0,
          );
          embersRef.current = saved;
          return;
        }

        let phase = phaseRef.current;
        let elapsed = now - phaseStartRef.current;

        if (phase === 'orb' && elapsed >= DUR.orb) {
          phase = 'reveal';
          phaseRef.current = phase;
          phaseStartRef.current = now;
          elapsed = 0;
        } else if (phase === 'reveal' && elapsed >= DUR.reveal) {
          phase = 'alive';
          phaseRef.current = phase;
          phaseStartRef.current = now;
          elapsed = 0;
          if (!replayArmedRef.current) {
            replayArmedRef.current = true;
            setShowReplay(true);
            nextGlitchRef.current = now + 4500;
          }
        }

        if (phase === 'orb') {
          const t = clamp(elapsed / DUR.orb);
          const colorway = calculateColorway(t);
          const frameIdx = Math.min(
            FRAME_COUNT - 1,
            Math.floor(clamp(colorway.localT) * FRAME_COUNT),
          );
          const endGlitch = smoothstep(clamp((t - 0.82) / 0.18));
          const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
          const zoom = 1.04 + 0.06 * Math.sin(t * Math.PI * 2) + endGlitch * 0.22;
          const rgbAmt = endGlitch * 14;

          sceneCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          paintOrbFrame(
            sceneCtx,
            viewW,
            viewH,
            layersPack?.[frameIdx],
            colorway.bgVal,
            colorway.vectorVal,
            zoom,
            0.08 + endGlitch * 0.9,
            true,
            rgbAmt,
            pulse,
          );

          blitSceneToMain(
            mainCtx,
            scene,
            viewW,
            viewH,
            dpr,
            0.35 + endGlitch * 0.4,
            32 + endGlitch * 16,
            0.8 + endGlitch * 0.15,
            0.25 + pulse * 0.2,
            now,
            0.12 + endGlitch,
            0,
            0,
            endGlitch * 0.2,
          );
        } else if (phase === 'reveal') {
          const raw = clamp(elapsed / DUR.reveal);
          const t = easeOutCubic(raw);
          const flashPeak = Math.exp(-Math.pow((raw - 0.16) * 18, 2));
          const burnAmt =
            Math.exp(-Math.pow((raw - 0.18) * 9, 2)) * 0.95 +
            (1 - smoothstep(clamp((raw - 0.1) / 0.45))) * 0.25;
          const orbZoom = lerp(1.12, 3.6, easeInOutCubic(clamp(raw / 0.7)));
          const rgbAmt = lerp(16, 0, smoothstep(clamp((raw - 0.35) / 0.5)));
          const fillBg = raw < 0.2;
          const orbFade = 1 - smoothstep(clamp((raw - 0.32) / 0.45));
          const heroIn = smoothstep(clamp((raw - 0.12) / 0.5));
          const shockT = clamp((raw - 0.16) / 0.42);
          const lastIdx = FRAME_COUNT - 1;
          const stutter =
            raw < 0.22 ? lastIdx - ((Math.random() * 7 * (1 - raw / 0.22)) | 0) : lastIdx;
          const frameIdx = Math.max(0, stutter);

          // scene = orb under + hero over
          sceneCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          if (orbFade > 0.02) {
            paintOrbFrame(
              sceneCtx,
              viewW,
              viewH,
              layersPack?.[frameIdx],
              fillBg ? lerp(255, 0, clamp(raw / 0.2)) : 0,
              fillBg ? lerp(0, 255, clamp(raw / 0.2)) : 255,
              orbZoom,
              0.55 * (1 - raw) + 0.15,
              fillBg,
              Math.max(4, rgbAmt),
              1,
            );
            if (!fillBg) {
              // keep black under when orb is screen-fading
              sceneCtx.globalAlpha = 1;
            }
          } else {
            sceneCtx.fillStyle = '#000';
            sceneCtx.fillRect(0, 0, viewW, viewH);
          }

          if (heroIn > 0.01 && heroRef.current) {
            sceneCtx.save();
            sceneCtx.globalAlpha = heroIn;
            if (orbFade > 0.2) sceneCtx.globalCompositeOperation = 'screen';
            else sceneCtx.globalCompositeOperation = 'source-over';
            sceneCtx.filter = `brightness(${0.75 + 0.4 * heroIn + flashPeak * 0.8}) contrast(${1.05 + flashPeak * 0.4})`;
            drawHeroWithCA(
              sceneCtx,
              heroRef.current,
              viewW,
              viewH,
              heroSizeRef.current.w,
              heroSizeRef.current.h,
              lerp(1.22, 1.08, t),
              px * 10,
              py * 8,
              rgbAmt * 0.55,
              1,
            );
            sceneCtx.filter = 'none';
            sceneCtx.restore();
          }

          if (!burstDoneRef.current && raw > 0.14) {
            burstDoneRef.current = true;
            embersRef.current.push(...spawnBurst(viewW * 0.5, viewH * 0.4, 100, 1.7));
          }

          blitSceneToMain(
            mainCtx,
            scene,
            viewW,
            viewH,
            dpr,
            0.35 + 0.7 * flashPeak + 0.45 * heroIn,
            40,
            0.7 + 0.25 * t,
            0.4 + flashPeak,
            now,
            (1 - raw) * 0.85,
            shockT,
            flashPeak,
            burnAmt,
          );
        } else if (phase === 'alive') {
          const breath = 0.5 + 0.5 * Math.sin(now * 0.00115);
          const scale = 1.06 + 0.02 * easeSineInOut(breath);
          const glowPulse = 0.5 + 0.5 * Math.sin(now * 0.0018);

          if (now > nextGlitchRef.current) {
            glitchUntilRef.current = now + 70 + Math.random() * 140;
            nextGlitchRef.current = now + 1800 + Math.random() * 3200;
          }
          const ticking = now < glitchUntilRef.current;
          const tickAmt = ticking ? 0.7 + Math.random() * 0.3 : 0;
          const jx = ticking ? (Math.random() - 0.5) * 10 : 0;

          compositeHeroScene(
            sceneCtx,
            viewW,
            viewH,
            dpr,
            scale,
            px * 12 + jx,
            py * 9,
            tickAmt * 4,
            1,
            1 + 0.05 * glowPulse + tickAmt * 0.08,
          );

          if (Math.random() < 0.045) {
            embersRef.current.push(spawnIdle(viewW, viewH));
          }

          blitSceneToMain(
            mainCtx,
            scene,
            viewW,
            viewH,
            dpr,
            0.55 + 0.28 * glowPulse,
            26 + tickAmt * 10,
            0.9 + 0.06 * glowPulse,
            0.45 + 0.35 * glowPulse,
            now,
            tickAmt,
            0,
            0,
            0,
          );
        }
      } finally {
        if (!hiddenRef.current) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          rafRef.current = 0;
        }
      }
    };

    const onVis = () => {
      const now = performance.now();
      if (document.hidden) {
        hiddenRef.current = true;
        lastTsRef.current = now;
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
      } else {
        const pausedFor = now - lastTsRef.current;
        phaseStartRef.current += pausedFor;
        nextGlitchRef.current += pausedFor;
        glitchUntilRef.current += pausedFor;
        hiddenRef.current = false;
        if (!rafRef.current) rafRef.current = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      document.removeEventListener('visibilitychange', onVis);
      mq.removeEventListener('change', onMq);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('resize', resize);
    };
  }, [ready, restart]);

  return (
    <div className="demon-root" style={{ background: BG }}>
      <canvas ref={mainRef} className="main-canvas" aria-label="Demonic figure stage" />

      {!ready && !loadError && <div className="boot-msg">Loading</div>}
      {loadError && <div className="boot-msg">{loadError}</div>}

      {showReplay && (
        <button type="button" className="replay-btn" onClick={restart}>
          Replay
        </button>
      )}
    </div>
  );
}
