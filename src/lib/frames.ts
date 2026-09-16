export const FRAME_W = 600;
export const FRAME_H = 338;
export const FRAME_COUNT = 126;
export const TRACE_SCALE = 0.1;

export type FrameLayer = {
  fill: string | null;
  paths: Path2D[];
};

export type Colorway = {
  phase: number;
  localT: number;
  bgVal: number;
  vectorVal: number;
};

declare global {
  interface Window {
    FRAMES?: string[];
    FRAME_COUNT?: number;
    FRAME_W?: number;
    FRAME_H?: number;
    FILL?: string;
    BG?: string;
  }
}

function fromWindow(): { markups: string[]; count: number } {
  const markups = window.FRAMES;
  if (!markups?.length) {
    throw new Error('frames-data.js loaded but window.FRAMES is empty');
  }
  return {
    markups,
    count: window.FRAME_COUNT || markups.length,
  };
}

let packPromise: Promise<{ markups: string[]; count: number }> | null = null;

/** Load the 5.3MB classic script once via <script> (public/, not bundled). */
export function loadFramesPack(): Promise<{ markups: string[]; count: number }> {
  if (packPromise) return packPromise;
  if (typeof window !== 'undefined' && window.FRAMES?.length) {
    packPromise = Promise.resolve(fromWindow());
    return packPromise;
  }
  packPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-frames-data]');
    if (existing && window.FRAMES?.length) {
      resolve(fromWindow());
      return;
    }
    const script = document.createElement('script');
    script.src = '/frames-data.js';
    script.async = true;
    script.dataset.framesData = '1';
    script.onload = () => {
      try {
        resolve(fromWindow());
      } catch (err) {
        reject(err);
      }
    };
    script.onerror = () => reject(new Error('Failed to load /frames-data.js'));
    document.head.appendChild(script);
  });
  return packPromise;
}

/**
 * Parse layered <g fill="..."> markup into Path2D groups.
 * Ported from user-pack/app.js parseFrameLayers.
 */
export function parseFrameLayers(markup: string): FrameLayer[] {
  const layers: FrameLayer[] = [];
  const gre = /<g\b([^>]*)>([\s\S]*?)<\/g>/gi;
  let gm: RegExpExecArray | null;
  while ((gm = gre.exec(markup))) {
    const fillM = /fill="([^"]+)"/i.exec(gm[1]);
    const fill = (fillM && fillM[1]) || null;
    const paths: Path2D[] = [];
    const re = /<path\b[^>]*\sd="([^"]*)"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(gm[2]))) {
      const d = m[1].replace(/\s+/g, ' ').trim();
      if (!d) continue;
      try {
        paths.push(new Path2D(d));
      } catch {
        /* skip malformed */
      }
    }
    if (paths.length) layers.push({ fill, paths });
  }
  if (!layers.length) {
    const paths: Path2D[] = [];
    const re = /<path\b[^>]*\sd="([^"]*)"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(markup))) {
      const d = m[1].replace(/\s+/g, ' ').trim();
      if (!d) continue;
      try {
        paths.push(new Path2D(d));
      } catch {
        /* skip */
      }
    }
    if (paths.length) layers.push({ fill: null, paths });
  }
  return layers;
}

export function parseAllFrames(markups: string[]): FrameLayer[][] {
  const out: FrameLayer[][] = new Array(markups.length);
  for (let i = 0; i < markups.length; i++) {
    out[i] = parseFrameLayers(markups[i]);
  }
  return out;
}

function smoothStep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/** Original 3-act black↔white energy, driven by 0..1 progress. */
export function calculateColorway(p: number): Colorway {
  const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
  let phase = 0;
  let localT = 0;
  let bgVal = 0;

  if (clamped < 1 / 3) {
    phase = 0;
    localT = clamped * 3;
    bgVal = 255 * smoothStep(localT);
  } else if (clamped < 2 / 3) {
    phase = 1;
    localT = (clamped - 1 / 3) * 3;
    bgVal = 255 * (1 - smoothStep(localT));
  } else {
    phase = 2;
    localT = (clamped - 2 / 3) * 3;
    bgVal = 255 * smoothStep(localT);
  }

  return {
    phase,
    localT,
    bgVal,
    vectorVal: 255 - bgVal,
  };
}
