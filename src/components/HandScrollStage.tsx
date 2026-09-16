import { useEffect, useRef, useState } from 'react';
import { coverFit } from '../lib/geom';
import {
  HAND_FRAME_COUNT,
  HAND_FRAME_H,
  HAND_FRAME_W,
  HAND_TRACE_SCALE,
  loadHandFramesPack,
  parseAllHandFrames,
  type HandFrameLayer,
} from '../lib/handFrames';

const BG = '#000000';
/** Scroll runway multiplier — pin section height as N × viewport. */
const RUNWAY_VH = 3.2;

function clamp(n: number, a = 0, b = 1) {
  return Math.min(b, Math.max(a, n));
}

function paintHandFrame(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  layers: HandFrameLayer[] | undefined,
) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, viewW, viewH);

  if (!layers?.length) return;

  const fit = coverFit(viewW, viewH, HAND_FRAME_W, HAND_FRAME_H);
  ctx.save();
  ctx.translate(fit.ox, fit.oy);
  ctx.scale(fit.scale, fit.scale);
  // Potrace Y-up → canvas Y-down
  ctx.translate(0, HAND_FRAME_H);
  ctx.scale(HAND_TRACE_SCALE, -HAND_TRACE_SCALE);

  for (const layer of layers) {
    ctx.fillStyle = layer.fill || '#e8e8e2';
    for (const p of layer.paths) {
      ctx.fill(p, 'evenodd');
    }
  }
  ctx.restore();
}

export function HandScrollStage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layersRef = useRef<HandFrameLayer[][] | null>(null);
  const frameIdxRef = useRef(0);
  const viewRef = useRef({ w: 0, h: 0, dpr: 1 });
  const visibleRef = useRef(true);
  const rafRef = useRef(0);
  const dirtyRef = useRef(true);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadHandFramesPack()
      .then(({ markups }) => {
        if (cancelled) return;
        layersRef.current = parseAllHandFrames(markups);
        setReady(true);
        dirtyRef.current = true;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load hand frames');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    const canvas = canvasRef.current;
    const sticky = stickyRef.current;
    const root = rootRef.current;
    if (!canvas || !sticky || !root) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = sticky.clientWidth || window.innerWidth;
      const h = sticky.clientHeight || window.innerHeight;
      viewRef.current = { w, h, dpr };
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirtyRef.current = true;
    };

    const progressFromScroll = () => {
      const rect = root.getBoundingClientRect();
      const total = root.offsetHeight - window.innerHeight;
      if (total <= 1) return 0;
      // When sticky pins, root.top goes from 0 → -(height - vh)
      const scrolled = -rect.top;
      return clamp(scrolled / total);
    };

    const syncFrame = () => {
      const p = progressFromScroll();
      const n = layersRef.current?.length || HAND_FRAME_COUNT;
      const idx = Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))));
      if (idx !== frameIdxRef.current) {
        frameIdxRef.current = idx;
        dirtyRef.current = true;
      }
    };

    const draw = () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      const { w, h } = viewRef.current;
      const layers = layersRef.current?.[frameIdxRef.current];
      paintHandFrame(ctx, w, h, layers);
    };

    const tick = () => {
      rafRef.current = 0;
      if (!visibleRef.current) return;
      syncFrame();
      draw();
    };

    const requestTick = () => {
      if (rafRef.current || !visibleRef.current) return;
      rafRef.current = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      dirtyRef.current = true;
      requestTick();
    };

    const onVis = () => {
      if (document.hidden) {
        visibleRef.current = false;
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
      } else {
        visibleRef.current = true;
        dirtyRef.current = true;
        requestTick();
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        visibleRef.current = hit && !document.hidden;
        if (visibleRef.current) {
          dirtyRef.current = true;
          requestTick();
        } else if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
      },
      { threshold: 0.01 },
    );
    io.observe(root);

    resize();
    syncFrame();
    draw();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [ready]);

  return (
    <section
      ref={rootRef}
      className="hand-scroll-root"
      style={{ height: `${RUNWAY_VH * 100}vh` }}
      aria-label="Hand rising scroll stage"
    >
      <div ref={stickyRef} className="hand-scroll-sticky" style={{ background: BG }}>
        <canvas ref={canvasRef} className="hand-scroll-canvas" />
        {!ready && !loadError && <div className="boot-msg">Loading</div>}
        {loadError && <div className="boot-msg">{loadError}</div>}
      </div>
    </section>
  );
}
