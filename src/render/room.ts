import Phaser from 'phaser';
import {
  FLOOR_STYLES,
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
import { blend, shade } from './color';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** 部屋の外側（画面の余白）の色。外の部屋では、しばふの色でうめる */
const INDOOR_BACKDROP = 0x2b2430;

/**
 * 外の部屋の遠景（VR の `vr/sky3d.ts` と同じ景色を、等角の画面にも描く）。
 * 色はそちらと合わせてあるので、片方を変えたらもう片方も変えること。
 */
const SKY_TOP = 0x2f7fcc;
const SKY_MID = 0x6fb2e8;
const SKY_LOW = 0xcfe8f7;
const SEA = 0x3a8dc6;
const SEA_SHALLOW = 0x79c6dd;
const SURF = 0xf4fbfd;
const SAND = 0xe8dcb8;
const MOUNTAIN_FAR = 0x9db2cc;
const MOUNTAIN_NEAR = 0x81a0c2;
const SUN = 0xfff8dc;
const CLOUD = 0xffffff;
const CLOUD_SHADE = 0xbccfe2;

/** 遠景を描く横はば（部屋の北かどから左右へ）。どこへパンしても足りる大きさ */
const SKY_W = 2600;
/**
 * 空のグラデーションの高さ。これより上は一色。
 *
 * 等角の画面は部屋に合わせて寄っているので、部屋の北かどより上に使える
 * 高さは **70px ほどしかない**（`applyFitZoom` が壁のぶんだけ余白を取り、
 * さらに上端は画面のヘッダーが覆う）。遠景はぜんぶその中に収めてある。
 */
const SKY_FADE = 300;
/** 波打ちぎわの高さ（部屋の北かどより上へ何px） */
const SHORE_UP = 20;
/** 海の帯のあつみ */
const SEA_H = 12;

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
  /** 外の部屋の遠景（空・雲・山・海）。床や壁より奥に敷く */
  private readonly skyG: Phaser.GameObjects.Graphics;
  private size = 12;
  /** 部分的に張り替えた床。キーは "gx,gy" */
  private patch: Record<string, number> = {};
  /** 時間帯。null なら色調をかけない（月コロニーなど、いつも同じ空の部屋） */
  private tod: TimeOfDay | null = null;
  /** 部屋のまわり（画面の余白）の色 */
  private backdropColor = INDOOR_BACKDROP;

  /** 時間帯の色調をかけた色 */
  private tone(color: number): number {
    return this.tod === null ? color : applyTimeOfDay(color, TIME_OF_DAY[this.tod]);
  }

  constructor(scene: Phaser.Scene) {
    this.skyG = scene.add.graphics().setDepth(-2500);
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
    const wall = WALL_STYLES[wallIdx % WALL_STYLES.length];
    const floor = FLOOR_STYLES[floorIdx % FLOOR_STYLES.length];
    // 外の部屋は、まわりも床とおなじ色にする。そうすると芝が画面の外まで
    // 続いて見えて、四角い板の上に立っているように見えない
    this.backdropColor = isOutdoorWall(wall) ? this.tone(floor.a) : INDOOR_BACKDROP;
    this.drawSky(isOutdoorWall(wall));
    this.drawWalls(wall);
    this.drawFloor(floor);
  }

  /** 画面の余白に敷く色。`redraw` のあとに読むこと */
  backdrop(): number {
    return this.backdropColor;
  }

  /**
   * 外の部屋の遠景。部屋の北かど（画面のいちばん奥）の上に、
   * 波打ちぎわ → 海 → 山 → 空 を積む。VR で外に出たときと同じ景色。
   *
   * 画面に固定するのではなく、**部屋と同じ世界の座標に**大きく描いてある。
   * そうすると、寄ったり動かしたりしたときに遠景も一緒に動いて、
   * 部屋の奥に続いているように見える。
   */
  private drawSky(outdoor: boolean) {
    const g = this.skyG;
    g.clear();
    if (!outdoor) return;

    const cx = 0; // gridToScreen(0, 0) は原点
    const shore = -SHORE_UP; // 波打ちぎわ
    const horizon = shore - SEA_H; // 水平線（海のむこう端）
    const left = cx - SKY_W;
    const w = SKY_W * 2;

    // 空。上は一色、地平線に近いほど白っぽく
    g.fillStyle(this.tone(SKY_TOP), 1);
    g.fillRect(left, horizon - 2400, w, 2400 - SKY_FADE);
    const bands = 44;
    for (let i = 0; i < bands; i++) {
      // 白っぽくなるのは地平線のすぐ上だけ。上のほうは青のままにしたいので、
      // 混ぜぐあいを 3乗して、変化を下に寄せる
      const u = (i / (bands - 1)) ** 3;
      const c = u < 0.5 ? blend(SKY_TOP, SKY_MID, u * 2) : blend(SKY_MID, SKY_LOW, (u - 0.5) * 2);
      g.fillStyle(this.tone(c), 1);
      // 1px かさねて、帯のすきまが出ないように
      g.fillRect(left, horizon - SKY_FADE + (SKY_FADE * i) / bands, w, SKY_FADE / bands + 1);
    }

    this.drawSun(g, cx + 170, horizon - 50);
    this.drawClouds(g, cx, horizon);
    this.drawMountains(g, cx, horizon);

    // 海。岸に近いほど明るくして浅瀬に見せる
    g.fillStyle(this.tone(SEA), 1);
    g.fillRect(left, horizon, w, SEA_H);
    g.fillStyle(this.tone(SEA_SHALLOW), 1);
    g.fillRect(left, shore - 5, w, 5);
    // 沖の波のすじ
    for (let i = 0; i < 2; i++) {
      g.fillStyle(this.tone(0xffffff), 0.16 - i * 0.05);
      g.fillRect(left, horizon + 4 + i * 4, w, 1.2);
    }
    // 白波と砂浜
    g.fillStyle(this.tone(SURF), 1);
    g.fillRect(left, shore - 2, w, 3);
    g.fillStyle(this.tone(SAND), 1);
    g.fillRect(left, shore + 1, w, 5);
  }

  /** お日さま。まわりのにじみは、うすい円をかさねて作る */
  private drawSun(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    for (let i = 5; i >= 1; i--) {
      g.fillStyle(this.tone(SUN), 0.07);
      g.fillCircle(x, y, 11 + i * 6);
    }
    g.fillStyle(this.tone(SUN), 1);
    g.fillCircle(x, y, 11);
  }

  /**
   * 雲。てっぺんが もくもく で 底が平らな積雲。
   * おなじ形を すこし下にずらして灰色で先に描くと、下側だけ影になって厚みが出る
   */
  private drawClouds(g: Phaser.GameObjects.Graphics, cx: number, horizon: number) {
    for (let i = 0; i < 11; i++) {
      const x = cx - 900 + (i + noise(i, 3) * 0.8) * 165;
      const y = horizon - 26 - noise(i, 4) * 24;
      const r = 7 + noise(i, 5) * 7;
      this.puffs(g, x, y + r * 0.22, r, CLOUD_SHADE, 1);
      this.puffs(g, x, y, r, CLOUD, 1);
    }
  }

  /** 雲ひとつぶんの ふくらみ。底は四角でそろえる */
  private puffs(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number, alpha: number) {
    const lobes: Array<[number, number]> = [
      [-1.9, 0.6],
      [-0.85, 0.92],
      [0.15, 1],
      [1.15, 0.78],
      [2.0, 0.55],
    ];
    g.fillStyle(this.tone(color), alpha);
    for (const [dx, k] of lobes) g.fillCircle(x + dx * r, y - k * r * 0.62, r * k);
    g.fillRect(x - 1.9 * r, y - r * 0.5, 3.9 * r, r * 0.5);
  }

  /** 海のむこうの山。奥の列を うすい色で、手前の列を すこし濃く */
  private drawMountains(g: Phaser.GameObjects.Graphics, cx: number, horizon: number) {
    for (const [seed, count, lo, hi, color] of [
      [11, 20, 8, 20, MOUNTAIN_FAR],
      [23, 13, 12, 30, MOUNTAIN_NEAR],
    ] as Array<[number, number, number, number, number]>) {
      for (let i = 0; i < count; i++) {
        const h = lo + noise(i, seed) * (hi - lo);
        const half = h * (0.85 + noise(i, seed + 1) * 0.7);
        const x = cx - 950 + (i + noise(i, seed + 2) * 0.9) * (1900 / count);
        g.fillStyle(this.tone(color), 1);
        g.fillPoints(
          [
            { x: x - half, y: horizon + 2 },
            { x, y: horizon - h },
            { x: x + half, y: horizon + 2 },
          ],
          true,
        );
      }
    }
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
    // 外の部屋には壁がない。空を描いた板を立てると、庭ではなく
    // 「空の絵をかけた部屋」に見えてしまう
    if (isOutdoorWall(style)) return;
    const n = gridToScreen(0, 0);
    const e = gridToScreen(this.size, 0);
    const w = gridToScreen(0, this.size);

    // 右側の壁（gy = 0 の縁）
    this.wallQuad(g, n, e, this.tone(style.a), style.pattern);
    // 左側の壁（gx = 0 の縁）
    this.wallQuad(g, n, w, this.tone(style.b), style.pattern);

    // 2枚の壁の継ぎ目
    g.lineStyle(1, this.tone(shade(style.b, 0.7)), 0.6);
    g.lineBetween(n.x, n.y, n.x, n.y - WALL_H);
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
