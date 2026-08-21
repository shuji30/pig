import Phaser from 'phaser';
import { GOLD, GOLD_LIGHT, TILE_H, TILE_W } from '../config';
import { rotatedSize } from '../core/iso';
import type { FurnitureDef, Recolor, Rotation } from '../types';
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

  /** 小さな飾り鋲（クッションのくるみボタンなど） */
  stud(u: number, v: number, z: number, r: number, color: number | string) {
    const [gx, gy] = this.map(u, v);
    this.ops.push({
      gx0: gx - 0.01,
      gx1: gx + 0.01,
      gy0: gy - 0.01,
      gy1: gy + 0.01,
      z0: z,
      z1: z + 0.4,
      draw: () => {
        const pt = this.sp(gx, gy, z);
        this.g.fillStyle(shade(color, 0.7), 1);
        this.g.fillEllipse(pt.x, pt.y + 0.6, r * 2, r);
        this.g.fillStyle(shade(color, 1.08), 1);
        this.g.fillEllipse(pt.x, pt.y, r * 1.5, r * 0.75);
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

/** 見た目の最大高さ（テクスチャの縦幅を決めるため。頂部の飾りぶんの余裕を含む） */
function maxZOf(def: FurnitureDef): number {
  return def.shape === 'rug' ? 2 : def.height + 14;
}

/**
 * 猫脚（カブリオレレッグ）。曲線は描けないので、外→内→外と3段に振った箱で S 字を近似する。
 * (cu, cv) は脚の中心、(du, dv) はその脚が向いている外側の向き。
 */
function cabriole(
  p: IsoPainter,
  cu: number,
  cv: number,
  du: number,
  dv: number,
  s: number,
  h: number,
  color: number | string,
) {
  const out = s * 0.42;
  const box = (
    ou: number,
    ov: number,
    half: number,
    z0: number,
    z1: number,
    col: number | string,
  ) => p.box(cu + ou - half, cv + ov - half, cu + ou + half, cv + ov + half, z0, z1, col);

  // 膝（外へ張り出す） -> 中間（内へ絞る） -> 足首（また外へ） -> 金の脚先
  box(du * out, dv * out, s * 0.5, h * 0.6, h, color);
  box(0, 0, s * 0.42, h * 0.28, h * 0.64, shade(color, 0.95));
  box(du * out * 0.7, dv * out * 0.7, s * 0.4, h * 0.1, h * 0.32, color);
  box(du * out * 0.7, dv * out * 0.7, s * 0.46, 0, h * 0.12, GOLD);
}

/** 4隅に猫脚を立てる */
function cabrioleLegs(p: IsoPainter, W: number, D: number, s: number, h: number, color: number | string) {
  const m = s * 0.85;
  cabriole(p, m, m, -1, -1, s, h, color);
  cabriole(p, W - m, m, 1, -1, s, h, color);
  cabriole(p, m, D - m, -1, 1, s, h, color);
  cabriole(p, W - m, D - m, 1, 1, s, h, color);
}

/** くるみボタン留めのクッション */
function tufted(
  p: IsoPainter,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  z: number,
  thickness: number,
  fabric: number | string,
) {
  p.box(u0, v0, u1, v1, z, z + thickness, fabric);
  const top = z + thickness;
  const cols = Math.max(1, Math.round((u1 - u0) / 0.34));
  const rows = Math.max(1, Math.round((v1 - v0) / 0.34));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const u = u0 + ((i + 0.5) * (u1 - u0)) / cols;
      const v = v0 + ((j + 0.5) * (v1 - v0)) / rows;
      p.stud(u, v, top + 0.3, 2.1, GOLD);
    }
  }
}

function paint(painter: IsoPainter, def: FurnitureDef) {
  const [W, D] = def.size;
  const H = def.height;
  const c = def.color;
  const ac = def.accent ?? tint(def.color, 0.45);
  const seatZ = Math.min(def.seatHeight ?? H * 0.5, H);

  switch (def.shape) {
    case 'rug': {
      // 縁 -> 内側の地 -> 中央のメダイヨン、という段構えの絨毯
      painter.flat(0, 0, W, D, shade(c, 1));
      painter.flat(0.16, 0.16, W - 0.16, D - 0.16, ac);
      const r = Math.min(W, D) * 0.26;
      painter.flat(W / 2 - r, D / 2 - r, W / 2 + r, D / 2 + r, shade(c, 1));
      painter.flat(W / 2 - r * 0.52, D / 2 - r * 0.52, W / 2 + r * 0.52, D / 2 + r * 0.52, tint(c, 0.55));
      painter.outlineFlat(0, 0, W, D, shade(c, 0.68));
      painter.outlineFlat(0.16, 0.16, W - 0.16, D - 0.16, GOLD);
      break;
    }
    case 'box': {
      // 背の低いものは猫脚のコモード、高いものは金の台輪に載せる
      const onLegs = H <= 50;
      const bodyZ = onLegs ? 11 : 5;
      if (onLegs) cabrioleLegs(painter, W, D, 0.16, bodyZ + 2, c);
      else painter.box(-0.02, -0.02, W + 0.02, D + 0.02, 0, bodyZ, GOLD);

      painter.box(0.03, 0.03, W - 0.03, D - 0.03, bodyZ, H - 5, c);
      // 正面の金彩パネル（footprint の外へ出して回転しても前後が崩れないようにする）
      painter.box(0.1, D - 0.03, W - 0.1, D + 0.02, bodyZ + 5, H - 10, GOLD);
      painter.box(0.17, D + 0.02, W - 0.17, D + 0.04, bodyZ + 8, H - 13, tint(c, 0.3));
      if (H >= 50) {
        const mid = (bodyZ + H) / 2;
        painter.box(0.07, D - 0.03, W - 0.07, D + 0.03, mid, mid + 3, GOLD);
      }
      // コーニス（天板まわりの金の繰形）
      painter.box(-0.06, -0.06, W + 0.06, D + 0.06, H - 5, H - 2, GOLD);
      painter.box(-0.03, -0.03, W + 0.03, D + 0.03, H - 2, H, tint(ac, 0.35));
      break;
    }
    case 'table': {
      const legH = Math.max(6, H - 8);
      cabrioleLegs(painter, W, D, 0.18, legH, c);
      painter.box(0.12, 0.12, W - 0.12, D - 0.12, legH - 6, legH, c); // 幕板
      painter.box(-0.05, -0.05, W + 0.05, D + 0.05, legH, legH + 3, GOLD);
      painter.box(-0.02, -0.02, W + 0.02, D + 0.02, legH + 3, H, ac); // 大理石の甲板
      break;
    }
    case 'chair': {
      cabrioleLegs(painter, W, D, 0.15, seatZ, c);
      painter.box(0.09, 0.09, W - 0.09, D - 0.09, seatZ - 3, seatZ + 1, c);
      painter.box(-0.02, -0.02, W + 0.02, D + 0.02, seatZ + 1, seatZ + 3, GOLD);
      tufted(painter, 0.13, 0.13, W - 0.13, D - 0.13, seatZ + 3, 5, ac);

      if (H > seatZ + 14) {
        painter.box(0.13, 0.07, W - 0.13, 0.2, seatZ + 3, H - 6, c);
        painter.box(0.21, 0.2, W - 0.21, 0.24, seatZ + 7, H - 11, ac);
        // 笠木（トップレール）とその中央の彫刻
        painter.box(0.1, 0.05, W - 0.1, 0.22, H - 6, H - 1, GOLD);
        painter.blob(W / 2, 0.14, H - 1, 5.6, 4.4, GOLD_LIGHT);
      }
      break;
    }
    case 'sofa': {
      const frameZ = Math.max(6, seatZ - 8);
      cabrioleLegs(painter, W, D, 0.16, frameZ, c);
      painter.box(0.05, 0.05, W - 0.05, D - 0.05, frameZ - 4, seatZ, c);
      painter.box(-0.02, -0.02, W + 0.02, D + 0.02, seatZ, seatZ + 2, GOLD);

      // 背もたれ（張地 + 笠木の彫刻）
      painter.box(0.05, 0.05, W - 0.05, 0.3, seatZ + 2, H - 5, c);
      painter.box(0.15, 0.3, W - 0.15, 0.34, seatZ + 5, H - 9, ac);
      painter.box(0.03, 0.03, W - 0.03, 0.32, H - 5, H - 1, GOLD);
      painter.blob(W / 2, 0.18, H - 1, 6.4, 4.8, GOLD_LIGHT);
      painter.blob(W * 0.22, 0.18, H - 1, 3.6, 3, GOLD_LIGHT);
      painter.blob(W * 0.78, 0.18, H - 1, 3.6, 3, GOLD_LIGHT);

      // 肘掛け（外側に巻き込むイメージで2段）
      for (const side of [0, 1]) {
        const u0 = side === 0 ? 0.05 : W - 0.28;
        const u1 = side === 0 ? 0.28 : W - 0.05;
        painter.box(u0, 0.34, u1, D - 0.05, seatZ + 2, seatZ + 13, c);
        painter.box(u0 - 0.02, 0.32, u1 + 0.02, D - 0.03, seatZ + 13, seatZ + 15, GOLD);
      }

      // 座面クッションは肘掛けの内側にきっちり収める
      const inner0 = 0.32;
      const inner1 = W - 0.32;
      const n = Math.max(1, Math.round(W));
      const cw = (inner1 - inner0) / n;
      for (let i = 0; i < n; i++) {
        tufted(painter, inner0 + i * cw + 0.03, 0.36, inner0 + (i + 1) * cw - 0.03, D - 0.1, seatZ + 2, 6, ac);
      }
      break;
    }
    case 'bed': {
      cabrioleLegs(painter, W, D, 0.17, 10, c);
      painter.box(0.05, 0.05, W - 0.05, D - 0.05, 6, 16, c);
      painter.box(-0.02, -0.02, W + 0.02, D + 0.02, 16, 17, GOLD);

      // ヘッドボード
      painter.box(0.05, 0.05, W - 0.05, 0.26, 17, H - 5, c);
      painter.box(0.17, 0.26, W - 0.17, 0.3, 22, H - 9, tint(ac, 0.1));
      painter.box(0.03, 0.03, W - 0.03, 0.28, H - 5, H - 1, GOLD);
      painter.blob(W / 2, 0.16, H - 1, 6.8, 5.2, GOLD_LIGHT);
      painter.blob(W * 0.2, 0.16, H - 1, 3.6, 3, GOLD_LIGHT);
      painter.blob(W * 0.8, 0.16, H - 1, 3.6, 3, GOLD_LIGHT);

      // フットボード
      painter.box(0.05, D - 0.2, W - 0.05, D - 0.05, 17, 30, c);
      painter.box(0.03, D - 0.22, W - 0.03, D - 0.03, 30, 33, GOLD);

      // 寝具
      painter.box(0.1, 0.3, W - 0.1, D - 0.22, 17, 27, ac);
      painter.box(0.2, 0.36, W - 0.2, 0.9, 27, 34, tint(ac, 0.2));
      painter.box(0.1, 0.94, W - 0.1, D - 0.22, 27, 31, tint(c, 0.15));
      break;
    }
    case 'plant': {
      const potH = Math.max(11, H * 0.27);
      painter.box(0.34, 0.34, 0.66, 0.66, 0, 4, GOLD);
      painter.box(0.3, 0.3, 0.7, 0.7, 4, potH, c);
      painter.box(0.25, 0.25, 0.75, 0.75, potH, potH + 4, GOLD);
      const leafZ = potH + 5;
      const span = H - leafZ;
      painter.blob(0.5, 0.5, leafZ + span * 0.35, span * 0.28, span * 0.22, shade(ac, 0.82));
      painter.blob(0.34, 0.6, leafZ + span * 0.6, span * 0.26, span * 0.2, ac);
      painter.blob(0.68, 0.42, leafZ + span * 0.62, span * 0.24, span * 0.19, shade(ac, 0.9));
      painter.blob(0.5, 0.48, leafZ + span * 0.92, span * 0.26, span * 0.2, tint(ac, 0.12));
      break;
    }
    case 'lamp': {
      painter.box(0.3, 0.3, 0.7, 0.7, 0, 5, c);
      painter.box(0.37, 0.37, 0.63, 0.63, 5, 11, GOLD_LIGHT);
      painter.box(0.46, 0.46, 0.54, 0.54, 11, H - 24, c);
      painter.box(0.38, 0.38, 0.62, 0.62, H - 26, H - 20, GOLD_LIGHT);
      painter.box(0.3, 0.3, 0.7, 0.7, H - 20, H - 16, c);
      // ろうそくと炎
      painter.box(0.42, 0.42, 0.58, 0.58, H - 16, H - 5, ac);
      painter.blob(0.5, 0.5, H - 3, 3.4, 4.2, '#ffd77a');
      break;
    }
    case 'tv': {
      painter.box(W / 2 - 0.3, 0.42, W / 2 + 0.3, 0.58, 0, 6, c);
      painter.box(W / 2 - 0.08, 0.46, W / 2 + 0.08, 0.54, 6, 13, c);
      painter.box(0.05, 0.34, W - 0.05, 0.6, 13, H, c); // 金の額縁
      painter.box(0.13, 0.6, W - 0.13, 0.63, 17, H - 5, ac); // 画面
      painter.blob(W / 2, 0.47, H, 6.4, 4.8, GOLD_LIGHT); // 額縁上部の彫刻
      break;
    }
  }
  painter.flush();
}

/** 家具1つ分のテクスチャを生成（同じ key は再利用） */
/**
 * 色を差し替えた定義を作る。形は同じままなので、
 * 1種類から何色でも増やせる（供給効率がいちばん高い増やし方）。
 */
export function recolored(def: FurnitureDef, recolor?: Recolor): FurnitureDef {
  if (!recolor || (!recolor.color && !recolor.accent)) return def;
  return {
    ...def,
    color: recolor.color ?? def.color,
    accent: recolor.accent ?? def.accent,
  };
}

/** キャッシュのキーに色を含める。同じ形の色違いは別テクスチャになる */
function recolorKey(recolor?: Recolor): string {
  if (!recolor) return '';
  const c = recolor.color ?? '';
  const a = recolor.accent ?? '';
  return c || a ? `:${c}${a}` : '';
}

export function getFurnitureTexture(
  scene: Phaser.Scene,
  baseDef: FurnitureDef,
  rot: Rotation,
  recolor?: Recolor,
): FurnitureTexture {
  const def = recolored(baseDef, recolor);
  const key = `fur:${def.id}:${rot}${recolorKey(recolor)}`;
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
