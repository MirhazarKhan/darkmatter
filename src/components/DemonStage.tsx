import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { easeInOutCubic, easeOutCubic, easeSineInOut, smoothstep } from '../lib/easing';

type Phase = 'boot' | 'orb' | 'reveal' | 'alive' | 'static';

const BG = '#0d0e0f';
const VIEW_W = 168.81;
const VIEW_H = 300;
const SVG_URL = '/demon-detailed.svg';

const DUR = {
  orb: 2400,
  reveal: 2200,
  settle: 800,
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

export function DemonStage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const bloomRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLCanvasElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const phaseRef = useRef<Phase>('boot');
  const phaseStartRef = useRef(0);
  const rafRef = useRef(0);
  const hiddenRef = useRef(false);
  const reducedRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const parallaxRef = useRef({ x: 0, y: 0 });
  const svgMarkupRef = useRef<string | null>(null);

  const [showReplay, setShowReplay] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const restart = useCallback(() => {
    if (reducedRef.current) return;
    phaseRef.current = 'orb';
    phaseStartRef.current = performance.now();
    setShowReplay(false);
  }, []);

  // Load detailed SVG once and inject into hero (inline for crisp control)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(SVG_URL);
        if (!res.ok) throw new Error(`Failed to load ${SVG_URL}: ${res.status}`);
        let markup = await res.text();
        // Ensure root svg fills container
        markup = markup.replace(
          /<svg\b([^>]*)>/,
          (_m, attrs: string) => {
            let a = attrs
              .replace(/\s(width|height)="[^"]*"/g, '')
              .replace(/\sclass="[^"]*"/g, '');
            if (!/viewBox=/.test(a)) a += ` viewBox="0 0 ${VIEW_W} ${VIEW_H}"`;
            return `<svg class="hero-svg"${a} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
          },
        );
        if (cancelled) return;
        svgMarkupRef.current = markup;
        if (heroRef.current) heroRef.current.innerHTML = markup;
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

  // Film grain canvas (subtle, low-res stretch for perf)
  useEffect(() => {
    const canvas = grainRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const paintStaticNoise = () => {
      const w = Math.max(1, Math.floor(window.innerWidth / 2));
      const h = Math.max(1, Math.floor(window.innerHeight / 2));
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      const img = ctx.createImageData(w, h);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 22;
      }
      ctx.putImageData(img, 0, 0);
    };

    paintStaticNoise();
    const onResize = () => paintStaticNoise();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Main cinematic loop
  useEffect(() => {
    if (!ready) return;

    reducedRef.current = prefersReducedMotion();

    const onVis = () => {
      hiddenRef.current = document.hidden;
      if (!document.hidden) {
        phaseStartRef.current = performance.now();
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

    const onPointer = (e: PointerEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      pointerRef.current.x = clamp((e.clientX - cx) / cx, -1, 1);
      pointerRef.current.y = clamp((e.clientY - cy) / cy, -1, 1);
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    if (reducedRef.current) {
      phaseRef.current = 'static';
    } else {
      phaseRef.current = 'orb';
      phaseStartRef.current = performance.now();
    }

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      if (hiddenRef.current) return;

      const hero = heroRef.current;
      const far = farRef.current;
      const mid = midRef.current;
      const bloom = bloomRef.current;
      const orb = orbRef.current;
      const stage = stageRef.current;
      const vignette = vignetteRef.current;
      if (!hero || !far || !mid || !bloom || !orb || !stage) return;

      // Soft parallax target (pointer + slow drift)
      const driftX = Math.sin(now * 0.00022) * 0.35;
      const driftY = Math.cos(now * 0.00018) * 0.25;
      const tx = pointerRef.current.x * 0.55 + driftX;
      const ty = pointerRef.current.y * 0.45 + driftY;
      parallaxRef.current.x += (tx - parallaxRef.current.x) * 0.045;
      parallaxRef.current.y += (ty - parallaxRef.current.y) * 0.045;
      const px = parallaxRef.current.x;
      const py = parallaxRef.current.y;

      if (phaseRef.current === 'static') {
        orb.style.opacity = '0';
        bloom.style.opacity = '0.55';
        hero.style.opacity = '1';
        hero.style.clipPath = 'none';
        hero.style.transform = 'scale(1)';
        far.style.opacity = '0.35';
        mid.style.opacity = '0.45';
        far.style.transform = `translate(${px * -10}px, ${py * -8}px) scale(1.06)`;
        mid.style.transform = `translate(${px * -5}px, ${py * -4}px) scale(1.03)`;
        stage.style.transform = `translate(${px * 6}px, ${py * 5}px)`;
        if (vignette) vignette.style.opacity = '1';
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
        setShowReplay(true);
      }

      // Stage base parallax
      stage.style.transform = `translate(${px * 8}px, ${py * 6}px)`;

      if (phase === 'orb') {
        const t = elapsed / DUR.orb;
        const pulse = 0.88 + 0.12 * Math.sin(t * Math.PI * 2);
        const breath = easeSineInOut((Math.sin(t * Math.PI * 2) + 1) / 2);
        const orbScale = (0.55 + 0.2 * breath) * pulse;
        const orbAlpha = 0.55 + 0.35 * breath;

        orb.style.opacity = String(orbAlpha);
        orb.style.transform = `translate(-50%, -50%) scale(${orbScale})`;
        bloom.style.opacity = String(0.15 + 0.25 * breath);
        bloom.style.transform = `translate(-50%, -50%) scale(${1.1 + 0.3 * breath})`;

        hero.style.opacity = '0';
        hero.style.clipPath = 'circle(0% at 50% 42%)';
        far.style.opacity = String(0.08 * breath);
        mid.style.opacity = '0';
        if (vignette) vignette.style.opacity = '0.85';
      } else if (phase === 'reveal') {
        const raw = elapsed / DUR.reveal;
        const t = easeOutCubic(raw);

        // Expanding luminous reveal
        const radius = 8 + 92 * easeInOutCubic(clamp(raw));
        const orbFade = 1 - smoothstep(clamp((raw - 0.15) / 0.55));
        const bloomIn = smoothstep(clamp(raw / 0.35)) * (0.7 + 0.3 * Math.sin(now * 0.003));
        const heroIn = smoothstep(clamp((raw - 0.12) / 0.65));
        const farIn = smoothstep(clamp((raw - 0.05) / 0.5)) * 0.4;
        const midIn = smoothstep(clamp((raw - 0.18) / 0.55)) * 0.55;

        orb.style.opacity = String(orbFade * 0.85);
        orb.style.transform = `translate(-50%, -50%) scale(${0.7 + 1.8 * t})`;
        bloom.style.opacity = String(bloomIn);
        bloom.style.transform = `translate(-50%, -50%) scale(${1.2 + 0.8 * t})`;

        hero.style.opacity = String(heroIn);
        hero.style.clipPath = `circle(${radius}% at 50% 42%)`;
        hero.style.filter = `brightness(${0.85 + 0.2 * heroIn}) contrast(1.05)`;
        hero.style.transform = `scale(${0.985 + 0.02 * heroIn})`;

        far.style.opacity = String(farIn);
        mid.style.opacity = String(midIn);
        far.style.transform = `translate(${px * -12}px, ${py * -10}px) scale(${1.08 + 0.02 * t})`;
        mid.style.transform = `translate(${px * -6}px, ${py * -5}px) scale(${1.04})`;

        if (vignette) vignette.style.opacity = String(0.7 + 0.3 * t);
      } else if (phase === 'alive') {
        const breath = 0.5 + 0.5 * Math.sin(now * 0.00115);
        const scale = 1 + 0.015 * easeSineInOut(breath);
        const glowPulse = 0.5 + 0.5 * Math.sin(now * 0.0018);
        const smokePulse = 0.32 + 0.12 * Math.sin(now * 0.0009);

        orb.style.opacity = '0';
        bloom.style.opacity = String(0.42 + 0.22 * glowPulse);
        bloom.style.transform = `translate(-50%, -50%) scale(${1.35 + 0.12 * glowPulse})`;

        hero.style.opacity = '1';
        hero.style.clipPath = 'none';
        hero.style.filter = `brightness(${1 + 0.04 * glowPulse}) contrast(1.06)`;
        hero.style.transform = `scale(${scale})`;

        far.style.opacity = String(smokePulse);
        mid.style.opacity = String(0.42 + 0.1 * glowPulse);
        far.style.transform = `translate(${px * -14}px, ${py * -11 + Math.sin(now * 0.0007) * 2}px) scale(1.07)`;
        mid.style.transform = `translate(${px * -7}px, ${py * -5}px) scale(1.035)`;

        if (vignette) vignette.style.opacity = String(0.9 + 0.08 * glowPulse);
      }
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onVis);
      mq.removeEventListener('change', onMq);
      window.removeEventListener('pointermove', onPointer);
    };
  }, [ready, restart]);

  const atmosphereStyle = useMemo(
    () =>
      ({
        backgroundImage: `url(${SVG_URL})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: 'contain',
      }) as const,
    [],
  );

  return (
    <div ref={rootRef} className="demon-root" style={{ background: BG }}>
      <div className="demon-stage" ref={stageRef}>
        {/* Far atmospheric depth (blurred duplicate) */}
        <div
          ref={farRef}
          className="depth-layer depth-far"
          style={atmosphereStyle}
          aria-hidden
        />
        {/* Mid glow plate */}
        <div
          ref={midRef}
          className="depth-layer depth-mid"
          style={atmosphereStyle}
          aria-hidden
        />

        {/* Soft luminous bloom behind figure */}
        <div ref={bloomRef} className="soft-bloom" aria-hidden />

        {/* Opening orb / light bloom */}
        <div ref={orbRef} className="light-orb" aria-hidden />

        {/* Hero detailed SVG (inline) */}
        <div ref={heroRef} className="hero-frame" role="img" aria-label="Detailed demonic figure" />
      </div>

      {/* Cinematic overlays */}
      <div ref={vignetteRef} className="vignette" aria-hidden />
      <canvas ref={grainRef} className="grain" aria-hidden />

      {!ready && !loadError && <div className="boot-msg">Loading…</div>}
      {loadError && <div className="boot-msg">{loadError}</div>}

      {showReplay && (
        <button type="button" className="replay-btn" onClick={restart}>
          Replay
        </button>
      )}
    </div>
  );
}
