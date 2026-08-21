import Phaser from 'phaser';
import { GOLD, GOLD_LIGHT } from '../config';
import { WALL_COL_W, type WallSide } from '../core/wall';
import type { FurnitureDef, Recolor, WallShape } from '../types';
import { shade, toInt } from './color';
import { recolored } from './furnitureTexture';

/**
 * 壁に掛ける家具のテクスチャを、壁の傾きに合わせた平行四辺形として描く。
 *
 * 壁の上の座標 (u, h) は画面へこう写る（`core/wall.ts` と同じ式）。
 *   right: x =  u, y = u/2 - h
 *   left : x = -u, y = u/2 - h
 * u は「壁に沿った距離」で、h は床からの高さ。矩形は画面上では
 * 傾いた平行四辺形になるので、頂点を自分で計算して塗っている。
 */
export interface WallTexture {
  key: string;
  /** スロットの左上（u=0, h=中心+高さ/2 の点）を合わせるための原点 */
  originX: number;
  originY: number;
}

const cache = new Map<string, WallTexture>();

/** 壁の上の (u, h) をテクスチャの中の座標へ */
type Map2 = (u: number, h: number) => { x: number; y: number };

type Color = number | string;
const asInt = (c: Color): number => (typeof c === 'string' ? toInt(c) : c);

class WallPainter {
  constructor(
    private readonly g: Phaser.GameObjects.Graphics,
    private readonly at: Map2,
  ) {}

  /** 壁の上の矩形（平行四辺形として塗られる） */
  quad(u0: number, h0: number, u1: number, h1: number, color: Color, alpha = 1) {
    const pts = [this.at(u0, h1), this.at(u1, h1), this.at(u1, h0), this.at(u0, h0)];
    this.g.fillStyle(asInt(color), alpha);
    this.g.fillPoints(pts, true);
  }

  /** 枠線 */
  frame(u0: number, h0: number, u1: number, h1: number, color: Color, width = 1, alpha = 1) {
    const pts = [this.at(u0, h1), this.at(u1, h1), this.at(u1, h0), this.at(u0, h0)];
    this.g.lineStyle(width, asInt(color), alpha);
    this.g.strokePoints(pts, true);
  }

  /** 壁の上の円（画面では縦に潰れないので、そのまま円で描く） */
  disc(u: number, h: number, r: number, color: Color, alpha = 1) {
    const c = this.at(u, h);
    this.g.fillStyle(asInt(color), alpha);
    this.g.fillCircle(c.x, c.y, r);
  }

  line(u0: number, h0: number, u1: number, h1: number, color: Color, width = 1) {
    const a = this.at(u0, h0);
    const b = this.at(u1, h1);
    this.g.lineStyle(width, asInt(color), 1);
    this.g.lineBetween(a.x, a.y, b.x, b.y);
  }
}

/** 金の縁取り＋中身、という共通の作り */
function framed(p: WallPainter, w: number, h: number, frameColor: Color, inner: Color, thick = 3) {
  p.quad(0, 0, w, h, shade(frameColor, 0.82));
  p.quad(1, 1, w - 1, h - 1, frameColor);
  p.quad(thick, thick, w - thick, h - thick, inner);
  p.frame(thick, thick, w - thick, h - thick, shade(inner, 0.72), 1, 0.7);
}

