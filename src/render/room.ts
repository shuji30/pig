import Phaser from 'phaser';
import { FLOOR_STYLES, TILE_H, TILE_W, WALL_H, WALL_STYLES } from '../config';
import { gridToScreen } from '../core/iso';
import { shade } from './color';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** 床と壁の描画。模様替えのたびに描き直す */
export class RoomView {
  private readonly floorG: Phaser.GameObjects.Graphics;
  private readonly wallG: Phaser.GameObjects.Graphics;
  private size = 12;
  /** 部分的に張り替えた床。キーは "gx,gy" */
  private patch: Record<string, number> = {};

  constructor(scene: Phaser.Scene) {
    this.wallG = scene.add.graphics().setDepth(-2000);
    this.floorG = scene.add.graphics().setDepth(-1900);
  }

  /**
   * @param size 一辺のマス数（部屋ごとに変わる）
   * @param patch 部分的に張り替えた床（"gx,gy" -> ゆかの番号）
   */
  redraw(floorIdx: number, wallIdx: number, size: number, patch: Record<string, number> = {}) {
    this.size = size;
    this.patch = patch;
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
        g.fillStyle((gx + gy) % 2 === 0 ? style.a : style.b, 1);
        g.fillPoints(pts, true);
        g.lineStyle(1, style.line, 0.5);
        g.strokePoints(pts, true);
      }
    }
    const style = base;
    // 床の外周
    const n = gridToScreen(0, 0);
    const e = gridToScreen(this.size, 0);
    const s = gridToScreen(this.size, this.size);
    const w = gridToScreen(0, this.size);
    g.lineStyle(2, shade(style.line, 0.8), 0.9);
    g.strokePoints([n, e, s, w], true);
  }

  private drawWalls(style: (typeof WALL_STYLES)[number]) {
    const g = this.wallG;
    g.clear();
    const n = gridToScreen(0, 0);
    const e = gridToScreen(this.size, 0);
    const w = gridToScreen(0, this.size);

    // 右側の壁（gy = 0 の縁）
    this.wallQuad(g, n, e, style.a);
    // 左側の壁（gx = 0 の縁）
    this.wallQuad(g, n, w, style.b);

    // 継ぎ目
    g.lineStyle(1, shade(style.b, 0.7), 0.6);
    g.lineBetween(n.x, n.y, n.x, n.y - WALL_H);
  }

  private wallQuad(
    g: Phaser.GameObjects.Graphics,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: number,
  ) {
    const pts = [
      { x: from.x, y: from.y - WALL_H },
      { x: to.x, y: to.y - WALL_H },
      { x: to.x, y: to.y },
      { x: from.x, y: from.y },
    ];
    g.fillStyle(color, 1);
    g.fillPoints(pts, true);
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

  destroy() {
    this.floorG.destroy();
    this.wallG.destroy();
  }
}
