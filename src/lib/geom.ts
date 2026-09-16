export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function coverFit(
  viewW: number,
  viewH: number,
  artW: number,
  artH: number,
  zoom = 1,
): { scale: number; ox: number; oy: number; w: number; h: number } {
  const scale = Math.max(viewW / artW, viewH / artH) * zoom;
  const w = artW * scale;
  const h = artH * scale;
  return {
    scale,
    ox: (viewW - w) * 0.5,
    oy: (viewH - h) * 0.5,
    w,
    h,
  };
}

export function rgbGray(v: number): string {
  const x = Math.round(v);
  return `rgb(${x}, ${x}, ${x})`;
}

export function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(3)})`;
}
