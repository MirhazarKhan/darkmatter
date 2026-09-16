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

type Phase = 'boot' | 'orb' | 'reveal' | 'alive' | 'static';

const BG = '#000000';
const VIEW_W = 168.81;
const VIEW_H = 300;
const SVG_URL = '/demon-detailed.svg';

const DUR = {
  orb: 3400,
  reveal: 2400,
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

function pad3(n: number): string {
  if (n < 10) return `00${n}`;
  if (n < 100) return `0${n}`;
  return String(n);
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
  dpr: number,
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
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (fillBg) {
    ctx.fillStyle = rgbGray(bgVal);
    ctx.fillRect(0, 0, viewW, viewH);
  } else {
    ctx.clearRect(0, 0, viewW, viewH);
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

function drawShockwave(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
) {
  if (t <= 0 || t >= 1) return;
  const r = lerp(20, Math.max(cx, cy) * 2.4, easeOutCubic(t));
  const a = (1 - t) * 0.85;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = rgba(255, 245, 230, a);
  ctx.lineWidth = lerp(18, 2, t);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(255, 70, 40, a * 0.45);
  ctx.lineWidth = lerp(8, 1, t);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawTearBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amount: number,
) {
  if (amount < 0.04) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const n = 2 + ((amount * 9) | 0);
  for (let i = 0; i < n; i++) {
    const y = Math.random() * h;
    const hh = 1 + Math.random() * 12;
    ctx.fillStyle = rgba(255, 255, 255, 0.08 + Math.random() * 0.22 * amount);
    ctx.fillRect(0, y, w, hh);
  }
  ctx.restore();
}

export function DemonStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const bloomRef = useRef<HTMLDivElement>(null);
  const rgbRRef = useRef<HTMLDivElement>(null);
  const rgbBRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const burnRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const shockRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const scanRef = useRef<HTMLDivElement>(null);

  const phaseRef = useRef<Phase>('boot');
  const phaseStartRef = useRef(0);
  const rafRef = useRef(0);
  const hiddenRef = useRef(false);
  const reducedRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const parallaxRef = useRef({ x: 0, y: 0 });
  const layersRef = useRef<FrameLayer[][] | null>(null);
  const embersRef = useRef<Ember[]>([]);
  const lastTsRef = useRef(0);
  const nextGlitchRef = useRef(0);
  const glitchUntilRef = useRef(0);
  const grainTickRef = useRef(0);
  const burstDoneRef = useRef(false);
  const viewRef = useRef({ w: 0, h: 0, dpr: 1 });
  const replayArmedRef = useRef(false);
  const grainPaintRef = useRef<(n: number) => void>(() => {});

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
    const orb = orbRef.current;
    if (orb) {
      orb.style.opacity = '1';
      orb.style.mixBlendMode = 'normal';
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const reduced = prefersReducedMotion();
        const skipFrames =
          reduced || new URLSearchParams(window.location.search).get('phase') === 'alive';
        const svgPromise = fetch(SVG_URL).then((res) => {
          if (!res.ok) throw new Error(`Failed to load ${SVG_URL}: ${res.status}`);
          return res.text();
        });

        const framesPromise = skipFrames
          ? Promise.resolve<FrameLayer[][] | null>(null)
          : loadFramesPack().then((pack) => parseAllFrames(pack.markups));

        const [markupRaw, layers] = await Promise.all([svgPromise, framesPromise]);
        if (cancelled) return;

        let markup = markupRaw.replace(
          /<svg\b([^>]*)>/,
          (_m, attrs: string) => {
            let a = attrs
              .replace(/\s(width|height)="[^"]*"/g, '')
              .replace(/\sclass="[^"]*"/g, '')
              .replace(/\spreserveAspectRatio="[^"]*"/g, '');
            if (!/viewBox=/.test(a)) a += ` viewBox="0 0 ${VIEW_W} ${VIEW_H}"`;
            return `<svg class="hero-svg"${a} width="100%" height="100%" preserveAspectRatio="xMidYMin slice">`;
          },
        );
        if (heroRef.current) heroRef.current.innerHTML = markup;
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
    };
  }, []);

  useEffect(() => {
    const canvas = grainRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const paintNoise = (alphaBase: number) => {
      const w = Math.max(1, Math.floor(window.innerWidth / 2));
      const h = Math.max(1, Math.floor(window.innerHeight / 2));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
      }
      const img = ctx.createImageData(w, h);
      const data = img.data;
      const a = alphaBase | 0;
      for (let i = 0; i < data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = a;
      }
      ctx.putImageData(img, 0, 0);
    };

    paintNoise(28);
    grainPaintRef.current = paintNoise;
    const onResize = () => paintNoise(28);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!ready) return;

    reducedRef.current = prefersReducedMotion();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(window.innerWidth));
      const h = Math.max(1, Math.floor(window.innerHeight));
      viewRef.current = { w, h, dpr };
      const orb = orbRef.current;
      const fx = fxRef.current;
      if (orb) {
        orb.width = Math.floor(w * dpr);
        orb.height = Math.floor(h * dpr);
        orb.style.width = `${w}px`;
        orb.style.height = `${h}px`;
      }
      if (fx) {
        fx.width = Math.floor(w * dpr);
        fx.height = Math.floor(h * dpr);
        fx.style.width = `${w}px`;
        fx.style.height = `${h}px`;
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

    const frame = (now: number) => {
      if (hiddenRef.current) {
        rafRef.current = 0;
        return;
      }

      try {
      const dt = lastTsRef.current ? Math.min(48, now - lastTsRef.current) : 16;
      lastTsRef.current = now;

      const hero = heroRef.current;
      const far = farRef.current;
      const mid = midRef.current;
      const bloom = bloomRef.current;
      const stage = stageRef.current;
      const vignette = vignetteRef.current;
      const orbCanvas = orbRef.current;
      const fxCanvas = fxRef.current;
      const burn = burnRef.current;
      const flash = flashRef.current;
      const shock = shockRef.current;
      const hud = hudRef.current;
      const rgbR = rgbRRef.current;
      const rgbB = rgbBRef.current;
      const scan = scanRef.current;
      if (!hero || !far || !mid || !bloom || !stage || !orbCanvas || !fxCanvas) return;

      const orbCtx = orbCanvas.getContext('2d', { alpha: true, desynchronized: true });
      const fxCtx = fxCanvas.getContext('2d', { alpha: true, desynchronized: true });
      if (!orbCtx || !fxCtx) return;

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

      fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fxCtx.clearRect(0, 0, viewW, viewH);

      const applyHeroCover = (
        opacity: number,
        extraScale: number,
        clip: string | null,
        filter: string,
        rgbAmt: number,
      ) => {
        hero.style.opacity = String(opacity);
        hero.style.clipPath = clip ?? 'none';
        hero.style.filter = filter;
        hero.style.transform = `translate(${px * 10}px, ${py * 8}px) scale(${extraScale})`;
        far.style.transform = `translate(${px * -16}px, ${py * -12}px) scale(${1.18 * extraScale})`;
        mid.style.transform = `translate(${px * -8}px, ${py * -6}px) scale(${1.1 * extraScale})`;
        if (rgbR) {
          rgbR.style.opacity = String(rgbAmt * 0.16);
          rgbR.style.transform = `translate(${-4 - rgbAmt * 8 + px * 8}px, ${py * 6}px) scale(${extraScale})`;
        }
        if (rgbB) {
          rgbB.style.opacity = String(rgbAmt * 0.16);
          rgbB.style.transform = `translate(${4 + rgbAmt * 8 + px * 8}px, ${py * 6}px) scale(${extraScale})`;
        }
      };

      if (phaseRef.current === 'static') {
        orbCanvas.style.opacity = '0';
        bloom.style.opacity = '0.58';
        bloom.style.transform = 'translate(-50%, -50%) scale(1.05)';
        applyHeroCover(1, 1.06, null, 'contrast(1.08) brightness(1.02)', 0);
        far.style.opacity = '0.42';
        mid.style.opacity = '0.5';
        stage.style.transform = 'none';
        if (vignette) vignette.style.opacity = '1';
        if (burn) burn.style.opacity = '0';
        if (flash) flash.style.opacity = '0';
        if (hud) hud.style.opacity = '0';
        if (scan) scan.style.opacity = '0.16';
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

      stage.style.transform = `translate(${px * 6}px, ${py * 5}px)`;

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

        orbCanvas.style.opacity = '1';
        orbCanvas.style.mixBlendMode = 'normal';
        paintOrbFrame(
          orbCtx,
          dpr,
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

        applyHeroCover(0, 1.2, 'circle(0% at 50% 38%)', 'none', endGlitch);
        bloom.style.opacity = String(0.12 + 0.25 * pulse + endGlitch * 0.3);
        bloom.style.transform = `translate(-50%, -50%) scale(${0.7 + 0.5 * pulse})`;
        far.style.opacity = '0';
        mid.style.opacity = '0';
        if (burn) burn.style.opacity = String(endGlitch * 0.25);
        if (flash) flash.style.opacity = '0';
        if (shock) {
          shock.style.opacity = '0';
          shock.style.transform = 'translate(-50%, -50%) scale(0.2)';
        }
        if (vignette) vignette.style.opacity = String(0.75 + endGlitch * 0.15);
        if (hud) {
          hud.style.opacity = String(0.7);
          hud.textContent = `GLITCH ORB  ·  FRAME ${pad3(frameIdx + 1)} / ${FRAME_COUNT}`;
        }
        if (scan) scan.style.opacity = String(0.32 + endGlitch * 0.2);

        grainTickRef.current += 1;
        if (grainTickRef.current % 3 === 0) grainPaintRef.current(32 + endGlitch * 20);

        drawTearBars(fxCtx, viewW, viewH, 0.12 + endGlitch);
      } else if (phase === 'reveal') {
        const raw = clamp(elapsed / DUR.reveal);
        const t = easeOutCubic(raw);
        const flashPeak = Math.exp(-Math.pow((raw - 0.16) * 18, 2));
        const burnAmt =
          Math.exp(-Math.pow((raw - 0.18) * 9, 2)) * 0.95 +
          (1 - smoothstep(clamp((raw - 0.1) / 0.45))) * 0.25;
        const zoom = lerp(1.12, 3.6, easeInOutCubic(clamp(raw / 0.7)));
        const rgbAmt = lerp(16, 0, smoothstep(clamp((raw - 0.35) / 0.5)));
        const fillBg = raw < 0.2;
        const orbFade = 1 - smoothstep(clamp((raw - 0.38) / 0.5));
        const heroIn = smoothstep(clamp((raw - 0.14) / 0.55));
        const radius = 6 + 140 * easeInOutCubic(clamp((raw - 0.1) / 0.6));
        const shockT = clamp((raw - 0.16) / 0.42);
        const lastIdx = FRAME_COUNT - 1;
        const stutter =
          raw < 0.22 ? lastIdx - ((Math.random() * 7 * (1 - raw / 0.22)) | 0) : lastIdx;
        const frameIdx = Math.max(0, stutter);

        orbCanvas.style.mixBlendMode = raw < 0.22 ? 'normal' : 'screen';
        orbCanvas.style.opacity = String(orbFade);
        paintOrbFrame(
          orbCtx,
          dpr,
          viewW,
          viewH,
          layersPack?.[frameIdx],
          fillBg ? lerp(255, 0, clamp(raw / 0.2)) : 0,
          fillBg ? lerp(0, 255, clamp(raw / 0.2)) : 255,
          zoom,
          0.55 * (1 - raw) + 0.15,
          fillBg,
          Math.max(4, rgbAmt),
          1,
        );

        applyHeroCover(
          heroIn,
          lerp(1.22, 1.06, t),
          `circle(${radius}% at 50% 36%)`,
          `brightness(${0.75 + 0.4 * heroIn + flashPeak * 0.8}) contrast(${1.05 + flashPeak * 0.4})`,
          rgbAmt / 16,
        );

        bloom.style.opacity = String(
          0.2 + 0.7 * flashPeak + 0.5 * smoothstep(clamp((raw - 0.2) / 0.4)),
        );
        bloom.style.transform = `translate(-50%, -50%) scale(${0.8 + 0.7 * t})`;
        far.style.opacity = String(smoothstep(clamp((raw - 0.12) / 0.45)) * 0.45);
        mid.style.opacity = String(smoothstep(clamp((raw - 0.2) / 0.5)) * 0.55);

        if (flash) flash.style.opacity = String(flashPeak);
        if (burn) {
          burn.style.opacity = String(burnAmt);
          burn.style.transform = `scale(${1 + t * 0.6})`;
        }
        if (shock) {
          shock.style.opacity = String((1 - shockT) * (raw > 0.15 ? 1 : 0) * 0.9);
          shock.style.borderColor = `rgba(255,245,230,${(1 - shockT).toFixed(3)})`;
          shock.style.boxShadow = `0 0 ${40 + shockT * 80}px rgba(255,240,220,${(0.45 * (1 - shockT)).toFixed(3)})`;
          shock.style.transform = `translate(-50%, -50%) scale(${lerp(0.2, 78, easeOutCubic(shockT))})`;
        }
        if (vignette) vignette.style.opacity = String(0.65 + 0.3 * t);
        if (hud) hud.style.opacity = String(1 - smoothstep(raw * 1.6));
        if (scan) scan.style.opacity = String(0.4 * (1 - t) + 0.18);

        if (!burstDoneRef.current && raw > 0.14) {
          burstDoneRef.current = true;
          embersRef.current.push(...spawnBurst(viewW * 0.5, viewH * 0.4, 90, 1.6));
        }

        drawShockwave(fxCtx, viewW * 0.5, viewH * 0.4, shockT);
        drawTearBars(fxCtx, viewW, viewH, (1 - raw) * 0.7);
        grainTickRef.current += 1;
        if (grainTickRef.current % 2 === 0) grainPaintRef.current(40);
      } else if (phase === 'alive') {
        const breath = 0.5 + 0.5 * Math.sin(now * 0.00115);
        const scale = 1.05 + 0.018 * easeSineInOut(breath);
        const glowPulse = 0.5 + 0.5 * Math.sin(now * 0.0018);
        const smokePulse = 0.34 + 0.14 * Math.sin(now * 0.0009);

        if (now > nextGlitchRef.current) {
          glitchUntilRef.current = now + 70 + Math.random() * 140;
          nextGlitchRef.current = now + 1800 + Math.random() * 3200;
        }
        const ticking = now < glitchUntilRef.current;
        const tickAmt = ticking ? 0.7 + Math.random() * 0.3 : 0;

        orbCanvas.style.opacity = '0';
        orbCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        orbCtx.clearRect(0, 0, viewW, viewH);

        const dx = ticking ? 3 + Math.random() * 5 : 0;
        applyHeroCover(
          1,
          scale,
          null,
          `brightness(${1 + 0.05 * glowPulse + tickAmt * 0.08}) contrast(1.08)` +
            (ticking
              ? ` drop-shadow(${dx}px 0 0 rgba(255,40,70,0.45)) drop-shadow(${-dx}px 0 0 rgba(40,220,255,0.45))`
              : ''),
          tickAmt * 0.25,
        );
        if (ticking) {
          hero.style.transform += ` translateX(${(Math.random() - 0.5) * 10}px)`;
        }

        bloom.style.opacity = String(0.48 + 0.22 * glowPulse);
        bloom.style.transform = `translate(-50%, -50%) scale(${1.05 + 0.12 * glowPulse})`;
        far.style.opacity = String(smokePulse);
        mid.style.opacity = String(0.44 + 0.12 * glowPulse);
        if (burn) burn.style.opacity = '0';
        if (flash) flash.style.opacity = '0';
        if (shock) shock.style.opacity = '0';
        if (vignette) vignette.style.opacity = String(0.92 + 0.06 * glowPulse);
        if (hud) hud.style.opacity = '0';
        if (scan) scan.style.opacity = String(0.18 + tickAmt * 0.12);

        if (Math.random() < 0.04) embersRef.current.push(spawnIdle(viewW, viewH));
        if (ticking) drawTearBars(fxCtx, viewW, viewH, tickAmt);

        grainTickRef.current += 1;
        if (grainTickRef.current % 4 === 0) grainPaintRef.current(26);
      }

      tickEmbers(embersRef.current, dt);
      drawEmbers(fxCtx, embersRef.current);
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

  const plateStyle = {
    backgroundImage: `url(${SVG_URL})`,
  } as const;

  return (
    <div className="demon-root" style={{ background: BG }}>
      <canvas ref={orbRef} className="orb-canvas" aria-hidden />

      <div className="demon-stage" ref={stageRef}>
        <div ref={farRef} className="depth-layer depth-far" style={plateStyle} aria-hidden />
        <div ref={midRef} className="depth-layer depth-mid" style={plateStyle} aria-hidden />
        <div ref={bloomRef} className="soft-bloom" aria-hidden />
        <div ref={heroRef} className="hero-frame" role="img" aria-label="Detailed demonic figure" />
        <div ref={rgbRRef} className="rgb-plate rgb-r" style={plateStyle} aria-hidden />
        <div ref={rgbBRef} className="rgb-plate rgb-b" style={plateStyle} aria-hidden />
      </div>

      <canvas ref={fxRef} className="fx-canvas" aria-hidden />
      <div ref={shockRef} className="shockwave" aria-hidden />
      <div ref={burnRef} className="film-burn" aria-hidden />
      <div ref={flashRef} className="flash" aria-hidden />
      <div ref={scanRef} className="scanlines" aria-hidden />
      <div ref={vignetteRef} className="vignette" aria-hidden />
      <canvas ref={grainRef} className="grain" aria-hidden />
      <div ref={hudRef} className="cine-hud" aria-hidden />

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
