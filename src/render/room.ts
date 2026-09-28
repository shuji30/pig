import Phaser from 'phaser';
import {
  FLOOR_STYLES,
  HEDGE_H,
  isOutdoorWall,
  TILE_H,
  TILE_W,
  WALL_H,
  WALL_STYLES,
  type FloorStyle,
  type WallStyle,
} from '../config';
import { gridToScreen } from '../core/iso';
import { applyTimeOfDay, TIME_OF_DAY, type TimeOfDay } from '../core/timeOfDay';
import { shade } from './color';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** いけがきの色。空の色から作れないので、ここに持つ（時間帯はかける） */
const HEDGE = 0x5f9e55;
const HEDGE_LIGHT = 0x76b568;
const HEDGE_DARK = 0x4a7f43;

/**
 * マスごとの、決まった乱数（0..1）。
 * しばふを市松にしないための散らしに使う。毎回おなじ値が出ないと、
 * 描き直すたびに草の向きが変わってちらつく
 */
function noise(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 床と壁の描画。模様替えのたびに描き直す */
export class RoomView {
  private readonly floorG: Phaser.GameObjects.Graphics;
  private readonly wallG: Phaser.GameObjects.Graphics;
  private size = 12;
  /** 部分的に張り替えた床。キーは "gx,gy" */
  private patch: Record<string, number> = {};
  /** 時間帯。null なら色調をかけない（月コロニーなど、いつも同じ空の部屋） */
  private tod: TimeOfDay | null = null;

  /** 時間帯の色調をかけた色 */
  private tone(color: number): number {
    return this.tod === null ? color : applyTimeOfDay(color, TIME_OF_DAY[this.tod]);
  }

  constructor(scene: Phaser.Scene) {
    this.wallG = scene.add.graphics().setDepth(-2000);
    this.floorG = scene.add.graphics().setDepth(-1900);
  }

  /**
   * @param size 一辺のマス数（部屋ごとに変わる）
   * @param patch 部分的に張り替えた床（"gx,gy" -> ゆかの番号）
   */
  redraw(
    floorIdx: number,
    wallIdx: number,
    size: number,
    patch: Record<string, number> = {},
    tod: TimeOfDay | null = null,
  ) {
    this.size = size;
    this.patch = patch;
    this.tod = tod;
    this.drawWalls(WALL_STYLES[wallIdx % WALL_STYLES.length]);
    this.drawFloor(FLOOR_STYLES[floorIdx % FLOOR_STYLES.length]);
  }

  private drawFloor(base: (typeof FLOOR_STYLES)[number]) {
    const g = this.floorG;
    g.clear();
    for (let gy = 0; gy < this.size; gy++) {
      for (let gx = 0; gx < this.size; gx++) {
        // そのマスだけ張り替えてあれば、その柄で塗る
        const patched = this.patch[`${gx},${gy}`];
        const style = patched === undefined ? base : (FLOOR_STYLES[patched] ?? base);
        const p = gridToScreen(gx, gy);
        const pts = [
          { x: p.x, y: p.y },
          { x: p.x + HW, y: p.y + HH },
          { x: p.x, y: p.y + TILE_H },
          { x: p.x - HW, y: p.y + HH },
        ];
        this.fillTile(g, style, gx, gy, p, pts);
      }
    }
    const style = base;
    // 床の外周
    const n = gridToScreen(0, 0);
    const e = gridToScreen(this.size, 0);
    const s = gridToScreen(this.size, this.size);
    const w = gridToScreen(0, this.size);
    g.lineStyle(2, this.tone(shade(style.line, 0.8)), 0.9);
    g.strokePoints([n, e, s, w], true);
  }

  /** 1マスぶんの床。柄ごとに中の描き方を変える */
  private fillTile(
    g: Phaser.GameObjects.Graphics,
    style: FloorStyle,
    gx: number,
    gy: number,
    p: { x: number; y: number },
    pts: Array<{ x: number; y: number }>,
  ) {
    // 地の色。板張りは列ごと、しばふはマスごとに散らし、それ以外は市松
    const even =
      style.pattern === 'plank'
        ? gy % 2 === 0
        : style.pattern === 'grass'
          ? noise(gx, gy) < 0.5
          : (gx + gy) % 2 === 0;
    g.fillStyle(this.tone(even ? style.a : style.b), 1);
    g.fillPoints(pts, true);

    const cx = p.x;
    const cy = p.y + HH;
    switch (style.pattern) {
      case 'quad': {
        // 4分割の細かい市松。中の2つだけ色を変える
        g.fillStyle(this.tone(even ? style.b : style.a), 1);
        g.fillPoints(
          [{ x: cx, y: p.y }, { x: cx + HW / 2, y: p.y + HH / 2 }, { x: cx, y: cy }, { x: cx - HW / 2, y: p.y + HH / 2 }],
          true,
        );
        g.fillPoints(
          [
            { x: cx, y: cy },
            { x: cx + HW / 2, y: cy + HH / 2 },
            { x: cx, y: p.y + TILE_H },
            { x: cx - HW / 2, y: cy + HH / 2 },
          ],
          true,
        );
        break;
      }
      case 'star': {
        // 寄木。中央に一回り小さい菱形を置いて、continuous な柄に見せる
        const k = 0.46;
        g.fillStyle(this.tone(even ? style.b : style.a), 1);
        g.fillPoints(
          [
            { x: cx, y: cy - HH * k },
            { x: cx + HW * k, y: cy },
            { x: cx, y: cy + HH * k },
            { x: cx - HW * k, y: cy },
          ],
          true,
        );
        break;
      }
      case 'inset': {
        // 目地。内側に一回り小さい面を置く
        const k = 0.82;
        g.fillStyle(this.tone(style.a), 1);
        g.fillPoints(
          [
            { x: cx, y: cy - HH * k },
            { x: cx + HW * k, y: cy },
            { x: cx, y: cy + HH * k },
            { x: cx - HW * k, y: cy },
          ],
          true,
        );
        break;
      }
      case 'plank': {
        // 板の継ぎ目。1マスを2枚に見せる線を1本入れる
        g.lineStyle(1, this.tone(shade(style.line, 0.92)), 0.55);
        g.lineBetween(cx - HW, cy, cx, cy + HH);
        break;
      }
      case 'grass': {
        // しばふ。**マスの縁を描かない。**線を引くと、とたんに
        // 「みどりのカーペット」に見える。かわりに短い草を散らす
        for (let i = 0; i < 5; i++) {
          const a = noise(gx * 7 + i, gy * 13);
          const b = noise(gx * 17, gy * 23 + i);
          // ひし形の中に収める（|dx|/HW + |dy|/HH <= 1）
          const u = (a - 0.5) * 1.5;
          const v = (b - 0.5) * (1 - Math.abs(u)) * 1.5;
          const x = cx + u * HW;
          const y = cy + v * HH;
          const len = 3 + a * 2.5;
          g.lineStyle(1, this.tone(i % 2 === 0 ? style.line : shade(style.a, 1.12)), 0.75);
          g.lineBetween(x, y, x + (b - 0.5) * 2.4, y - len);
        }
        break;
      }
      default:
        break;
    }

    if (style.pattern !== 'grass') {
      g.lineStyle(1, this.tone(style.line), style.pattern === 'plank' ? 0.3 : 0.5);
      g.strokePoints(pts, true);
    }
  }

  private drawWalls(style: WallStyle) {
    const g = this.wallG;
    g.clear();
    const n = gridToScreen(0, 0);
    const e = gridToScreen(this.size, 0);
    const w = gridToScreen(0, this.size);

    // 右側の壁（gy = 0 の縁）
    this.wallQuad(g, n, e, this.tone(style.a), style.pattern);
    // 左側の壁（gx = 0 の縁）
    this.wallQuad(g, n, w, this.tone(style.b), style.pattern);

    // 継ぎ目。いけがきは空まで線を引くと目立つので、囲いのぶんだけ
    const seamH = isOutdoorWall(style) ? HEDGE_H : WALL_H;
    g.lineStyle(1, this.tone(isOutdoorWall(style) ? HEDGE_DARK : shade(style.b, 0.7)), 0.6);
    g.lineBetween(n.x, n.y, n.x, n.y - seamH);
  }

  private wallQuad(
    g: Phaser.GameObjects.Graphics,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: number,
    pattern: WallStyle['pattern'] = 'plain',
  ) {
    const pts = [
      { x: from.x, y: from.y - WALL_H },
      { x: to.x, y: to.y - WALL_H },
      { x: to.x, y: to.y },
      { x: from.x, y: from.y },
    ];
    g.fillStyle(color, 1);
    g.fillPoints(pts, true);
    this.wallPattern(g, from, to, color, pattern);
    // いけがきは部屋の壁ではなく囲いなので、モールディングも幅木も付けない。
    // これを付けると、とたんに「みどりの部屋」に見えてしまう
    if (pattern === 'hedge') return;
    // 上部のモールディング
    const trim = 8;
    g.fillStyle(shade(color, 1.06), 1);
    g.fillPoints(
      [
        { x: from.x, y: from.y - WALL_H },
        { x: to.x, y: to.y - WALL_H },
        { x: to.x, y: to.y - WALL_H + trim },
        { x: from.x, y: from.y - WALL_H + trim },
      ],
      true,
    );
    // 幅木
    g.fillStyle(shade(color, 0.86), 1);
    g.fillPoints(
      [
        { x: from.x, y: from.y - 10 },
        { x: to.x, y: to.y - 10 },
        { x: to.x, y: to.y },
        { x: from.x, y: from.y },
      ],
      true,
    );
    g.lineStyle(1, shade(color, 0.72), 0.8);
    g.strokePoints(pts, true);
  }

  /**
   * 壁の柄。壁面の点は「沿った割合 t（0..1）と、床からの高さ h」で決まる。
   * 平行四辺形なので、両端を t で混ぜて y から h を引けばよい。
   */
  private wallPattern(
    g: Phaser.GameObjects.Graphics,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: number,
    pattern: WallStyle['pattern'],
  ) {
    if (pattern === 'plain') return;
    const at = (t: number, h: number) => ({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t - h,
    });
    const quad = (t0: number, h0: number, t1: number, h1: number, c: number, alpha = 1) => {
      g.fillStyle(c, alpha);
      g.fillPoints([at(t0, h1), at(t1, h1), at(t1, h0), at(t0, h0)], true);
    };

    switch (pattern) {
      case 'stripe': {
        const n = 14;
        for (let i = 0; i < n; i += 2) quad(i / n, 10, (i + 1) / n, WALL_H - 8, shade(color, 0.93));
        break;
      }
      case 'panel': {
        // 腰の高さで見切り、下half に鏡板を並べる
        const rail = WALL_H * 0.42;
        quad(0, 10, 1, rail, shade(color, 0.93));
        quad(0, rail - 3, 1, rail, shade(color, 1.07));
        const n = 6;
        for (let i = 0; i < n; i++) {
          const pad = 0.02;
          quad(i / n + pad, 16, (i + 1) / n - pad, rail - 8, shade(color, 0.87), 0.7);
        }
        break;
      }
      case 'dot': {
        g.fillStyle(shade(color, 0.9), 1);
        const cols = 10;
        const rows = 4;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const t = (c + (r % 2 === 0 ? 0.25 : 0.75)) / cols;
            const h = 16 + ((WALL_H - 30) * r) / rows;
            const pt = at(t, h);
            g.fillCircle(pt.x, pt.y, 2.6);
          }
        }
        break;
      }
      case 'hedge': {
        // 上は空。すこし明るくして、空気の層があるように見せる
        quad(0, HEDGE_H, 1, WALL_H, shade(color, 1.05));
        quad(0, WALL_H * 0.72, 1, WALL_H, shade(color, 1.1));
        // くも。ひとつを3つの丸で作る（ばらばらに置くと ただの点に見える）
        g.fillStyle(this.tone(0xffffff), 0.7);
        for (const [ct, ch] of [[0.24, 78], [0.66, 70]]) {
          for (const [dt, dh, r] of [[-0.035, 0, 8], [0, 4, 11], [0.04, -1, 7]]) {
            const pt = at(ct + dt, ch + dh);
            g.fillCircle(pt.x, pt.y, r);
          }
        }
        // いけがき本体
        quad(0, 0, 1, HEDGE_H, this.tone(HEDGE));
        // 上の輪郭を でこぼこ にする。まっすぐだと「塀」に見える
        const bumps = 26;
        g.fillStyle(this.tone(HEDGE_LIGHT), 1);
        for (let i = 0; i <= bumps; i++) {
          const t = i / bumps;
          const pt = at(t, HEDGE_H - 2 + (i % 2 === 0 ? 1.5 : -1));
          g.fillCircle(pt.x, pt.y, 4.6);
        }
        // 葉のつぶ
        for (let i = 0; i < 90; i++) {
          const t = noise(i, 1);
          const h = 2 + noise(i, 2) * (HEDGE_H - 6);
          const pt = at(t, h);
          g.fillStyle(this.tone(noise(i, 3) < 0.5 ? HEDGE_DARK : HEDGE_LIGHT), 0.55);
          g.fillCircle(pt.x, pt.y, 2.2);
        }
        break;
      }
      case 'brick': {
        const rows = 7;
        const cols = 8;
        const rowH = (WALL_H - 10) / rows;
        for (let r = 0; r < rows; r++) {
          const h0 = 8 + rowH * r;
          const offset = r % 2 === 0 ? 0 : 0.5 / cols;
          for (let c = -1; c < cols; c++) {
            const t0 = Math.max(0, c / cols + offset);
            const t1 = Math.min(1, (c + 1) / cols + offset - 0.012);
            if (t1 <= t0) continue;
            quad(t0, h0, t1, h0 + rowH - 2, shade(color, r % 2 === 0 ? 1.03 : 0.95));
          }
        }
        break;
      }
      default:
        break;
    }
  }

  destroy() {
    this.floorG.destroy();
    this.wallG.destroy();
  }
}
