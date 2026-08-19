import Phaser from 'phaser';
import { TILE_H, TILE_W } from '../config';
import { rotatedSize } from '../core/iso';
import type { FurnitureDef, Rotation } from '../types';
import { shade, tint, toInt } from './color';

const HW = TILE_W / 2;
const HH = TILE_H / 2;
const PAD = 6;
const EPS = 1e-6;

/** 生成済みテクスチャのメタ情報 */
export interface FurnitureTexture {
  key: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

const cache = new Map<string, FurnitureTexture>();

/** 描画をいちど溜めておき、奥→手前の順に並べ替えてから実行するための単位 */
interface Op {
  gx0: number;
  gx1: number;
  gy0: number;
  gy1: number;
  z0: number;
  z1: number;
  draw: () => void;
}

/**
 * ローカル座標系での描画を担当するヘルパー。
 * ローカルは「背面が v=0、正面が v=D」の向きで定義し、rot に応じてグリッドへ写す。
 * 回転しても正しく重なるよう、描画はグリッド空間での前後関係で並べ替える。
 */
class IsoPainter {
  private ops: Op[] = [];

  constructor(
    private readonly g: Phaser.GameObjects.Graphics,
    private readonly offX: number,
    private readonly offY: number,
    private readonly rot: Rotation,
    private readonly W: number,
    private readonly D: number,
  ) {}

  /** ローカル (u,v) -> グリッド (gx,gy) */
  private map(u: number, v: number): [number, number] {
    switch (this.rot) {
      case 0:
        return [u, v];
      case 1:
        return [v, u];
      case 2:
        return [this.W - u, this.D - v];
      default:
        return [this.D - v, this.W - u];
    }
  }

  /** グリッド座標 + 高さ -> テクスチャ内のピクセル座標 */
  private sp(gx: number, gy: number, z: number): { x: number; y: number } {
    return { x: this.offX + (gx - gy) * HW, y: this.offY + (gx + gy) * HH - z };
  }

  /** ローカル矩形をグリッドの範囲へ正規化 */
  private range(u0: number, v0: number, u1: number, v1: number) {
    const a = this.map(u0, v0);
    const b = this.map(u1, v1);
    return {
      gx0: Math.min(a[0], b[0]),
      gx1: Math.max(a[0], b[0]),
      gy0: Math.min(a[1], b[1]),
      gy1: Math.max(a[1], b[1]),
    };
  }

  /** 直方体 */
  box(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, color: number | string) {
    const r = this.range(u0, v0, u1, v1);
    this.ops.push({
      ...r,
      z0,
      z1,
      draw: () => {
        const { gx0, gx1, gy0, gy1 } = r;
        const g = this.g;
        const top = [this.sp(gx0, gy0, z1), this.sp(gx1, gy0, z1), this.sp(gx1, gy1, z1), this.sp(gx0, gy1, z1)];
        const right = [this.sp(gx1, gy0, z1), this.sp(gx1, gy1, z1), this.sp(gx1, gy1, z0), this.sp(gx1, gy0, z0)];
        const left = [this.sp(gx0, gy1, z1), this.sp(gx1, gy1, z1), this.sp(gx1, gy1, z0), this.sp(gx0, gy1, z0)];
        const line = shade(color, 0.45);
        if (z1 > z0) {
          g.fillStyle(shade(color, 0.62), 1);
          g.fillPoints(left, true);
          g.fillStyle(shade(color, 0.82), 1);
          g.fillPoints(right, true);
        }
        g.fillStyle(shade(color, 1), 1);
        g.fillPoints(top, true);
        g.lineStyle(1, line, 0.5);
        g.strokePoints(top, true);
        if (z1 > z0) {
          g.strokePoints(left, true);
          g.strokePoints(right, true);
        }
      },
    });
  }

  /** 床に貼る平面 */
  flat(u0: number, v0: number, u1: number, v1: number, color: number | string) {
    const r = this.range(u0, v0, u1, v1);
    this.ops.push({
      ...r,
      z0: 0,
      z1: 0,
      draw: () => {
        const pts = [
          this.sp(r.gx0, r.gy0, 0),
          this.sp(r.gx1, r.gy0, 0),
          this.sp(r.gx1, r.gy1, 0),
          this.sp(r.gx0, r.gy1, 0),
        ];
        this.g.fillStyle(typeof color === 'string' ? toInt(color) : color, 1);
        this.g.fillPoints(pts, true);
      },
    });
  }

  outlineFlat(u0: number, v0: number, u1: number, v1: number, color: number | string) {
    const r = this.range(u0, v0, u1, v1);
    this.ops.push({
      ...r,
      z0: 0,
      z1: 0.01,
      draw: () => {
        const pts = [
          this.sp(r.gx0, r.gy0, 0),
          this.sp(r.gx1, r.gy0, 0),
          this.sp(r.gx1, r.gy1, 0),
          this.sp(r.gx0, r.gy1, 0),
        ];
        this.g.lineStyle(1, typeof color === 'string' ? toInt(color) : color, 0.8);
        this.g.strokePoints(pts, true);
      },
    });
  }

