import { coverFit, lerp, rgba } from './geom';

/** Cover-fit draw of ImageBitmap / HTMLImageElement into a viewport. */
export function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  viewW: number,
  viewH: number,
  artW: number,
  artH: number,
  zoom = 1,
  panX = 0,
  panY = 0,
  /** Bias: negative shifts art up (show more of head/aura). */
  anchorY = 0.16,
) {
  const fit = coverFit(viewW, viewH, artW, artH, zoom);
  const ox = fit.ox + panX;
  const oy = fit.oy + panY + fit.h * anchorY * 0.5;
  ctx.drawImage(img, ox, oy, fit.w, fit.h);
  return { ...fit, ox, oy };
}

/** Fast separable box blur (approx gaussian when stacked). */
export function boxBlur(
  src: ImageData,
  tmp: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
) {
  if (radius < 1) return;
  const r = Math.min(radius | 0, 32);
  const data = src.data;
  const len = w * h;

  // horizontal
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let aSum = 0;
    for (let x = -r; x <= r; x++) {
      const xi = Math.min(w - 1, Math.max(0, x));
      const i = (row + xi) * 4;
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      aSum += data[i + 3];
    }
    const denom = r * 2 + 1;
    for (let x = 0; x < w; x++) {
      const o = (row + x) * 4;
      tmp[o] = (rSum / denom) | 0;
      tmp[o + 1] = (gSum / denom) | 0;
      tmp[o + 2] = (bSum / denom) | 0;
      tmp[o + 3] = (aSum / denom) | 0;
      const xOut = x - r;
      const xIn = x + r + 1;
      const iOut = (row + Math.min(w - 1, Math.max(0, xOut))) * 4;
      const iIn = (row + Math.min(w - 1, Math.max(0, xIn))) * 4;
      rSum += data[iIn] - data[iOut];
      gSum += data[iIn + 1] - data[iOut + 1];
      bSum += data[iIn + 2] - data[iOut + 2];
      aSum += data[iIn + 3] - data[iOut + 3];
    }
  }

  // vertical
  for (let x = 0; x < w; x++) {
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let aSum = 0;
    for (let y = -r; y <= r; y++) {
      const yi = Math.min(h - 1, Math.max(0, y));
      const i = (yi * w + x) * 4;
      rSum += tmp[i];
      gSum += tmp[i + 1];
      bSum += tmp[i + 2];
      aSum += tmp[i + 3];
    }
    const denom = r * 2 + 1;
    for (let y = 0; y < h; y++) {
      const o = (y * w + x) * 4;
      data[o] = (rSum / denom) | 0;
      data[o + 1] = (gSum / denom) | 0;
      data[o + 2] = (bSum / denom) | 0;
      data[o + 3] = (aSum / denom) | 0;
      const yOut = y - r;
      const yIn = y + r + 1;
      const iOut = (Math.min(h - 1, Math.max(0, yOut)) * w + x) * 4;
      const iIn = (Math.min(h - 1, Math.max(0, yIn)) * w + x) * 4;
      rSum += tmp[iIn] - tmp[iOut];
      gSum += tmp[iIn + 1] - tmp[iOut + 1];
      bSum += tmp[iIn + 2] - tmp[iOut + 2];
      aSum += tmp[iIn + 3] - tmp[iOut + 3];
    }
  }

  void len;
}

/**
 * Multi-pass bloom: downsample → blur → upsample → screen composite.
 * Mutates bloomCtx; draws result onto destCtx.
 */
