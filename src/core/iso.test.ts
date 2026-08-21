import { describe, expect, it } from 'vitest';
import { TILE_H, TILE_W } from '../config';
import { depthFor, gridToScreen, rotatedSize, screenToGrid, screenToTile, tileCenter } from './iso';

describe('gridToScreen', () => {
  it('原点はそのまま原点になる', () => {
    expect(gridToScreen(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('+gx は画面の右下へ、+gy は左下へ伸びる', () => {
    expect(gridToScreen(1, 0)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 });
    expect(gridToScreen(0, 1)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
  });

  it('マスの中心は角から半マスずれる', () => {
    expect(tileCenter(0, 0)).toEqual({ x: 0, y: TILE_H / 2 });
    expect(tileCenter(2, 3)).toEqual(gridToScreen(2.5, 3.5));
  });
});

describe('screenToGrid / screenToTile', () => {
  it('gridToScreen の逆変換になっている', () => {
    for (const [gx, gy] of [
      [0, 0],
      [3, 7],
      [11.5, 0.25],
      [-2, 5],
    ]) {
      const p = gridToScreen(gx, gy);
      const back = screenToGrid(p.x, p.y);
      expect(back.gx).toBeCloseTo(gx, 10);
      expect(back.gy).toBeCloseTo(gy, 10);
    }
  });

  it('マスの中心はそのマスに入る', () => {
    for (let gx = 0; gx < 12; gx++) {
      for (let gy = 0; gy < 12; gy++) {
        const c = tileCenter(gx, gy);
        expect(screenToTile(c.x, c.y)).toEqual({ gx, gy });
      }
    }
  });

  it('マスの四隅の内側も同じマスになる', () => {
    const c = tileCenter(4, 6);
    const e = 0.5;
    expect(screenToTile(c.x, c.y - TILE_H / 2 + e)).toEqual({ gx: 4, gy: 6 }); // 上
    expect(screenToTile(c.x, c.y + TILE_H / 2 - e)).toEqual({ gx: 4, gy: 6 }); // 下
    expect(screenToTile(c.x - TILE_W / 2 + e, c.y)).toEqual({ gx: 4, gy: 6 }); // 左
    expect(screenToTile(c.x + TILE_W / 2 - e, c.y)).toEqual({ gx: 4, gy: 6 }); // 右
  });
});

describe('rotatedSize', () => {
  it('偶数の回転では縦横がそのまま', () => {
    expect(rotatedSize([2, 3], 0)).toEqual([2, 3]);
    expect(rotatedSize([2, 3], 2)).toEqual([2, 3]);
  });

  it('奇数の回転では縦横が入れかわる', () => {
    expect(rotatedSize([2, 3], 1)).toEqual([3, 2]);
    expect(rotatedSize([2, 3], 3)).toEqual([3, 2]);
  });
});

describe('depthFor', () => {
  it('手前のマスほど大きい', () => {
    expect(depthFor(0, 0)).toBeLessThan(depthFor(1, 0));
    expect(depthFor(0, 0)).toBeLessThan(depthFor(0, 1));
    expect(depthFor(3, 3)).toBeLessThan(depthFor(4, 4));
  });

  it('同じ和なら +gy 側が手前になる', () => {
    expect(depthFor(1, 3)).toBeGreaterThan(depthFor(3, 1));
  });

  it('大きい家具は占有範囲の手前の角で決まる', () => {
    // 3x1 の家具の手前の角は (gx+3, gy+1)
    expect(depthFor(0, 0, 3, 1)).toBe(depthFor(3, 1, 0, 0));
  });
});
