import type Phaser from 'phaser';
import type { StampDef } from '../data/stamps';
import { shade, toInt } from './color';

/**
 * スタンプの絵柄。中心 (0,0)、半径 r に収まるように描く。
 * 絵文字ではなく自分で描いているのは、端末ごとに見た目が変わらないようにするため
 * （家具やアバターと同じ手続き生成の方針）。
 */
export function drawStamp(g: Phaser.GameObjects.Graphics, def: StampDef, r: number) {
  const color = toInt(def.color);
  const accent = toInt(def.accent);
  const line = shade(color, 0.72);

  switch (def.shape) {
    case 'heart': {
      // 丸2つ＋三角で、まるい輪郭のハートにする
      g.fillStyle(color, 1);
      g.fillCircle(-r * 0.42, -r * 0.28, r * 0.46);
      g.fillCircle(r * 0.42, -r * 0.28, r * 0.46);
      g.fillTriangle(-r * 0.86, -r * 0.12, r * 0.86, -r * 0.12, 0, r * 0.82);
      g.fillStyle(accent, 0.9);
      g.fillEllipse(-r * 0.34, -r * 0.34, r * 0.3, r * 0.22);
      break;
    }
    case 'star': {
      g.fillStyle(color, 1);
      fillStar(g, 0, 0, r, r * 0.46, 5, -Math.PI / 2);
      g.fillStyle(accent, 0.85);
      fillStar(g, -r * 0.06, -r * 0.06, r * 0.5, r * 0.22, 5, -Math.PI / 2);
      break;
    }
    case 'note': {
      // 八分音符2つ。玉・軸・つなぎの旗
      g.fillStyle(color, 1);
      g.fillEllipse(-r * 0.36, r * 0.5, r * 0.56, r * 0.42);
      g.fillEllipse(r * 0.52, r * 0.3, r * 0.56, r * 0.42);
      g.fillRect(-r * 0.14, -r * 0.72, r * 0.16, r * 1.3);
      g.fillRect(r * 0.74, -r * 0.92, r * 0.16, r * 1.3);
      g.fillTriangle(-r * 0.14, -r * 0.72, r * 0.9, -r * 0.92, r * 0.9, -r * 0.52);
      g.fillStyle(accent, 0.9);
      g.fillEllipse(-r * 0.44, r * 0.42, r * 0.2, r * 0.14);
      break;
    }
    case 'sparkle': {
      g.fillStyle(color, 1);
      fillFourPoint(g, 0, -r * 0.1, r * 0.95, r * 0.24);
      fillFourPoint(g, r * 0.62, r * 0.6, r * 0.4, r * 0.1);
      fillFourPoint(g, -r * 0.66, r * 0.5, r * 0.3, r * 0.08);
      g.fillStyle(accent, 0.95);
      fillFourPoint(g, 0, -r * 0.1, r * 0.5, r * 0.12);
      break;
    }
    case 'exclaim': {
      g.fillStyle(color, 1);
      g.fillRoundedRect(-r * 0.2, -r * 0.9, r * 0.4, r * 1.12, r * 0.2);
      g.fillCircle(0, r * 0.62, r * 0.24);
      g.fillStyle(accent, 0.8);
      g.fillRoundedRect(-r * 0.1, -r * 0.78, r * 0.12, r * 0.7, r * 0.06);
      break;
    }
    case 'question': {
      g.lineStyle(r * 0.36, color, 1);
      g.beginPath();
      g.arc(0, -r * 0.38, r * 0.44, Math.PI * 0.95, Math.PI * 0.35, false);
      g.strokePath();
      g.fillStyle(color, 1);
      g.fillRect(-r * 0.09, -r * 0.05, r * 0.2, r * 0.42);
      g.fillCircle(0, r * 0.66, r * 0.22);
      break;
    }
    case 'sweat': {
      // しずく。丸＋とがった先
      for (const [dx, dy, k] of [
        [0, 0, 1],
        [r * 0.66, r * 0.36, 0.52],
      ] as Array<[number, number, number]>) {
        g.fillStyle(color, 1);
        g.fillCircle(dx, dy + r * 0.28 * k, r * 0.5 * k);
        g.fillTriangle(
          dx - r * 0.42 * k,
          dy + r * 0.3 * k,
          dx + r * 0.42 * k,
          dy + r * 0.3 * k,
          dx,
          dy - r * 0.78 * k,
        );
        g.fillStyle(accent, 0.85);
        g.fillCircle(dx - r * 0.16 * k, dy + r * 0.24 * k, r * 0.14 * k);
      }
      break;
    }
    case 'flower': {
      g.fillStyle(color, 1);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        g.fillCircle(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, r * 0.4);
      }
      g.fillStyle(accent, 1);
      g.fillCircle(0, 0, r * 0.32);
      break;
    }
    case 'cake': {
      // 台・クリーム・ろうそく
      g.fillStyle(shade(color, 0.9), 1);
      g.fillRoundedRect(-r * 0.78, -r * 0.1, r * 1.56, r * 0.86, r * 0.12);
      g.fillStyle(color, 1);
      g.fillRoundedRect(-r * 0.86, -r * 0.42, r * 1.72, r * 0.44, r * 0.18);
      g.fillStyle(accent, 1);
      g.fillRect(-r * 0.08, -r * 0.98, r * 0.16, r * 0.58);
      g.fillStyle(toInt('#f7d98c'), 1);
      g.fillEllipse(0, -r * 1.12, r * 0.22, r * 0.32);
      g.fillStyle(accent, 0.9);
      for (const x of [-r * 0.5, 0, r * 0.5]) g.fillCircle(x, r * 0.34, r * 0.1);
      break;
    }
    case 'sleep': {
      // Z を3つ、右上へ小さくなりながら
      const zs: Array<[number, number, number]> = [
        [-r * 0.5, r * 0.5, 1],
        [r * 0.24, -r * 0.06, 0.68],
        [r * 0.74, -r * 0.5, 0.44],
      ];
      for (const [x, y, k] of zs) {
        g.fillStyle(k === 1 ? color : line, 1);
        const w = r * 0.72 * k;
        const t = r * 0.19 * k;
        g.fillRect(x - w / 2, y - w / 2, w, t);
        g.fillRect(x - w / 2, y + w / 2 - t, w, t);
        // 斜めの棒
        g.fillTriangle(x + w / 2 - t * 0.4, y - w / 2, x + w / 2, y - w / 2 + t, x - w / 2 + t, y + w / 2);
        g.fillTriangle(x - w / 2, y + w / 2, x - w / 2 + t, y + w / 2 - t * 0.2, x + w / 2 - t, y - w / 2);
      }
      break;
    }
    case 'sun': {
      g.fillStyle(color, 1);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.cos(a) * r * 0.82;
        const y = Math.sin(a) * r * 0.82;
        g.fillTriangle(
          x + Math.cos(a + 1.2) * r * 0.16,
          y + Math.sin(a + 1.2) * r * 0.16,
          x + Math.cos(a - 1.2) * r * 0.16,
          y + Math.sin(a - 1.2) * r * 0.16,
          Math.cos(a) * r * 1.05,
          Math.sin(a) * r * 1.05,
        );
      }
      g.fillCircle(0, 0, r * 0.62);
      g.fillStyle(accent, 0.9);
      g.fillCircle(-r * 0.14, -r * 0.16, r * 0.32);
      break;
    }
    case 'moon': {
      // 三日月。外側の弧と、内側にずらした弧をつないで多角形にする
      g.fillStyle(color, 1);
      g.fillPoints(crescent(r * 0.92, r * 0.78, r * 0.42), true, true);
      g.fillStyle(accent, 0.85);
      g.fillPoints(crescent(r * 0.6, r * 0.5, r * 0.28), true, true);
      break;
    }
    case 'crown': {
      g.fillStyle(color, 1);
      g.fillPoints(
        [
          { x: -r * 0.86, y: r * 0.5 },
          { x: -r * 0.86, y: -r * 0.62 },
          { x: -r * 0.34, y: -r * 0.1 },
          { x: 0, y: -r * 0.86 },
          { x: r * 0.34, y: -r * 0.1 },
          { x: r * 0.86, y: -r * 0.62 },
          { x: r * 0.86, y: r * 0.5 },
        ],
        true,
        true,
      );
      g.fillStyle(shade(color, 0.86), 1);
      g.fillRect(-r * 0.86, r * 0.5, r * 1.72, r * 0.26);
      g.fillStyle(accent, 1);
      for (const x of [-r * 0.5, 0, r * 0.5]) g.fillCircle(x, r * 0.16, r * 0.14);
      break;
    }
    case 'cup': {
      g.fillStyle(shade(color, 0.85), 1);
      g.fillEllipse(0, r * 0.78, r * 1.5, r * 0.4); // ソーサー
      g.fillStyle(color, 1);
      g.fillPoints(
        [
          { x: -r * 0.6, y: -r * 0.3 },
          { x: r * 0.6, y: -r * 0.3 },
          { x: r * 0.42, y: r * 0.62 },
          { x: -r * 0.42, y: r * 0.62 },
        ],
        true,
        true,
      );
      g.lineStyle(r * 0.14, color, 1);
      g.beginPath();
      g.arc(r * 0.66, r * 0.08, r * 0.26, Math.PI * 1.5, Math.PI * 0.5, false);
      g.strokePath();
      g.fillStyle(accent, 1);
      g.fillEllipse(0, -r * 0.28, r * 1.16, r * 0.3); // 中のお茶
      // ゆげ
      g.fillStyle(accent, 0.8);
      for (const x of [-r * 0.24, r * 0.24]) g.fillEllipse(x, -r * 0.72, r * 0.12, r * 0.3);
      break;
    }
    default:
      break;
  }
}