function drawShape(p: WallPainter, shape: WallShape, def: FurnitureDef, w: number, h: number) {
  const color = def.color;
  const accent = def.accent ?? '#ffffff';
  switch (shape) {
    case 'window': {
      // 枠 → 空 → 桟 → カーテンの気配（上に軽い影）
      framed(p, w, h, color, accent, 4);
      p.quad(4, h * 0.55, w - 4, h - 4, shade(accent, 1.1)); // 上のほうは明るい空
      p.line(w / 2, 4, w / 2, h - 4, shade(color, 0.9), 2);
      p.line(4, h / 2, w - 4, h / 2, shade(color, 0.9), 2);
      if (w > 60) p.line(w * 0.75, 4, w * 0.75, h - 4, shade(color, 0.9), 1.5);
      // 窓台
      p.quad(-2, -3, w + 2, 1, shade(color, 0.86));
      // 金のかざり
      p.disc(w / 2, h + 3, 3, GOLD);
      break;
    }
    case 'painting': {
      framed(p, w, h, GOLD, accent, 4);
      // 中の絵：ざっくりした色面で「何か描いてある」感じを出す
      p.quad(6, 6, w - 6, h * 0.45, shade(accent, 0.86));
      p.disc(w * 0.38, h * 0.62, Math.min(w, h) * 0.14, shade(accent, 1.18));
      p.disc(w * 0.62, h * 0.5, Math.min(w, h) * 0.1, shade(accent, 1.28));
      p.disc(w * 0.5, h * 0.72, Math.min(w, h) * 0.09, shade(accent, 1.34));
      // 上辺の中央にロココの飾り
      p.disc(w / 2, h + 2, 3.2, GOLD_LIGHT);
      break;
    }
    case 'mirror': {
      framed(p, w, h, GOLD, accent, 3);
      // 映り込みの斜めのハイライト
      p.quad(w * 0.18, h * 0.15, w * 0.42, h * 0.85, '#ffffff', 0.35);
      p.quad(w * 0.55, h * 0.3, w * 0.66, h * 0.7, '#ffffff', 0.22);
      p.disc(w / 2, h + 3, 3.4, GOLD_LIGHT);
      break;
    }
    case 'clock': {
      p.disc(w / 2, h / 2, Math.min(w, h) / 2, shade(GOLD, 0.8));
      p.disc(w / 2, h / 2, Math.min(w, h) / 2 - 1.6, GOLD);
      p.disc(w / 2, h / 2, Math.min(w, h) / 2 - 4, color);
      // 針
      p.line(w / 2, h / 2, w / 2, h / 2 + Math.min(w, h) * 0.28, '#5a4a3a', 1.6);
      p.line(w / 2, h / 2, w / 2 + Math.min(w, h) * 0.2, h / 2 + 1, '#5a4a3a', 1.4);
      p.disc(w / 2, h / 2, 1.4, GOLD);
      break;
    }
    case 'sconce': {
      // 壁につく台 → 腕 → ろうそく → 灯り
      p.quad(w * 0.3, 0, w * 0.7, h * 0.3, shade(GOLD, 0.85));
      p.quad(w * 0.42, h * 0.28, w * 0.58, h * 0.52, GOLD);
      p.quad(w * 0.2, h * 0.5, w * 0.8, h * 0.58, GOLD);
      for (const cu of [w * 0.32, w * 0.68]) {
        p.quad(cu - 2, h * 0.58, cu + 2, h * 0.82, '#fdf8ee');
        p.disc(cu, h * 0.9, 3.4, accent);
        p.disc(cu, h * 0.92, 1.8, '#fffbe8');
      }
      break;
    }
    case 'shelf': {
      // 棚板 → 支え → 上に小物
      p.quad(0, h * 0.3, w, h * 0.42, color);
      p.quad(0, h * 0.24, w, h * 0.3, shade(color, 0.84));
      p.quad(w * 0.12, h * 0.05, w * 0.2, h * 0.28, shade(color, 0.8));
      p.quad(w * 0.8, h * 0.05, w * 0.88, h * 0.28, shade(color, 0.8));
      p.quad(0, h * 0.42, w, h * 0.45, GOLD, 0.9);
      p.disc(w * 0.3, h * 0.6, 5, accent);
      p.quad(w * 0.5, h * 0.45, w * 0.62, h * 0.78, shade(accent, 0.9));
      p.disc(w * 0.75, h * 0.56, 4, shade(accent, 1.1));
      break;
    }
    case 'tapestry': {
      // 上の吊り棒 → 布 → すそのふさ
      p.quad(-2, h - 4, w + 2, h, GOLD);
      p.quad(1, 3, w - 1, h - 4, color);
      p.quad(4, 6, w - 4, h - 7, shade(color, 1.12));
      // 中央の紋章
      p.disc(w / 2, h * 0.55, Math.min(w, h) * 0.16, shade(accent, 1.0));
      p.disc(w / 2, h * 0.55, Math.min(w, h) * 0.1, shade(color, 1.24));
      for (let i = 0; i <= 4; i++) p.disc((w / 4) * i, 2, 2.4, accent);
      break;
    }
  }
}

/**
 * (家具, 壁の向き) ごとのテクスチャ。
 * 一度作ればキャッシュされる。
 */
export function getWallTexture(
  scene: Phaser.Scene,
  baseDef: FurnitureDef,
  side: WallSide,
  recolor?: Recolor,
): WallTexture {
  const def = recolored(baseDef, recolor);
  const key = `wall:${def.id}:${side}${recolor?.color ?? ''}${recolor?.accent ?? ''}`;
  const hit = cache.get(key);
  if (hit && scene.textures.exists(key)) return hit;

  const w = def.size[0] * WALL_COL_W;
  const h = def.height;
  // 平行四辺形なので、u が進むほど y が下がる。テクスチャは
  // (幅 = w + 余白, 高さ = h + w/2 + 余白) の箱に収まる
  const PAD = 6;
  const texW = w + PAD * 2;
  const texH = h + w / 2 + PAD * 2;
  // テクスチャの中の座標へ写す。u=0, h=0（スロットの下端）が
  // right なら左上寄り、left なら右上寄りに来る
  const at: Map2 =
    side === 'right'
      ? (u, hh) => ({ x: PAD + u, y: PAD + h - hh + u / 2 })
      : (u, hh) => ({ x: PAD + w - u, y: PAD + h - hh + u / 2 });

  const g = scene.add.graphics();
  drawShape(new WallPainter(g, at), def.wallShape ?? 'painting', def, w, h);
  g.generateTexture(key, texW, texH);
  g.destroy();

  // スプライトを置くときは「スロットの u=0, h=0 の点」を基準にしたい
  const anchor = at(0, 0);
  const tex: WallTexture = { key, originX: anchor.x / texW, originY: anchor.y / texH };
  cache.set(key, tex);
  return tex;
}

/** カタログのアイコン用に、テクスチャを DOM のキャンバスへ写す */
export function makeWallIconCanvas(scene: Phaser.Scene, def: FurnitureDef): HTMLCanvasElement {
  const tex = getWallTexture(scene, def, 'right');
  const src = scene.textures.get(tex.key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const canvas = document.createElement('canvas');
  const size = 46;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const sw = src.width;
  const sh = src.height;
  const scale = Math.min(size / sw, size / sh, 1.6);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, (size - sw * scale) / 2, (size - sh * scale) / 2, sw * scale, sh * scale);
  return canvas;
}