export function applyBloom(
  destCtx: CanvasRenderingContext2D,
  sceneCanvas: HTMLCanvasElement,
  bloomCanvas: HTMLCanvasElement,
  bloomCtx: CanvasRenderingContext2D,
  tmpBuf: { data: Uint8ClampedArray | null; w: number; h: number },
  strength: number,
  viewW: number,
  viewH: number,
) {
  if (strength < 0.02) return;
  const bw = Math.max(32, (viewW / 4) | 0);
  const bh = Math.max(32, (viewH / 4) | 0);
  if (bloomCanvas.width !== bw || bloomCanvas.height !== bh) {
    bloomCanvas.width = bw;
    bloomCanvas.height = bh;
  }
  bloomCtx.setTransform(1, 0, 0, 1, 0, 0);
  bloomCtx.clearRect(0, 0, bw, bh);
  bloomCtx.drawImage(sceneCanvas, 0, 0, bw, bh);

  let img: ImageData;
  try {
    img = bloomCtx.getImageData(0, 0, bw, bh);
  } catch {
    // tainted / unavailable — soft fallback via canvas blur filter
    destCtx.save();
    destCtx.globalCompositeOperation = 'screen';
    destCtx.globalAlpha = strength * 0.55;
    destCtx.filter = 'blur(18px) brightness(1.35)';
    destCtx.drawImage(sceneCanvas, 0, 0, viewW, viewH);
    destCtx.filter = 'none';
    destCtx.restore();
    return;
  }

  if (!tmpBuf.data || tmpBuf.w !== bw || tmpBuf.h !== bh) {
    tmpBuf.data = new Uint8ClampedArray(bw * bh * 4);
    tmpBuf.w = bw;
    tmpBuf.h = bh;
  }
  // threshold lift + blur passes
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const k = lum > 48 ? 1 : lum / 48;
    d[i] = (d[i] * k) | 0;
    d[i + 1] = (d[i + 1] * k) | 0;
    d[i + 2] = (d[i + 2] * k) | 0;
  }
  boxBlur(img, tmpBuf.data, bw, bh, 3);
  boxBlur(img, tmpBuf.data, bw, bh, 2);
  bloomCtx.putImageData(img, 0, 0);

  destCtx.save();
  destCtx.globalCompositeOperation = 'screen';
  destCtx.globalAlpha = Math.min(1, strength);
  destCtx.drawImage(bloomCanvas, 0, 0, viewW, viewH);
  destCtx.globalAlpha = Math.min(1, strength * 0.55);
  destCtx.filter = 'blur(12px)';
  destCtx.drawImage(bloomCanvas, 0, 0, viewW, viewH);
  destCtx.filter = 'none';
  destCtx.restore();
}

/** Subtle RGB channel split of a scene canvas onto dest. */
export function applyChromaticAberration(
  destCtx: CanvasRenderingContext2D,
  sceneCanvas: HTMLCanvasElement,
  viewW: number,
  viewH: number,
  px: number,
) {
  if (px < 0.4) return;
  destCtx.save();
  destCtx.globalCompositeOperation = 'screen';
  destCtx.globalAlpha = 0.55;
  destCtx.drawImage(sceneCanvas, -px, 0, viewW, viewH);
  // approximate R bias by darkening then screening — real channel split needs
  // getImageData; use offset copies with tint overlays for speed
  destCtx.globalAlpha = 0.35;
  destCtx.fillStyle = 'rgba(255,40,60,0.45)';
  destCtx.globalCompositeOperation = 'multiply';
  destCtx.fillRect(0, 0, viewW, viewH);
  destCtx.globalCompositeOperation = 'screen';
  destCtx.globalAlpha = 0.5;
  destCtx.drawImage(sceneCanvas, px, 0, viewW, viewH);
  destCtx.restore();
}