/**
 * 三日月のかたち。外側の円弧をたどり、内側へずらした円弧で戻る。
 * 塗りの引き算ができないので、輪郭を自分で作っている
 */
function crescent(outer: number, inner: number, offset: number): Phaser.Types.Math.Vector2Like[] {
  const pts: Phaser.Types.Math.Vector2Like[] = [];
  const from = Math.PI * 0.42;
  const to = Math.PI * 1.58;
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    pts.push({ x: Math.cos(a) * outer, y: Math.sin(a) * outer });
  }
  for (let i = steps; i >= 0; i--) {
    const a = from + ((to - from) * i) / steps;
    pts.push({ x: Math.cos(a) * inner - offset, y: Math.sin(a) * inner });
  }
  return pts;
}

/** 中心 (cx, cy) の星。points 個のとがりを持つ */
function fillStar(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points: number,
  rot: number,
) {
  const path: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = rot + (i / (points * 2)) * Math.PI * 2;
    path.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
  }
  g.fillPoints(path, true, true);
}

/** ４方向にとがったキラキラ */
function fillFourPoint(g: Phaser.GameObjects.Graphics, cx: number, cy: number, len: number, w: number) {
  g.fillPoints(
    [
      { x: cx, y: cy - len },
      { x: cx + w, y: cy - w },
      { x: cx + len, y: cy },
      { x: cx + w, y: cy + w },
      { x: cx, y: cy + len },
      { x: cx - w, y: cy + w },
      { x: cx - len, y: cy },
      { x: cx - w, y: cy - w },
    ],
    true,
    true,
  );
}

/** 「きもち」パネルに並べる小さな絵 */
export function makeStampIconCanvas(scene: Phaser.Scene, def: StampDef): HTMLCanvasElement {
  const S = 34;
  const key = `stampicon:${def.id}`;
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.translateCanvas(S / 2, S / 2);
    drawStamp(g, def, S * 0.4);
    g.generateTexture(key, S, S);
    g.destroy();
  }
  const src = scene.textures.get(key).getSourceImage() as CanvasImageSource;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(src, 0, 0);
  return canvas;
}