  /** 球っぽい塊（植物の葉など） */
  blob(u: number, v: number, z: number, rx: number, ry: number, color: number | string) {
    const [gx, gy] = this.map(u, v);
    this.ops.push({
      gx0: gx - 0.02,
      gx1: gx + 0.02,
      gy0: gy - 0.02,
      gy1: gy + 0.02,
      z0: z,
      z1: z + ry,
      draw: () => {
        const p = this.sp(gx, gy, z);
        this.g.fillStyle(shade(color, 0.75), 1);
        this.g.fillEllipse(p.x, p.y + 2, rx * 2, ry * 2);
        this.g.fillStyle(shade(color, 1), 1);
        this.g.fillEllipse(p.x - rx * 0.15, p.y - ry * 0.2, rx * 1.6, ry * 1.6);
      },
    });
  }

  /** 溜めた描画を前後関係の順に実行する */
  flush() {
    const sorted: Op[] = [];
    for (const op of this.ops) {
      let i = sorted.length;
      while (i > 0 && IsoPainter.behind(op, sorted[i - 1])) i--;
      sorted.splice(i, 0, op);
    }
    for (const op of sorted) op.draw();
    this.ops = [];
  }

  /** a を b より先に描くべきか（a が b の奥にあるか） */
  private static behind(a: Op, b: Op): boolean {
    const overlap =
      a.gx0 < b.gx1 - EPS && b.gx0 < a.gx1 - EPS && a.gy0 < b.gy1 - EPS && b.gy0 < a.gy1 - EPS;
    if (overlap) return a.z0 < b.z0 - EPS || (Math.abs(a.z0 - b.z0) < EPS && a.z1 < b.z1 - EPS);
    if (a.gx1 <= b.gx0 + EPS) return true;
    if (b.gx1 <= a.gx0 + EPS) return false;
    if (a.gy1 <= b.gy0 + EPS) return true;
    if (b.gy1 <= a.gy0 + EPS) return false;
    return a.gx1 + a.gy1 < b.gx1 + b.gy1;
  }
}

/** 見た目の最大高さ（テクスチャの縦幅を決めるため） */
function maxZOf(def: FurnitureDef): number {
  return def.shape === 'rug' ? 2 : def.height + 4;
}

function paint(painter: IsoPainter, def: FurnitureDef) {
  const [W, D] = def.size;
  const H = def.height;
  const c = def.color;
  const ac = def.accent ?? tint(def.color, 0.45);
  const seatZ = Math.min(def.seatHeight ?? H * 0.5, H);

  switch (def.shape) {
    case 'rug': {
      painter.flat(0, 0, W, D, shade(c, 1));
      painter.flat(0.18, 0.18, W - 0.18, D - 0.18, ac);
      painter.outlineFlat(0, 0, W, D, shade(c, 0.7));
      break;
    }
    case 'box': {
      painter.box(0, 0, W, D, 0, H, c);
      // 前面の扉パネルは footprint の外へわずかに出して、回転しても前後関係が崩れないようにする
      painter.box(0.08, D, W - 0.08, D + 0.03, H * 0.1, H * 0.9, ac);
      painter.box(-0.04, -0.04, W + 0.04, D + 0.04, H, H + 3, shade(c, 0.92));
      if (H >= 50) {
        painter.box(0.05, D, W - 0.05, D + 0.05, H * 0.36, H * 0.36 + 3, shade(ac, 0.8));
        painter.box(0.05, D, W - 0.05, D + 0.05, H * 0.66, H * 0.66 + 3, shade(ac, 0.8));
      }
      break;
    }
    case 'table': {
      const legTop = Math.max(2, H - 5);
      const leg = 0.17;
      const dark = shade(c, 0.8);
      painter.box(0.08, 0.08, 0.08 + leg, 0.08 + leg, 0, legTop, dark);
      painter.box(W - 0.08 - leg, 0.08, W - 0.08, 0.08 + leg, 0, legTop, dark);
      painter.box(0.08, D - 0.08 - leg, 0.08 + leg, D - 0.08, 0, legTop, dark);
      painter.box(W - 0.08 - leg, D - 0.08 - leg, W - 0.08, D - 0.08, 0, legTop, dark);
      painter.box(-0.04, -0.04, W + 0.04, D + 0.04, legTop, H, c);
      break;
    }
    case 'chair': {
      const dark = shade(c, 0.78);
      const leg = 0.15;
      painter.box(0.12, 0.12, 0.12 + leg, 0.12 + leg, 0, seatZ, dark);
      painter.box(W - 0.12 - leg, 0.12, W - 0.12, 0.12 + leg, 0, seatZ, dark);
      painter.box(0.12, D - 0.12 - leg, 0.12 + leg, D - 0.12, 0, seatZ, dark);
      painter.box(W - 0.12 - leg, D - 0.12 - leg, W - 0.12, D - 0.12, 0, seatZ, dark);
      painter.box(0.06, 0.06, W - 0.06, D - 0.06, seatZ, seatZ + 4, c);
      if (H > seatZ + 8) painter.box(0.09, 0.02, W - 0.09, 0.28, seatZ + 4, H, c);
      if (def.accent) painter.box(0.16, 0.34, W - 0.16, D - 0.1, seatZ + 4, seatZ + 7, ac);
      break;
    }
    case 'sofa': {
      painter.box(0.03, 0.03, W - 0.03, D - 0.03, 0, seatZ, c);
      painter.box(0.03, 0.03, W - 0.03, 0.32, seatZ, H, c);
      painter.box(0.03, 0.32, 0.3, D - 0.03, seatZ, seatZ + 11, shade(c, 0.95));
      painter.box(W - 0.3, 0.32, W - 0.03, D - 0.03, seatZ, seatZ + 11, shade(c, 0.95));
      for (let i = 0; i < W; i++) {
        painter.box(i + 0.34, 0.36, i + 0.94, D - 0.08, seatZ, seatZ + 6, ac);
      }
      break;
    }
    case 'bed': {
      painter.box(0.03, 0.03, W - 0.03, D - 0.03, 0, 12, c);
      painter.box(0.03, 0.03, W - 0.03, 0.3, 12, H, shade(c, 0.92));
      painter.box(0.07, 0.32, W - 0.07, D - 0.07, 12, 24, ac);
      painter.box(0.18, 0.4, W - 0.18, 0.95, 24, 31, tint(ac, 0.15));
      break;
    }
    case 'plant': {
      const potH = Math.max(8, H * 0.24);
      painter.box(0.3, 0.3, 0.7, 0.7, 0, potH, c);
      painter.box(0.26, 0.26, 0.74, 0.74, potH, potH + 3, shade(c, 0.85));
      const leafZ = potH + 4;
      const span = H - leafZ;
      painter.blob(0.5, 0.5, leafZ + span * 0.35, span * 0.28, span * 0.22, shade(ac, 0.82));
      painter.blob(0.34, 0.6, leafZ + span * 0.6, span * 0.26, span * 0.2, ac);
      painter.blob(0.68, 0.42, leafZ + span * 0.62, span * 0.24, span * 0.19, shade(ac, 0.9));
      painter.blob(0.5, 0.48, leafZ + span * 0.92, span * 0.26, span * 0.2, tint(ac, 0.12));
      break;
    }
    case 'lamp': {
      const dark = shade(c, 0.8);
      painter.box(0.34, 0.34, 0.66, 0.66, 0, 4, dark);
      painter.box(0.45, 0.45, 0.55, 0.55, 4, H - 18, dark);
      painter.box(0.24, 0.24, 0.76, 0.76, H - 18, H, ac);
      break;
    }
    case 'tv': {
      const dark = shade(c, 0.7);
      painter.box(W / 2 - 0.28, 0.38, W / 2 + 0.28, 0.62, 0, 10, dark);
      painter.box(0.06, 0.3, W - 0.06, 0.62, 10, H, c);
      // 画面は本体の正面にぴったり接して置く（重なるとテクスチャ内の順序が破綻する）
      painter.box(0.1, 0.62, W - 0.1, 0.66, 14, H - 5, ac);
      break;
    }
  }
  painter.flush();
}

/** 家具1つ分のテクスチャを生成（同じ key は再利用） */
export function getFurnitureTexture(scene: Phaser.Scene, def: FurnitureDef, rot: Rotation): FurnitureTexture {
  const key = `fur:${def.id}:${rot}`;
  const hit = cache.get(key);
  if (hit && scene.textures.exists(key)) return hit;

  const [gw, gd] = rotatedSize(def.size, rot);
  const maxZ = maxZOf(def);
  const width = (gw + gd) * HW + PAD * 2;
  const height = (gw + gd) * HH + maxZ + PAD * 2;
  const offX = gd * HW + PAD;
  const offY = maxZ + PAD;

  const g = scene.add.graphics({ x: 0, y: 0 });
  g.setVisible(false);
  paint(new IsoPainter(g, offX, offY, rot, def.size[0], def.size[1]), def);
  g.generateTexture(key, Math.ceil(width), Math.ceil(height));
  g.destroy();

  const meta: FurnitureTexture = {
    key,
    width,
    height,
    originX: offX / width,
    originY: offY / height,
  };
  cache.set(key, meta);
  return meta;
}

/** DOM のカタログ用アイコンを、生成済みテクスチャから作る */
export function makeIconCanvas(scene: Phaser.Scene, def: FurnitureDef): HTMLCanvasElement {
  const meta = getFurnitureTexture(scene, def, 0);
  const src = scene.textures.get(meta.key).getSourceImage() as CanvasImageSource;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(meta.width);
  canvas.height = Math.ceil(meta.height);
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(src, 0, 0);
  return canvas;
}