/** Draw chromatic-split hero directly (cleaner than post multiply). */
export function drawHeroWithCA(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  viewW: number,
  viewH: number,
  artW: number,
  artH: number,
  zoom: number,
  panX: number,
  panY: number,
  caPx: number,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (caPx > 0.5) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = '#ff2040';
    // red offset via source-atop trick: draw image then can't tint easily —
    // draw offset copies; slight color via filter
    ctx.filter = 'brightness(0.55) sepia(1) hue-rotate(-50deg) saturate(6)';
    drawCoverImage(ctx, img, viewW, viewH, artW, artH, zoom, panX - caPx, panY);
    ctx.filter = 'brightness(0.55) sepia(1) hue-rotate(160deg) saturate(6)';
    drawCoverImage(ctx, img, viewW, viewH, artW, artH, zoom, panX + caPx, panY);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
  }
  drawCoverImage(ctx, img, viewW, viewH, artW, artH, zoom, panX, panY);
  ctx.restore();
}

export function drawVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amount: number,
) {
  if (amount < 0.02) return;
  const g = ctx.createRadialGradient(
    w * 0.5,
    h * 0.4,
    Math.min(w, h) * 0.18,
    w * 0.5,
    h * 0.45,
    Math.max(w, h) * 0.72,
  );
  g.addColorStop(0, rgba(0, 0, 0, 0));
  g.addColorStop(0.55, rgba(0, 0, 0, 0.25 * amount));
  g.addColorStop(0.82, rgba(0, 0, 0, 0.72 * amount));
  g.addColorStop(1, rgba(0, 0, 0, 0.94 * amount));
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

const _grainTile = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (_grainTile) {
  _grainTile.width = 128;
  _grainTile.height = 128;
}
let _grainSeed = -1;
let _grainAlpha = -1;

export function paintGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  alpha: number,
  seed: number,
) {
  if (alpha < 1 || !_grainTile) return;
  const octx = _grainTile.getContext('2d');
  if (!octx) return;
  const a = alpha | 0;
  const s0 = seed | 0;
  if (s0 !== _grainSeed || a !== _grainAlpha) {
    _grainSeed = s0;
    _grainAlpha = a;
    const img = octx.createImageData(128, 128);
    const d = img.data;
    let s = (s0 * 1103515245 + 12345) >>> 0;
    for (let i = 0; i < d.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const v = s & 255;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = a;
    }
    octx.putImageData(img, 0, 0);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.55;
  const pat = ctx.createPattern(_grainTile, 'repeat');
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

export function drawLightRays(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  length: number,
  pulse: number,
  time: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + time * 0.00015 + Math.sin(time * 0.0004 + i) * 0.08;
    const wobble = 0.55 + 0.45 * Math.sin(time * 0.0011 + i * 1.7);
    const alpha = (0.035 + 0.04 * pulse) * wobble;
    const spread = 0.035 + (i % 3) * 0.012;
    ctx.fillStyle = rgba(255, 230, 190, alpha);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, length, a - spread, a + spread);
    ctx.closePath();
    ctx.fill();
  }
  // soft core
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, length * 0.35);
  core.addColorStop(0, rgba(255, 245, 220, 0.14 + pulse * 0.1));
  core.addColorStop(0.5, rgba(255, 120, 60, 0.05));
  core.addColorStop(1, rgba(0, 0, 0, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, length * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawGlitchSlices(
  ctx: CanvasRenderingContext2D,
  sceneCanvas: HTMLCanvasElement,
  viewW: number,
  viewH: number,
  amount: number,
) {
  if (amount < 0.06) return;
  const slices = Math.min(10, 2 + ((amount * 10) | 0));
  for (let i = 0; i < slices; i++) {
    if (Math.random() > amount * 0.9) continue;
    const y = Math.random() * viewH;
    const hh = 2 + Math.random() * 28 * amount;
    const dx = (Math.random() - 0.5) * 100 * amount;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, viewW, hh);
    ctx.clip();
    ctx.drawImage(sceneCanvas, dx, (Math.random() - 0.5) * 6 * amount, viewW, viewH);
    ctx.restore();
  }
}

export function drawShockwave(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
) {
  if (t <= 0 || t >= 1) return;
  const r = lerp(20, Math.max(cx, cy) * 2.4, 1 - Math.pow(1 - t, 3));
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

export function drawTearBars(
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
