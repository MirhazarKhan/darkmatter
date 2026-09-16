import { lerp } from './geom';

export type Ember = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  heat: number;
};

export function spawnBurst(cx: number, cy: number, n: number, spread = 1): Ember[] {
  const out: Ember[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (0.4 + Math.random() * 2.8) * spread;
    out.push({
      x: cx + (Math.random() - 0.5) * 80,
      y: cy + (Math.random() - 0.5) * 80,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 0.6 - Math.random() * 1.4,
      life: 0,
      max: 500 + Math.random() * 900,
      size: 0.8 + Math.random() * 2.4,
      heat: Math.random(),
    });
  }
  return out;
}

export function spawnIdle(w: number, h: number): Ember {
  return {
    x: w * (0.25 + Math.random() * 0.5),
    y: h * (0.55 + Math.random() * 0.4),
    vx: (Math.random() - 0.5) * 0.35,
    vy: -0.25 - Math.random() * 0.55,
    life: 0,
    max: 1800 + Math.random() * 2200,
    size: 0.6 + Math.random() * 1.6,
    heat: 0.35 + Math.random() * 0.65,
  };
}

export function tickEmbers(list: Ember[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    e.life += dt;
    e.x += e.vx * dt * 0.06;
    e.y += e.vy * dt * 0.06;
    e.vy -= dt * 0.00035;
    e.vx *= 0.995;
    if (e.life >= e.max) list.splice(i, 1);
  }
}

export function drawEmbers(ctx: CanvasRenderingContext2D, list: Ember[]): void {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const t = e.life / e.max;
    const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    const a = Math.max(0, fade) * 0.85;
    const r = lerp(255, 255, e.heat);
    const g = lerp(240, 70, e.heat);
    const b = lerp(210, 30, e.heat);
    ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.size * (1 + t * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
