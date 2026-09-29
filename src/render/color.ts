/** '#rrggbb' -> 0xrrggbb */
export function toInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

/** 明るさを倍率で調整した色を返す */
export function shade(color: number | string, factor: number): number {
  const c = typeof color === 'string' ? toInt(color) : color;
  const r = Math.min(255, Math.round(((c >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((c >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((c & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/** 白と混ぜて淡くする */
export function tint(color: number | string, amount: number): number {
  const c = typeof color === 'string' ? toInt(color) : color;
  const mix = (v: number) => Math.round(v + (255 - v) * amount);
  return (mix((c >> 16) & 0xff) << 16) | (mix((c >> 8) & 0xff) << 8) | mix(c & 0xff);
}

/** ふたつの色を t(0..1) で混ぜる */
export function blend(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const mix = (sh: number) => {
    const va = (a >> sh) & 0xff;
    const vb = (b >> sh) & 0xff;
    return Math.round(va + (vb - va) * k);
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
