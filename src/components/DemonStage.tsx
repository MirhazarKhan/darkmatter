import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BG,
  VIEW_H,
  VIEW_W,
  getMorphBank,
  getStaticFigurePaths,
  samplePath,
  type MorphBank,
} from '../lib/morph';
import { easeInOutCubic, easeOutBack, easeSineInOut, smoothstep } from '../lib/easing';

type Phase =
  | 'boot'
  | 'breathe'
  | 'orbToGlow'
  | 'reveal'
  | 'alive'
  | 'hold'
  | 'toOrb'
  | 'static';

const DUR = {
  breathe: 2200,
  orbToGlow: 1400,
  reveal: 1100,
  aliveCycle: 3200,
  hold: 2800,
  toOrb: 900,
} as const;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function fillPath(
  ctx: CanvasRenderingContext2D,
  d: string,
  fill: string,
  alpha = 1,
) {
  if (!d || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
  ctx.fillStyle = fill;
  ctx.fill(new Path2D(d));
  ctx.restore();
}

function containLayout(cw: number, ch: number) {
  const scale = Math.min(cw / VIEW_W, ch / VIEW_H);
  const drawW = VIEW_W * scale;
  const drawH = VIEW_H * scale;
  return { scale, ox: (cw - drawW) / 2, oy: (ch - drawH) / 2 };
}

export function DemonStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bankRef = useRef<MorphBank | null>(null);
  const phaseRef = useRef<Phase>('boot');
  const phaseStartRef = useRef(0);
  const aliveDirRef = useRef<1 | -1>(1);
  const aliveCycleStartRef = useRef(0);
  const rafRef = useRef(0);
  const hiddenRef = useRef(false);
  const reducedRef = useRef(false);
  const [showReplay, setShowReplay] = useState(false);

  const restart = useCallback(() => {
    if (reducedRef.current) return;
    phaseRef.current = 'breathe';
    phaseStartRef.current = performance.now();
    aliveDirRef.current = 1;
    setShowReplay(false);
  }, []);

  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    try {
      bankRef.current = getMorphBank();
    } catch (err) {
      console.error('Morph bank init failed', err);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const applySize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    applySize();
    window.addEventListener('resize', applySize);

    const onVis = () => {
      hiddenRef.current = document.hidden;
      if (!document.hidden) {
        const n = performance.now();
        phaseStartRef.current = n;
        aliveCycleStartRef.current = n;
      }
    };
    document.addEventListener('visibilitychange', onVis);

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

    if (reducedRef.current) {
      phaseRef.current = 'static';
    } else {
      phaseRef.current = 'breathe';
      phaseStartRef.current = performance.now();
    }

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      if (hiddenRef.current) return;

      const cw = window.innerWidth;
      const ch = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, cw, ch);

      const { scale, ox, oy } = containLayout(cw, ch);

      if (phaseRef.current === 'static' || !bankRef.current) {
        const s = getStaticFigurePaths();
        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(scale, scale);
        fillPath(ctx, s.smoke, s.fills.smoke);
        fillPath(ctx, s.glow, s.fills.glowCore);
        fillPath(ctx, s.figure, s.fills.figure);
        fillPath(ctx, s.eye, s.fills.eye);
        ctx.restore();
        return;
      }

      const bank = bankRef.current;
      let phase = phaseRef.current;
      let elapsed = now - phaseStartRef.current;

      if (phase === 'breathe' && elapsed >= DUR.breathe) {
        phase = 'orbToGlow';
        phaseRef.current = phase;
        phaseStartRef.current = now;
        elapsed = 0;
      } else if (phase === 'orbToGlow' && elapsed >= DUR.orbToGlow) {
        phase = 'reveal';
        phaseRef.current = phase;
        phaseStartRef.current = now;
        elapsed = 0;
      } else if (phase === 'reveal' && elapsed >= DUR.reveal) {
        phase = 'alive';
        phaseRef.current = phase;
        phaseStartRef.current = now;
        aliveCycleStartRef.current = now;
        aliveDirRef.current = 1;
        elapsed = 0;
        setShowReplay(true);
      } else if (phase === 'hold' && elapsed >= DUR.hold) {
        phase = 'toOrb';
        phaseRef.current = phase;
        phaseStartRef.current = now;
        elapsed = 0;
        setShowReplay(false);
      } else if (phase === 'toOrb' && elapsed >= DUR.toOrb) {
        phase = 'breathe';
        phaseRef.current = phase;
        phaseStartRef.current = now;
        elapsed = 0;
      }

      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);

      if (phase === 'breathe') {
        const t = (elapsed % DUR.breathe) / DUR.breathe;
        const pulse = 0.92 + 0.08 * Math.sin(t * Math.PI * 2);
        const breathAlpha =
          0.85 + 0.15 * easeSineInOut((Math.sin(t * Math.PI * 2) + 1) / 2);
        ctx.translate(VIEW_W / 2, VIEW_H * 0.42);
        ctx.scale(pulse, pulse);
        ctx.translate(-VIEW_W / 2, -VIEW_H * 0.42);
        fillPath(ctx, bank.orbD, bank.fills.orb, breathAlpha);
      } else if (phase === 'orbToGlow') {
        const raw = elapsed / DUR.orbToGlow;
        const t = easeInOutCubic(raw);
        const grow = 1 + 0.06 * easeOutBack(Math.min(1, raw * 1.2));
        ctx.translate(VIEW_W / 2, VIEW_H * 0.42);
        ctx.scale(grow, grow);
        ctx.translate(-VIEW_W / 2, -VIEW_H * 0.42);
        const d = samplePath(bank.orbToGlow, t);
        const fill = t < 0.45 ? bank.fills.orb : bank.fills.glowCore;
        fillPath(ctx, d, fill, 1);
      } else if (phase === 'reveal') {
        const raw = elapsed / DUR.reveal;
        const smokeA = smoothstep(raw);
        const glowA = Math.min(1, smoothstep(raw) * 1.15);
        const figA = smoothstep(Math.max(0, (raw - 0.15) / 0.7));
        const eyeA = smoothstep(Math.max(0, (raw - 0.45) / 0.4));
        fillPath(ctx, bank.smokeA, bank.fills.smoke, smokeA);
        fillPath(ctx, bank.glowCoreD, bank.fills.glowCore, glowA);
        fillPath(ctx, bank.figureD, bank.fills.figure, figA);
        fillPath(ctx, bank.eyeD, bank.fills.eye, eyeA);
      } else if (phase === 'alive' || phase === 'hold') {
        const cycleElapsed = now - aliveCycleStartRef.current;
        const half = DUR.aliveCycle / 2;
        if (cycleElapsed >= half) {
          aliveDirRef.current = aliveDirRef.current === 1 ? -1 : 1;
          aliveCycleStartRef.current = now;
        }
        const local = Math.min(1, (now - aliveCycleStartRef.current) / half);
        const eased = easeInOutCubic(local);
        const smokeSamples =
          aliveDirRef.current === 1 ? bank.smokeAB : bank.smokeBA;
        const smokeD = samplePath(smokeSamples, eased);

        const glowPulse =
          0.88 + 0.12 * Math.sin(now * 0.004) * Math.sin(now * 0.0027);
        const flickerSeed = Math.sin(now * 0.031) * Math.sin(now * 0.017);
        const eyeAlpha =
          flickerSeed > 0.92 ? 0.15 : flickerSeed > 0.85 ? 0.55 : 1;

        fillPath(ctx, smokeD, bank.fills.smoke, 1);
        ctx.save();
        ctx.translate(VIEW_W / 2, VIEW_H * 0.35);
        ctx.scale(glowPulse, glowPulse);
        ctx.translate(-VIEW_W / 2, -VIEW_H * 0.35);
        fillPath(ctx, bank.glowCoreD, bank.fills.glowCore, 1);
        ctx.restore();
        fillPath(ctx, bank.figureD, bank.fills.figure, 1);
        fillPath(ctx, bank.eyeD, bank.fills.eye, eyeAlpha);

        if (phase === 'alive') {
          const aliveElapsed = now - phaseStartRef.current;
          if (aliveElapsed >= DUR.aliveCycle * 2.2) {
            phaseRef.current = 'hold';
            phaseStartRef.current = now;
          }
        }
      } else if (phase === 'toOrb') {
        const raw = elapsed / DUR.toOrb;
        const t = easeInOutCubic(raw);
        const fade = 1 - t;
        fillPath(ctx, bank.smokeA, bank.fills.smoke, fade * 0.6);
        fillPath(ctx, bank.glowCoreD, bank.fills.glowCore, fade);
        fillPath(ctx, bank.figureD, bank.fills.figure, fade);
        fillPath(ctx, bank.eyeD, bank.fills.eye, fade);
        const shrink = 1 - 0.35 * t;
        ctx.save();
        ctx.translate(VIEW_W / 2, VIEW_H * 0.42);
        ctx.scale(shrink, shrink);
        ctx.translate(-VIEW_W / 2, -VIEW_H * 0.42);
        const back = samplePath(bank.orbToGlow, 1 - t);
        fillPath(
          ctx,
          back,
          t > 0.5 ? bank.fills.orb : bank.fills.glowCore,
          Math.min(1, t * 1.4),
        );
        ctx.restore();
      }

      ctx.restore();
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', applySize);
      document.removeEventListener('visibilitychange', onVis);
      mq.removeEventListener('change', onMq);
    };
  }, [restart]);

  return (
    <div className="demon-root">
      <canvas
        ref={canvasRef}
        className="demon-canvas"
        aria-label="Demonic morph VFX"
      />
      {showReplay && (
        <button type="button" className="replay-btn" onClick={restart}>
          Replay
        </button>
      )}
    </div>
  );
}
