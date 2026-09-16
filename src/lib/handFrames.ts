export const HAND_FRAME_W = 1000;
export const HAND_FRAME_H = 562;
export const HAND_FRAME_COUNT = 44;
export const HAND_TRACE_SCALE = 0.1;

export type HandFrameLayer = {
  fill: string | null;
  paths: Path2D[];
};

declare global {
  interface Window {
    HAND_FRAMES?: string[];
    HAND_FRAME_COUNT?: number;
    HAND_FRAME_W?: number;
    HAND_FRAME_H?: number;
    HAND_BG?: string;
  }
}

function fromWindow(): { markups: string[]; count: number } {
  const markups = window.HAND_FRAMES;
  if (!markups?.length) {
    throw new Error('hand-frames-data.js loaded but window.HAND_FRAMES is empty');
  }
  return {
    markups,
    count: window.HAND_FRAME_COUNT || markups.length,
  };
}

let packPromise: Promise<{ markups: string[]; count: number }> | null = null;

/** Load classic script once via <script> (public/, not bundled). */
export function loadHandFramesPack(): Promise<{ markups: string[]; count: number }> {
  if (packPromise) return packPromise;
  if (typeof window !== 'undefined' && window.HAND_FRAMES?.length) {
    packPromise = Promise.resolve(fromWindow());
    return packPromise;
  }
  packPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-hand-frames-data]');
    if (existing && window.HAND_FRAMES?.length) {
      resolve(fromWindow());
      return;
    }
    const script = document.createElement('script');
    script.src = '/hand-frames-data.js';
    script.async = true;
    script.dataset.handFramesData = '1';
    script.onload = () => {
      try {
        resolve(fromWindow());
      } catch (err) {
        reject(err);
      }
    };
    script.onerror = () => reject(new Error('Failed to load /hand-frames-data.js'));
    document.head.appendChild(script);
  });
  return packPromise;
}

export function parseHandFrameLayers(markup: string): HandFrameLayer[] {
  const layers: HandFrameLayer[] = [];
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
  return layers;
}

export function parseAllHandFrames(markups: string[]): HandFrameLayer[][] {
  const out: HandFrameLayer[][] = new Array(markups.length);
  for (let i = 0; i < markups.length; i++) {
    out[i] = parseHandFrameLayers(markups[i]);
  }
  return out;
}
