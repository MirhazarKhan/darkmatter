import { interpolate } from 'flubber';
import morphKeys from '../data/morph-keys.json';
import layersData from '../data/layers.json';

export const VIEW_W = 169;
export const VIEW_H = 300;
export const BG = '#242526';

export type LayerId = 'bg' | 'smokeOuter' | 'glowCore' | 'figure' | 'eye';

export interface PathLayer {
  id: string;
  fill: string;
  type: 'path' | 'rect';
  d?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export const layers = layersData.layers as PathLayer[];

export const keys = morphKeys.keys as Record<
  string,
  { d: string; fill: string }
>;

const SAMPLE_COUNT = 48;

function sampleInterpolator(fn: (t: number) => string, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    out.push(fn(t));
  }
  return out;
}

export interface MorphBank {
  orbToGlow: string[];
  smokeAB: string[];
  smokeBA: string[];
  orbD: string;
  glowCoreD: string;
  figureD: string;
  eyeD: string;
  smokeA: string;
  smokeB: string;
  fills: {
    orb: string;
    glowCore: string;
    figure: string;
    smoke: string;
    eye: string;
  };
}

let cached: MorphBank | null = null;

/** Precompute flubber morph samples (once per session). */
export function getMorphBank(): MorphBank {
  if (cached) return cached;

  const orb = keys.orb.d;
  const glow = keys.glowCore.d;
  const smokeA = keys.smokeA.d;
  const smokeB = keys.smokeB.d;

  const orbToGlowFn = interpolate(orb, glow, { maxSegmentLength: 8 });
  const smokeABFn = interpolate(smokeA, smokeB, { maxSegmentLength: 10 });
  const smokeBAFn = interpolate(smokeB, smokeA, { maxSegmentLength: 10 });

  const figureLayer = layers.find((l) => l.id === 'figure');
  const eyeLayer = layers.find((l) => l.id === 'eye');

  cached = {
    orbToGlow: sampleInterpolator(orbToGlowFn, SAMPLE_COUNT),
    smokeAB: sampleInterpolator(smokeABFn, SAMPLE_COUNT),
    smokeBA: sampleInterpolator(smokeBAFn, SAMPLE_COUNT),
    orbD: orb,
    glowCoreD: glow,
    figureD: figureLayer?.d ?? keys.figure.d,
    eyeD: eyeLayer?.d ?? '',
    smokeA,
    smokeB,
    fills: {
      orb: keys.orb.fill,
      glowCore: keys.glowCore.fill,
      figure: keys.figure.fill,
      smoke: keys.smokeA.fill,
      eye: (eyeLayer?.fill as string) ?? '#ffffff',
    },
  };
  return cached;
}

/** Lookup precomputed path at progress 0..1 with linear sample lerp via nearest. */
export function samplePath(samples: string[], t: number): string {
  const x = Math.min(1, Math.max(0, t));
  if (samples.length === 0) return '';
  if (samples.length === 1) return samples[0];
  const idx = x * (samples.length - 1);
  const i0 = Math.floor(idx);
  // Path morph samples are discrete; pick nearest for Path2D stability
  const i1 = Math.min(samples.length - 1, Math.round(idx));
  void i0;
  return samples[i1];
}

export function getStaticFigurePaths(): {
  smoke: string;
  glow: string;
  figure: string;
  eye: string;
  fills: MorphBank['fills'];
} {
  const bank = getMorphBank();
  return {
    smoke: bank.smokeA,
    glow: bank.glowCoreD,
    figure: bank.figureD,
    eye: bank.eyeD,
    fills: bank.fills,
  };
}
